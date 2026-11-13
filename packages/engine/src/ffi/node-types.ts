/**
 * Shared node model declarations.
 *
 * Keeping these types and layout constants in a leaf module lets the node
 * implementation depend on the layout synchronizer without a reverse type
 * dependency from flex-sync.
 */

import type { Node } from "flexily"
import type {
  GridAreaPlacement,
  GridAutoFlow,
  GridContentAlignment,
  GridItemAlignment,
  GridPlacement,
  GridTrack,
  GridTrackSize,
} from "./grid-types"
import {
  getClassNameResolver,
  setClassNameResolver,
  bumpThemeEpoch,
  getThemeEpoch,
  type ClassNameResolver,
} from "../styling/theme-context"

export {
  getClassNameResolver,
  setClassNameResolver,
  bumpThemeEpoch,
  getThemeEpoch,
  type ClassNameResolver,
}

// Numeric values preserved for backward compat; semantics map through
// packages/engine/src/loop/layout-adapter.ts.

/** @public Sizing type enum for layout adapter sizing values. */
export const SIZING = {
  FIT: 0,
  GROW: 1,
  PERCENT: 2,
  FIXED: 3,
} as const

/** @public Flex direction enum for layout adapter direction values. */
export const DIRECTION = {
  LEFT_TO_RIGHT: 0,
  TOP_TO_BOTTOM: 1,
} as const

/** @public Horizontal alignment enum for layout adapter alignment values. */
export const ALIGN_X = { LEFT: 0, RIGHT: 1, CENTER: 2, SPACE_BETWEEN: 3 } as const

/** @public Vertical alignment enum for layout adapter alignment values. */
export const ALIGN_Y = { TOP: 0, BOTTOM: 1, CENTER: 2, SPACE_BETWEEN: 3 } as const

/** @public */
export const TGE_NODE_KIND = { BOX: "box", TEXT: "text", IMG: "img", CANVAS: "canvas", ROOT: "root" } as const
/** @public */
export type TGENodeKind = (typeof TGE_NODE_KIND)[keyof typeof TGE_NODE_KIND]

/** @public */
export const INTERACTION_MODE = { NONE: "none", DRAG: "drag" } as const
/** @public */
export type InteractionMode = (typeof INTERACTION_MODE)[keyof typeof INTERACTION_MODE]

export type NodeTransformExtra = {
  local: Float64Array | null
  localInverse: Float64Array | null
  acc: Float64Array | null
  accInverse: Float64Array | null
}

export type NodeCompositorExtra = {
  stableFrames: number
  unstableFrames: number
  autoLayer: boolean
}

export type NodeImageExtra = {
  source?: string
  revision?: number
  cancel?: () => void
  buffer: { data: Uint8Array; width: number; height: number } | null
  state: "idle" | "loading" | "loaded" | "error"
  nativeHandle: bigint | null
}

export type NodeCanvasExtra = {
  displayListCommands: import("./canvas").DrawCmd[] | null
  displayListHash: string | null
  drawCacheKey: string | null
}

/** @public Event passed to onPress handlers. Supports stopPropagation like DOM events. */
export type PressEvent = {
  /** Prevent the event from bubbling to parent nodes. */
  stopPropagation: () => void
  /** Whether stopPropagation() was called. */
  readonly propagationStopped: boolean
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

/** @public Per-corner radius values. */
export type CornerRadii = { tl: number; tr: number; br: number; bl: number }

/** @public 2D transform configuration. */
export type TransformConfig = {
  translateX?: number
  translateY?: number
  rotate?: number
  scale?: number
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  perspective?: number
  rotateX?: number
  rotateY?: number
}

/** @public Glow effect configuration (pre-parse, accepts string | number colors). */
export type GlowConfig = {
  radius: number
  color: string | number
  intensity?: number
}

/** @public Shadow definition (pre-parse, accepts string | number colors). */
export type ShadowConfig = {
  x: number
  y: number
  blur: number
  color: string | number
}

/** @public Gradient configuration (pre-parse, accepts string | number colors). */
export type GradientConfig = {
  type: "linear"
  from: string | number
  to: string | number
  angle?: number
} | {
  type: "radial"
  from: string | number
  to: string | number
}

/** @public Viewport transform for canvas pan/zoom. */
export type ViewportConfig = { x: number; y: number; zoom: number }

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
  /** @beta Selects the retained Flex or Grid layout profile. Defaults to `flex`. */
  layout?: "flex" | "grid"
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
  rowGap?: number
  columnGap?: number
  alignX?: "left" | "right" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch"
  alignY?: "top" | "bottom" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch"
  /** Alias for alignX in Flex; Grid content distribution in the inline axis. @beta */
  justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end" | "start" | "end" | "space-around" | "space-evenly" | "stretch"
  /** Alias for alignY in Flex; Grid item alignment in the block axis. @beta */
  alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end" | "start" | "end" | "stretch"
  /** @beta Grid tracks in the horizontal inline axis. Replace the array to invalidate it. */
  gridTemplateColumns?: readonly GridTrack[]
  /** @beta Grid tracks in the vertical block axis. Replace the array to invalidate it. */
  gridTemplateRows?: readonly GridTrack[]
  /** @beta Implicit column track size; repeat and line names are not accepted here. */
  gridAutoColumns?: GridTrackSize
  /** @beta Implicit row track size; repeat and line names are not accepted here. */
  gridAutoRows?: GridTrackSize
  /** @beta Automatic placement flow and optional dense cursor search. */
  gridAutoFlow?: GridAutoFlow
  /** @beta Rectangular template-area matrix; `null` denotes an empty cell. */
  gridTemplateAreas?: readonly (readonly (string | null)[])[]
  /** @beta Structured column placement shorthand. */
  gridColumn?: GridPlacement
  /** @beta Structured row placement shorthand. */
  gridRow?: GridPlacement
  /** @beta Named area or four-line area placement. */
  gridArea?: GridAreaPlacement
  /** @beta Grid content distribution in the block axis. */
  alignContent?: GridContentAlignment
  /** @beta Default alignment for Grid items in the inline axis. */
  justifyItems?: GridItemAlignment
  /** @beta Per-item inline-axis alignment override. */
  justifySelf?: GridItemAlignment
  /** @beta Per-item block-axis alignment override. */
  alignSelf?: GridItemAlignment

  // Sizing
  width?: SizingUnit
  height?: SizingUnit
  /** When set, width behaves as "grow" (opentui compat) */
  flexGrow?: number
  /** Accepted for CSS compatibility. Flexily handles shrinking automatically. */
  flexShrink?: number
  /** Flex initial main-axis size before free space distribution. */
  flexBasis?: number | string

  // Visual
  backgroundColor?: string | number  // "#ff0000" or 0xff0000ff
  cornerRadius?: number
  /** CSS-friendly alias for cornerRadius (Decision 1) */
  borderRadius?: number
  cornerRadii?: CornerRadii
  borderColor?: string | number
  borderWidth?: number
  /** Opacity: 0.0 = fully transparent, 1.0 = fully opaque. Multiplies alpha of entire element. */
  opacity?: number
  /** Declarative visual property transition duration in ms (`true` = 150ms, `false` or `0` disables). */
  transition?: boolean | number

  // Compositing
  layer?: boolean  // Opt-in: this node becomes its own compositing layer
  /** Declarative interaction state used by engine-level drag/compositor policies. */
  interactionMode?: InteractionMode
  debugName?: string

  // Scrolling / Clipping
  scrollX?: boolean  // Enable horizontal scroll clipping
  scrollY?: boolean  // Enable vertical scroll clipping
  scrollSpeed?: number  // Lines per scroll tick (default: natural accumulation)
  scrollId?: string  // Stable scroll container ID (set by ScrollView for programmatic control)

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
  shadow?: ShadowConfig | ShadowConfig[]
  /** CSS-friendly alias for shadow (Decision 1) */
  boxShadow?: TGEProps["shadow"]
  glow?: GlowConfig
  gradient?: GradientConfig
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
  /** Alias for onPress (web convention). If both are provided, onPress takes precedence. */
  onClick?: (event?: PressEvent) => void
  /** Make this element focusable via Tab navigation. Like HTML tabindex="0". */
  focusable?: boolean
  /** Explicit ID for focus registration (defaults to id or node-focus-${id}) */
  focusId?: string
  /** Keyboard event handler — fires when this element is focused and a key is pressed. */
  onKeyDown?: (event: import("../input/types").KeyEvent) => void

  // Mouse event callbacks — dispatched by updateInteractiveStates in the render loop.
  /** Fires when mouse button is pressed while over this node. */
  onMouseDown?: (event: NodeMouseEvent) => void
  /** Fires when mouse button is released while over this node. */
  onMouseUp?: (event: NodeMouseEvent) => void
  /** Fires when pointer moves over this node (every frame while hovered). */
  onMouseMove?: (event: NodeMouseEvent) => void
  /** Fires when pointer enters this node's bounds. */
  onMouseOver?: (event: NodeMouseEvent) => void
  /** Web-standard alias for onMouseOver. */
  onMouseEnter?: (event: NodeMouseEvent) => void
  /** Vexart hover alias for onMouseOver. */
  onHoverEnter?: (event: NodeMouseEvent) => void
  /** Fires when pointer leaves this node's bounds. */
  onMouseOut?: (event: NodeMouseEvent) => void
  /** Web-standard alias for onMouseOut. */
  onMouseLeave?: (event: NodeMouseEvent) => void
  /** Vexart hover alias for onMouseOut. */
  onHoverLeave?: (event: NodeMouseEvent) => void

  // Transforms — 2D affine + pseudo-perspective
  /** Transform configuration: translate, rotate, scale, skew, perspective. */
  transform?: TransformConfig
  /** Transform origin point. Default: "center". */
  transformOrigin?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | { x: number; y: number }

  // Convenience
  /** Class name resolved by pluggable class name resolver. */
  className?: string
  /** CSS-style prop — merged with direct props (direct props win). Decision 3. */
  style?: Partial<TGEProps>
  /** Lowest-precedence default style layer (overridden by className, style, and direct props). */
  defaultStyle?: Partial<TGEProps>
  /** When true, className overrides direct component props (used by styled components). */
  classOverride?: boolean

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
  viewport?: ViewportConfig

  // Text
  color?: string | number
  fontSize?: number
  fontId?: number
  lineHeight?: number
  wordBreak?: "normal" | "keep-all"
  whiteSpace?: "normal" | "pre-wrap" | "nowrap"
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
  /** Whether this node has been removed from the tree */
  destroyed: boolean
  /** Computed layout rect — written after the layout pass */
  layout: LayoutRect
  /** Persistent Flexily layout node. Text nodes attach one lazily with measureFunc. @internal */
  _flexNode: Node | null
  /** Interactive state — managed by render loop hit-testing */
  _hovered: boolean
  _active: boolean
  _focused: boolean
  /** Image-only extra data, allocated lazily for img nodes. */
  _imageExtra?: NodeImageExtra | null
  /** Canvas-only extra data, allocated lazily for canvas nodes. */
  _canvasExtra?: NodeCanvasExtra | null
  /** Pre-parsed width sizing — resolved once in setProperty, read every frame */
  _widthSizing: SizingInfo | null
  /** Pre-parsed height sizing — resolved once in setProperty, read every frame */
  _heightSizing: SizingInfo | null
  /** Prop keys applied from the JSX style object during the previous style merge. */
  _styleKeys?: Set<string>
  /** Layout prop keys mirrored from className onto node.props for Flexily sync. */
  _classLayoutKeys?: Set<string>
  /** Layout prop keys mirrored from defaultStyle onto node.props for Flexily sync. */
  _defaultLayoutKeys?: Set<string>
  /** Last className value synchronized to Flexily layout. */
  _syncedClassName?: string
  /** Last defaultStyle reference synchronized to Flexily layout. */
  _syncedDefaultStyle?: Partial<TGEProps>
  /** Layout prop keys present during the previous layout synchronization. */
  _prevLayoutKeys?: Set<string>
  /** Lazy transform matrices (local & accumulated). */
  _transforms?: NodeTransformExtra | null
  /** Computed LOCAL transform matrix — backwards compatibility accessor */
  _transform: Float64Array | null
  /** Inverse LOCAL transform matrix — backwards compatibility accessor */
  _transformInverse: Float64Array | null
  /** Accumulated transform matrix — backwards compatibility accessor */
  _accTransform: Float64Array | null
  /** Inverse accumulated transform — backwards compatibility accessor */
  _accTransformInverse: Float64Array | null
  /** Transient engine-managed interaction mode for compositor optimizations. */
  _interactionMode?: InteractionMode
  /** Cached effective visual props from resolveProps(). */
  _vp: TGEProps | null
  /** True when cached effective visual props must be recomputed. */
  _vpDirty: boolean
  /** Generational epoch at which _vp was cached. */
  _vpEpoch?: number
  /** Sibling position maintained by insert/remove for O(1) next-sibling lookup. */
  _siblingIndex: number
  /** Count of focusable nodes in this subtree, including self. */
  _focusableCount: number
  /** Pre-order index assigned by walkTree for paint-order comparisons. */
  _dfsIndex: number
  /** Tree depth assigned by walkTree — root=0. Used by stacking sort. */
  _depth: number
  /** Nearest scroll-container ancestor id, or 0 when none. */
  _scrollContainerId: number
  /** Lazy compositor stability heuristics. */
  _compositor?: NodeCompositorExtra | null
  /** Consecutive frames where this node's layer/subtree stayed clean — backwards compatibility accessor */
  _stableFrameCount: number
  /** Consecutive frames where this node's layer/subtree changed — backwards compatibility accessor */
  _unstableFrameCount: number
  /** True when this node was promoted by automatic compositor heuristics — backwards compatibility accessor */
  _autoLayer: boolean
  /** Key of the owning compositor layer, or "bg" for the default layer. */
  _layerKey: string | null
  /** Per-loop dirty tracker attached to root node. */
  _dirtyTracker?: import("../reconciler/dirty").DirtyTracker | null
  /** Per-instance engine context attached to this node or inherited from root. */
  _engineContext?: import("../context").EngineContext | null
}

/** Supported sizing keywords. @public */
export type SizingKeyword = "fit" | "grow" | "auto" | "fill"

/** Sizing percentage token (e.g. "100%", "50%"). @public */
export type SizingPercent = `${number}%`

/** Sizing pixel token (e.g. "100px", "20px"). @public */
export type SizingPx = `${number}px`

/** Sizing dimension unit for width and height. @public */
export type SizingUnit = number | SizingKeyword | SizingPercent | SizingPx

/** @public */
export type SizingInfo = { type: number; value: number }

/** @public Computed layout geometry written each frame after layout. */
export type LayoutRect = {
  x: number
  y: number
  width: number
  height: number
}

// ── Color parsing ──

const MAX_COLOR_CACHE_SIZE = 512
const _colorCache = new Map<string, number>()

export function getColorCacheSize(): number {
  return _colorCache.size
}

export function clearColorCache(): void {
  _colorCache.clear()
}

/** @public */
export function parseColor(value: string | number | undefined): number {
  if (value === undefined) return 0
  if (typeof value === "number") return value >>> 0
  const cached = _colorCache.get(value)
  if (cached !== undefined) {
    _colorCache.delete(value)
    _colorCache.set(value, cached)
    return cached
  }
  // "#rgb", "#rgba", "#rrggbb", or "#rrggbbaa" (with or without #)
  const hex = value.startsWith("#") ? value.slice(1) : value
  let result = 0
  if (hex.length === 3) {
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0], 16) * 17
      const g = parseInt(hex[1], 16) * 17
      const b = parseInt(hex[2], 16) * 17
      result = ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0
    }
  } else if (hex.length === 4) {
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      const r = parseInt(hex[0], 16) * 17
      const g = parseInt(hex[1], 16) * 17
      const b = parseInt(hex[2], 16) * 17
      const a = parseInt(hex[3], 16) * 17
      result = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
    }
  } else if (hex.length === 6) {
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      result = ((parseInt(hex, 16) << 8) | 0xff) >>> 0
    }
  } else if (hex.length === 8) {
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      result = (parseInt(hex, 16)) >>> 0
    }
  }
  if (_colorCache.size >= MAX_COLOR_CACHE_SIZE) {
    const oldest = _colorCache.keys().next().value
    if (oldest !== undefined) _colorCache.delete(oldest)
  }
  _colorCache.set(value, result)
  return result
}

/**
 * Resolve effective props:
 *   1. Cache check: node._vp && !node._vpDirty && node._vpEpoch === currentThemeEpoch
 *   2. Merge defaultStyle (lowest precedence)
 *   3. Merge className via globalClassNameResolver
 *   4. Merge style prop (direct props override style)
 *   5. Deep-merge hoverStyle/activeStyle/focusStyle
 *   6. Resolve aliases: borderRadius→cornerRadius, boxShadow→shadow, onClick→onPress,
 *      onMouseEnter/onHoverEnter→onMouseOver, onMouseLeave/onHoverLeave→onMouseOut
 *   7. Merge interactive states when active
 */
/** @public */
export function resolveProps(node: TGENode): TGEProps {
  const base = node.props
  const resolver = getClassNameResolver()
  const themeEpoch = getThemeEpoch()
  const hasActiveInteractive =
    (node._hovered && base.hoverStyle !== undefined)
    || (node._focused && base.focusStyle !== undefined)
    || (node._active && base.activeStyle !== undefined)
  if (
    !base.defaultStyle
    && (!base.className || !resolver)
    && !base.style
    && !node._defaultLayoutKeys?.size
    && !node._classLayoutKeys?.size
    && !hasActiveInteractive
    && base.borderRadius === undefined
    && base.boxShadow === undefined
    && base.onClick === undefined
    && base.onMouseEnter === undefined
    && base.onHoverEnter === undefined
    && base.onMouseLeave === undefined
    && base.onHoverLeave === undefined
  ) {
    return base
  }
  if (node._vp && !node._vpDirty && node._vpEpoch === themeEpoch) return node._vp
  const out: TGEProps = {} as TGEProps
  const classProps = base.className && resolver
    ? resolver(base.className)
    : undefined
  const classRecord = classProps as Record<string, unknown> | undefined

  const isClassOverride = !!base.classOverride && !!classProps

  if (isClassOverride) {
    // Layer 0: defaultStyle (lowest precedence)
    if (base.defaultStyle) Object.assign(out, base.defaultStyle)

    // Layer 1: direct component defaults (skipping defaultStyle, style, className, classOverride)
    const baseRecord = base as Record<string, unknown>
    const defaultRecord = base.defaultStyle as Record<string, unknown> | undefined
    const outRecord = out as Record<string, unknown>
    for (const key of Object.keys(base)) {
      if (key === "defaultStyle" || key === "style" || key === "className" || key === "classOverride") continue
      if (node._defaultLayoutKeys?.has(key) && baseRecord[key] === defaultRecord?.[key]) continue
      outRecord[key] = baseRecord[key]
    }

    // Layer 2: className overrides direct component props
    Object.assign(out, classProps)
    if (classProps.backgroundColor !== undefined) {
      out.gradient = undefined
    }

    // Layer 3: inline style overrides className
    if (base.style) Object.assign(out, base.style)

    // Merge interactive styles: defaultStyle < base < classProps < base.style
    if (base.defaultStyle?.hoverStyle || base.hoverStyle || classProps?.hoverStyle || base.style?.hoverStyle) {
      out.hoverStyle = Object.assign({}, base.defaultStyle?.hoverStyle, base.hoverStyle, classProps?.hoverStyle, base.style?.hoverStyle)
    }
    if (base.defaultStyle?.focusStyle || base.focusStyle || classProps?.focusStyle || base.style?.focusStyle) {
      out.focusStyle = Object.assign({}, base.defaultStyle?.focusStyle, base.focusStyle, classProps?.focusStyle, base.style?.focusStyle)
    }
    if (base.defaultStyle?.activeStyle || base.activeStyle || classProps?.activeStyle || base.style?.activeStyle) {
      out.activeStyle = Object.assign({}, base.defaultStyle?.activeStyle, base.activeStyle, classProps?.activeStyle, base.style?.activeStyle)
    }
  } else {
  // Layer 0: defaultStyle (lowest precedence)
  if (base.defaultStyle) Object.assign(out, base.defaultStyle)
  // Layer 1: className
  if (classProps) Object.assign(out, classProps)
  // Layer 2: style
  if (base.style) Object.assign(out, base.style)

  // Layer 3: direct props (skip mirrored default/className layout keys unless mutated directly)
  const baseRecord = base as Record<string, unknown>
  const defaultRecord = base.defaultStyle as Record<string, unknown> | undefined
  const outRecord = out as Record<string, unknown>
  for (const key of Object.keys(base)) {
    if (key === "defaultStyle" || key === "style" || key === "classOverride") continue
    if (node._defaultLayoutKeys?.has(key) && baseRecord[key] === defaultRecord?.[key]) continue
    if (node._classLayoutKeys?.has(key) && classRecord && baseRecord[key] === classRecord[key]) continue
    outRecord[key] = baseRecord[key]
  }
  }

  // Strip default-only flex/align keys when layout is grid so Grid diagnostics never treat element defaults as explicit flex props
  if (out.layout === "grid") {
    if (classRecord?.direction === undefined && (base.style as Record<string, unknown> | undefined)?.direction === undefined && (base.direction === undefined || node._defaultLayoutKeys?.has("direction"))) {
      delete out.direction
    }
    if (classRecord?.alignX === undefined && (base.style as Record<string, unknown> | undefined)?.alignX === undefined && (base.alignX === undefined || node._defaultLayoutKeys?.has("alignX"))) {
      delete out.alignX
    }
    if (classRecord?.alignY === undefined && (base.style as Record<string, unknown> | undefined)?.alignY === undefined && (base.alignY === undefined || node._defaultLayoutKeys?.has("alignY"))) {
      delete out.alignY
    }
  }

  // Merge interactive styles in place across layers (standard non-classOverride path)
  if (!isClassOverride) {
  if (base.defaultStyle?.hoverStyle || classProps?.hoverStyle || base.style?.hoverStyle || base.hoverStyle) {
    out.hoverStyle = Object.assign({}, base.defaultStyle?.hoverStyle, classProps?.hoverStyle, base.style?.hoverStyle, base.hoverStyle)
  }
  if (base.defaultStyle?.focusStyle || classProps?.focusStyle || base.style?.focusStyle || base.focusStyle) {
    out.focusStyle = Object.assign({}, base.defaultStyle?.focusStyle, classProps?.focusStyle, base.style?.focusStyle, base.focusStyle)
  }
  if (base.defaultStyle?.activeStyle || classProps?.activeStyle || base.style?.activeStyle || base.activeStyle) {
    out.activeStyle = Object.assign({}, base.defaultStyle?.activeStyle, classProps?.activeStyle, base.style?.activeStyle, base.activeStyle)
  }
  }

  // Resolve aliases in place (zero allocations)
  if (out.borderRadius !== undefined) {
    if (isClassOverride && classProps?.borderRadius !== undefined) {
      out.cornerRadius = out.borderRadius
    } else if (out.cornerRadius === undefined) {
      out.cornerRadius = out.borderRadius
    }
  }
  if (out.boxShadow !== undefined) {
    if (isClassOverride && classProps?.boxShadow !== undefined) {
      out.shadow = out.boxShadow
    } else if (out.shadow === undefined) {
      out.shadow = out.boxShadow
    }
  }
  if (out.onClick !== undefined && out.onPress === undefined) out.onPress = out.onClick
  if (out.onMouseOver === undefined) {
    if (out.onMouseEnter !== undefined) out.onMouseOver = out.onMouseEnter
    else if (out.onHoverEnter !== undefined) out.onMouseOver = out.onHoverEnter
  }
  if (out.onMouseOut === undefined) {
    if (out.onMouseLeave !== undefined) out.onMouseOut = out.onMouseLeave
    else if (out.onHoverLeave !== undefined) out.onMouseOut = out.onHoverLeave
  }

  // Merge active interactive states in place
  if (node._hovered && out.hoverStyle) Object.assign(out, out.hoverStyle)
  if (node._focused && out.focusStyle) Object.assign(out, out.focusStyle)
  if (node._active && out.activeStyle) Object.assign(out, out.activeStyle)

  // Re-resolve aliases if interactive styles introduced them
  if (out.borderRadius !== undefined && out.cornerRadius === undefined) out.cornerRadius = out.borderRadius
  if (out.boxShadow !== undefined && out.shadow === undefined) out.shadow = out.boxShadow

  node._vp = out
  node._vpDirty = false
  node._vpEpoch = themeEpoch
  return out
}
