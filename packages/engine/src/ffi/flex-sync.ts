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
  ALIGN_SPACE_BETWEEN,
  ALIGN_STRETCH,
  JUSTIFY_FLEX_START,
  JUSTIFY_FLEX_END,
  JUSTIFY_CENTER,
  JUSTIFY_SPACE_BETWEEN,
  MEASURE_MODE_UNDEFINED,
} from "flexily"
import type { TGENode, SizingInfo, TGEProps } from "./node"
import { SIZING } from "./node"
import { measureForLayout, measureTextConstrained } from "./text-layout"

export const LAYOUT_PROPS = new Set([
  "direction", "flexDirection", "padding", "paddingX", "paddingY",
  "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
  "margin", "marginX", "marginY", "marginLeft", "marginRight", "marginTop", "marginBottom",
  "gap", "alignX", "alignY", "justifyContent", "alignItems",
  "width", "height", "flexGrow", "flexShrink",
  "minWidth", "maxWidth", "minHeight", "maxHeight",
  "floating", "floatOffset", "zIndex",
  "borderWidth", "borderLeft", "borderRight", "borderTop", "borderBottom",
  "hoverStyle", "activeStyle", "focusStyle",
  "scrollX", "scrollY",
])

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
  if (!flex || node.kind === "text") return
  const props = node.props
  syncDirection(flex, props)
  syncPadding(flex, props)
  syncMargin(flex, props)
  syncGap(flex, props.gap)
  syncAlign(flex, props)
  syncSizing(flex, node._widthSizing, node._heightSizing, props.flexGrow)
  syncMinMax(flex, props)
  syncBorder(flex, props)
  syncFloating(flex, props)
  syncScroll(flex, props)
}

export function syncLayoutProp(node: TGENode, key: string, _value: unknown): void {
  const flex = node._flexNode
  if (!flex) return
  if (node.kind === "text") {
    flex.markDirty()
    return
  }
  const props = node.props
  switch (key) {
    case "direction":
    case "flexDirection":
      syncDirection(flex, props)
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
      break
    case "width":
    case "height":
    case "flexGrow":
    case "flexShrink":
      syncSizing(flex, node._widthSizing, node._heightSizing, props.flexGrow)
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

export function createTextFlexNode(node: TGENode): void {
  if (node._flexNode) return
  const flex = Node.create()
  node._flexNode = flex
  flex.setMeasureFunc((width, widthMode, _height, _heightMode) => {
    const content = collectText(node)
    if (!content) return { width: 0, height: 0 }
    const props = node.props
    const fontSize = props.fontSize ?? 14
    const fontId = props.fontId ?? 0
    const fontFamily = props.fontFamily
    const fontWeight = props.fontWeight
    const fontStyle = props.fontStyle
    const maxW = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width
    if (maxW === Infinity || maxW <= 0) {
      return measureForLayout(content, fontId, fontSize, fontFamily, fontWeight, fontStyle)
    }
    return measureTextConstrained(content, fontId, fontSize, maxW, fontFamily, fontWeight, fontStyle)
  })
  const parent = node.parent?._flexNode
  if (parent) {
    parent.insertChild(flex, node._siblingIndex)
  }
}

function syncDirection(flex: Node, props: TGEProps): void {
  const dir = props.direction ?? props.flexDirection
  flex.setFlexDirection(dir === "row" ? FLEX_DIRECTION_ROW : FLEX_DIRECTION_COLUMN)
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

function syncSizing(flex: Node, ws: SizingInfo | null, hs: SizingInfo | null, flexGrow?: number): void {
  if (flexGrow !== undefined && ws === null) {
    flex.setFlexGrow(1)
  } else if (ws) {
    syncWidthSizing(flex, ws)
  }
  if (hs) syncHeightSizing(flex, hs)
}

function syncWidthSizing(flex: Node, sizing: SizingInfo): void {
  switch (sizing.type) {
    case SIZING.GROW:
      flex.setFlexGrow(1)
      break
    case SIZING.PERCENT:
      flex.setWidthPercent(sizing.value * 100)
      break
    case SIZING.FIXED:
      flex.setWidth(sizing.value)
      break
  }
}

function syncHeightSizing(flex: Node, sizing: SizingInfo): void {
  switch (sizing.type) {
    case SIZING.GROW:
      flex.setFlexGrow(1)
      break
    case SIZING.PERCENT:
      flex.setHeightPercent(sizing.value * 100)
      break
    case SIZING.FIXED:
      flex.setHeight(sizing.value)
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
