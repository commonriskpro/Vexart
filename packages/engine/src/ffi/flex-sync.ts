import {
  Node,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  POSITION_TYPE_ABSOLUTE,
  OVERFLOW_SCROLL,
  EDGE_LEFT,
  EDGE_TOP,
  EDGE_RIGHT,
  EDGE_BOTTOM,
  EDGE_ALL,
  GUTTER_ALL,
  ALIGN_FLEX_START,
  ALIGN_FLEX_END,
  ALIGN_CENTER,
  ALIGN_AUTO,
  ALIGN_SPACE_BETWEEN,
  ALIGN_STRETCH,
  JUSTIFY_FLEX_START,
  JUSTIFY_FLEX_END,
  JUSTIFY_CENTER,
  JUSTIFY_SPACE_BETWEEN,
  MEASURE_MODE_UNDEFINED,
} from "flexily"
import { SIZING, type TGENode, type SizingInfo, type TGEProps } from "./node-types"
import type {
  GridAreaPlacement,
  GridAutoFlow,
  GridContentAlignment,
  GridItemAlignment,
  GridItemStyle,
  GridIntrinsicMeasureFunc,
  GridLayoutError,
  GridPlacement,
  GridStyle,
  GridTrack,
  GridTrackSize,
} from "./grid-types"
import { measureForLayout, measureTextConstrained, type TextLayoutOptions } from "./text-layout"
import { createGridTextIntrinsicAdapter } from "./grid-text-intrinsics"

export const LAYOUT_PROPS = new Set([
  "layout",
  "direction", "flexDirection", "padding", "paddingX", "paddingY",
  "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
  "margin", "marginX", "marginY", "marginLeft", "marginRight", "marginTop", "marginBottom",
  "gap", "alignX", "alignY", "justifyContent", "alignItems",
  "alignContent", "justifyItems", "justifySelf", "alignSelf",
  "gridTemplateColumns", "gridTemplateRows", "gridAutoColumns", "gridAutoRows",
  "gridAutoFlow", "gridTemplateAreas", "gridColumn", "gridRow", "gridArea",
  "width", "height", "flexGrow", "flexShrink", "flexBasis", "flexWrap",
  "minWidth", "maxWidth", "minHeight", "maxHeight",
  "floating", "floatOffset", "zIndex",
  "borderWidth", "borderLeft", "borderRight", "borderTop", "borderBottom",
  "hoverStyle", "activeStyle", "focusStyle",
  "scrollX", "scrollY",
])

const GRID_STYLE_PROPS = new Set([
  "layout", "gap", "justifyContent", "alignContent", "justifyItems", "alignItems",
  "gridTemplateColumns", "gridTemplateRows", "gridAutoColumns", "gridAutoRows",
  "gridAutoFlow", "gridTemplateAreas",
])

const GRID_ITEM_PROPS = new Set(["gridColumn", "gridRow", "gridArea", "justifySelf", "alignSelf"])

type GridNode = Node & {
  setLayoutMode: (mode: "flex" | "grid") => void
  getLayoutMode: () => "flex" | "grid"
  setGridStyle: (style: GridStyle) => void
  setGridItemStyle: (style: GridItemStyle) => void
  getGridStyle: () => GridStyle | null
  getGridRevision: () => number
  setIntrinsicMeasureFunc: (measure: GridIntrinsicMeasureFunc | null) => void
  getIntrinsicMeasureFunc: () => GridIntrinsicMeasureFunc | null
  setGridValidationError: (error: GridLayoutError | null) => void
}

type GridSyncState = {
  readonly style: GridStyle
  readonly item: GridItemStyle
  readonly revision: number
}

/** Diagnostics produced while translating the Grid/Flex boundary. */
export type GridSyncDiagnostic = {
  readonly code: "GRID_INVALID_VALUE" | "GRID_UNSUPPORTED_ALIGNMENT"
  readonly path: string
  readonly nodeId: number
}

const gridSyncStates = new WeakMap<TGENode, GridSyncState>()
const gridItemStates = new WeakMap<TGENode, GridItemStyle>()
const gridSyncDiagnostics = new WeakMap<TGENode, readonly GridSyncDiagnostic[]>()
const gridTextIntrinsicStates = new WeakMap<TGENode, GridIntrinsicMeasureFunc>()
const gridTextSizingStates = new WeakMap<TGENode, string>()
const gridItemSizingStates = new WeakMap<TGENode, string>()

/** Read bridge diagnostics without exposing them as part of the public barrel. */
export function getGridSyncDiagnostics(node: TGENode): readonly GridSyncDiagnostic[] {
  return gridSyncDiagnostics.get(node) ?? []
}

const TEXT_LAYOUT_PROPS = new Set([
  "fontSize",
  "fontId",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "whiteSpace",
  "wordBreak",
])

export function isLayoutProp(name: string): boolean {
  return LAYOUT_PROPS.has(name)
}

export function isTextLayoutProp(name: string): boolean {
  return TEXT_LAYOUT_PROPS.has(name)
}

function mapJustify(value: number): number {
  if (value === 1) return JUSTIFY_FLEX_END
  if (value === 2) return JUSTIFY_CENTER
  if (value === 3) return JUSTIFY_SPACE_BETWEEN
  return JUSTIFY_FLEX_START
}

function mapAlign(value: number): number {
  if (value === 255) return ALIGN_STRETCH
  if (value === 1) return ALIGN_FLEX_END
  if (value === 2) return ALIGN_CENTER
  if (value === 3) return ALIGN_SPACE_BETWEEN
  return ALIGN_FLEX_START
}

function parseDir(value: unknown): number {
  return value === "row" ? 0 : 1
}

function parseAlignX(value: unknown): number {
  if (value === "right" || value === "flex-end") return 1
  if (value === "center") return 2
  if (value === "space-between") return 3
  return 0
}

function parseAlignY(value: unknown): number {
  if (value === "bottom" || value === "flex-end") return 1
  if (value === "center") return 2
  if (value === "space-between") return 3
  return 0
}

function maxInteractiveBorder(props: TGEProps): number {
  return Math.max(
    props.focusStyle?.borderWidth ?? 0,
    props.hoverStyle?.borderWidth ?? 0,
    props.activeStyle?.borderWidth ?? 0,
  )
}

function collectText(node: TGENode): string {
  if (node.text) return node.text
  return node.children.map((child) => collectText(child)).join("")
}

export function syncAllLayoutProps(node: TGENode): void {
  const flex = node._flexNode
  if (!flex) return
  if (node.kind === "text") {
    if (node.parent?.props.layout === "grid") syncGridItem(node)
    syncGridTextIntrinsic(node)
    return
  }
  const props = node.props
  if (props.layout === "grid") {
    syncGridLayout(node)
    return
  }
  syncFlexLayout(node)
}

function syncFlexLayout(node: TGENode): void {
  const flex = node._flexNode
  if (!flex) return
  const props = node.props
  const grid = flex as GridNode
  const wasGrid = typeof grid.setLayoutMode === "function" && grid.getLayoutMode() !== "flex"
  if (wasGrid) {
    grid.setLayoutMode("flex")
    grid.setGridValidationError(null)
  }
  syncDirection(flex, props)
  syncPadding(flex, props)
  syncMargin(flex, props)
  syncGap(flex, props.gap)
  syncAlign(flex, props)
  if (node.parent?.props.layout === "grid") {
    syncGridItemSizing(node)
  } else {
    gridItemSizingStates.delete(node)
    syncSizing(
      flex,
      node._widthSizing,
      node._heightSizing,
      props.flexGrow,
      props.flexShrink,
      parentDirection(node),
    )
  }
  syncMinMax(flex, props)
  syncBorder(flex, props)
  syncFloating(flex, props)
  syncScroll(flex, props)
  if (wasGrid) syncChildSizing(node)
  gridSyncStates.delete(node)
  gridSyncDiagnostics.delete(node)
  refreshParentGridValidation(node)
}

export function syncLayoutProp(node: TGENode, key: string, _value: unknown): void {
  const flex = node._flexNode
  if (!flex) return
  if (node.kind === "text") {
    if (GRID_ITEM_PROPS.has(key) && node.parent?.props.layout === "grid") syncGridItem(node)
    if (key === "width" || key === "height") syncGridTextSizing(node, node.parent?.props.layout === "grid")
    if (GRID_ITEM_PROPS.has(key) || isTextLayoutProp(key)) syncGridTextIntrinsic(node)
    gridSyncDiagnostics.set(node, gridDiagnostics(node))
    refreshParentGridValidation(node)
    flex.markDirty()
    return
  }
  if (node.props.layout === "grid") {
    syncGridLayoutProp(node, key)
    return
  }
  if (key === "layout") {
    syncFlexLayout(node)
    return
  }
  if (GRID_ITEM_PROPS.has(key)) {
    if (node.parent?.props.layout === "grid") syncGridItem(node)
    return
  }
  const props = node.props
  switch (key) {
    case "direction":
    case "flexDirection":
      syncDirection(flex, props)
      syncChildSizing(node)
      break
    case "padding":
    case "paddingX":
    case "paddingY":
    case "paddingLeft":
    case "paddingRight":
    case "paddingTop":
    case "paddingBottom":
      syncPadding(flex, props)
      break
    case "margin":
    case "marginX":
    case "marginY":
    case "marginLeft":
    case "marginRight":
    case "marginTop":
    case "marginBottom":
      syncMargin(flex, props)
      break
    case "gap":
      syncGap(flex, props.gap)
      break
    case "alignX":
    case "alignY":
    case "justifyContent":
    case "alignItems":
      syncAlign(flex, props)
      if ((key === "alignX" || key === "alignY") && node.parent?.props.layout === "grid") {
        gridSyncDiagnostics.set(node, gridDiagnostics(node))
        refreshParentGridValidation(node)
      }
      break
    case "width":
    case "height":
    case "flexGrow":
    case "flexShrink":
      if (node.parent?.props.layout === "grid") {
        syncGridItemSizing(node)
      } else {
        syncSizing(
          flex,
          node._widthSizing,
          node._heightSizing,
          props.flexGrow,
          props.flexShrink,
          parentDirection(node),
        )
      }
      if ((key === "flexGrow" || key === "flexShrink") && node.parent?.props.layout === "grid") {
        gridSyncDiagnostics.set(node, gridDiagnostics(node))
        refreshParentGridValidation(node)
      }
      break
    case "flexBasis":
    case "flexWrap":
      if (node.parent?.props.layout === "grid") {
        gridSyncDiagnostics.set(node, gridDiagnostics(node))
        refreshParentGridValidation(node)
      }
      break
    case "minWidth":
    case "maxWidth":
    case "minHeight":
    case "maxHeight":
      syncMinMax(flex, props)
      break
    case "borderWidth":
    case "borderLeft":
    case "borderRight":
    case "borderTop":
    case "borderBottom":
    case "hoverStyle":
    case "activeStyle":
    case "focusStyle":
      syncBorder(flex, props)
      break
    case "floating":
      syncFloating(flex, props)
      if (node.parent?.props.layout === "grid") {
        syncGridItemSizing(node)
      } else {
        syncSizing(
          flex,
          node._widthSizing,
          node._heightSizing,
          props.flexGrow,
          props.flexShrink,
          parentDirection(node),
        )
      }
      break
    case "floatOffset":
    case "zIndex":
      syncFloating(flex, props)
      break
    case "scrollX":
    case "scrollY":
      syncScroll(flex, props)
      break
  }
}

function asGridNode(node: TGENode): GridNode {
  const flex = node._flexNode as GridNode | null
  if (!flex || typeof flex.setLayoutMode !== "function") {
    throw new Error("Grid layout requires the vendored Flexily Grid node")
  }
  return flex
}

const EMPTY_GRID_TRACKS: readonly GridTrack[] = Object.freeze([])
const EMPTY_GRID_AREAS: readonly (readonly (string | null)[])[] = Object.freeze([])

function gridContentAlignment(value: unknown): GridContentAlignment {
  if (value === "left" || value === "flex-start") return "start"
  if (value === "right" || value === "flex-end") return "end"
  if (value === undefined) return "stretch"
  return value as GridContentAlignment
}

function gridItemAlignment(value: unknown): GridItemAlignment {
  if (value === "top" || value === "flex-start") return "start"
  if (value === "bottom" || value === "flex-end") return "end"
  if (value === undefined) return "stretch"
  return value as GridItemAlignment
}

function gridStyle(props: TGEProps): GridStyle {
  return Object.freeze({
    columns: props.gridTemplateColumns ?? EMPTY_GRID_TRACKS,
    rows: props.gridTemplateRows ?? EMPTY_GRID_TRACKS,
    autoColumns: (props.gridAutoColumns ?? "auto") as GridTrackSize,
    autoRows: (props.gridAutoRows ?? "auto") as GridTrackSize,
    autoFlow: (props.gridAutoFlow ?? "row") as GridAutoFlow,
    areas: props.gridTemplateAreas ?? EMPTY_GRID_AREAS,
    gap: props.gap ?? 0,
    justifyContent: gridContentAlignment(props.justifyContent),
    alignContent: (props.alignContent ?? "stretch") as GridContentAlignment,
    justifyItems: (props.justifyItems ?? "stretch") as GridItemAlignment,
    alignItems: gridItemAlignment(props.alignItems),
  })
}

function gridItemStyle(props: TGEProps): GridItemStyle {
  return Object.freeze({
    ...(props.gridRow === undefined ? {} : { row: props.gridRow as GridPlacement }),
    ...(props.gridColumn === undefined ? {} : { column: props.gridColumn as GridPlacement }),
    ...(props.gridArea === undefined ? {} : { area: props.gridArea as GridAreaPlacement }),
    ...(props.justifySelf === undefined ? {} : { justifySelf: props.justifySelf }),
    ...(props.alignSelf === undefined ? {} : { alignSelf: props.alignSelf }),
  })
}

function sameGridStyle(left: GridStyle, right: GridStyle): boolean {
  return left.columns === right.columns
    && left.rows === right.rows
    && left.autoColumns === right.autoColumns
    && left.autoRows === right.autoRows
    && left.autoFlow === right.autoFlow
    && left.areas === right.areas
    && Object.is(left.gap, right.gap)
    && left.justifyContent === right.justifyContent
    && left.alignContent === right.alignContent
    && left.justifyItems === right.justifyItems
    && left.alignItems === right.alignItems
}

function sameGridItem(left: GridItemStyle, right: GridItemStyle): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.area === right.area
    && left.justifySelf === right.justifySelf
    && left.alignSelf === right.alignSelf
}

function gridDiagnostics(node: TGENode): readonly GridSyncDiagnostic[] {
  const props = node.props
  const flexOnly = props as TGEProps & Record<string, unknown>
  const diagnostics: GridSyncDiagnostic[] = []
  const add = (code: GridSyncDiagnostic["code"], path: string): void => {
    diagnostics.push(Object.freeze({ code, path, nodeId: node.id }))
  }

  // These aliases have a precise Flex meaning and no implicit Grid fallback.
  if (props.alignX !== undefined) add("GRID_INVALID_VALUE", "alignX")
  if (props.alignY !== undefined) add("GRID_INVALID_VALUE", "alignY")

  const alignItems = props.alignItems as unknown
  if (alignItems === "space-between" || alignItems === "space-around" || alignItems === "space-evenly") {
    add("GRID_UNSUPPORTED_ALIGNMENT", "alignItems")
  }

  // A Grid container has a fixed horizontal LTR profile. Flex container
  // direction/wrapping props are therefore reported, never translated into a
  // second layout mode. A Grid item may still use its own Flex direction when
  // its own layout mode is Flex.
  if (props.layout === "grid") {
    if (props.direction !== undefined) add("GRID_INVALID_VALUE", "direction")
    if (props.flexDirection !== undefined) add("GRID_INVALID_VALUE", "flexDirection")
    if (flexOnly.flexWrap !== undefined) add("GRID_INVALID_VALUE", "flexWrap")
  }

  // Flex growth belongs to the parent profile. A Grid child inside Flex still
  // participates in Flex growth; the same props under a Grid parent are not
  // silently translated into Grid sizing.
  if (node.parent?.props.layout === "grid") {
    if (props.flexGrow !== undefined) add("GRID_INVALID_VALUE", "flexGrow")
    if (props.flexShrink !== undefined) add("GRID_INVALID_VALUE", "flexShrink")
    if (flexOnly.flexBasis !== undefined) add("GRID_INVALID_VALUE", "flexBasis")
  }
  return Object.freeze(diagnostics)
}

function diagnosticError(node: TGENode, diagnostic: GridSyncDiagnostic | undefined): GridLayoutError | null {
  if (!diagnostic) return null
  const owner = findDiagnosticNode(node, diagnostic.nodeId)
  const flex = owner?._flexNode as GridNode | null
  return Object.freeze({
    code: diagnostic.code,
    path: diagnostic.path,
    // GridCalculateResult uses the retained Flexily node identity, matching
    // solver errors. Bridge-only diagnostics keep the TGE id separately.
    nodeId: flex?.getGridNodeId?.() ?? diagnostic.nodeId,
  })
}

function findDiagnosticNode(node: TGENode, nodeId: number): TGENode | undefined {
  if (node.id === nodeId) return node
  for (const child of node.children) {
    const owner = findDiagnosticNode(child, nodeId)
    if (owner) return owner
  }
  return undefined
}

/** Return the first deterministic bridge diagnostic owned by this Grid tree. */
function firstGridDiagnostic(node: TGENode): GridSyncDiagnostic | undefined {
  if (node.props.layout !== "grid") return undefined
  const own = gridDiagnostics(node)
  if (own.length > 0) return own[0]
  for (const child of node.children) {
    const childDiagnostics = gridDiagnostics(child)
    if (childDiagnostics.length > 0) return childDiagnostics[0]
  }
  return undefined
}

function syncGridValidation(node: TGENode): void {
  const flex = node._flexNode as GridNode | null
  if (!flex || typeof flex.setGridValidationError !== "function") return
  flex.setGridValidationError(diagnosticError(node, firstGridDiagnostic(node)))
}

function refreshParentGridValidation(node: TGENode): void {
  const parent = node.parent
  if (parent?.props.layout === "grid") syncGridValidation(parent)
}

function syncGridLayout(node: TGENode): void {
  const flex = asGridNode(node)
  const style = gridStyle(node.props)
  const item = gridItemStyle(node.props)
  const prior = gridSyncStates.get(node)
  const currentRevision = flex.getGridRevision()
  const styleChanged = !prior || !sameGridStyle(prior.style, style) || prior.revision !== currentRevision
  const itemChanged = !prior || !sameGridItem(prior.item, item)

  flex.setLayoutMode("grid")
  if (styleChanged) {
    flex.setGridStyle(style)
  }
  if (itemChanged) syncGridItem(node, flex, item)

  // Node style still carries dimensions, spacing, borders, floating and
  // scrolling. Grid sizing reads those values, while Grid owns track gaps and
  // alignment in its immutable style snapshot.
  if (!prior) {
    syncPadding(flex, node.props)
    syncMargin(flex, node.props)
    if (node.parent?.props.layout === "grid") {
      syncGridItemSizing(node)
    } else {
      syncSizing(
        flex,
        node._widthSizing,
        node._heightSizing,
        node.props.flexGrow,
        node.props.flexShrink,
        parentDirection(node),
      )
    }
    syncMinMax(flex, node.props)
    syncBorder(flex, node.props)
    syncFloating(flex, node.props)
    syncScroll(flex, node.props)
  }

  gridSyncDiagnostics.set(node, gridDiagnostics(node))
  gridSyncStates.set(node, { style, item, revision: flex.getGridRevision() })

  // A parent profile can switch from Flex to Grid after its children have
  // already been synchronized. Refresh only each child's placement seam so
  // that the switch does not require a second tree-wide reconciliation pass.
  for (const child of node.children) {
    if (child._flexNode) {
      syncGridItem(child)
      if (child.kind === "text") syncGridTextIntrinsic(child)
      else syncGridItemSizing(child)
      gridSyncDiagnostics.set(child, gridDiagnostics(child))
    }
  }
  syncGridValidation(node)
}

function syncGridItem(node: TGENode, providedFlex?: Node, providedItem?: GridItemStyle): void {
  const flex = (providedFlex ?? node._flexNode) as GridNode | null
  if (!flex || typeof flex.setGridItemStyle !== "function") return
  const item = providedItem ?? gridItemStyle(node.props)
  const prior = gridItemStates.get(node)
  if (!prior && Object.keys(item).length === 0) return
  if (prior && sameGridItem(prior, item)) return
  flex.setGridItemStyle(item)
  gridItemStates.set(node, item)
}

function gridTextIntrinsicOptions(node: TGENode) {
  const props = node.props
  return {
    text: collectText(node),
    fontId: props.fontId,
    fontSize: props.fontSize,
    lineHeight: props.lineHeight,
    fontFamily: props.fontFamily,
    fontWeight: props.fontWeight,
    fontStyle: props.fontStyle,
    whiteSpace: props.whiteSpace,
    wordBreak: props.wordBreak,
  }
}

/** Attach the live Grid intrinsic callback to one retained text Node. */
function syncGridTextIntrinsic(node: TGENode): void {
  const flex = node._flexNode as GridNode | null
  if (!flex || typeof flex.setIntrinsicMeasureFunc !== "function") return

  const isGridItem = node.parent?.props.layout === "grid"
  syncGridTextSizing(node, isGridItem)
  const current = flex.getIntrinsicMeasureFunc()
  const prior = gridTextIntrinsicStates.get(node)
  if (!isGridItem) {
    if (current) flex.setIntrinsicMeasureFunc(null)
    gridTextIntrinsicStates.delete(node)
    return
  }

  if (prior && current === prior) return
  const measure = createGridTextIntrinsicAdapter(() => gridTextIntrinsicOptions(node))
  flex.setIntrinsicMeasureFunc(measure)
  gridTextIntrinsicStates.set(node, measure)
}

/** Keep the Flex text measure node compatible with the active parent profile. */
function syncGridTextSizing(node: TGENode, isGridItem: boolean): void {
  const flex = node._flexNode
  if (!flex) return
  const sizing = node._widthSizing
  const height = node._heightSizing
  const mode = sizing
    ? `${isGridItem ? "grid" : "flex"}:${sizing.type}:${sizing.value}`
    : isGridItem ? "grid:auto" : "flex:fit-content"
  const state = `${mode}|${height ? `${height.type}:${height.value}` : "auto"}`
  if (gridTextSizingStates.get(node) === state) return

  if (!sizing) {
    if (isGridItem) flex.setWidthAuto()
    else setWidthFitContent(flex)
  } else if (isGridItem && sizing.type === SIZING.FIT) {
    // An explicit width="fit" remains fit-content in Grid; omitted width is
    // the only case that becomes auto so the Grid item's default stretch can
    // use the resolved area while intrinsic measurement still sizes tracks.
    setWidthFitContent(flex)
  } else {
    syncWidthSizing(flex, sizing)
  }
  if (height) {
    if (isGridItem && height.type === SIZING.FIT) setHeightFitContent(flex)
    else syncHeightSizing(flex, height)
  } else if (isGridItem) {
    flex.setHeightAuto()
  }
  gridTextSizingStates.set(node, state)
}

function syncGridLayoutProp(node: TGENode, key: string): void {
  const flex = asGridNode(node)
  if (key === "layout") {
    syncGridLayout(node)
    return
  }
  if (GRID_STYLE_PROPS.has(key) || GRID_ITEM_PROPS.has(key)) {
    syncGridLayout(node)
    return
  }

  const props = node.props
  switch (key) {
    case "direction":
    case "flexDirection":
      // The Grid profile is always horizontal LTR; own Flex direction is
      // intentionally ignored. It is not sent to Flexily's Flex style.
      gridSyncDiagnostics.set(node, gridDiagnostics(node))
      syncGridValidation(node)
      return
    case "alignX":
    case "alignY":
      gridSyncDiagnostics.set(node, gridDiagnostics(node))
      syncGridValidation(node)
      return
    case "flexWrap":
      gridSyncDiagnostics.set(node, gridDiagnostics(node))
      syncGridValidation(node)
      return
    case "flexBasis":
      // flex-basis is an item sizing property. It remains available to a
      // Grid node when its parent is Flex, but is invalid when that parent is
      // Grid; either way it is never translated into Grid track sizing.
      gridSyncDiagnostics.set(node, gridDiagnostics(node))
      syncGridValidation(node)
      return
    case "width":
    case "height":
      if (node.parent?.props.layout === "grid") {
        syncGridItemSizing(node)
      } else {
        syncSizing(
          flex,
          node._widthSizing,
          node._heightSizing,
          props.flexGrow,
          props.flexShrink,
          parentDirection(node),
        )
      }
      return
    case "flexGrow":
    case "flexShrink":
      if (node.parent?.props.layout === "grid") {
        syncGridItemSizing(node)
      } else {
        syncSizing(
          flex,
          node._widthSizing,
          node._heightSizing,
          props.flexGrow,
          props.flexShrink,
          parentDirection(node),
        )
      }
      gridSyncDiagnostics.set(node, gridDiagnostics(node))
      refreshParentGridValidation(node)
      return
    case "padding":
    case "paddingX":
    case "paddingY":
    case "paddingLeft":
    case "paddingRight":
    case "paddingTop":
    case "paddingBottom":
      syncPadding(flex, props)
      return
    case "margin":
    case "marginX":
    case "marginY":
    case "marginLeft":
    case "marginRight":
    case "marginTop":
    case "marginBottom":
      syncMargin(flex, props)
      return
    case "minWidth":
    case "maxWidth":
    case "minHeight":
    case "maxHeight":
      syncMinMax(flex, props)
      return
    case "borderWidth":
    case "borderLeft":
    case "borderRight":
    case "borderTop":
    case "borderBottom":
    case "hoverStyle":
    case "activeStyle":
    case "focusStyle":
      syncBorder(flex, props)
      return
    case "floating":
      syncFloating(flex, props)
      return
    case "floatOffset":
    case "zIndex":
      syncFloating(flex, props)
      return
    case "scrollX":
    case "scrollY":
      syncScroll(flex, props)
      return
  }
}

export function createTextFlexNode(node: TGENode): void {
  if (node._flexNode) return
  const flex = Node.create()
  node._flexNode = flex
  setWidthFitContent(flex)
  flex.setMeasureFunc((width, widthMode, _height, _heightMode) => {
    const content = collectText(node)
    if (!content) return { width: 0, height: 0 }
    const props = node.props
    const fontSize = props.fontSize ?? 14
    const fontId = props.fontId ?? 0
    const fontFamily = props.fontFamily
    const fontWeight = props.fontWeight
    const fontStyle = props.fontStyle
    const options: TextLayoutOptions = {
      whiteSpace: props.whiteSpace,
      wordBreak: props.wordBreak,
      fontFamily,
      fontWeight,
      fontStyle,
    }
    const maxW = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width
    if (maxW === Infinity || maxW <= 0) {
      return measureForLayout(content, fontId, fontSize, fontFamily, fontWeight, fontStyle)
    }
    return measureTextConstrained(content, fontId, fontSize, maxW, fontFamily, fontWeight, fontStyle, options)
  })
  const parent = node.parent?._flexNode
  if (parent) {
    parent.insertChild(flex, node._siblingIndex)
    // Text nodes are materialized lazily during walk-tree. Apply any Grid
    // item placement that arrived before that materialization to the same
    // retained Node, without creating a second text/layout path.
    if (node.parent?.props.layout === "grid") syncGridItem(node)
    syncGridTextIntrinsic(node)
  }
}

function syncDirection(flex: Node, props: TGEProps): void {
  const dir = props.direction ?? props.flexDirection
  flex.setFlexDirection(dir === "row" ? FLEX_DIRECTION_ROW : FLEX_DIRECTION_COLUMN)
}

function parentDirection(node: TGENode): number {
  const parent = node.parent
  if (!parent) return FLEX_DIRECTION_COLUMN
  return parseDir(parent.props.direction ?? parent.props.flexDirection) === 0
    ? FLEX_DIRECTION_ROW
    : FLEX_DIRECTION_COLUMN
}

function syncChildSizing(node: TGENode): void {
  for (const child of node.children) {
    const flex = child._flexNode
    if (!flex || child.kind === "text") continue
    const props = child.props
    syncSizing(
      flex,
      child._widthSizing,
      child._heightSizing,
      props.flexGrow,
      props.flexShrink,
      parentDirection(child),
    )
  }
}

function gridItemSizingKey(node: TGENode): string {
  const width = node._widthSizing
  const height = node._heightSizing
  return `${width?.type ?? "auto"}:${width?.value ?? 0}|${height?.type ?? "auto"}:${height?.value ?? 0}`
}

/** Apply Grid's item sizing semantics without mutating the public props. */
function syncGridItemSizing(node: TGENode): void {
  const flex = node._flexNode
  if (!flex) return
  const key = gridItemSizingKey(node)
  if (gridItemSizingStates.get(node) === key) return
  syncSizing(flex, node._widthSizing, node._heightSizing, undefined, undefined, parentDirection(node), true)
  gridItemSizingStates.set(node, key)
}

function syncPadding(flex: Node, props: TGEProps): void {
  const px = props.paddingX ?? props.padding ?? 0
  const py = props.paddingY ?? props.padding ?? 0
  flex.setPadding(EDGE_LEFT, props.paddingLeft ?? px)
  flex.setPadding(EDGE_RIGHT, props.paddingRight ?? px)
  flex.setPadding(EDGE_TOP, props.paddingTop ?? py)
  flex.setPadding(EDGE_BOTTOM, props.paddingBottom ?? py)
}

function syncMargin(flex: Node, props: TGEProps): void {
  const mx = props.marginX ?? props.margin ?? 0
  const my = props.marginY ?? props.margin ?? 0
  flex.setMargin(EDGE_LEFT, props.marginLeft ?? mx)
  flex.setMargin(EDGE_RIGHT, props.marginRight ?? mx)
  flex.setMargin(EDGE_TOP, props.marginTop ?? my)
  flex.setMargin(EDGE_BOTTOM, props.marginBottom ?? my)
}

function syncGap(flex: Node, value: number | undefined): void {
  flex.setGap(GUTTER_ALL, value ?? 0)
}

function syncAlign(flex: Node, props: TGEProps): void {
  const dir = parseDir(props.direction ?? props.flexDirection)
  const ax = parseAlignX(props.alignX ?? props.justifyContent)
  const ay = parseAlignY(props.alignY ?? props.alignItems)
  if (dir === 1) {
    flex.setJustifyContent(mapJustify(ay))
    flex.setAlignItems(mapAlign(ax))
    return
  }
  flex.setJustifyContent(mapJustify(ax))
  flex.setAlignItems(mapAlign(ay))
}

function syncSizing(
  flex: Node,
  ws: SizingInfo | null,
  hs: SizingInfo | null,
  flexGrow?: number,
  flexShrink?: number,
  parentDir = FLEX_DIRECTION_COLUMN,
  gridItem = false,
): void {
  const widthMainGrow = ws?.type === SIZING.GROW && parentDir === FLEX_DIRECTION_ROW
  const heightMainGrow = hs?.type === SIZING.GROW && parentDir === FLEX_DIRECTION_COLUMN
  const crossGrow = (ws?.type === SIZING.GROW && parentDir === FLEX_DIRECTION_COLUMN)
    || (hs?.type === SIZING.GROW && parentDir === FLEX_DIRECTION_ROW)

  if (ws) {
    if (gridItem && ws.type === SIZING.FIT) setWidthFitContent(flex)
    else syncWidthSizing(flex, ws)
  } else if (gridItem) {
    // Omitted Grid item dimensions remain auto so Grid's default stretch can
    // size the item to its resolved area.
    flex.setWidthAuto()
  } else if (flexGrow === undefined) {
    // Auto-sized wrappers must clamp to the width offered by their parent.
    // Leaving them in the intrinsic AUTO mode lets a long text child expand
    // past a narrow responsive column before its measure function sees a
    // useful width constraint.
    setWidthFitContent(flex)
  }
  if (hs) {
    if (gridItem && hs.type === SIZING.FIT) setHeightFitContent(flex)
    else syncHeightSizing(flex, hs)
  } else if (gridItem) {
    flex.setHeightAuto()
  }

  const growsOnMainAxis = flexGrow !== undefined || widthMainGrow || heightMainGrow
  flex.setFlexGrow(
    flexGrow !== undefined
      ? flexGrow
      : growsOnMainAxis
        ? 1
        : 0,
  )
  flex.setFlexShrink(flexShrink ?? (growsOnMainAxis ? 1 : 0))
  flex.setAlignSelf(crossGrow ? ALIGN_STRETCH : ALIGN_AUTO)
}

function syncWidthSizing(flex: Node, sizing: SizingInfo): void {
  switch (sizing.type) {
    case SIZING.GROW:
      // Grow is resolved after both axes are known in syncSizing. Keep the
      // width auto so row flex distribution and column cross-axis stretching
      // both receive a definite, non-stale basis.
      flex.setWidthAuto()
      break
    case SIZING.PERCENT:
      flex.setWidthPercent(sizing.value * 100)
      break
    case SIZING.FIXED:
      flex.setWidth(sizing.value)
      break
    case SIZING.FIT:
      // Explicit fit means shrink-wrap the node's intrinsic children. The
      // AUTO unit lets Flexily measure nested boxes; omitted width still uses
      // FIT_CONTENT below so responsive wrappers clamp long text.
      flex.setWidthAuto()
      break
  }
}

type FitContentNode = Node & { setWidthFitContent?: () => void; setHeightFitContent?: () => void }

function setWidthFitContent(flex: Node): void {
  const node = flex as FitContentNode
  if (node.setWidthFitContent) {
    node.setWidthFitContent()
    return
  }
  // Older Flexily builds do not expose fit-content; AUTO is the closest
  // fallback and keeps the bridge usable with those runtimes.
  flex.setWidthAuto()
}

function setHeightFitContent(flex: Node): void {
  const node = flex as FitContentNode
  if (node.setHeightFitContent) {
    node.setHeightFitContent()
    return
  }
  flex.setHeightAuto()
}

function syncHeightSizing(flex: Node, sizing: SizingInfo): void {
  switch (sizing.type) {
    case SIZING.GROW:
      // Grow is resolved after both axes are known in syncSizing.
      flex.setHeightAuto()
      break
    case SIZING.PERCENT:
      flex.setHeightPercent(sizing.value * 100)
      break
    case SIZING.FIXED:
      flex.setHeight(sizing.value)
      break
    case SIZING.FIT:
      flex.setHeightAuto()
      break
  }
}

function syncMinMax(flex: Node, props: TGEProps): void {
  if (props.minWidth !== undefined) flex.setMinWidth(props.minWidth)
  if (props.maxWidth !== undefined) flex.setMaxWidth(props.maxWidth)
  if (props.minHeight !== undefined) flex.setMinHeight(props.minHeight)
  if (props.maxHeight !== undefined) flex.setMaxHeight(props.maxHeight)
}

function syncBorder(flex: Node, props: TGEProps): void {
  const bw = Math.max(props.borderWidth ?? 0, maxInteractiveBorder(props))
  flex.setBorder(EDGE_ALL, bw)
  if (props.borderLeft !== undefined) flex.setBorder(EDGE_LEFT, props.borderLeft)
  if (props.borderRight !== undefined) flex.setBorder(EDGE_RIGHT, props.borderRight)
  if (props.borderTop !== undefined) flex.setBorder(EDGE_TOP, props.borderTop)
  if (props.borderBottom !== undefined) flex.setBorder(EDGE_BOTTOM, props.borderBottom)
}

function syncFloating(flex: Node, props: TGEProps): void {
  if (!props.floating) return
  flex.setPositionType(POSITION_TYPE_ABSOLUTE)
  flex.setPosition(EDGE_LEFT, props.floatOffset?.x ?? 0)
  flex.setPosition(EDGE_TOP, props.floatOffset?.y ?? 0)
}

function syncScroll(flex: Node, props: TGEProps): void {
  if (props.scrollX || props.scrollY) flex.setOverflow(OVERFLOW_SCROLL)
}
