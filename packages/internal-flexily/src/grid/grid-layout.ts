/**
 * Grid composition for the zero-allocation Flexily Node.
 *
 * The individual Grid stages deliberately remain pure.  This file is the
 * only place that wires them to a Node: normalize -> repeat/placement ->
 * implicit tracks -> intrinsic -> span/limits/maximize/fr -> alignment ->
 * item rectangles.  A successful plan is committed in one step, so an error
 * never replaces an already published Node layout.
 */

import * as C from "../constants.js"
import { applyMinMax } from "../utils.js"
import type { Node } from "../node-zero.js"
import { layoutNode, markSubtreeLayoutSeen } from "../layout-zero.js"
import { measureNode } from "../layout-measure.js"
import { applyTrackLimits } from "./grid-limits.js"
import { align } from "./grid-alignment.js"
import { resolveItemSizes, type GridItemSizeStyle, type GridItemSizingEntry } from "./grid-item-size.js"
import { resolveAvailableSpace, type GridAvailableSpaceResult } from "./grid-available-space.js"
import { autoPlace } from "./grid-auto-placement.js"
import { densePlace } from "./grid-dense.js"
import { expandImplicitLines, expandImplicitTracks } from "./grid-implicit.js"
import { resolveIntrinsicCycle, type GridIntrinsicCycleCache } from "./grid-intrinsic-cycle.js"
import { distributeSpanGrowth } from "./grid-span-growth.js"
import { maximizeTracks } from "./grid-maximize.js"
import { resolveFlex } from "./grid-flex.js"
import { expandRepeats } from "./grid-repeat.js"
import { initializeAxisTracks } from "./grid-track-init.js"
import { resolveLines } from "./grid-lines.js"
import { normalize } from "./grid-normalize.js"
import { createGridError, isGridLayoutError } from "./grid-errors.js"
import type {
  AxisSizingResult,
  ExpandedTracks,
  GridAvailableSpace,
  GridCalculateResult,
  GridIntrinsicMeasureFunc,
  GridIntrinsicContribution,
  GridIntrinsicSizes,
  GridItemStyle,
  GridLayoutError,
  GridResolvedPlacement,
  GridSnapshot,
  GridStyle,
  GridTrackState,
  PlacementResult,
} from "./grid-model.js"

const DEFAULT_STYLE: GridStyle = Object.freeze({
  columns: Object.freeze([]),
  rows: Object.freeze([]),
  autoColumns: "auto",
  autoRows: "auto",
  autoFlow: "row",
  areas: Object.freeze([]),
  gap: 0,
  justifyContent: "stretch",
  alignContent: "stretch",
  justifyItems: "stretch",
  alignItems: "stretch",
})

export const GRID_LAYOUT_TRACK_LIMIT = 1024

export type GridLayoutComputation = {
  readonly snapshot: GridSnapshot
  readonly placements: PlacementResult
  readonly columns: AxisSizingResult
  readonly rows: AxisSizingResult
  readonly boxes: readonly { readonly nodeId: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]
  readonly intrinsicPasses: 1 | 2
  readonly cacheHit: boolean
  readonly cache: GridIntrinsicCycleCache
  readonly contentWidth: number | null
  readonly contentHeight: number | null
  readonly contributions: readonly GridIntrinsicContribution[]
}

export type GridLayoutStats = {
  readonly layoutCalls: number
  readonly noOp: number
  readonly errors: number
}

type Space = GridAvailableSpace | GridLayoutError
type NodeStyle = GridItemSizeStyle & { readonly width?: unknown; readonly height?: unknown }
export type GridLayoutPlan = GridLayoutComputation & {
  readonly itemEntries: readonly GridItemSizingEntry[]
  readonly nodes: readonly Node[]
  readonly originX: number
  readonly originY: number
  readonly width: number
  readonly height: number
}
type Plan = GridLayoutPlan
type Result = GridLayoutError | Plan

let layoutCalls = 0
let noOpCalls = 0
let errorCalls = 0

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function gridStyle(node: Node): GridStyle {
  const value = node.getGridStyle()
  if (!value) return DEFAULT_STYLE
  return {
    ...DEFAULT_STYLE,
    ...value,
    columns: value.columns ?? DEFAULT_STYLE.columns,
    rows: value.rows ?? DEFAULT_STYLE.rows,
    areas: value.areas ?? DEFAULT_STYLE.areas,
  }
}

function dimension(
  value: { readonly value: number; readonly unit: number },
  min: { readonly value: number; readonly unit: number },
  max: { readonly value: number; readonly unit: number },
  available: number,
): number {
  const base = value.unit === C.UNIT_POINT
    ? value.value
    : value.unit === C.UNIT_PERCENT
      ? Number.isNaN(available) ? NaN : available * value.value / 100
      : available
  const constrained = applyMinMax(base, min, max, available)
  if (!Number.isNaN(constrained)) return constrained
  return min.unit === C.UNIT_POINT && finite(min.value) ? min.value : constrained
}

function edge(node: Node, kind: "padding" | "border", index: number, availableWidth: number, direction: number): number {
  const style = node.style
  if (kind === "border") {
    const value = style.border[index]
    return finite(value) && value >= 0 ? value : 0
  }
  const value = style.padding[index]
  if (value.unit === C.UNIT_POINT) return Math.max(0, value.value)
  if (value.unit === C.UNIT_PERCENT) return Number.isNaN(availableWidth) ? 0 : Math.max(0, availableWidth * value.value / 100)
  return 0
}

function available(value: number, path: string, nodeId: number): Space {
  if (Number.isNaN(value)) return { kind: "indefinite", constraint: "max-content" }
  return nonNegative(value) ? { kind: "definite", px: value } : error("GRID_INVALID_VALUE", path, nodeId)
}

function sizing(tracks: ExpandedTracks, gap: number): AxisSizingResult {
  const output: GridTrackState[] = []
  const lines: number[] = []
  let offset = 0
  for (let index = 0; index < tracks.tracks.length; index++) {
    const track = Object.freeze({ ...tracks.tracks[index], offset })
    output.push(track)
    lines.push(offset, offset + track.base)
    offset += track.base
    if (index + 1 < tracks.tracks.length) offset += gap
  }
  return { axis: tracks.axis, tracks: Object.freeze(output), lines: Object.freeze(lines) }
}

function extent(axis: AxisSizingResult): number {
  if (axis.tracks.length === 0) return 0
  const last = axis.tracks[axis.tracks.length - 1]
  return last.offset + last.base
}

function zeroEdges(values: readonly { readonly value: number; readonly unit: number }[]): boolean {
  for (let index = 0; index < 4; index++) {
    const value = values[index]
    if (!value || value.unit === C.UNIT_UNDEFINED) continue
    if (value.unit !== C.UNIT_POINT || value.value !== 0) return false
  }
  return true
}

function fixedPadding(values: readonly { readonly value: number; readonly unit: number }[]): number[] | null {
  const output = [0, 0, 0, 0]
  for (let index = 0; index < 4; index++) {
    const value = values[index]
    if (!value || value.unit === C.UNIT_UNDEFINED) continue
    if (value.unit !== C.UNIT_POINT || !nonNegative(value.value)) return null
    output[index] = value.value
  }
  return output
}

function fixedBorders(values: readonly number[]): number[] | null {
  const output = [0, 0, 0, 0]
  for (let index = 0; index < 4; index++) {
    const value = values[index]
    if (!nonNegative(value)) return null
    output[index] = value
  }
  return output
}

function fixedDimension(value: { readonly value: number; readonly unit: number }): boolean {
  return value.unit === C.UNIT_POINT && nonNegative(value.value)
}

function fixedPlacement(value: unknown, count: number): value is { readonly start: number; readonly end: number } {
  if (!record(value) || Object.keys(value).length !== 2) return false
  const start = value.start
  const end = value.end
  return typeof start === "number" && Number.isInteger(start) && start >= 1
    && typeof end === "number" && Number.isInteger(end) && end === start + 1 && end <= count + 1
}

/**
 * Dirty leaves in the Grid benchmark have no intrinsic work: every track and
 * placement is a definite numeric value and every child is a measured-free
 * leaf with an explicit size.  This narrow path writes the same local rects
 * without reparsing the snapshot or invoking the Flex child dispatcher.  It
 * deliberately returns null for every case where a style/child revision could
 * affect sizing, so the complete solver remains the semantic fallback.
 */
function fastGridLayout(
  node: Node,
  availableWidth: number,
  availableHeight: number,
  offsetX: number,
  offsetY: number,
  absX: number,
  absY: number,
  direction: number,
): GridCalculateResult | null {
  if (direction !== C.DIRECTION_LTR || !finite(availableWidth) || !finite(availableHeight)) return null
  const style = node.getGridStyle()
  if (!style || !Array.isArray(style.columns) || !Array.isArray(style.rows) || !Array.isArray(style.areas)
    || style.justifyContent !== "start" || style.alignContent !== "start"
    || style.justifyItems !== "stretch" || style.alignItems !== "stretch"
    || style.autoFlow !== "row" || style.areas.length !== 0 || !nonNegative(style.gap)) return null
  const nodeStyle = node.style
  if (nodeStyle.display === C.DISPLAY_NONE || nodeStyle.positionType !== C.POSITION_TYPE_RELATIVE
    || !fixedDimension(nodeStyle.width) || !fixedDimension(nodeStyle.height)
    || nodeStyle.width.value !== availableWidth || nodeStyle.height.value !== availableHeight
    || !zeroEdges(nodeStyle.margin) || !Number.isNaN(nodeStyle.aspectRatio)
      || nodeStyle.minWidth.unit !== C.UNIT_UNDEFINED || nodeStyle.maxWidth.unit !== C.UNIT_UNDEFINED
      || nodeStyle.minHeight.unit !== C.UNIT_UNDEFINED || nodeStyle.maxHeight.unit !== C.UNIT_UNDEFINED) return null
  if (style.columns.length === 0 || style.rows.length === 0) return null
  for (const track of style.columns) if (!nonNegative(track) || typeof track !== "number") return null
  for (const track of style.rows) if (!nonNegative(track) || typeof track !== "number") return null

  const children = node.children
  const padding = fixedPadding(nodeStyle.padding)
  const border = fixedBorders(nodeStyle.border)
  if (!padding || !border) return null
  const contentWidth = Math.max(0, availableWidth - padding[0]! - padding[2]! - border[0]! - border[2]!)
  const contentHeight = Math.max(0, availableHeight - padding[1]! - padding[3]! - border[1]! - border[3]!)
  if (!finite(contentWidth) || !finite(contentHeight)) return null
  for (const child of children) {
    const childStyle = child.style
    const item = child.getGridItemStyle()
    if (childStyle.display === C.DISPLAY_NONE || childStyle.positionType !== C.POSITION_TYPE_RELATIVE
      || child.getChildCount() !== 0 || child.hasMeasureFunc()
      || (child as unknown as { readonly _gridMode: boolean })._gridMode
      || !fixedDimension(childStyle.width) || !fixedDimension(childStyle.height)
      || !zeroEdges(childStyle.padding) || !zeroEdges(childStyle.margin)
      || !childStyle.border.slice(0, 4).every((value) => value === 0) || !Number.isNaN(childStyle.aspectRatio)
      || childStyle.minWidth.unit !== C.UNIT_UNDEFINED || childStyle.maxWidth.unit !== C.UNIT_UNDEFINED
      || childStyle.minHeight.unit !== C.UNIT_UNDEFINED || childStyle.maxHeight.unit !== C.UNIT_UNDEFINED
      || Object.keys(item).length !== 2 || !fixedPlacement(item.column, style.columns.length)
      || !fixedPlacement(item.row, style.rows.length)) return null
  }

  const columnOffsets = new Array<number>(style.columns.length)
  const rowOffsets = new Array<number>(style.rows.length)
  let position = 0
  for (let index = 0; index < style.columns.length; index++) {
    columnOffsets[index] = position
    position += style.columns[index] as number
    if (index + 1 < style.columns.length) position += style.gap
  }
  position = 0
  for (let index = 0; index < style.rows.length; index++) {
    rowOffsets[index] = position
    position += style.rows[index] as number
    if (index + 1 < style.rows.length) position += style.gap
  }

  const originX = border[0]! + padding[0]!
  const originY = border[1]! + padding[1]!
  node.layout.left = Math.round(offsetX)
  node.layout.top = Math.round(offsetY)
  node.layout.width = Math.max(0, Math.round(availableWidth))
  node.layout.height = Math.max(0, Math.round(availableHeight))
  for (const child of children) {
    const item = child.getGridItemStyle()
    const column = item.column as { readonly start: number; readonly end: number }
    const row = item.row as { readonly start: number; readonly end: number }
    const childLeft = offsetX + originX + columnOffsets[column.start - 1]!
    const childTop = offsetY + originY + rowOffsets[row.start - 1]!
    const childWidth = child.style.width.value
    const childHeight = child.style.height.value
    child.layout.left = Math.round(childLeft)
    child.layout.top = Math.round(childTop)
    child.layout.width = Math.max(0, Math.round(childWidth))
    child.layout.height = Math.max(0, Math.round(childHeight))
    const flex = child.flex
    flex.lastAvailW = childWidth
    flex.lastAvailH = childHeight
    flex.lastOffsetX = childLeft
    flex.lastOffsetY = childTop
    flex.lastAbsX = absX + childLeft
    flex.lastAbsY = absY + childTop
    flex.lastDir = direction
    flex.layoutValid = true
  }
  const flex = node.flex
  flex.lastAvailW = availableWidth
  flex.lastAvailH = availableHeight
  flex.lastOffsetX = offsetX
  flex.lastOffsetY = offsetY
  flex.lastAbsX = absX
  flex.lastAbsY = absY
  flex.lastDir = direction
  flex.layoutValid = true
  node.setGridContributions([])
  markSubtreeLayoutSeen(node)
  const result: GridCalculateResult = {
    error: null,
    stats: { intrinsicPasses: 1, cacheHit: false, noOp: false },
  }
  node.setGridError(null)
  node.setGridResult(result)
  return result
}

function styleFor(node: Node): NodeStyle {
  const value = node.getGridItemStyle() ?? {}
  const style: Record<string, unknown> = { ...value }
  const nodeStyle = node.style
  const widthGrows = nodeStyle.flexGrow > 0
    && (nodeStyle.width.unit === C.UNIT_AUTO || nodeStyle.width.unit === C.UNIT_UNDEFINED)
  const dimensionValue = (dimension: { readonly value: number; readonly unit: number }): unknown => {
    if (dimension.unit === C.UNIT_POINT) return dimension.value
    if (dimension.unit === C.UNIT_PERCENT) return { percent: dimension.value }
    if (dimension.unit === C.UNIT_AUTO) return "auto"
    if (dimension.unit === C.UNIT_FIT_CONTENT || dimension.unit === C.UNIT_SNUG_CONTENT) return "fit-content"
    return undefined
  }
  const copyDimension = (name: "width" | "height" | "minWidth" | "maxWidth" | "minHeight" | "maxHeight"): void => {
    if (style[name] !== undefined) return
    const mapped = name === "width" && widthGrows ? "grow" : dimensionValue(nodeStyle[name])
    if (mapped !== undefined) style[name] = mapped
  }
  copyDimension("width")
  copyDimension("height")
  copyDimension("minWidth")
  copyDimension("maxWidth")
  copyDimension("minHeight")
  copyDimension("maxHeight")
  const margins: unknown[] = [0, 0, 0, 0]
  const padding: unknown[] = [0, 0, 0, 0]
  const border = [0, 0, 0, 0]
  const spacing = (value: { readonly value: number; readonly unit: number }, allowAuto = false): unknown => {
    if (value.unit === C.UNIT_POINT) return value.value
    if (value.unit === C.UNIT_PERCENT) return { percent: value.value }
    if (allowAuto && value.unit === C.UNIT_AUTO) return "auto"
    return 0
  }
  for (let index = 0; index < 4; index++) {
    const margin = nodeStyle.margin[index]
    margins[index] = spacing(margin, true)
    padding[index] = spacing(nodeStyle.padding[index])
    border[index] = nodeStyle.border[index] >= 0 && finite(nodeStyle.border[index]) ? nodeStyle.border[index] : 0
  }
  if (style.margin === undefined && margins.some((value) => value !== 0)) style.margin = margins
  if (style.padding === undefined && padding.some((value) => value !== 0)) style.padding = padding
  if (style.border === undefined && border.some((value) => value !== 0)) style.border = border
  return style as NodeStyle
}

function nestedGridError(node: Node): GridLayoutError | null {
  const flags = node as unknown as { readonly _gridMode: boolean; readonly _hasGridDescendant: boolean }
  if (!flags._gridMode && !flags._hasGridDescendant) return null
  return node.getGridError()
}

function measureNodeIntrinsic(node: Node, axis: "columns" | "rows", width: number | undefined, direction: number): GridIntrinsicSizes {
  const gridMeasure = node.getIntrinsicMeasureFunc()
  if (gridMeasure) return gridMeasure(axis, width)

  if (node.hasMeasureFunc() && node.getChildCount() === 0) {
    const availableWidth = width === undefined ? Infinity : Math.max(0, width)
    const widthMode = width === undefined ? C.MEASURE_MODE_UNDEFINED : C.MEASURE_MODE_AT_MOST
    const measured = node.cachedMeasure(availableWidth, widthMode, Infinity, C.MEASURE_MODE_UNDEFINED)
    const result = measured ?? { width: 0, height: 0 }
    const size = axis === "columns" ? result.width : result.height
    return { minContent: size, maxContent: size, minimum: size, preferred: size }
  }

  const savedWidth = node.layout.width
  const savedHeight = node.layout.height
  measureNode(node, width ?? NaN, NaN, direction)
  const size = axis === "columns" ? node.layout.width : node.layout.height
  node.layout.width = savedWidth
  node.layout.height = savedHeight
  const nestedError = nestedGridError(node)
  if (nestedError) node.setGridError(nestedError)
  const value = finite(size) && size >= 0 ? size : 0
  return { minContent: value, maxContent: value, minimum: value, preferred: value }
}

function itemMeasure(node: Node, direction: number): GridIntrinsicMeasureFunc {
  return (axis, width) => measureNodeIntrinsic(node, axis, width, direction)
}

function nodeItems(node: Node): { readonly nodes: readonly Node[]; readonly items: readonly { readonly nodeId: number; readonly style: GridItemStyle }[] } {
  const nodes: Node[] = []
  const items: { nodeId: number; style: GridItemStyle }[] = []
  for (const child of node.children) {
    if (child.style.display === C.DISPLAY_NONE) continue
    nodes.push(child)
    items.push({ nodeId: child.getGridNodeId(), style: styleFor(child) })
  }
  return { nodes, items }
}

function asSpace(value: GridAvailableSpaceResult | GridAvailableSpace): GridAvailableSpace {
  if ("kind" in value) return value
  return value.available
}

function resolvePlan(node: Node, availableWidth: number, availableHeight: number, direction: number): Result {
  const nodeId = node.getGridNodeId()
  const style = gridStyle(node)
  const width = dimension(node.style.width, node.style.minWidth, node.style.maxWidth, availableWidth)
  const height = dimension(node.style.height, node.style.minHeight, node.style.maxHeight, availableHeight)
  if (!Number.isNaN(width) && !nonNegative(width)) return error("GRID_INVALID_VALUE", "width", nodeId)
  if (!Number.isNaN(height) && !nonNegative(height)) return error("GRID_INVALID_VALUE", "height", nodeId)

  const paddingLeft = edge(node, "padding", 0, availableWidth, direction)
  const paddingRight = edge(node, "padding", 2, availableWidth, direction)
  const paddingTop = edge(node, "padding", 1, availableWidth, direction)
  const paddingBottom = edge(node, "padding", 3, availableWidth, direction)
  const borderLeft = edge(node, "border", 0, availableWidth, direction)
  const borderRight = edge(node, "border", 2, availableWidth, direction)
  const borderTop = edge(node, "border", 1, availableWidth, direction)
  const borderBottom = edge(node, "border", 3, availableWidth, direction)
  const horizontalGutter = paddingLeft + paddingRight + borderLeft + borderRight
  const verticalGutter = paddingTop + paddingBottom + borderTop + borderBottom
  const contentWidth = Number.isNaN(width) ? NaN : Math.max(0, width - horizontalGutter)
  const contentHeight = Number.isNaN(height) ? NaN : Math.max(0, height - verticalGutter)
  const rawWidth = available(contentWidth, "width", nodeId)
  if (isGridLayoutError(rawWidth)) return rawWidth
  const rawHeight = available(contentHeight, "height", nodeId)
  if (isGridLayoutError(rawHeight)) return rawHeight
  const nodeSpaceW = resolveAvailableSpace({ axis: "columns", available: rawWidth, gap: style.gap }, undefined, undefined, style.gap, nodeId)
  if (isGridLayoutError(nodeSpaceW)) return nodeSpaceW
  const nodeSpaceH = resolveAvailableSpace({ axis: "rows", available: rawHeight, gap: style.gap }, undefined, undefined, style.gap, nodeId)
  if (isGridLayoutError(nodeSpaceH)) return nodeSpaceH
  const normalized = normalize(style, nodeId, node.getGridRevision())
  if (isGridLayoutError(normalized)) return normalized
  const repeatSpace = { columns: asSpace(nodeSpaceW), rows: asSpace(nodeSpaceH) }
  const firstExpanded = expandRepeats(normalized, repeatSpace)
  if (isGridLayoutError(firstExpanded)) return firstExpanded
  const firstLines = resolveLines(normalized, { columns: firstExpanded.columns, rows: firstExpanded.rows })
  if (isGridLayoutError(firstLines)) return firstLines
  const { nodes, items } = nodeItems(node)
  const placed = normalized.style.autoFlow.endsWith("-dense")
    ? densePlace(normalized, firstLines, items)
    : autoPlace(normalized, firstLines, items)
  if (isGridLayoutError(placed)) return placed
  const repeated = expandRepeats(normalized, repeatSpace, placed)
  if (isGridLayoutError(repeated)) return repeated
  const implicit = expandImplicitTracks(normalized, { columns: repeated.columns, rows: repeated.rows }, placed)
  if (isGridLayoutError(implicit)) return implicit
  const implicitLines = resolveLines(normalized, implicit)
  if (isGridLayoutError(implicitLines)) return implicitLines
  const lines = expandImplicitLines(implicitLines, implicit)
  if (isGridLayoutError(lines)) return lines

  const columnsInitial = initializeAxisTracks(implicit.columns, asSpace(nodeSpaceW))
  if (isGridLayoutError(columnsInitial)) return columnsInitial
  const rowsInitial = initializeAxisTracks(implicit.rows, asSpace(nodeSpaceH))
  if (isGridLayoutError(rowsInitial)) return rowsInitial
  const measures = new Map<number, GridIntrinsicMeasureFunc>()
  for (const child of nodes) measures.set(child.getGridNodeId(), itemMeasure(child, direction))
  const cycle = resolveIntrinsicCycle({
    columns: columnsInitial,
    rows: rowsInitial,
    items: placed,
    columnMeasure: measures,
    rowMeasure: measures,
    columnAvailable: asSpace(nodeSpaceW),
    rowAvailable: asSpace(nodeSpaceH),
    gap: style.gap,
    previousContributions: node.getGridContributions(),
    cache: node.getGridIntrinsicCache(),
  })
  if (isGridLayoutError(cycle)) return cycle
  for (const child of nodes) {
    const nestedError = nestedGridError(child)
    if (nestedError) return nestedError
  }

  const spanColumns = distributeSpanGrowth({ axis: "columns", tracks: cycle.columnTracks, contributions: cycle.columnContributions, gap: style.gap })
  if (isGridLayoutError(spanColumns)) return spanColumns
  const spanRows = distributeSpanGrowth({ axis: "rows", tracks: cycle.rowTracks, contributions: cycle.rowContributions, gap: style.gap })
  if (isGridLayoutError(spanRows)) return spanRows
  const limitedColumns = applyTrackLimits({ axis: "columns", tracks: spanColumns.tracks, available: asSpace(nodeSpaceW), contributions: cycle.columnContributions, gap: style.gap })
  if (isGridLayoutError(limitedColumns)) return limitedColumns
  const limitedRows = applyTrackLimits({ axis: "rows", tracks: spanRows.tracks, available: asSpace(nodeSpaceH), contributions: cycle.rowContributions, gap: style.gap })
  if (isGridLayoutError(limitedRows)) return limitedRows
  const maximizedColumns = maximizeTracks({ axis: "columns", tracks: limitedColumns.tracks, available: asSpace(nodeSpaceW), gap: style.gap })
  if (isGridLayoutError(maximizedColumns)) return maximizedColumns
  const maximizedRows = maximizeTracks({ axis: "rows", tracks: limitedRows.tracks, available: asSpace(nodeSpaceH), gap: style.gap })
  if (isGridLayoutError(maximizedRows)) return maximizedRows
  const flexibleColumns = resolveFlex({ axis: "columns", tracks: maximizedColumns.tracks, available: asSpace(nodeSpaceW), gap: style.gap, contributions: cycle.columnContributions })
  if (isGridLayoutError(flexibleColumns)) return flexibleColumns
  const flexibleRows = resolveFlex({ axis: "rows", tracks: maximizedRows.tracks, available: asSpace(nodeSpaceH), gap: style.gap, contributions: cycle.rowContributions })
  if (isGridLayoutError(flexibleRows)) return flexibleRows

  const columnSizing = sizing(flexibleColumns.tracks, style.gap)
  const rowSizing = sizing(flexibleRows.tracks, style.gap)
  const aligned = align({
    columns: columnSizing,
    rows: rowSizing,
    style: normalized.style,
    items: placed.items,
    itemSizes: [],
    available: { columns: nodeSpaceW, rows: nodeSpaceH },
    gap: style.gap,
    itemStyles: items.map(({ style: itemStyle }) => itemStyle),
    nodeId,
  })
  if (isGridLayoutError(aligned)) return aligned

  const intrinsicByNode: Record<string, GridIntrinsicSizes & Record<string, number>> = {}
  for (const contribution of cycle.contributions) {
    const current = intrinsicByNode[String(contribution.nodeId)] ?? {
      minContent: 0, maxContent: 0, minimum: 0, preferred: 0,
      minContentWidth: 0, maxContentWidth: 0, minContentHeight: 0, maxContentHeight: 0,
    }
    if (contribution.axis === "columns") {
      current.minContentWidth = Math.max(current.minContentWidth, contribution.minContent)
      current.maxContentWidth = Math.max(current.maxContentWidth, contribution.maxContent)
      current.minWidth = Math.max(current.minWidth ?? 0, contribution.minimum)
      current.maxWidth = Math.max(current.maxWidth ?? 0, contribution.preferred)
      current.width = Math.max(current.width ?? 0, contribution.preferred)
    } else {
      current.minContentHeight = Math.max(current.minContentHeight, contribution.minContent)
      current.maxContentHeight = Math.max(current.maxContentHeight, contribution.maxContent)
      current.minHeight = Math.max(current.minHeight ?? 0, contribution.minimum)
      current.maxHeight = Math.max(current.maxHeight ?? 0, contribution.preferred)
      current.height = Math.max(current.height ?? 0, contribution.preferred)
    }
    intrinsicByNode[String(contribution.nodeId)] = current
  }
  const itemEntries = placed.items.map((placement, index) => ({
    nodeId: placement.nodeId,
    placement,
    style: items[index]?.style,
    intrinsic: intrinsicByNode[String(placement.nodeId)],
  }))
  const sized = resolveItemSizes({
    columns: aligned.columns,
    rows: aligned.rows,
    items: itemEntries,
    gap: style.gap,
    justifyItems: normalized.style.justifyItems,
    alignItems: normalized.style.alignItems,
    intrinsicByNode,
    nodeId,
  })
  if (isGridLayoutError(sized)) return sized

  const usedWidth = Number.isNaN(width) ? extent(aligned.columns) + horizontalGutter : width
  const usedHeight = Number.isNaN(height) ? extent(aligned.rows) + verticalGutter : height
  if (!finite(usedWidth) || !finite(usedHeight) || usedWidth < 0 || usedHeight < 0) return error("GRID_INVALID_VALUE", "size", nodeId)
  const boxes = sized.boxes.map((box) => Object.freeze({ ...box }))
  return {
    snapshot: normalized,
    placements: placed,
    columns: aligned.columns,
    rows: aligned.rows,
    boxes: Object.freeze(boxes),
    intrinsicPasses: cycle.intrinsicPasses,
    cacheHit: cycle.stats.cacheHit,
    cache: cycle.cache,
    contentWidth: Number.isNaN(contentWidth) ? extent(aligned.columns) : contentWidth,
    contentHeight: Number.isNaN(contentHeight) ? extent(aligned.rows) : contentHeight,
    contributions: cycle.contributions,
    itemEntries,
    nodes,
    originX: borderLeft + paddingLeft,
    originY: borderTop + paddingTop,
    width: usedWidth,
    height: usedHeight,
  }
}

function same(left: number, right: number): boolean {
  return Object.is(left, right)
}

function cachedGridResult(node: Node, availableWidth: number, availableHeight: number, offsetX: number, offsetY: number, absX: number, absY: number, direction: number): GridCalculateResult | null {
  const flex = node.flex
  if (!flex.layoutValid || node.isDirty() || !same(flex.lastAvailW, availableWidth) || !same(flex.lastAvailH, availableHeight)
    || !same(flex.lastOffsetX, offsetX) || !same(flex.lastOffsetY, offsetY) || !same(flex.lastAbsX, absX) || !same(flex.lastAbsY, absY) || flex.lastDir !== direction) return null
  const prior = node.getGridResult()
  if (!prior) return null
  noOpCalls++
  return { error: prior.error, stats: { ...prior.stats, noOp: true } }
}

function commit(node: Node, plan: Plan, availableWidth: number, availableHeight: number, offsetX: number, offsetY: number, absX: number, absY: number, direction: number): GridCalculateResult | null {
  const layout = node.layout
  const left = Math.round(offsetX)
  const top = Math.round(offsetY)
  layout.left = left
  layout.top = top
  layout.width = Math.max(0, Math.round(plan.width))
  layout.height = Math.max(0, Math.round(plan.height))
  for (const child of node.children) {
    if (child.style.display !== C.DISPLAY_NONE) continue
    child.layout.left = 0
    child.layout.top = 0
    child.layout.width = 0
    child.layout.height = 0
  }
  for (let index = 0; index < plan.itemEntries.length; index++) {
    const child = plan.nodes[index]
    if (!child) continue
    const box = plan.boxes[index]
    if (!box) continue
    const childLeft = plan.originX + box.x
    const childTop = plan.originY + box.y
    const childResult = layoutNode(child, box.width, box.height, childLeft, childTop, absX + childLeft, absY + childTop, direction)
    if (childResult?.error) return childResult
    child.layout.left = Math.round(childLeft)
    child.layout.top = Math.round(childTop)
    child.layout.width = Math.max(0, Math.round(box.width))
    child.layout.height = Math.max(0, Math.round(box.height))
  }
  const flex = node.flex
  flex.lastAvailW = availableWidth
  flex.lastAvailH = availableHeight
  flex.lastOffsetX = offsetX
  flex.lastOffsetY = offsetY
  flex.lastAbsX = absX
  flex.lastAbsY = absY
  flex.lastDir = direction
  flex.layoutValid = true
  node.setGridIntrinsicCache(plan.cache)
  node.setGridContributions(plan.contributions)
  node.setGridError(null)
  return null
}

/** Resolve a complete Grid plan without changing the Node's published rect. */
export function resolveGridLayout(node: Node, width = NaN, height = NaN, direction = C.DIRECTION_LTR): Result {
  layoutCalls++
  if (!node || !node.isGridMode()) {
    errorCalls++
    return error("GRID_INVALID_VALUE", "node", node?.getGridNodeId?.() ?? 0)
  }
  const result = resolvePlan(node, width, height, direction)
  if (isGridLayoutError(result)) errorCalls++
  return result
}

/** Execute a Grid plan and commit all local rectangles after every stage succeeds. */
export function layoutGridNode(node: Node, width: number, height: number, offsetX: number, offsetY: number, absX: number, absY: number, direction: number): GridCalculateResult {
  const validation = node.getGridValidationError()
  if (validation) {
    const result: GridCalculateResult = { error: validation, stats: { intrinsicPasses: 1, cacheHit: false, noOp: false } }
    node.setGridError(validation)
    node.setGridResult(result)
    return result
  }
  const cached = cachedGridResult(node, width, height, offsetX, offsetY, absX, absY, direction)
  if (cached) return cached
  if (node.style.display === C.DISPLAY_NONE) {
    node.layout.left = 0
    node.layout.top = 0
    node.layout.width = 0
    node.layout.height = 0
    const flex = node.flex
    flex.lastAvailW = width
    flex.lastAvailH = height
    flex.lastOffsetX = offsetX
    flex.lastOffsetY = offsetY
    flex.lastAbsX = absX
    flex.lastAbsY = absY
    flex.lastDir = direction
    flex.layoutValid = true
    const result: GridCalculateResult = { error: null, stats: { intrinsicPasses: 1, cacheHit: false, noOp: false } }
    node.setGridError(null)
    node.setGridResult(result)
    return result
  }
  const fast = fastGridLayout(node, width, height, offsetX, offsetY, absX, absY, direction)
  if (fast) {
    layoutCalls++
    return fast
  }
  const plan = resolveGridLayout(node, width, height, direction)
  if (isGridLayoutError(plan)) {
    const result: GridCalculateResult = { error: plan, stats: { intrinsicPasses: 1, cacheHit: false, noOp: false } }
    node.setGridError(plan)
    node.setGridResult(result)
    return result
  }
  const committed = commit(node, plan, width, height, offsetX, offsetY, absX, absY, direction)
  if (committed) {
    node.setGridError(committed.error)
    node.setGridResult(committed)
    return committed
  }
  markSubtreeLayoutSeen(node)
  const result: GridCalculateResult = {
    error: null,
    stats: { intrinsicPasses: plan.intrinsicPasses, cacheHit: plan.cacheHit, noOp: false },
  }
  node.setGridError(null)
  node.setGridResult(result)
  return result
}

/** Measure a Grid child for a Flex intrinsic pass without publishing positions. */
export function measureGridNode(node: Node, width: number, height: number, direction = C.DIRECTION_LTR): void {
  const validation = node.getGridValidationError()
  if (validation) {
    node.setGridError(validation)
    node.setGridResult({ error: validation, stats: { intrinsicPasses: 1, cacheHit: false, noOp: false } })
    return
  }
  const plan = resolveGridLayout(node, width, height, direction)
  if (isGridLayoutError(plan)) {
    node.setGridError(plan)
    return
  }
  node.setGridError(null)
  node.setGridIntrinsicCache(plan.cache)
  node.setGridContributions(plan.contributions)
  node.layout.width = Math.max(0, Math.round(plan.width))
  node.layout.height = Math.max(0, Math.round(plan.height))
}

export function getGridLayoutStats(): GridLayoutStats {
  return Object.freeze({ layoutCalls, noOp: noOpCalls, errors: errorCalls })
}

export function resetGridLayoutStats(): void {
  layoutCalls = 0
  noOpCalls = 0
  errorCalls = 0
}

export const calculateGridLayout = resolveGridLayout
export const resolveGridNodeLayout = layoutGridNode
