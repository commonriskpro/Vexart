import { MEASURE_MODE_UNDEFINED } from "flexily"
import { acquireFlexNode } from "./flex-pool"
import { SIZING, type TGENode } from "./node-types"
import { measureForLayout, measureTextConstrained, type TextLayoutOptions } from "./text-layout"
import { createGridTextIntrinsicAdapter } from "./grid-text-intrinsics"
import type { GridIntrinsicMeasureFunc } from "./grid-types"
import {
  setHeightFitContent,
  setWidthFitContent,
  syncHeightSizing,
  syncWidthSizing,
} from "./flex-sync-style"
import { syncGridItem, type GridNode } from "./flex-sync-grid"

export const TEXT_LAYOUT_PROPS = new Set([
  "fontSize",
  "fontId",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "whiteSpace",
  "wordBreak",
])

export function isTextLayoutProp(name: string): boolean {
  return TEXT_LAYOUT_PROPS.has(name)
}

export function collectText(node: TGENode): string {
  if (node.text) return node.text
  return node.children.map((child) => collectText(child)).join("")
}

const gridTextIntrinsicStates = new WeakMap<TGENode, GridIntrinsicMeasureFunc>()
const gridTextSizingStates = new WeakMap<TGENode, string>()

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
export function syncGridTextIntrinsic(node: TGENode): void {
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
export function syncGridTextSizing(node: TGENode, isGridItem: boolean): void {
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

export function createTextFlexNode(node: TGENode): void {
  if (node._flexNode) return
  if (node.parent?.kind === "text") return
  const flex = acquireFlexNode()
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
