/**
 * TGENode — the bridge between SolidJS reconciler and Clay layout.
 *
 * SolidJS creates/manipulates TGENodes via createRenderer methods.
 * Each frame, we walk the TGENode tree and "replay" it into Clay
 * for layout calculation.
 *
 * TGENode is a simple retained tree — Clay is stateless immediate-mode,
 * so we need to maintain the tree structure ourselves.
 */

import { SIZING, DIRECTION, ALIGN_X, ALIGN_Y } from "./clay"

export type TGENodeKind = "box" | "text" | "root"

export type TGEProps = {
  // Layout
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"

  // Sizing
  width?: number | string    // number=fixed, "100%"=percent, "fit"=fit, "grow"=grow
  height?: number | string

  // Visual
  backgroundColor?: string | number  // "#ff0000" or 0xff0000ff
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number

  // Compositing
  layer?: boolean  // Opt-in: this node becomes its own compositing layer

  // Text
  color?: string | number
  fontSize?: number
  fontId?: number
}

export type TGENode = {
  kind: TGENodeKind
  props: TGEProps
  text: string          // for text nodes
  children: TGENode[]
  parent: TGENode | null
}

export function createNode(kind: TGENodeKind): TGENode {
  return {
    kind,
    props: {},
    text: "",
    children: [],
    parent: null,
  }
}

export function createTextNode(text: string): TGENode {
  const node = createNode("text")
  node.text = text
  return node
}

export function insertChild(parent: TGENode, child: TGENode, anchor?: TGENode) {
  child.parent = parent
  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx >= 0) {
      parent.children.splice(idx, 0, child)
      return
    }
  }
  parent.children.push(child)
}

export function removeChild(parent: TGENode, child: TGENode) {
  const idx = parent.children.indexOf(child)
  if (idx >= 0) parent.children.splice(idx, 1)
  child.parent = null
}

// ── Color parsing ──

export function parseColor(value: string | number | undefined): number {
  if (value === undefined) return 0
  if (typeof value === "number") return value
  // "#rrggbb" or "#rrggbbaa"
  const hex = value.startsWith("#") ? value.slice(1) : value
  if (hex.length === 6) return (parseInt(hex, 16) << 8 | 0xff) >>> 0
  if (hex.length === 8) return parseInt(hex, 16) >>> 0
  return 0
}

// ── Sizing parsing ──

export type SizingInfo = { type: number; value: number }

export function parseSizing(value: number | string | undefined): SizingInfo {
  if (value === undefined) return { type: SIZING.FIT, value: 0 }
  if (typeof value === "number") return { type: SIZING.FIXED, value }
  if (value === "fit") return { type: SIZING.FIT, value: 0 }
  if (value === "grow") return { type: SIZING.GROW, value: 0 }
  if (value.endsWith("%")) {
    const pct = parseFloat(value) / 100
    return { type: SIZING.PERCENT, value: pct }
  }
  return { type: SIZING.FIT, value: 0 }
}

export function parseDirection(value: string | undefined): number {
  if (value === "column") return DIRECTION.TOP_TO_BOTTOM
  return DIRECTION.LEFT_TO_RIGHT
}

export function parseAlignX(value: string | undefined): number {
  if (value === "right") return ALIGN_X.RIGHT
  if (value === "center") return ALIGN_X.CENTER
  return ALIGN_X.LEFT
}

export function parseAlignY(value: string | undefined): number {
  if (value === "bottom") return ALIGN_Y.BOTTOM
  if (value === "center") return ALIGN_Y.CENTER
  return ALIGN_Y.TOP
}
