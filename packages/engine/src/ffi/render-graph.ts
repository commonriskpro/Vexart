import type { CanvasContext, DrawCmd } from "./canvas"
import type { TGENode } from "./node"
import { hasBackdropEffect } from "../loop/predicates"

// ── RenderCommand type ──
// Commands are produced by layout-adapter.endLayout() and carry nodeId for
// matching commands to effects, images, and layer assignments.
//
// TODO(arch): RenderCommand is a generic intermediary — effect/image/canvas data
// takes a detour through effectsQueue (walk-tree) → RenderCommand (layout-adapter)
// → Map.get by nodeId (buildRenderOp). Consider merging effects directly into
// a unified RenderGraphOp during endLayout() to eliminate the intermediary.

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
  /** Stable node ID for matching render ops to effects/images. */
  nodeId?: number
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
  cornerRadius: number
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
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
  transform?: Float64Array
  transformInverse?: Float64Array
  transformBounds?: { x: number; y: number; width: number; height: number }
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

/** @public */
export interface RenderBounds {
  x: number
  y: number
  width: number
  height: number
}

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
export type RenderGraphQueues = {
  effects: Map<number, EffectConfig>
  images: Map<number, ImagePaintConfig>
  canvases: Map<number, CanvasPaintConfig>
}

/** @public */
export type RenderGraphQueueState = {
  borderEffectIndex: number
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

/** @public */
export type RectangleRenderInputs = {
  renderObjectId: number | null
  color: number
  radius: number
  image: ImagePaintConfig | null
  canvas: CanvasPaintConfig | null
  effect: EffectConfig | null
}

/** @public */
export type BorderRenderInputs = {
  radius: number
  width: number
  cornerRadii: { tl: number; tr: number; br: number; bl: number } | null
}

/** @public */
export type TextRenderInputs = {
  text: string
  fontId: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  textHeight: number
  fontFamily?: string
  fontWeight?: number
  fontStyle?: string
}

/** @public */
export type RectangleRenderOp = {
  kind: "rectangle"
  renderObjectId: number | null
  command: RenderCommand
  inputs: RectangleRenderInputs
}

/** @public */
export type ImageRenderOp = {
  kind: "image"
  renderObjectId: number | null
  command: RenderCommand
  rect: RectangleRenderOp
  image: ImagePaintConfig
}

/** @public */
export type CanvasRenderOp = {
  kind: "canvas"
  renderObjectId: number | null
  command: RenderCommand
  rect: RectangleRenderOp
  canvas: CanvasPaintConfig
}

/** @public */
export type EffectRenderOp = {
  kind: "effect"
  renderObjectId: number | null
  command: RenderCommand
  rect: RectangleRenderOp
  effect: EffectConfig
  backdrop: BackdropRenderMetadata | null
  transformStateId: number
  clipStateId: number
  effectStateId: number
}

/** @public */
export type BorderRenderOp = {
  kind: "border"
  renderObjectId: number | null
  command: RenderCommand
  inputs: BorderRenderInputs
}

/** @public */
export type TextRenderOp = {
  kind: "text"
  renderObjectId: number | null
  command: RenderCommand
  inputs: TextRenderInputs
}

/** @public */
export type RawCommandRenderOp = {
  kind: "raw-command"
  renderObjectId: number | null
  command: RenderCommand
}

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

/** @public */
export function createRenderGraphQueues(): RenderGraphQueues {
  return {
    effects: new Map(),
    images: new Map(),
    canvases: new Map(),
  }
}

/** @public */
export function resetRenderGraphQueues(queues: RenderGraphQueues) {
  queues.effects.clear()
  queues.images.clear()
  queues.canvases.clear()
}

/** @public */
export function cloneRenderGraphQueues(queues: RenderGraphQueues): RenderGraphQueues {
  // buildRenderGraphFrame no longer mutates queues, so callers can reuse
  // the original queue references without paying 3x slice() allocations.
  return {
    effects: queues.effects,
    images: queues.images,
    canvases: queues.canvases,
  }
}

export function getRectangleRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues, renderObjectId: number | null): RectangleRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const color = cmd.color >>> 0

  const image = renderObjectId !== null
    ? queues.images.get(renderObjectId) ?? null
    : null

  const canvas = renderObjectId !== null
    ? queues.canvases.get(renderObjectId) ?? null
    : null

  const effect = renderObjectId !== null
    ? queues.effects.get(renderObjectId) ?? null
    : null

  return { renderObjectId, color, radius, image, canvas, effect }
}

export function getBorderRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues, state: RenderGraphQueueState): BorderRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const width = Math.round(cmd.extra1) || 1
  let effect: EffectConfig | null = null
  let i = 0
  for (const entry of queues.effects.values()) {
    if (i++ < state.borderEffectIndex) continue
    if (entry.cornerRadii === undefined) continue
    effect = entry
    state.borderEffectIndex = i
    break
  }
  return {
    radius,
    width,
    cornerRadii: effect?.cornerRadii ?? null,
  }
}

export function getTextRenderInputs(cmd: RenderCommand, textMetaMap: Map<number, TextMeta>): TextRenderInputs | null {
  if (!cmd.text) return null
  const meta = cmd.nodeId === undefined ? undefined : textMetaMap.get(cmd.nodeId)
  const fontId = meta?.fontId ?? 0
  const fontSize = meta?.fontSize ?? (Math.round(cmd.extra1) || 14)
  const lineHeight = meta?.lineHeight ?? Math.ceil(fontSize * 1.2)
  const maxWidth = Math.max(Math.round(cmd.width), 1)
  const textHeight = Math.round(cmd.height) > 0 ? Math.round(cmd.height) : lineHeight
  return {
    text: cmd.text,
    fontId,
    fontSize,
    lineHeight,
    maxWidth,
    textHeight,
    fontFamily: meta?.fontFamily,
    fontWeight: meta?.fontWeight,
    fontStyle: meta?.fontStyle,
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
  return {
    blur: effect.backdropBlur ?? null,
    brightness: effect.backdropBrightness ?? null,
    contrast: effect.backdropContrast ?? null,
    saturate: effect.backdropSaturate ?? null,
    grayscale: effect.backdropGrayscale ?? null,
    invert: effect.backdropInvert ?? null,
    sepia: effect.backdropSepia ?? null,
    hueRotate: effect.backdropHueRotate ?? null,
  }
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

function getEffectStateId(effect: EffectConfig) {
  if (effect._stateHash !== undefined && effect._node?._vpDirty === false) return effect._stateHash
  let offset = 0
  const writeU32 = (value: number) => { effectHashView.setUint32(offset, value >>> 0, true); offset += 4 }
  const writeF64 = (value: number) => { effectHashView.setFloat64(offset, Number.isFinite(value) ? value : 0, true); offset += 8 }
  writeU32(effect.color)
  writeF64(effect.cornerRadius)
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
  const effectStateId = getEffectStateId(effect)
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
export function buildRenderOp(cmd: RenderCommand, queues: RenderGraphQueues, queueState: RenderGraphQueueState, textMetaMap: Map<number, TextMeta>, ownerIds?: { rect: number | null; text: number | null }): RenderGraphOp | null {
  if (cmd.type === CMD.RECTANGLE) {
    const renderObjectId = ownerIds?.rect ?? null
    const rect: RectangleRenderOp = {
      kind: "rectangle",
      renderObjectId,
      command: cmd,
      inputs: getRectangleRenderInputs(cmd, queues, renderObjectId),
    }
    if (rect.inputs.image) {
      return {
        kind: "image",
        renderObjectId,
        command: cmd,
        rect,
        image: rect.inputs.image,
      }
    }
    if (rect.inputs.canvas) {
      return {
        kind: "canvas",
        renderObjectId,
        command: cmd,
        rect,
        canvas: rect.inputs.canvas,
      }
    }
    if (rect.inputs.effect) {
      const transformStateId = getTransformStateId(rect.inputs.effect)
      const clipStateId = createClipStateId([])
      const effectStateId = getEffectStateId(rect.inputs.effect)
      return {
        kind: "effect",
        renderObjectId,
        command: cmd,
        rect,
        effect: rect.inputs.effect,
        backdrop: null,
        transformStateId,
        clipStateId,
        effectStateId,
      }
    }
    return rect
  }
  if (cmd.type === CMD.BORDER) {
    return {
      kind: "border",
      renderObjectId: null,
      command: cmd,
      inputs: getBorderRenderInputs(cmd, queues, queueState),
    }
  }
  if (cmd.type === CMD.TEXT) {
    const renderObjectId = ownerIds?.text ?? null
    const inputs = getTextRenderInputs(cmd, textMetaMap)
    if (!inputs) return null
    return {
      kind: "text",
      renderObjectId,
      command: cmd,
      inputs,
    }
  }
  // SCISSOR_START/END are handled by the clipStack in buildRenderGraphFrame,
  // not as renderable ops. Skip them here.
  if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) {
    return null
  }
  return {
    kind: "raw-command",
    renderObjectId: null,
    command: cmd,
  }
}

/** @public */
export function buildRenderGraphFrame(
  commands: RenderCommand[],
  queues: RenderGraphQueues,
  textMetaMap: Map<number, TextMeta>,
): RenderGraphFrame {
  const ops: RenderGraphOp[] = []
  const clipStack: ClipStackEntry[] = []
  const queueState: RenderGraphQueueState = { borderEffectIndex: 0 }
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
    const op = buildRenderOp(cmd, queues, queueState, textMetaMap, {
      rect: cmd.type === CMD.RECTANGLE ? rectId : null,
      text: cmd.type === CMD.TEXT ? textId : null,
    })
    if (op?.kind === "effect") {
      const backdrop = createBackdropMetadata(op.effect, cmd, clipStack)
      ops.push({
        ...op,
        backdrop,
        transformStateId: backdrop?.transformStateId ?? getTransformStateId(op.effect),
        clipStateId: backdrop?.clipStateId ?? createClipStateId(clipStack),
        effectStateId: backdrop?.effectStateId ?? getEffectStateId(op.effect),
      })
    } else if (op) {
      ops.push(op)
    }
  }
  return { ops }
}
