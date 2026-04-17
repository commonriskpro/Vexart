import type { CanvasContext } from "./canvas"
import type { TGENode } from "./node"
import { CMD, type RenderCommand } from "./clay"
import { packColor } from "./paint-bridge"

export type ShadowDef = {
  x: number
  y: number
  blur: number
  color: number
}

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
  _node?: TGENode
  _subtreeTransform?: boolean
}

export const BACKDROP_FILTER_KIND = {
  BLUR: "blur",
  COLOR: "color",
  BLUR_COLOR: "blur-color",
} as const

export type BackdropFilterKind = (typeof BACKDROP_FILTER_KIND)[keyof typeof BACKDROP_FILTER_KIND]

export interface RenderBounds {
  x: number
  y: number
  width: number
  height: number
}

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

export type ImagePaintConfig = {
  renderObjectId?: number
  color: number
  cornerRadius: number
  imageBuffer: { data: Uint8Array; width: number; height: number }
  objectFit: "contain" | "cover" | "fill" | "none"
}

export type CanvasPaintConfig = {
  renderObjectId?: number
  color: number
  onDraw: (ctx: CanvasContext) => void
  viewport?: { x: number; y: number; zoom: number }
}

export type RenderGraphQueues = {
  effects: EffectConfig[]
  images: ImagePaintConfig[]
  canvases: CanvasPaintConfig[]
}

export type TextMeta = {
  content: string
  fontId: number
  fontSize: number
  lineHeight: number
}

export type RectangleRenderInputs = {
  renderObjectId: number | null
  color: number
  radius: number
  image: ImagePaintConfig | null
  canvas: CanvasPaintConfig | null
  effect: EffectConfig | null
}

export type BorderRenderInputs = {
  radius: number
  width: number
  cornerRadii: { tl: number; tr: number; br: number; bl: number } | null
}

export type TextRenderInputs = {
  text: string
  fontId: number
  lineHeight: number
  maxWidth: number
  textHeight: number
}

export type RectangleRenderOp = {
  kind: "rectangle"
  renderObjectId: number | null
  command: RenderCommand
  inputs: RectangleRenderInputs
}

export type ImageRenderOp = {
  kind: "image"
  renderObjectId: number | null
  command: RenderCommand
  rect: RectangleRenderOp
  image: ImagePaintConfig
}

export type CanvasRenderOp = {
  kind: "canvas"
  renderObjectId: number | null
  command: RenderCommand
  rect: RectangleRenderOp
  canvas: CanvasPaintConfig
}

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

export type BorderRenderOp = {
  kind: "border"
  renderObjectId: number | null
  command: RenderCommand
  inputs: BorderRenderInputs
}

export type TextRenderOp = {
  kind: "text"
  renderObjectId: number | null
  command: RenderCommand
  inputs: TextRenderInputs
}

export type RawCommandRenderOp = {
  kind: "raw-command"
  renderObjectId: number | null
  command: RenderCommand
}

export type RenderGraphOp = RectangleRenderOp | ImageRenderOp | CanvasRenderOp | EffectRenderOp | BorderRenderOp | TextRenderOp | RawCommandRenderOp

export type RenderGraphFrame = {
  ops: RenderGraphOp[]
}

type ClipStackEntry = {
  bounds: RenderBounds
  id: string
}

export function createRenderGraphQueues(): RenderGraphQueues {
  return {
    effects: [],
    images: [],
    canvases: [],
  }
}

export function resetRenderGraphQueues(queues: RenderGraphQueues) {
  queues.effects.length = 0
  queues.images.length = 0
  queues.canvases.length = 0
}

export function cloneRenderGraphQueues(queues: RenderGraphQueues): RenderGraphQueues {
  return {
    effects: queues.effects.slice(),
    images: queues.images.slice(),
    canvases: queues.canvases.slice(),
  }
}

export function getRectangleRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues, renderObjectId: number | null): RectangleRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const color = packColor(cmd.color[0], cmd.color[1], cmd.color[2], cmd.color[3])

  const imageIdx = renderObjectId !== null ? queues.images.findIndex((entry) => entry.renderObjectId === renderObjectId) : -1
  const image = imageIdx >= 0 ? queues.images.splice(imageIdx, 1)[0] : null

  const canvasIdx = renderObjectId !== null ? queues.canvases.findIndex((entry) => entry.renderObjectId === renderObjectId) : -1
  const canvas = canvasIdx >= 0 ? queues.canvases.splice(canvasIdx, 1)[0] : null

  const effectIdx = renderObjectId !== null ? queues.effects.findIndex((entry) => entry.renderObjectId === renderObjectId) : -1
  const effect = effectIdx >= 0 ? queues.effects.splice(effectIdx, 1)[0] : null

  return { renderObjectId, color, radius, image, canvas, effect }
}

export function getBorderRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues): BorderRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const width = Math.round(cmd.extra1) || 1
  const effectIdx = queues.effects.findIndex((entry) => entry.cornerRadii !== undefined)
  const effect = effectIdx >= 0 ? queues.effects.splice(effectIdx, 1)[0] : null
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
  return `transform:${Array.from(matrix, serializeMatrixValue).join(",")}`
}

function getEffectStateId(effect: EffectConfig) {
  const shadow = Array.isArray(effect.shadow)
    ? effect.shadow.map((entry) => `${entry.x}:${entry.y}:${entry.blur}:${entry.color}`).join("|")
    : effect.shadow
      ? `${effect.shadow.x}:${effect.shadow.y}:${effect.shadow.blur}:${effect.shadow.color}`
      : "none"
  const glow = effect.glow ? `${effect.glow.radius}:${effect.glow.color}:${effect.glow.intensity}` : "none"
  const gradient = effect.gradient
    ? effect.gradient.type === "linear"
      ? `linear:${effect.gradient.from}:${effect.gradient.to}:${effect.gradient.angle}`
      : `radial:${effect.gradient.from}:${effect.gradient.to}`
    : "none"
  const params = getBackdropFilterParams(effect)
  return [
    `color:${effect.color}`,
    `radius:${effect.cornerRadius}`,
    `shadow:${shadow}`,
    `glow:${glow}`,
    `gradient:${gradient}`,
    `blur:${params.blur ?? "none"}`,
    `brightness:${params.brightness ?? "none"}`,
    `contrast:${params.contrast ?? "none"}`,
    `saturate:${params.saturate ?? "none"}`,
    `grayscale:${params.grayscale ?? "none"}`,
    `invert:${params.invert ?? "none"}`,
    `sepia:${params.sepia ?? "none"}`,
    `hueRotate:${params.hueRotate ?? "none"}`,
    `opacity:${effect.opacity ?? "none"}`,
    `subtree:${effect._subtreeTransform ? 1 : 0}`,
  ].join(";")
}

function createClipStateId(stack: ClipStackEntry[]) {
  if (stack.length === 0) return "clip:none"
  return `clip:${stack.map((entry) => entry.id).join(">")}`
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

export function buildRenderOp(cmd: RenderCommand, queues: RenderGraphQueues, textMetaMap: Map<string, TextMeta>, ownerIds?: { rect: number | null; text: number | null }): RenderGraphOp | null {
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
      inputs: getBorderRenderInputs(cmd, queues),
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
  return {
    kind: "raw-command",
    renderObjectId: null,
    command: cmd,
  }
}

export function buildRenderGraphFrame(
  commands: RenderCommand[],
  queues: RenderGraphQueues,
  textMetaMap: Map<string, TextMeta>,
  owners?: { rectNodeIds: number[]; textNodeIds: number[] },
): RenderGraphFrame {
  const ops: RenderGraphOp[] = []
  const clipStack: ClipStackEntry[] = []
  let rectIdx = 0
  let textIdx = 0
  for (const cmd of commands) {
    const op = buildRenderOp(cmd, queues, textMetaMap, {
      rect: cmd.type === CMD.RECTANGLE ? owners?.rectNodeIds[rectIdx++] ?? null : null,
      text: cmd.type === CMD.TEXT ? owners?.textNodeIds[textIdx++] ?? null : null,
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

    if (cmd.type === CMD.SCISSOR_START) {
      clipStack.push(createClipStackEntry(cmd, clipStack.length))
      continue
    }
    if (cmd.type === CMD.SCISSOR_END) {
      clipStack.pop()
    }
  }
  return { ops }
}
