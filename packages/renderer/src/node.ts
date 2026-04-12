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

export type TGENodeKind = "box" | "text" | "img" | "root"

/** Interactive style props — usable in hoverStyle, activeStyle, focusStyle */
export type InteractiveStyleProps = Partial<Pick<TGEProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "borderRadius" | "shadow" | "boxShadow" | "glow" | "gradient" | "backdropBlur" | "opacity">>

export type TGEProps = {
  // Layout
  direction?: "row" | "column"
  /** Alias for direction (opentui compat) */
  flexDirection?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  /** Alias for alignX (opentui compat) */
  justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end"
  /** Alias for alignY (opentui compat) */
  alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end"

  // Sizing
  width?: number | string    // number=fixed, "100%"=percent, "fit"=fit, "grow"=grow
  height?: number | string
  /** When set, width behaves as "grow" (opentui compat) */
  flexGrow?: number
  /** Accepted for compat, Clay shrinks implicitly */
  flexShrink?: number

  // Visual
  backgroundColor?: string | number  // "#ff0000" or 0xff0000ff
  cornerRadius?: number
  /** CSS-friendly alias for cornerRadius (Decision 1) */
  borderRadius?: number
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }  // Per-corner radius
  borderColor?: string | number
  borderWidth?: number
  /** Opacity: 0.0 = fully transparent, 1.0 = fully opaque. Multiplies alpha of entire element. */
  opacity?: number

  // Compositing
  layer?: boolean  // Opt-in: this node becomes its own compositing layer

  // Scrolling / Clipping
  scrollX?: boolean  // Enable horizontal scroll clipping
  scrollY?: boolean  // Enable vertical scroll clipping
  scrollSpeed?: number  // Lines per scroll tick (default: natural accumulation)
  scrollId?: string  // Stable Clay ID for scroll container (set by ScrollView for programmatic control)

  // Floating / Absolute positioning
  floating?: "parent" | "root" | { attachTo: string }  // Enable floating: relative to parent, root, or named element
  floatOffset?: { x: number; y: number }               // Pixel offset from attach point
  zIndex?: number                                        // Z-order for floating elements
  floatAttach?: { element?: number; parent?: number }    // Attach point (0-8, 3x3 grid)
  pointerPassthrough?: boolean                           // Allow pointer events to pass through

  // Sizing constraints
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number

  // Per-side padding
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number

  // Per-side borders
  borderLeft?: number
  borderRight?: number
  borderTop?: number
  borderBottom?: number
  borderBetweenChildren?: number

  // Effects
  shadow?: {           // Drop shadow — painted BEFORE the rect
    x: number          // Horizontal offset (px)
    y: number          // Vertical offset (px)
    blur: number       // Blur radius (px)
    color: number      // Shadow color (packed RGBA u32)
  } | Array<{          // Multiple shadows — painted in order
    x: number
    y: number
    blur: number
    color: number
  }>
  /** CSS-friendly alias for shadow (Decision 1) */
  boxShadow?: TGEProps["shadow"]
  glow?: {                     // Outer glow — painted BEFORE the rect
    radius: number             // Glow spread radius (px)
    color: string | number     // Glow color (hex string or packed RGBA u32)
    intensity?: number         // 0-100, default 80
  }
  gradient?: {         // Gradient fill — painted INSTEAD of solid backgroundColor
    type: "linear"
    from: number       // Start color (packed RGBA u32)
    to: number         // End color (packed RGBA u32)
    angle?: number     // Degrees: 0=left→right, 90=top→bottom (default 90)
  } | {
    type: "radial"
    from: number       // Center color (packed RGBA u32)
    to: number         // Edge color (packed RGBA u32)
  }
  backdropBlur?: number  // Blur radius for content behind this element (glassmorphism)

  // Interactive states — merged over base props when active
  hoverStyle?: InteractiveStyleProps
  activeStyle?: InteractiveStyleProps
  /** Focus state — applied when element has focus (Decision 7) */
  focusStyle?: InteractiveStyleProps
  /** Unified press handler — fires on mouse click + Enter/Space when focused (Decision 6) */
  onPress?: () => void

  // Convenience
  /** CSS-style prop — merged with direct props (direct props win). Decision 3. */
  style?: Partial<TGEProps>

  // Image (<img> intrinsic)
  /** Image source — file path or URL. Decoded async on first render. */
  src?: string
  /** How the image fits within its layout box. Default: "contain". */
  objectFit?: "contain" | "cover" | "fill" | "none"

  // Text
  color?: string | number
  fontSize?: number
  fontId?: number
  lineHeight?: number
  wordBreak?: "normal" | "keep-all"
  whiteSpace?: "normal" | "pre-wrap"
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
}

export type TGENode = {
  kind: TGENodeKind
  props: TGEProps
  text: string          // for text nodes
  children: TGENode[]
  parent: TGENode | null
  /** Stable unique identifier for this node */
  id: number
  /** Whether this node has been removed from the tree */
  destroyed: boolean
  /** Computed layout rect — written after Clay layout pass */
  layout: LayoutRect
  /** Interactive state — managed by render loop hit-testing */
  _hovered: boolean
  _active: boolean
  _focused: boolean
  /** Decoded image RGBA data — set by image decode pipeline, read by paintCommand */
  _imageBuffer: { data: Uint8Array; width: number; height: number } | null
  /** Image decode state — prevents re-triggering decode */
  _imageState: "idle" | "loading" | "loaded" | "error"
  /** Pre-parsed width sizing — resolved once in setProperty, read every frame */
  _widthSizing: SizingInfo | null
  /** Pre-parsed height sizing — resolved once in setProperty, read every frame */
  _heightSizing: SizingInfo | null
}

/** Computed layout geometry from Clay — written each frame after layout */
export type LayoutRect = {
  x: number
  y: number
  width: number
  height: number
}

let nextNodeId = 1

export function createNode(kind: TGENodeKind): TGENode {
  return {
    kind,
    props: {},
    text: "",
    children: [],
    parent: null,
    id: nextNodeId++,
    destroyed: false,
    layout: { x: 0, y: 0, width: 0, height: 0 },
    _hovered: false,
    _active: false,
    _focused: false,
    _imageBuffer: null,
    _imageState: "idle",
    _widthSizing: { type: SIZING.FIT, value: 0 },
    _heightSizing: { type: SIZING.FIT, value: 0 },
  }
}

/**
 * Resolve effective props:
 *   1. Merge `style` prop under direct props (direct wins)
 *   2. Resolve aliases: borderRadius→cornerRadius, boxShadow→shadow
 *   3. Resolve padding shorthand: [Y,X] or [T,R,B,L]
 *   4. Merge hoverStyle/activeStyle/focusStyle when active
 */
export function resolveProps(node: TGENode): TGEProps {
  let base = node.props

  // 1. Merge style prop (direct props override style)
  if (base.style) {
    base = { ...base.style, ...base }
  }

  // 2. Resolve aliases
  if (base.borderRadius !== undefined && base.cornerRadius === undefined) {
    base = { ...base, cornerRadius: base.borderRadius }
  }
  if (base.boxShadow !== undefined && base.shadow === undefined) {
    base = { ...base, shadow: base.boxShadow }
  }

  // 3. Merge interactive states
  const needsInteractive = node._hovered || node._active || node._focused
  if (!needsInteractive) return base
  if (!base.hoverStyle && !base.activeStyle && !base.focusStyle) return base

  let resolved = base
  if (node._hovered && base.hoverStyle) {
    resolved = { ...resolved, ...base.hoverStyle }
  }
  if (node._focused && base.focusStyle) {
    resolved = { ...resolved, ...base.focusStyle }
  }
  if (node._active && base.activeStyle) {
    resolved = { ...resolved, ...base.activeStyle }
  }
  return resolved
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
  child.destroyed = true
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
  if (value === "row") return DIRECTION.LEFT_TO_RIGHT
  return DIRECTION.TOP_TO_BOTTOM
}

export function parseAlignX(value: string | undefined): number {
  if (value === "right" || value === "flex-end") return ALIGN_X.RIGHT
  if (value === "center") return ALIGN_X.CENTER
  if (value === "space-between") return ALIGN_X.SPACE_BETWEEN
  return ALIGN_X.LEFT // "left", "flex-start", or default
}

export function parseAlignY(value: string | undefined): number {
  if (value === "bottom" || value === "flex-end") return ALIGN_Y.BOTTOM
  if (value === "center") return ALIGN_Y.CENTER
  if (value === "space-between") return ALIGN_Y.SPACE_BETWEEN
  return ALIGN_Y.TOP // "top", "flex-start", or default
}
