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
} from "flexily"
import { SIZING, type TGENode, type SizingInfo, type TGEProps } from "./node-types"

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

export function isLayoutProp(name: string): boolean {
  return LAYOUT_PROPS.has(name)
}

export function mapJustify(value: number): number {
  if (value === 1) return JUSTIFY_FLEX_END
  if (value === 2) return JUSTIFY_CENTER
  if (value === 3) return JUSTIFY_SPACE_BETWEEN
  return JUSTIFY_FLEX_START
}

export function mapAlign(value: number): number {
  if (value === 255) return ALIGN_STRETCH
  if (value === 1) return ALIGN_FLEX_END
  if (value === 2) return ALIGN_CENTER
  if (value === 3) return ALIGN_SPACE_BETWEEN
  return ALIGN_FLEX_START
}

export function parseDir(value: unknown): number {
  return value === "column" ? 1 : 0
}

export function parseAlignX(value: unknown): number {
  if (value === "right" || value === "flex-end") return 1
  if (value === "center") return 2
  if (value === "space-between") return 3
  return 0
}

export function parseAlignY(value: unknown): number {
  if (value === "bottom" || value === "flex-end") return 1
  if (value === "center") return 2
  if (value === "space-between") return 3
  return 0
}

export function maxInteractiveBorder(props: TGEProps): number {
  return Math.max(
    props.focusStyle?.borderWidth ?? 0,
    props.hoverStyle?.borderWidth ?? 0,
    props.activeStyle?.borderWidth ?? 0,
  )
}

export function syncDirection(flex: Node, props: TGEProps): void {
  const dir = props.direction ?? props.flexDirection
  flex.setFlexDirection(dir === "column" ? FLEX_DIRECTION_COLUMN : FLEX_DIRECTION_ROW)
}

export function parentDirection(node: TGENode): number {
  const parent = node.parent
  if (!parent) return FLEX_DIRECTION_ROW
  return parseDir(parent.props.direction ?? parent.props.flexDirection) === 1
    ? FLEX_DIRECTION_COLUMN
    : FLEX_DIRECTION_ROW
}

export function syncChildSizing(node: TGENode): void {
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

export function syncPadding(flex: Node, props: TGEProps): void {
  const px = props.paddingX ?? props.padding ?? 0
  const py = props.paddingY ?? props.padding ?? 0
  flex.setPadding(EDGE_LEFT, props.paddingLeft ?? px)
  flex.setPadding(EDGE_RIGHT, props.paddingRight ?? px)
  flex.setPadding(EDGE_TOP, props.paddingTop ?? py)
  flex.setPadding(EDGE_BOTTOM, props.paddingBottom ?? py)
}

export function syncMargin(flex: Node, props: TGEProps): void {
  const mx = props.marginX ?? props.margin ?? 0
  const my = props.marginY ?? props.margin ?? 0
  flex.setMargin(EDGE_LEFT, props.marginLeft ?? mx)
  flex.setMargin(EDGE_RIGHT, props.marginRight ?? mx)
  flex.setMargin(EDGE_TOP, props.marginTop ?? my)
  flex.setMargin(EDGE_BOTTOM, props.marginBottom ?? my)
}

export function syncGap(flex: Node, value: number | undefined): void {
  flex.setGap(GUTTER_ALL, value ?? 0)
}

export function syncAlign(flex: Node, props: TGEProps): void {
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

export function syncSizing(
  flex: Node,
  ws: SizingInfo | null,
  hs: SizingInfo | null,
  flexGrow?: number,
  flexShrink?: number,
  parentDir = FLEX_DIRECTION_ROW,
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

export function syncWidthSizing(flex: Node, sizing: SizingInfo): void {
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

export type FitContentNode = Node & { setWidthFitContent?: () => void; setHeightFitContent?: () => void }

export function setWidthFitContent(flex: Node): void {
  const node = flex as FitContentNode
  if (node.setWidthFitContent) {
    node.setWidthFitContent()
    return
  }
  // Older Flexily builds do not expose fit-content; AUTO is the closest
  // fallback and keeps the bridge usable with those runtimes.
  flex.setWidthAuto()
}

export function setHeightFitContent(flex: Node): void {
  const node = flex as FitContentNode
  if (node.setHeightFitContent) {
    node.setHeightFitContent()
    return
  }
  flex.setHeightAuto()
}

export function syncHeightSizing(flex: Node, sizing: SizingInfo): void {
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

export function syncMinMax(flex: Node, props: TGEProps): void {
  if (props.minWidth !== undefined) flex.setMinWidth(props.minWidth)
  if (props.maxWidth !== undefined) flex.setMaxWidth(props.maxWidth)
  if (props.minHeight !== undefined) flex.setMinHeight(props.minHeight)
  if (props.maxHeight !== undefined) flex.setMaxHeight(props.maxHeight)
}

export function syncBorder(flex: Node, props: TGEProps): void {
  const bw = Math.max(props.borderWidth ?? 0, maxInteractiveBorder(props))
  flex.setBorder(EDGE_ALL, bw)
  if (props.borderLeft !== undefined) flex.setBorder(EDGE_LEFT, props.borderLeft)
  if (props.borderRight !== undefined) flex.setBorder(EDGE_RIGHT, props.borderRight)
  if (props.borderTop !== undefined) flex.setBorder(EDGE_TOP, props.borderTop)
  if (props.borderBottom !== undefined) flex.setBorder(EDGE_BOTTOM, props.borderBottom)
}

export function syncFloating(flex: Node, props: TGEProps): void {
  if (!props.floating) return
  flex.setPositionType(POSITION_TYPE_ABSOLUTE)
  flex.setPosition(EDGE_LEFT, props.floatOffset?.x ?? 0)
  flex.setPosition(EDGE_TOP, props.floatOffset?.y ?? 0)
}

export function syncScroll(flex: Node, props: TGEProps): void {
  if (props.scrollX || props.scrollY) flex.setOverflow(OVERFLOW_SCROLL)
}
