/**
 * TGENode — the bridge between SolidJS reconciler and Taffy/vexart layout.
 *
 * SolidJS creates/manipulates TGENodes via createRenderer methods.
 * Each frame, we walk the TGENode tree and emit commands into the
 * TypeScript layout adapter per design §8.
 *
 * TGENode is a simple retained tree. Taffy is stateless from TS's perspective
 * (layout tree is rebuilt each frame from TS state).
 *
 * Phase 2 migration: removed Clay FFI dependency. Constants are now
 * local to this module, matching the same numeric values for backward
 * compatibility with any callers that read them.
 */

// ── Layout constants (previously from clay.ts) ──
// Numeric values preserved for backward compat; semantics map through
// packages/engine/src/loop/layout-adapter.ts.

/** @public Sizing type enum that preserves the legacy clay sizing values. */
export const SIZING = {
  FIT: 0,
  GROW: 1,
  PERCENT: 2,
  FIXED: 3,
} as const

/** @public Flex direction enum that preserves the legacy clay direction values. */
export const DIRECTION = {
  LEFT_TO_RIGHT: 0,
  TOP_TO_BOTTOM: 1,
} as const

/** @public Horizontal alignment enum that preserves the legacy clay horizontal alignment values. */
export const ALIGN_X = { LEFT: 0, RIGHT: 1, CENTER: 2, SPACE_BETWEEN: 3 } as const

/** @public Vertical alignment enum that preserves the legacy clay vertical alignment values. */
export const ALIGN_Y = { TOP: 0, BOTTOM: 1, CENTER: 2, SPACE_BETWEEN: 3 } as const

/** @public */
export type TGENodeKind = "box" | "text" | "img" | "canvas" | "root"

/** @public */
export type InteractionMode = "none" | "drag"

export type NodeImageExtra = {
  buffer: { data: Uint8Array; width: number; height: number } | null
  state: "idle" | "loading" | "loaded" | "error"
  nativeHandle: bigint | null
}

export type NodeCanvasExtra = {
  displayListCommands: import("./canvas").DrawCmd[] | null
  displayListHash: string | null
  drawCacheKey: string | null
  nativeHandle: bigint | null
}

/** @public Event passed to onPress handlers. Supports stopPropagation like DOM events. */
export type PressEvent = {
  /** Prevent the event from bubbling to parent nodes. */
  stopPropagation: () => void
  /** Whether stopPropagation() was called. */
  readonly propagationStopped: boolean
}

/** @public Create a PressEvent instance. */
export function createPressEvent(): PressEvent {
  let stopped = false
  return {
    stopPropagation() { stopped = true },
    get propagationStopped() { return stopped },
  }
}

/** @public Mouse event passed to onMouseDown, onMouseUp, onMouseMove, onMouseOver, and onMouseOut handlers. */
export type NodeMouseEvent = {
  /** Pointer X in absolute pixels (screen-space). */
  x: number
  /** Pointer Y in absolute pixels (screen-space). */
  y: number
  /** Pointer X relative to the node's layout origin. */
  nodeX: number
  /** Pointer Y relative to the node's layout origin. */
  nodeY: number
  /** Node layout width — useful for ratio calculations (e.g. slider). */
  width: number
  /** Node layout height. */
  height: number
}

/** @public Self-filter configuration applied to the element's own paint output. */
export type FilterConfig = {
  /** Gaussian blur radius in px. Default: 0 (no blur). */
  blur?: number
  /** Brightness: 0=black, 100=unchanged, 200=2x bright. */
  brightness?: number
  /** Contrast: 0=grey, 100=unchanged, 200=high contrast. */
  contrast?: number
  /** Saturation: 0=grayscale, 100=unchanged, 200=hyper-saturated. */
  saturate?: number
  /** Grayscale: 0=unchanged, 100=full grayscale. */
  grayscale?: number
  /** Invert: 0=unchanged, 100=fully inverted. */
  invert?: number
  /** Sepia: 0=unchanged, 100=full sepia. */
  sepia?: number
  /** Hue rotation in degrees (0-360). */
  hueRotate?: number
}

/** @public Interactive style props usable in hoverStyle, activeStyle, and focusStyle. */
export type InteractiveStyleProps = Partial<Pick<TGEProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "borderRadius" | "shadow" | "boxShadow" | "glow" | "gradient" | "backdropBlur" | "backdropBrightness" | "backdropContrast" | "backdropSaturate" | "backdropGrayscale" | "backdropInvert" | "backdropSepia" | "backdropHueRotate" | "opacity" | "filter">>

/** @public */
export type TGEProps = {
  // Layout
  direction?: "row" | "column"
  /** Alias for direction (opentui compat) */
  flexDirection?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  margin?: number
  marginX?: number
  marginY?: number
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
  /** Declarative interaction state used by engine-level retained drag/compositor policies. */
  interactionMode?: InteractionMode
  debugName?: string

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
  viewportClip?: boolean                                 // Default true for browser-like viewport clipping of floating layers

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

  // Per-side margin
  marginLeft?: number
  marginRight?: number
  marginTop?: number
  marginBottom?: number

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
  /** Backdrop brightness filter. 0=black, 100=unchanged, 200=2x bright. */
  backdropBrightness?: number
  /** Backdrop contrast filter. 0=grey, 100=unchanged, 200=high contrast. */
  backdropContrast?: number
  /** Backdrop saturation filter. 0=grayscale, 100=unchanged, 200=hyper-saturated. */
  backdropSaturate?: number
  /** Backdrop grayscale filter. 0=unchanged, 100=full grayscale. */
  backdropGrayscale?: number
  /** Backdrop invert filter. 0=unchanged, 100=fully inverted. */
  backdropInvert?: number
  /** Backdrop sepia filter. 0=unchanged, 100=full sepia. */
  backdropSepia?: number
  /** Backdrop hue-rotate filter. 0-360 degrees, 0/360=unchanged. */
  backdropHueRotate?: number

  /**
   * Self-filter applied to this element's own paint output.
   * Unlike backdropBlur/backdropFilter which affect content BEHIND the element,
   * `filter` affects the element's own rendered pixels (REQ-2B-401).
   */
  filter?: FilterConfig

  /**
   * Hint that this property will change soon — pre-promotes the node to its own
   * GPU compositing layer to avoid runtime promotion cost (REQ-2B-501).
   * Accepted values: "transform", "opacity", "filter", "scroll".
   */
  willChange?: string | string[]

  /**
   * Containment boundary hint (REQ-2B-502).
   * - 'none': no containment (default).
   * - 'layout': size changes inside do not re-lay out siblings.
   * - 'paint': content clipped to bounds; no overflow visible.
   * - 'strict': layout + paint combined.
   */
  contain?: 'none' | 'layout' | 'paint' | 'strict'

  // Interactive states — merged over base props when active
  hoverStyle?: InteractiveStyleProps
  activeStyle?: InteractiveStyleProps
  /** Focus state — applied when element has focus (Decision 7) */
  focusStyle?: InteractiveStyleProps
  /** Unified press handler — fires on mouse click + Enter/Space when focused (Decision 6) */
  onPress?: (event?: PressEvent) => void
  /** Make this element focusable via Tab navigation. Like HTML tabindex="0". */
  focusable?: boolean
  /** Keyboard event handler — fires when this element is focused and a key is pressed. */
  onKeyDown?: (event: any) => void

  // Mouse event callbacks — dispatched by updateInteractiveStates in the render loop.
  /** Fires when mouse button is pressed while over this node. */
  onMouseDown?: (event: NodeMouseEvent) => void
  /** Fires when mouse button is released while over this node. */
  onMouseUp?: (event: NodeMouseEvent) => void
  /** Fires when pointer moves over this node (every frame while hovered). */
  onMouseMove?: (event: NodeMouseEvent) => void
  /** Fires when pointer enters this node's bounds. */
  onMouseOver?: (event: NodeMouseEvent) => void
  /** Fires when pointer leaves this node's bounds. */
  onMouseOut?: (event: NodeMouseEvent) => void

  // Transforms — 2D affine + pseudo-perspective
  /** Transform configuration: translate, rotate, scale, skew, perspective. */
  transform?: {
    translateX?: number    // pixels
    translateY?: number    // pixels
    rotate?: number        // degrees
    scale?: number         // uniform scale (1 = 100%)
    scaleX?: number        // horizontal scale
    scaleY?: number        // vertical scale
    skewX?: number         // degrees
    skewY?: number         // degrees
    perspective?: number   // perspective distance (higher = subtler, 0 = off)
    rotateX?: number       // tilt around X axis in degrees (vertical foreshortening)
    rotateY?: number       // tilt around Y axis in degrees (horizontal foreshortening)
  }
  /** Transform origin point. Default: "center". */
  transformOrigin?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | { x: number; y: number }

  // Convenience
  /** CSS-style prop — merged with direct props (direct props win). Decision 3. */
  style?: Partial<TGEProps>

  // Image (<img> intrinsic)
  /** Image source — file path or URL. Decoded async on first render. */
  src?: string
  /** How the image fits within its layout box. Default: "contain". */
  objectFit?: "contain" | "cover" | "fill" | "none"

  // Canvas (<canvas> intrinsic)
  /** Imperative draw callback — compat/lab canvas API, called each frame with a CanvasContext. */
  onDraw?: (ctx: import("./canvas").CanvasContext) => void
  /** Optional cache key for static canvas draw lists. Change it when onDraw output changes. */
  drawCacheKey?: string | number
  /** Viewport transform for pan and zoom. */
  viewport?: { x: number; y: number; zoom: number }

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

/** @public */
export type TGENode = {
  kind: TGENodeKind
  props: TGEProps
  text: string          // for text nodes
  children: TGENode[]
  parent: TGENode | null
  /** Stable unique identifier for this node */
  id: number
  /** Native scene node ID used by the Rust-retained scene graph skeleton. */
  _nativeId: bigint | null
  /** Whether this node has been removed from the tree */
  destroyed: boolean
  /** Computed layout rect — written after Clay layout pass */
  layout: LayoutRect
  /** Interactive state — managed by render loop hit-testing */
  _hovered: boolean
  _active: boolean
  _focused: boolean
  /** Image-only retained data, allocated lazily for img nodes. */
  _imageExtra: NodeImageExtra | null
  /** Canvas-only retained data, allocated lazily for canvas nodes. */
  _canvasExtra: NodeCanvasExtra | null
  /** Pre-parsed width sizing — resolved once in setProperty, read every frame */
  _widthSizing: SizingInfo | null
  /** Pre-parsed height sizing — resolved once in setProperty, read every frame */
  _heightSizing: SizingInfo | null
  /** Computed LOCAL transform matrix — set after layout if node has transform prop */
  _transform: Float64Array | null
  /** Inverse LOCAL transform matrix — for local-space calculations */
  _transformInverse: Float64Array | null
  /** Accumulated transform matrix — local × parent's accumulated (hierarchy) */
  _accTransform: Float64Array | null
  /** Inverse accumulated transform — for hit-testing (screen → local coords) */
  _accTransformInverse: Float64Array | null
  /** Transient engine-managed interaction mode for compositor optimizations. */
  _interactionMode: InteractionMode
  /** Cached effective visual props from resolveProps(). */
  _vp: TGEProps | null
  /** True when cached effective visual props must be recomputed. */
  _vpDirty: boolean
  /** Sibling position maintained by insert/remove for O(1) next-sibling lookup. */
  _siblingIndex: number
  /** Count of focusable nodes in this subtree, including self. */
  _focusableCount: number
  /** Pre-order index assigned by walkTree for paint-order comparisons. */
  _dfsIndex: number
  /** Nearest scroll-container ancestor id, or 0 when none. */
  _scrollContainerId: number
  /** Consecutive frames where this node's layer/subtree stayed clean. */
  _stableFrameCount: number
  /** Consecutive frames where this node's layer/subtree changed. */
  _unstableFrameCount: number
  /** True when this node was promoted by automatic compositor heuristics. */
  _autoLayer: boolean
  /** Key of the owning compositor layer, or "bg" for the default layer. */
  _layerKey: string | null
  /** Monotonic mutation generation bumped by setProperty. */
  _generation: number
  /** Last text measurement cache key and result for per-node frame reuse. */
  _lastMeasuredText: string | null
  _lastMeasuredFontId: number
  _lastMeasuredFontSize: number
  _lastMeasurement: { width: number; height: number } | null
}

/** @public Computed layout geometry written each frame after layout. */
export type LayoutRect = {
  x: number
  y: number
  width: number
  height: number
}

let nextNodeId = 1

/** @public */
export function createNode(kind: TGENodeKind): TGENode {
  return {
    kind,
    props: {},
    text: "",
    children: [],
    parent: null,
    id: nextNodeId++,
    _nativeId: null,
    destroyed: false,
    layout: { x: 0, y: 0, width: 0, height: 0 },
    _hovered: false,
    _active: false,
    _focused: false,
    _imageExtra: kind === "img" ? { buffer: null, state: "idle", nativeHandle: null } : null,
    _canvasExtra: kind === "canvas" ? { displayListCommands: null, displayListHash: null, drawCacheKey: null, nativeHandle: null } : null,
    _widthSizing: null,
    _heightSizing: null,
    _transform: null,
    _transformInverse: null,
    _accTransform: null,
    _accTransformInverse: null,
    _interactionMode: "none",
    _vp: null,
    _vpDirty: true,
    _siblingIndex: 0,
    _focusableCount: 0,
    _dfsIndex: 0,
    _scrollContainerId: 0,
    _stableFrameCount: 0,
    _unstableFrameCount: 0,
    _autoLayer: false,
    _layerKey: null,
    _generation: 0,
    _lastMeasuredText: null,
    _lastMeasuredFontId: -1,
    _lastMeasuredFontSize: -1,
    _lastMeasurement: null,
  }
}

export function ensureImageExtra(node: TGENode): NodeImageExtra {
  if (!node._imageExtra) node._imageExtra = { buffer: null, state: "idle", nativeHandle: null }
  return node._imageExtra
}

export function ensureCanvasExtra(node: TGENode): NodeCanvasExtra {
  if (!node._canvasExtra) node._canvasExtra = { displayListCommands: null, displayListHash: null, drawCacheKey: null, nativeHandle: null }
  return node._canvasExtra
}

/**
 * Resolve effective props:
 *   1. Merge `style` prop under direct props (direct wins)
 *   2. Resolve aliases: borderRadius→cornerRadius, boxShadow→shadow
 *   3. Resolve padding shorthand: [Y,X] or [T,R,B,L]
 *   4. Merge hoverStyle/activeStyle/focusStyle when active
 */
/** @public */
export function resolveProps(node: TGENode): TGEProps {
  if (node._vp && !node._vpDirty) return node._vp
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
  if (!needsInteractive || (!base.hoverStyle && !base.activeStyle && !base.focusStyle)) {
    node._vp = base
    node._vpDirty = false
    return base
  }

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
  node._vp = resolved
  node._vpDirty = false
  return resolved
}

export function createTextNode(text: string): TGENode {
  const node = createNode("text")
  node.text = text
  return node
}

/** @public */
export function insertChild(parent: TGENode, child: TGENode, anchor?: TGENode) {
  if (child.parent === parent && anchor === child) return

  const previousParent = child.parent
  if (previousParent) {
    const previousIndex = previousParent.children.indexOf(child)
    if (previousIndex >= 0) {
      previousParent.children.splice(previousIndex, 1)
      updateSiblingIndices(previousParent, previousIndex)
      adjustFocusableAncestors(previousParent, -child._focusableCount)
    }
  }

  child.parent = parent
  child.destroyed = false
  let insertIndex = parent.children.length
  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx >= 0) {
      parent.children.splice(idx, 0, child)
      insertIndex = idx
      updateSiblingIndices(parent, insertIndex)
      adjustFocusableAncestors(parent, child._focusableCount)
      return
    }
  }
  parent.children.push(child)
  child._siblingIndex = insertIndex
  adjustFocusableAncestors(parent, child._focusableCount)
}

/** @public */
export function removeChild(parent: TGENode, child: TGENode) {
  const idx = parent.children.indexOf(child)
  if (idx >= 0) {
    parent.children.splice(idx, 1)
    updateSiblingIndices(parent, idx)
    adjustFocusableAncestors(parent, -child._focusableCount)
  }
  child.parent = null
  child.destroyed = true
}

function updateSiblingIndices(parent: TGENode, start: number) {
  for (let i = start; i < parent.children.length; i++) {
    parent.children[i]._siblingIndex = i
  }
}

export function adjustFocusableAncestors(node: TGENode | null, delta: number) {
  if (delta === 0) return
  let current = node
  while (current) {
    current._focusableCount = Math.max(0, current._focusableCount + delta)
    current = current.parent
  }
}

// ── Color parsing ──

const _colorCache = new Map<string, number>()

/** @public */
export function parseColor(value: string | number | undefined): number {
  if (value === undefined) return 0
  if (typeof value === "number") return value >>> 0
  const cached = _colorCache.get(value)
  if (cached !== undefined) return cached
  // "#rrggbb" or "#rrggbbaa"
  const hex = value.startsWith("#") ? value.slice(1) : value
  const result = hex.length === 6
    ? (parseInt(hex, 16) << 8 | 0xff) >>> 0
    : hex.length === 8
      ? parseInt(hex, 16) >>> 0
      : 0
  _colorCache.set(value, result)
  return result
}

// ── Sizing parsing ──

/** @public */
export type SizingInfo = { type: number; value: number }

/** @public */
export function parseSizing(value: number | string | undefined): SizingInfo | null {
  if (value === undefined) return null
  if (typeof value === "number") return { type: SIZING.FIXED, value }
  if (value === "fit") return { type: SIZING.FIT, value: 0 }
  if (value === "grow") return { type: SIZING.GROW, value: 0 }
  if (value.endsWith("%")) {
    const pct = parseFloat(value) / 100
    return { type: SIZING.PERCENT, value: pct }
  }
  return { type: SIZING.FIT, value: 0 }
}

/** @public */
export function parseDirection(value: string | undefined): number {
  if (value === "row") return DIRECTION.LEFT_TO_RIGHT
  return DIRECTION.TOP_TO_BOTTOM
}

/** @public */
export function parseAlignX(value: string | undefined): number {
  if (value === "right" || value === "flex-end") return ALIGN_X.RIGHT
  if (value === "center") return ALIGN_X.CENTER
  if (value === "space-between") return ALIGN_X.SPACE_BETWEEN
  return ALIGN_X.LEFT // "left", "flex-start", or default
}

/** @public */
export function parseAlignY(value: string | undefined): number {
  if (value === "bottom" || value === "flex-end") return ALIGN_Y.BOTTOM
  if (value === "center") return ALIGN_Y.CENTER
  if (value === "space-between") return ALIGN_Y.SPACE_BETWEEN
  return ALIGN_Y.TOP // "top", "flex-start", or default
}
