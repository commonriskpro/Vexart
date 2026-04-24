import type { CanvasContext } from "./canvas"
import type { TGENode } from "./node"

// ── RenderCommand type ──
// Commands are produced by layout-adapter.endLayout() and carry nodeId for
// matching commands to effects, images, and layer assignments.

/** Clay-compatible command type constants. */
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
  color: [number, number, number, number] // r,g,b,a 0-255
  cornerRadius: number
  extra1: number // border width, font size
  extra2: number // text length, font id
  text?: string
  /** Stable node ID for matching render ops to effects/images. */
  nodeId?: number
}

// ── Color packing (inlined, formerly from paint-bridge.ts) ──
function packColor(r: number, g: number, b: number, a: number): number {
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0
}

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
  transformStateId: string
  clipStateId: string
  effectStateId: string
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
  viewport?: { x: number; y: number; zoom: number }
  nativeDisplayListHandle?: bigint | null
  displayListHash?: string | null
}

/** @public */
export type RenderGraphQueues = {
  effects: EffectConfig[]
  images: ImagePaintConfig[]
  canvases: CanvasPaintConfig[]
}

/** @public */
export type RenderGraphQueueState = {
  borderEffectIndex: number
}

/** @public */
export type TextMeta = {
  content: string
  fontId: number
  fontSize: number
  lineHeight: number
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
  lineHeight: number
  maxWidth: number
  textHeight: number
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
  transformStateId: string
  clipStateId: string
  effectStateId: string
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
  id: string
}

/** @public */
export function createRenderGraphQueues(): RenderGraphQueues {
  return {
    effects: [],
    images: [],
    canvases: [],
  }
}

/** @public */
export function resetRenderGraphQueues(queues: RenderGraphQueues) {
  queues.effects.length = 0
  queues.images.length = 0
  queues.canvases.length = 0
}

/** @public */
export function cloneRenderGraphQueues(queues: RenderGraphQueues): RenderGraphQueues {
  // buildRenderGraphFrame no longer mutates queue arrays, so callers can reuse
  // the original queue references without paying 3x slice() allocations.
  return {
    effects: queues.effects,
    images: queues.images,
    canvases: queues.canvases,
  }
}

export function getRectangleRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues, renderObjectId: number | null): RectangleRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const color = packColor(cmd.color[0], cmd.color[1], cmd.color[2], cmd.color[3])

  const image = renderObjectId !== null
    ? queues.images.find((entry) => entry.renderObjectId === renderObjectId) ?? null
    : null

  const canvas = renderObjectId !== null
    ? queues.canvases.find((entry) => entry.renderObjectId === renderObjectId) ?? null
    : null

  const effect = renderObjectId !== null
    ? queues.effects.find((entry) => entry.renderObjectId === renderObjectId) ?? null
    : null

  return { renderObjectId, color, radius, image, canvas, effect }
}

export function getBorderRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues, state: RenderGraphQueueState): BorderRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const width = Math.round(cmd.extra1) || 1
  let effect: EffectConfig | null = null
  for (let i = state.borderEffectIndex; i < queues.effects.length; i++) {
    const entry = queues.effects[i]
    if (entry.cornerRadii === undefined) continue
    effect = entry
    state.borderEffectIndex = i + 1
    break
  }
  return {
    radius,
    width,
    cornerRadii: effect?.cornerRadii ?? null,
  }
}

export function getTextRenderInputs(cmd: RenderCommand, textMetaMap: Map<string, TextMeta>): TextRenderInputs | null {
  if (!cmd.text) return null
  const meta = textMetaMap.get(cmd.text)
  const fontId = meta?.fontId ?? 0
  const lineHeight = meta?.lineHeight ?? 17
  const maxWidth = Math.max(Math.round(cmd.width), 1)
  const textHeight = Math.round(cmd.height) > 0 ? Math.round(cmd.height) : lineHeight
  return {
    text: cmd.text,
    fontId,
    lineHeight,
    maxWidth,
    textHeight,
  }
}

function roundBoundsValue(value: number) {
  return Math.round(value)
}

function createRenderBounds(x: number, y: number, width: number, height: number): RenderBounds {
  return {
    x: roundBoundsValue(x),
    y: roundBoundsValue(y),
    width: Math.max(0, roundBoundsValue(width)),
    height: Math.max(0, roundBoundsValue(height)),
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

function hasBackdropEffect(effect: EffectConfig) {
  return effect.backdropBlur !== undefined ||
    effect.backdropBrightness !== undefined ||
    effect.backdropContrast !== undefined ||
    effect.backdropSaturate !== undefined ||
    effect.backdropGrayscale !== undefined ||
    effect.backdropInvert !== undefined ||
    effect.backdropSepia !== undefined ||
    effect.backdropHueRotate !== undefined
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

function serializeMatrixValue(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0
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
  if (!matrix) return "transform:none"
  let id = "transform:"
  for (let i = 0; i < matrix.length; i++) {
    if (i > 0) id += ","
    id += serializeMatrixValue(matrix[i])
  }
  return id
}

function getEffectStateId(effect: EffectConfig) {
  let shadow = "none"
  if (Array.isArray(effect.shadow)) {
    shadow = ""
    for (let i = 0; i < effect.shadow.length; i++) {
      const entry = effect.shadow[i]
      if (i > 0) shadow += "|"
      shadow += `${entry.x}:${entry.y}:${entry.blur}:${entry.color}`
    }
  } else if (effect.shadow) {
    shadow = `${effect.shadow.x}:${effect.shadow.y}:${effect.shadow.blur}:${effect.shadow.color}`
  }
  const glow = effect.glow ? `${effect.glow.radius}:${effect.glow.color}:${effect.glow.intensity}` : "none"
  const gradient = effect.gradient
    ? effect.gradient.type === "linear"
      ? `linear:${effect.gradient.from}:${effect.gradient.to}:${effect.gradient.angle}`
      : `radial:${effect.gradient.from}:${effect.gradient.to}`
    : "none"
  const params = getBackdropFilterParams(effect)
  return `color:${effect.color};radius:${effect.cornerRadius};shadow:${shadow};glow:${glow};gradient:${gradient};blur:${params.blur ?? "none"};brightness:${params.brightness ?? "none"};contrast:${params.contrast ?? "none"};saturate:${params.saturate ?? "none"};grayscale:${params.grayscale ?? "none"};invert:${params.invert ?? "none"};sepia:${params.sepia ?? "none"};hueRotate:${params.hueRotate ?? "none"};opacity:${effect.opacity ?? "none"}`
}

function createClipStateId(stack: ClipStackEntry[]) {
  if (stack.length === 0) return "clip:none"
  let id = "clip:"
  for (let i = 0; i < stack.length; i++) {
    if (i > 0) id += ">"
    id += stack[i].id
  }
  return id
}

function createBackdropSourceKey(effect: EffectConfig, clipStateId: string, transformStateId: string) {
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
  return {
    bounds,
    id: `${depth}:${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
  }
}

/** @public */
export function buildRenderOp(cmd: RenderCommand, queues: RenderGraphQueues, queueState: RenderGraphQueueState, textMetaMap: Map<string, TextMeta>, ownerIds?: { rect: number | null; text: number | null }): RenderGraphOp | null {
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
  textMetaMap: Map<string, TextMeta>,
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
