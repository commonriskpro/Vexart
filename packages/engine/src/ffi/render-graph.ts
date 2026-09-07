import type { CanvasContext, DrawCmd } from "./canvas"
import type { TGENode } from "./node"
import { hasBackdropEffect } from "../loop/predicates"

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
  /** Stable node ID for matching render ops to effects/images. */
  nodeId?: number
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
  /** Self-filter applied to this element's own paint output (REQ-2B-401/402). */
  filter?: import("./node").FilterConfig
  _node?: TGENode
  _stateHash?: number
}

/** @public */
export const BACKDROP_FILTER_KIND = {
  BLUR: "blur",
  COLOR: "color",
  BLUR_COLOR: "blur-color",
} as const

/** @public */
export type BackdropFilterKind = (typeof BACKDROP_FILTER_KIND)[keyof typeof BACKDROP_FILTER_KIND]

/** @public Alias for Rect — kept for API compat. */
export type RenderBounds = import("./damage").Rect

/**
 * Canonical list of backdrop filter field names.
 * Single source of truth — used by predicates, walk-tree, and render-graph
 * to avoid manually enumerating these 8 fields in 4+ locations.
 */
export const BACKDROP_FIELDS = [
  "backdropBlur", "backdropBrightness", "backdropContrast", "backdropSaturate",
  "backdropGrayscale", "backdropInvert", "backdropSepia", "backdropHueRotate",
] as const

/** The corresponding BackdropFilterParams keys (without "backdrop" prefix, lowercased). */
export const BACKDROP_PARAM_KEYS = [
  "blur", "brightness", "contrast", "saturate",
  "grayscale", "invert", "sepia", "hueRotate",
] as const

/** @public */
export type BackdropFieldName = (typeof BACKDROP_FIELDS)[number]

/** @public */
export interface BackdropFilterParams {
  blur: number | null
  brightness: number | null
  contrast: number | null
  saturate: number | null
  grayscale: number | null
  invert: number | null
  sepia: number | null
  hueRotate: number | null
}

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
  imageBuffer: { data: Uint8Array; width: number; height: number }
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
  nativeDisplayListHandle?: bigint | null
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
  const transform = node._transform ?? undefined
  const transformInverse = node._transformInverse ?? undefined
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

function createRenderBounds(x: number, y: number, width: number, height: number): RenderBounds {
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  }
}

function boundsFromCommand(cmd: RenderCommand): RenderBounds {
  return createRenderBounds(cmd.x, cmd.y, cmd.width, cmd.height)
}

function intersectBounds(a: RenderBounds, b: RenderBounds): RenderBounds | null {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= left || bottom <= top) return null
  return createRenderBounds(left, top, right - left, bottom - top)
}

function expandBounds(bounds: RenderBounds, pad: number) {
  if (pad <= 0) return bounds
  return createRenderBounds(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2)
}

function getCurrentClipBounds(stack: ClipStackEntry[]) {
  let bounds: RenderBounds | null = null
  for (const entry of stack) {
    bounds = bounds ? intersectBounds(bounds, entry.bounds) : entry.bounds
    if (!bounds) return null
  }
  return bounds
}

function getBackdropFilterParams(effect: EffectConfig): BackdropFilterParams {
  const params = {} as BackdropFilterParams
  for (let i = 0; i < BACKDROP_FIELDS.length; i++) {
    params[BACKDROP_PARAM_KEYS[i]] = effect[BACKDROP_FIELDS[i]] ?? null
  }
  return params
}

function getBackdropFilterKind(params: BackdropFilterParams): BackdropFilterKind {
  const hasBlur = params.blur !== null && params.blur > 0
  const hasColor = params.brightness !== null ||
    params.contrast !== null ||
    params.saturate !== null ||
    params.grayscale !== null ||
    params.invert !== null ||
    params.sepia !== null ||
    params.hueRotate !== null
  if (hasBlur && hasColor) return BACKDROP_FILTER_KIND.BLUR_COLOR
  if (hasBlur) return BACKDROP_FILTER_KIND.BLUR
  return BACKDROP_FILTER_KIND.COLOR
}

const transformHashF64 = new Float64Array(9)
const transformHashU8 = new Uint8Array(transformHashF64.buffer)
const effectHashBuf = new ArrayBuffer(512)
const effectHashView = new DataView(effectHashBuf)
const effectHashU8 = new Uint8Array(effectHashBuf)

function fnv1a(data: ArrayLike<number>): number {
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function getTransformMatrix(effect: EffectConfig) {
  const node = effect._node
  if (node?._accTransform) return node._accTransform
  if (node?._transform) return node._transform
  if (effect.transform) return effect.transform
  return null
}

function getTransformStateId(effect: EffectConfig) {
  const matrix = getTransformMatrix(effect)
  if (!matrix) return 0
  for (let i = 0; i < 9; i++) transformHashF64[i] = Number.isFinite(matrix[i]) ? matrix[i] : 0
  return fnv1a(transformHashU8)
}

function getEffectStateId(effect: EffectConfig, radius = 0) {
  if (effect._stateHash !== undefined && effect._node?._vpDirty === false) return effect._stateHash
  let offset = 0
  const writeU32 = (value: number) => { effectHashView.setUint32(offset, value >>> 0, true); offset += 4 }
  const writeF64 = (value: number) => { effectHashView.setFloat64(offset, Number.isFinite(value) ? value : 0, true); offset += 8 }
  writeU32(effect.color)
  writeF64(radius)
  if (Array.isArray(effect.shadow)) {
    for (let i = 0; i < effect.shadow.length; i++) {
      const entry = effect.shadow[i]
      writeF64(entry.x)
      writeF64(entry.y)
      writeF64(entry.blur)
      writeU32(entry.color)
    }
  } else if (effect.shadow) {
    writeF64(effect.shadow.x)
    writeF64(effect.shadow.y)
    writeF64(effect.shadow.blur)
    writeU32(effect.shadow.color)
  }
  if (effect.glow) {
    writeF64(effect.glow.radius)
    writeU32(effect.glow.color)
    writeF64(effect.glow.intensity)
  }
  if (effect.gradient) {
    writeU32(effect.gradient.type === "linear" ? 1 : 2)
    writeU32(effect.gradient.from)
    writeU32(effect.gradient.to)
    writeF64(effect.gradient.type === "linear" ? effect.gradient.angle : 0)
  }
  const params = getBackdropFilterParams(effect)
  writeF64(params.blur ?? -1)
  writeF64(params.brightness ?? -1)
  writeF64(params.contrast ?? -1)
  writeF64(params.saturate ?? -1)
  writeF64(params.grayscale ?? -1)
  writeF64(params.invert ?? -1)
  writeF64(params.sepia ?? -1)
  writeF64(params.hueRotate ?? -1)
  // Self-filter fields participate in the effect identity as well. This is
  // consumed by transformed-sprite caches, so toggling a reactive filter (or
  // changing one of the individual channels) cannot reuse stale pixels.
  const selfFilter = effect.filter
  writeF64(selfFilter?.blur ?? -1)
  writeF64(selfFilter?.brightness ?? -1)
  writeF64(selfFilter?.contrast ?? -1)
  writeF64(selfFilter?.saturate ?? -1)
  writeF64(selfFilter?.grayscale ?? -1)
  writeF64(selfFilter?.invert ?? -1)
  writeF64(selfFilter?.sepia ?? -1)
  writeF64(selfFilter?.hueRotate ?? -1)
  writeF64(effect.opacity ?? -1)
  if (effect.cornerRadii) {
    writeF64(effect.cornerRadii.tl)
    writeF64(effect.cornerRadii.tr)
    writeF64(effect.cornerRadii.br)
    writeF64(effect.cornerRadii.bl)
  }
  const hash = fnv1a(effectHashU8.subarray(0, offset))
  effect._stateHash = hash
  return hash
}

function createClipStateId(stack: ClipStackEntry[]) {
  if (stack.length === 0) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < stack.length; i++) {
    let value = stack[i].id >>> 0
    for (let b = 0; b < 4; b++) {
      h ^= value & 0xff
      h = Math.imul(h, 0x01000193)
      value >>>= 8
    }
  }
  return h >>> 0
}

function createBackdropSourceKey(effect: EffectConfig, clipStateId: number, transformStateId: number) {
  const node = effect._node
  const parentId = node?.parent?.id ?? 0
  const layerId = node?.props.layer ? node.id : parentId
  return `backdrop-source:layer:${layerId}:parent:${parentId}:${clipStateId}:${transformStateId}`
}

function createBackdropMetadata(effect: EffectConfig, command: RenderCommand, clipStack: ClipStackEntry[]): BackdropRenderMetadata | null {
  if (!hasBackdropEffect(effect)) return null
  const inputBounds = boundsFromCommand(command)
  const stackClipBounds = getCurrentClipBounds(clipStack)
  const clipBounds = stackClipBounds ? intersectBounds(inputBounds, stackClipBounds) ?? inputBounds : inputBounds
  const outputBounds = clipBounds
  const blurPad = effect.backdropBlur ? Math.ceil(effect.backdropBlur) : 0
  const sampleBounds = expandBounds(outputBounds, blurPad)
  const filterParams = getBackdropFilterParams(effect)
  const transformStateId = getTransformStateId(effect)
  const clipStateId = createClipStateId(clipStack)
  const effectStateId = getEffectStateId(effect, Math.round(command.cornerRadius))
  return {
    backdropSourceKey: createBackdropSourceKey(effect, clipStateId, transformStateId),
    filterKind: getBackdropFilterKind(filterParams),
    filterParams,
    inputBounds,
    sampleBounds,
    outputBounds,
    clipBounds,
    transformStateId,
    clipStateId,
    effectStateId,
  }
}

function createClipStackEntry(cmd: RenderCommand, depth: number): ClipStackEntry {
  const bounds = boundsFromCommand(cmd)
  const id = hashU32Scratch(depth, bounds.x, bounds.y, bounds.width, bounds.height)
  return {
    bounds,
    id,
  }
}

function hashU32Scratch(a: number, b: number, c: number, d: number, e: number) {
  let h = 0x811c9dc5
  const mix = (input: number) => {
    let value = input >>> 0
    for (let i = 0; i < 4; i++) {
      h ^= value & 0xff
      h = Math.imul(h, 0x01000193)
      value >>>= 8
    }
  }
  mix(a); mix(b); mix(c); mix(d); mix(e)
  return h >>> 0
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

/** @public */
export function buildRenderGraphFrame(
  commands: RenderCommand[],
): RenderGraphFrame {
  const ops: RenderGraphOp[] = []
  const clipStack: ClipStackEntry[] = []
  for (const cmd of commands) {
    // Process SCISSOR commands for clipStack before building render ops
    if (cmd.type === CMD.SCISSOR_START) {
      clipStack.push(createClipStackEntry(cmd, clipStack.length))
      continue
    }
    if (cmd.type === CMD.SCISSOR_END) {
      clipStack.pop()
      continue
    }

    // Use cmd.nodeId directly (set by layout-adapter.endLayout()).
    // All commands carry nodeId — the legacy counter-based fallback has been removed.
    const rectId = cmd.nodeId ?? null
    const textId = cmd.nodeId ?? null
    const op = buildRenderOp(cmd, {
      rect: cmd.type === CMD.RECTANGLE ? rectId : null,
      text: cmd.type === CMD.TEXT ? textId : null,
    })
    const clipBounds = getCurrentClipBounds(clipStack)
    if (op?.kind === "effect") {
      const backdrop = createBackdropMetadata(op.effect, cmd, clipStack)
      ops.push({
        ...op,
        clipBounds,
        backdrop,
        transformStateId: backdrop?.transformStateId ?? getTransformStateId(op.effect),
        clipStateId: backdrop?.clipStateId ?? createClipStateId(clipStack),
        effectStateId: backdrop?.effectStateId ?? getEffectStateId(op.effect, Math.round(op.cornerRadius)),
      })
    } else if (op) {
      ops.push({ ...op, clipBounds })
    }
  }
  return { ops }
}
