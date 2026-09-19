import type { Node } from "flexily"
import type { TGENode, TGEProps } from "./node-types"
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
import {
  parentDirection,
  syncBorder,
  syncFloating,
  syncMargin,
  syncMinMax,
  syncPadding,
  syncScroll,
  syncSizing,
} from "./flex-sync-style"
import { syncGridTextIntrinsic } from "./flex-sync-text"

export const GRID_STYLE_PROPS = new Set([
  "layout", "gap", "justifyContent", "alignContent", "justifyItems", "alignItems",
  "gridTemplateColumns", "gridTemplateRows", "gridAutoColumns", "gridAutoRows",
  "gridAutoFlow", "gridTemplateAreas",
])

export const GRID_ITEM_PROPS = new Set(["gridColumn", "gridRow", "gridArea", "justifySelf", "alignSelf"])

export type GridNode = Node & {
  setLayoutMode: (mode: "flex" | "grid") => void
  getLayoutMode: () => "flex" | "grid"
  setGridStyle: (style: GridStyle) => void
  setGridItemStyle: (style: GridItemStyle) => void
  getGridStyle: () => GridStyle | null
  getGridRevision: () => number
  setIntrinsicMeasureFunc: (measure: GridIntrinsicMeasureFunc | null) => void
  getIntrinsicMeasureFunc: () => GridIntrinsicMeasureFunc | null
  setGridValidationError: (error: GridLayoutError | null) => void
  getGridNodeId?: () => number
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
const gridItemSizingStates = new WeakMap<TGENode, string>()

/** Read bridge diagnostics without exposing them as part of the public barrel. */
export function getGridSyncDiagnostics(node: TGENode): readonly GridSyncDiagnostic[] {
  return gridSyncDiagnostics.get(node) ?? []
}

export function recordGridDiagnostics(node: TGENode): readonly GridSyncDiagnostic[] {
  const diags = gridDiagnostics(node)
  gridSyncDiagnostics.set(node, diags)
  return diags
}

export function clearGridSyncState(node: TGENode): void {
  gridSyncStates.delete(node)
  gridSyncDiagnostics.delete(node)
}

export function clearGridItemSizing(node: TGENode): void {
  gridItemSizingStates.delete(node)
}

export function asGridNode(node: TGENode): GridNode {
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

export function gridStyle(props: TGEProps): GridStyle {
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

export function gridItemStyle(props: TGEProps): GridItemStyle {
  return Object.freeze({
    ...(props.gridRow === undefined ? {} : { row: props.gridRow as GridPlacement }),
    ...(props.gridColumn === undefined ? {} : { column: props.gridColumn as GridPlacement }),
    ...(props.gridArea === undefined ? {} : { area: props.gridArea as GridAreaPlacement }),
    ...(props.justifySelf === undefined ? {} : { justifySelf: props.justifySelf }),
    ...(props.alignSelf === undefined ? {} : { alignSelf: props.alignSelf }),
  })
}

export function sameGridStyle(left: GridStyle, right: GridStyle): boolean {
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

export function sameGridItem(left: GridItemStyle, right: GridItemStyle): boolean {
  return left.row === right.row
    && left.column === right.column
    && left.area === right.area
    && left.justifySelf === right.justifySelf
    && left.alignSelf === right.alignSelf
}

export function gridDiagnostics(node: TGENode): readonly GridSyncDiagnostic[] {
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

export function syncGridValidation(node: TGENode): void {
  const flex = node._flexNode as GridNode | null
  if (!flex || typeof flex.setGridValidationError !== "function") return
  flex.setGridValidationError(diagnosticError(node, firstGridDiagnostic(node)))
}

export function refreshParentGridValidation(node: TGENode): void {
  const parent = node.parent
  if (parent?.props.layout === "grid") syncGridValidation(parent)
}

export function syncGridLayout(node: TGENode): void {
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

export function syncGridItem(node: TGENode, providedFlex?: Node, providedItem?: GridItemStyle): void {
  const flex = (providedFlex ?? node._flexNode) as GridNode | null
  if (!flex || typeof flex.setGridItemStyle !== "function") return
  const item = providedItem ?? gridItemStyle(node.props)
  const prior = gridItemStates.get(node)
  if (!prior && Object.keys(item).length === 0) return
  if (prior && sameGridItem(prior, item)) return
  flex.setGridItemStyle(item)
  gridItemStates.set(node, item)
}

function gridItemSizingKey(node: TGENode): string {
  const width = node._widthSizing
  const height = node._heightSizing
  return `${width?.type ?? "auto"}:${width?.value ?? 0}|${height?.type ?? "auto"}:${height?.value ?? 0}`
}

/** Apply Grid's item sizing semantics without mutating the public props. */
export function syncGridItemSizing(node: TGENode): void {
  const flex = node._flexNode
  if (!flex) return
  const key = gridItemSizingKey(node)
  if (gridItemSizingStates.get(node) === key) return
  syncSizing(flex, node._widthSizing, node._heightSizing, undefined, undefined, parentDirection(node), true)
  gridItemSizingStates.set(node, key)
}

export function syncGridLayoutProp(node: TGENode, key: string): void {
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
