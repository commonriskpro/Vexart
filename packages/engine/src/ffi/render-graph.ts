import type { CanvasContext, DrawCmd } from "./canvas"
import type { TGENode } from "./node"
import {
  BACKDROP_FIELDS,
  type BackdropFieldName,
} from "../loop/predicates"
export { BACKDROP_FIELDS } from "../loop/predicates"
export type { BackdropFieldName } from "../loop/predicates"
import {
  createClipStateId,
  getTransformStateId,
  getEffectStateId,
  BACKDROP_FILTER_KIND,
  type BackdropFilterKind,
  BACKDROP_PARAM_KEYS,
  type BackdropFilterParams,
} from "../loop/effect-hash"

// ── RenderCommand type ──
// Commands are produced by layout-adapter.endLayout() and carry nodeId for
// matching commands to effects, images, and layer assignments.
//
// NOTE(arch): The old per-node metadata Map.get detours were eliminated —
// effects, images, canvas data, and text metadata now attach directly to
// RenderCommand in layout-adapter. Remaining overhead is RenderCommand →
// RenderGraphOp structural wrapping per frame.
// See item 11 in the simplification audit for a phased cleanup plan.

/** Layout adapter command type constants. */
export const CMD = {
  NONE: 0,
  RECTANGLE: 1,
  BORDER: 2,
  TEXT: 3,
  IMAGE: 4,
  SCISSOR_START: 5,
  SCISSOR_END: 6,
} as const

/** @public */
export type RenderCommand = {
  type: number
  x: number
  y: number
  width: number
  height: number
  /** Packed RGBA u32 (0xRRGGBBAA). Avoids array allocation per command. */
  color: number
  cornerRadius: number
  extra1: number // border width, font size
  extra2: number // text length, font id
  text?: string
  lineHeight?: number
  fontFamily?: string
  fontWeight?: number
  fontStyle?: string
  /** @internal Text layout mode forwarded from the TS layout pass. */
  whiteSpace?: "normal" | "pre-wrap" | "nowrap"
  /** @internal Text word-breaking mode forwarded from the TS layout pass. */
  wordBreak?: "normal" | "keep-all"
  /** Stable node ID for matching render ops to effects/images. */
  nodeId?: number
  /** Per-side border widths when the border is not uniform. */
  borderWidths?: { left: number; right: number; top: number; bottom: number }
  /** Effect config attached directly — eliminates Map.get lookup in render graph. */
  effect?: EffectConfig
  /** Image paint config attached directly. */
  image?: ImagePaintConfig
  /** Canvas paint config attached directly. */
  canvas?: CanvasPaintConfig
}

// Color is now stored as packed u32 on RenderCommand — no packColor needed.

/** @public */
export type ShadowDef = {
  x: number
  y: number
  blur: number
  color: number
}

/** @public */
export type EffectConfig = {
  renderObjectId?: number
  color: number
  shadow?: ShadowDef | ShadowDef[]
  glow?: { radius: number; color: number; intensity: number }
  gradient?: { type: "linear"; from: number; to: number; angle: number } | { type: "radial"; from: number; to: number }
  backdropBlur?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
  opacity?: number
  cornerRadii?: import("./node").CornerRadii
  transform?: Float64Array
  transformInverse?: Float64Array
  transformBounds?: import("./damage").Rect
  /** Cached buffer to avoid per-frame Float64Array allocation. */
  _transformBuf?: Float64Array
  /** Self-filter applied to this element's own paint output (REQ-2B-401/402). */
  filter?: import("./node").FilterConfig
  _node?: TGENode
  _stateHash?: number
}

export {
  BACKDROP_FILTER_KIND,
  type BackdropFilterKind,
  BACKDROP_PARAM_KEYS,
  type BackdropFilterParams,
}

/** @public Alias for Rect — kept for API compat. */
export type RenderBounds = import("./damage").Rect

/** @public */
export interface BackdropRenderMetadata {
  backdropSourceKey: string
  filterKind: BackdropFilterKind
  filterParams: BackdropFilterParams
  inputBounds: RenderBounds
  sampleBounds: RenderBounds
  outputBounds: RenderBounds
  clipBounds: RenderBounds
  transformStateId: number
  clipStateId: number
  effectStateId: number
}

/** @public */
export type ImagePaintConfig = {
  renderObjectId?: number
  color: number
  cornerRadius: number
  imageBuffer?: { data: Uint8Array; width: number; height: number } | null
  nativeImageHandle?: bigint | null
  objectFit: "contain" | "cover" | "fill" | "none"
}

/** @public */
export type CanvasPaintConfig = {
  renderObjectId?: number
  color: number
  onDraw: (ctx: CanvasContext) => void
  displayListCommands?: DrawCmd[]
  viewport?: { x: number; y: number; zoom: number }
  displayListHash?: string | null
}




/** @public */
export type TextMeta = {
  nodeId: number
  content: string
  fontId: number
  fontSize: number
  lineHeight: number
  fontFamily?: string
  fontWeight?: number
  fontStyle?: string
}

type BaseRenderOpFields = {
  renderObjectId: number | null
  type: number
  x: number
  y: number
  width: number
  height: number
  color: number
  cornerRadius: number
  extra1: number
  extra2: number
  text?: string
  lineHeight?: number
  fontFamily?: string
  fontWeight?: number
  fontStyle?: string
  /** @internal Text layout mode forwarded from the TS layout pass. */
  whiteSpace?: "normal" | "pre-wrap" | "nowrap"
  /** @internal Text word-breaking mode forwarded from the TS layout pass. */
  wordBreak?: "normal" | "keep-all"
  nodeId?: number
  /** @internal Active scroll/scissor viewport in absolute render coordinates. */
  clipBounds?: RenderBounds | null
}

/** @public */
export type RectangleRenderOp = {
  kind: "rectangle"
  radius: number
  image: ImagePaintConfig | null
  canvas: CanvasPaintConfig | null
  effect: EffectConfig | null
} & BaseRenderOpFields

/** @public */
export type ImageRenderOp = {
  kind: "image"
  rect: RectangleRenderOp
  image: ImagePaintConfig
  textureId?: bigint | number | null
} & BaseRenderOpFields

/** @public */
export type CanvasRenderOp = {
  kind: "canvas"
  rect: RectangleRenderOp
  canvas: CanvasPaintConfig
} & BaseRenderOpFields

/** @public */
export type EffectRenderOp = {
  kind: "effect"
  rect: RectangleRenderOp
  effect: EffectConfig
  backdrop: BackdropRenderMetadata | null
  transformStateId: number
  clipStateId: number
  effectStateId: number
} & BaseRenderOpFields

/** @public */
export type BorderRenderOp = {
  kind: "border"
  radius: number
  borderWidth: number
  cornerRadii: import("./node").CornerRadii | null
  borderWidths?: RenderCommand["borderWidths"] | null
} & BaseRenderOpFields

/** @public */
export type TextRenderOp = {
  kind: "text"
  text: string
  fontId: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  textHeight: number
} & BaseRenderOpFields

/** @public */
export type RawCommandRenderOp = {
  kind: "raw-command"
} & BaseRenderOpFields

/** @public */
export type RenderGraphOp = RectangleRenderOp | ImageRenderOp | CanvasRenderOp | EffectRenderOp | BorderRenderOp | TextRenderOp | RawCommandRenderOp

/** @public */
export type RenderGraphFrame = {
  ops: RenderGraphOp[]
}

type ClipStackEntry = {
  bounds: RenderBounds
  id: number
  /** Scroll node that introduced the clip, when available. Internal only. */
  nodeId?: number
}

const EMPTY_CLIP_STACK: ClipStackEntry[] = Object.freeze([]) as unknown as ClipStackEntry[]

// Clip provenance is deliberately kept out of RenderGraphOp's public shape.
// Layer isolation needs to know whether a clip belongs to an ancestor of the
// isolated subtree (apply it after the subtree transform) or was introduced
// inside the subtree (apply it while rasterizing the source). A flattened
// rectangle cannot preserve that distinction, so retain it in an internal
// side table instead of widening the public render-graph API.
const renderOpClipStacks = new WeakMap<object, ClipStackEntry[]>()

export function getRenderOpClipStack(op: RenderGraphOp) {
  return renderOpClipStacks.get(op) ?? EMPTY_CLIP_STACK
}

/** Internal bridge for isolated source ops cloned by the GPU backend. */
export function setRenderOpClipStack(op: RenderGraphOp, stack: ClipStackEntry[]) {
  renderOpClipStacks.set(op, stack)
}



function createBaseRenderOpFields(cmd: RenderCommand, renderObjectId: number | null): BaseRenderOpFields {
  return {
    renderObjectId,
    type: cmd.type,
    x: cmd.x,
    y: cmd.y,
    width: cmd.width,
    height: cmd.height,
    color: cmd.color >>> 0,
    cornerRadius: cmd.cornerRadius,
    extra1: cmd.extra1,
    extra2: cmd.extra2,
    text: cmd.text,
    lineHeight: cmd.lineHeight,
    fontFamily: cmd.fontFamily,
    fontWeight: cmd.fontWeight,
    fontStyle: cmd.fontStyle,
    whiteSpace: cmd.whiteSpace,
    wordBreak: cmd.wordBreak,
    nodeId: cmd.nodeId,
  }
}

/**
 * Resolve JSX transform props after layout has produced the node matrix.
 *
 * `walkTree` allocates an effect record before Flexily layout runs, so the
 * record cannot contain the final matrix at that point. The render graph is
 * built after layout; hydrate the effect here so native transform sprites
 * receive the actual matrix instead of the zero-filled placeholder.
 */
function resolveEffectTransform(effect: EffectConfig): EffectConfig {
  const node = effect._node
  if (!node) return effect
  const transforms = node._transforms
  const transform = transforms?.local ?? undefined
  const transformInverse = transforms?.localInverse ?? undefined
  if (effect.transform === transform && effect.transformInverse === transformInverse) return effect
  return { ...effect, transform, transformInverse }
}

export function createRectangleRenderOp(cmd: RenderCommand, renderObjectId: number | null): RectangleRenderOp {
  const radius = Math.round(cmd.cornerRadius)

  return {
    kind: "rectangle",
    ...createBaseRenderOpFields(cmd, renderObjectId),
    radius,
    image: cmd.image ?? null,
    canvas: cmd.canvas ?? null,
    effect: cmd.effect ? resolveEffectTransform(cmd.effect) : null,
  }
}

function createBorderRenderOp(cmd: RenderCommand): BorderRenderOp {
  const radius = Math.round(cmd.cornerRadius)
  const borderWidth = Math.round(cmd.extra1) || 1
  return {
    kind: "border",
    ...createBaseRenderOpFields(cmd, null),
    radius,
    borderWidth,
    cornerRadii: cmd.effect?.cornerRadii ?? null,
    borderWidths: cmd.borderWidths ?? null,
  }
}

function createTextRenderOp(cmd: RenderCommand, renderObjectId: number | null): TextRenderOp | null {
  if (!cmd.text) return null
  const fontId = Math.round(cmd.extra2) || 0
  const fontSize = Math.round(cmd.extra1) || 14
  const lineHeight = cmd.lineHeight ?? Math.ceil(fontSize * 1.2)
  const maxWidth = Math.max(Math.round(cmd.width), 1)
  const textHeight = Math.round(cmd.height) > 0 ? Math.round(cmd.height) : lineHeight
  return {
    kind: "text",
    ...createBaseRenderOpFields(cmd, renderObjectId),
    text: cmd.text,
    fontId,
    fontSize,
    lineHeight,
    maxWidth,
    textHeight,
    fontFamily: cmd.fontFamily,
    fontWeight: cmd.fontWeight,
    fontStyle: cmd.fontStyle,
  }
}
/** @public */
export function buildRenderOp(cmd: RenderCommand, ownerIds?: { rect: number | null; text: number | null }): RenderGraphOp | null {
  if (cmd.type === CMD.RECTANGLE) {
    const renderObjectId = ownerIds?.rect ?? null
    const rect = createRectangleRenderOp(cmd, renderObjectId)
    if (rect.image) {
      return {
        kind: "image",
        ...createBaseRenderOpFields(cmd, renderObjectId),
        rect,
        image: rect.image,
      }
    }
    if (rect.canvas) {
      return {
        kind: "canvas",
        ...createBaseRenderOpFields(cmd, renderObjectId),
        rect,
        canvas: rect.canvas,
      }
    }
    if (rect.effect) {
      const transformStateId = getTransformStateId(rect.effect)
      const clipStateId = createClipStateId([])
      const effectStateId = getEffectStateId(rect.effect, rect.radius)
      return {
        kind: "effect",
        ...createBaseRenderOpFields(cmd, renderObjectId),
        rect,
        effect: rect.effect,
        backdrop: null,
        transformStateId,
        clipStateId,
        effectStateId,
      }
    }
    return rect
  }
  if (cmd.type === CMD.BORDER) {
    return createBorderRenderOp(cmd)
  }
  if (cmd.type === CMD.TEXT) {
    const renderObjectId = ownerIds?.text ?? null
    return createTextRenderOp(cmd, renderObjectId)
  }
  // SCISSOR_START/END are handled by the clipStack in buildRenderGraphFrame,
  // not as renderable ops. Skip them here.
  if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) {
    return null
  }
  return {
    kind: "raw-command",
    ...createBaseRenderOpFields(cmd, null),
  }
}
