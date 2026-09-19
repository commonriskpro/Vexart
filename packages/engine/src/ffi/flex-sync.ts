import type { TGENode } from "./node-types"
import {
  LAYOUT_PROPS,
  isLayoutProp,
  parentDirection,
  syncAlign,
  syncBorder,
  syncChildSizing,
  syncDirection,
  syncFloating,
  syncGap,
  syncMargin,
  syncMinMax,
  syncPadding,
  syncScroll,
  syncSizing,
} from "./flex-sync-style"
import {
  GRID_ITEM_PROPS,
  type GridNode,
  type GridSyncDiagnostic,
  clearGridItemSizing,
  clearGridSyncState,
  getGridSyncDiagnostics,
  recordGridDiagnostics,
  refreshParentGridValidation,
  syncGridItem,
  syncGridItemSizing,
  syncGridLayout,
  syncGridLayoutProp,
} from "./flex-sync-grid"
import {
  createTextFlexNode,
  isTextLayoutProp,
  syncGridTextIntrinsic,
  syncGridTextSizing,
} from "./flex-sync-text"

export { LAYOUT_PROPS, isLayoutProp } from "./flex-sync-style"
export { type GridSyncDiagnostic, getGridSyncDiagnostics } from "./flex-sync-grid"
export { isTextLayoutProp, createTextFlexNode } from "./flex-sync-text"

export function syncAllLayoutProps(node: TGENode): void {
  if (node.kind === "text" && !node._flexNode && node.parent?.kind !== "text") {
    createTextFlexNode(node)
  }
  const flex = node._flexNode
  if (!flex) return
  if (node.kind === "text") {
    flex.markDirty()
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
    clearGridItemSizing(node)
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
  clearGridSyncState(node)
  refreshParentGridValidation(node)
}

export function syncLayoutProp(node: TGENode, key: string, _value: unknown): void {
  if (node.kind === "text" && !node._flexNode && node.parent?.kind !== "text") {
    createTextFlexNode(node)
  }
  const flex = node._flexNode
  if (!flex) return
  if (node.kind === "text") {
    if (GRID_ITEM_PROPS.has(key) && node.parent?.props.layout === "grid") syncGridItem(node)
    if (key === "width" || key === "height") syncGridTextSizing(node, node.parent?.props.layout === "grid")
    if (GRID_ITEM_PROPS.has(key) || isTextLayoutProp(key)) syncGridTextIntrinsic(node)
    recordGridDiagnostics(node)
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
        recordGridDiagnostics(node)
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
        recordGridDiagnostics(node)
        refreshParentGridValidation(node)
      }
      break
    case "flexBasis":
    case "flexWrap":
      if (node.parent?.props.layout === "grid") {
        recordGridDiagnostics(node)
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
