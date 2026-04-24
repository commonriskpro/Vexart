import { ptr } from "bun:ffi"
import {
  BACKDROP_FILTER_KIND,
  buildRenderOp,
  type BackdropFilterKind,
  type BackdropFilterParams,
  type BackdropRenderMetadata,
  type BorderRenderOp,
  type CanvasRenderOp,
  type EffectConfig,
  type EffectRenderOp,
  type ImageRenderOp,
  type RectangleRenderInputs,
  type RectangleRenderOp,
  type RenderCommand,
  type RenderGraphFrame,
  type RenderGraphOp,
  type RenderGraphQueues,
  type RenderBounds,
  type TextRenderOp,
  type TextMeta,
  CMD,
} from "./render-graph"
import { fromConfig } from "./matrix"
import { nativeSceneHandle } from "./native-scene"
import { openVexartLibrary } from "./vexart-bridge"

export const NATIVE_RENDER_OP_KIND = {
  RECT: "rect",
  BORDER: "border",
  TEXT: "text",
  EFFECT: "effect",
  IMAGE: "image",
  CANVAS: "canvas",
} as const

export type NativeRenderOpKind = (typeof NATIVE_RENDER_OP_KIND)[keyof typeof NATIVE_RENDER_OP_KIND]

export interface NativeRenderOpSnapshot {
  kind: NativeRenderOpKind
  nodeId: number
  x: number
  y: number
  width: number
  height: number
  color: number
  cornerRadius: number
  borderWidth: number
  opacity: number
  text: string
  fontSize: number
  fontId: number
  objectFit?: "contain" | "cover" | "fill" | "none"
  canvasViewportJson?: string
  materialKey: string
  effectKey: string
  imageSource: string
  imageHandle?: number
  hasGradient: boolean
  hasShadow: boolean
  hasGlow: boolean
  hasFilter: boolean
  hasBackdrop: boolean
  hasTransform: boolean
  hasOpacity: boolean
  hasCornerRadii?: boolean
  gradientJson: string
  shadowJson: string
  glowJson: string
  filterJson: string
  transformJson: string
  cornerRadiiJson?: string
  backdropBlur: number | null
  backdropBrightness: number | null
  backdropContrast: number | null
  backdropSaturate: number | null
  backdropGrayscale: number | null
  backdropInvert: number | null
  backdropSepia: number | null
  backdropHueRotate: number | null
}

export interface NativeRenderBatchSnapshot {
  key: string
  opNodeIds: number[]
}

export interface NativeRenderGraphSnapshot {
  ops: NativeRenderOpSnapshot[]
  batches: NativeRenderBatchSnapshot[]
}

type NativeClipStackEntry = {
  bounds: RenderBounds
  id: string
}

export function nativeRenderGraphSnapshot(): NativeRenderGraphSnapshot | null {
  const scene = nativeSceneHandle()
  if (!scene) return null
  const out = new Uint8Array(64 * 1024)
  const used = new Uint32Array(1)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_scene_render_graph_snapshot(1n, scene, ptr(out), out.byteLength, ptr(used)) as number
  if (rc !== 0) return null
  return JSON.parse(new TextDecoder().decode(out.slice(0, used[0]))) as NativeRenderGraphSnapshot
}

function parseJsonValue<T>(value: string): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
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

function boundsFromCommand(command: RenderCommand): RenderBounds {
  return createRenderBounds(command.x, command.y, command.width, command.height)
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

function getCurrentClipBounds(stack: NativeClipStackEntry[]) {
  let bounds: RenderBounds | null = null
  for (const entry of stack) {
    bounds = bounds ? (intersectBounds(bounds, entry.bounds) ?? bounds) : entry.bounds
  }
  return bounds
}

function createClipStackEntry(command: RenderCommand, depth: number): NativeClipStackEntry {
  const bounds = boundsFromCommand(command)
  return {
    bounds,
    id: `${depth}:${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
  }
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

function hasBackdropEffect(effect: EffectConfig) {
  const params = getBackdropFilterParams(effect)
  return params.blur !== null
    || params.brightness !== null
    || params.contrast !== null
    || params.saturate !== null
    || params.grayscale !== null
    || params.invert !== null
    || params.sepia !== null
    || params.hueRotate !== null
}

function getBackdropFilterKind(params: BackdropFilterParams): BackdropFilterKind {
  const hasBlur = params.blur !== null
  const hasColor = params.brightness !== null
    || params.contrast !== null
    || params.saturate !== null
    || params.grayscale !== null
    || params.invert !== null
    || params.sepia !== null
    || params.hueRotate !== null
  if (hasBlur && hasColor) return BACKDROP_FILTER_KIND.BLUR_COLOR
  if (hasBlur) return BACKDROP_FILTER_KIND.BLUR
  return BACKDROP_FILTER_KIND.COLOR
}

function serializeMatrixValue(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0
}

function getTransformStateId(effect: EffectConfig) {
  const matrix = effect._node?._accTransform ?? effect._node?._transform ?? effect.transform ?? null
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
  const cornerRadii = effect.cornerRadii
    ? `${effect.cornerRadii.tl}:${effect.cornerRadii.tr}:${effect.cornerRadii.br}:${effect.cornerRadii.bl}`
    : "none"
  const params = getBackdropFilterParams(effect)
  return `color:${effect.color};radius:${effect.cornerRadius};cornerRadii:${cornerRadii};shadow:${shadow};glow:${glow};gradient:${gradient};blur:${params.blur ?? "none"};brightness:${params.brightness ?? "none"};contrast:${params.contrast ?? "none"};saturate:${params.saturate ?? "none"};grayscale:${params.grayscale ?? "none"};invert:${params.invert ?? "none"};sepia:${params.sepia ?? "none"};hueRotate:${params.hueRotate ?? "none"};opacity:${effect.opacity ?? "none"}`
}

function createClipStateId(stack: NativeClipStackEntry[]) {
  if (stack.length === 0) return "clip:none"
  let id = "clip:"
  for (let i = 0; i < stack.length; i++) {
    if (i > 0) id += ">"
    id += stack[i].id
  }
  return id
}

function createBackdropMetadata(effect: EffectConfig, command: RenderCommand, clipStack: NativeClipStackEntry[]): BackdropRenderMetadata | null {
  if (!hasBackdropEffect(effect)) return null
  const inputBounds = boundsFromCommand(command)
  const stackClipBounds = getCurrentClipBounds(clipStack)
  const clipBounds = stackClipBounds ? (intersectBounds(inputBounds, stackClipBounds) ?? inputBounds) : inputBounds
  const outputBounds = clipBounds
  const blurPad = effect.backdropBlur ? Math.ceil(effect.backdropBlur) : 0
  const sampleBounds = expandBounds(outputBounds, blurPad)
  const filterParams = getBackdropFilterParams(effect)
  const transformStateId = getTransformStateId(effect)
  const clipStateId = createClipStateId(clipStack)
  const effectStateId = getEffectStateId(effect)
  return {
    backdropSourceKey: `backdrop-source:native:${effect.renderObjectId ?? 0}:${clipStateId}:${transformStateId}`,
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

function unpackColor(color: number): [number, number, number, number] {
  return [
    (color >>> 24) & 0xff,
    (color >>> 16) & 0xff,
    (color >>> 8) & 0xff,
    color & 0xff,
  ]
}

function nativeCommand(command: RenderCommand, op: NativeRenderOpSnapshot): RenderCommand {
  return {
    ...command,
    color: unpackColor(op.color),
    cornerRadius: op.cornerRadius,
    extra1: op.kind === NATIVE_RENDER_OP_KIND.BORDER ? op.borderWidth : op.kind === NATIVE_RENDER_OP_KIND.TEXT ? op.fontSize : command.extra1,
    extra2: op.kind === NATIVE_RENDER_OP_KIND.TEXT ? op.fontId : command.extra2,
    text: op.kind === NATIVE_RENDER_OP_KIND.TEXT ? op.text : command.text,
  }
}

function nativeEffectConfig(op: NativeRenderOpSnapshot, queueHint?: EffectConfig): EffectConfig {
  const transform = parseJsonValue<Record<string, number>>(op.transformJson)
  const matrix = transform ? fromConfig(transform, op.width / 2, op.height / 2) : undefined
  const cornerRadii = parseJsonValue<{ tl: number; tr: number; br: number; bl: number }>(op.cornerRadiiJson ?? "")
  return {
    renderObjectId: op.nodeId,
    color: op.color,
    cornerRadius: op.cornerRadius,
    shadow: parseJsonValue(op.shadowJson),
    glow: parseJsonValue(op.glowJson),
    gradient: parseJsonValue(op.gradientJson),
    backdropBlur: op.backdropBlur ?? undefined,
    backdropBrightness: op.backdropBrightness ?? undefined,
    backdropContrast: op.backdropContrast ?? undefined,
    backdropSaturate: op.backdropSaturate ?? undefined,
    backdropGrayscale: op.backdropGrayscale ?? undefined,
    backdropInvert: op.backdropInvert ?? undefined,
    backdropSepia: op.backdropSepia ?? undefined,
    backdropHueRotate: op.backdropHueRotate ?? undefined,
    filter: parseJsonValue(op.filterJson),
    cornerRadii,
    opacity: op.hasOpacity ? op.opacity : undefined,
    transform: matrix,
    _node: queueHint?._node,
  }
}

function nativeRectangleInputs(op: NativeRenderOpSnapshot, effect: EffectConfig | null = null): RectangleRenderInputs {
  return {
    renderObjectId: op.nodeId,
    color: op.color,
    radius: Math.round(op.cornerRadius),
    image: null,
    canvas: null,
    effect,
  }
}

function directNativeRectangleOp(command: RenderCommand, op: NativeRenderOpSnapshot): RectangleRenderOp {
  return {
    kind: "rectangle",
    renderObjectId: op.nodeId,
    command,
    inputs: nativeRectangleInputs(op),
  }
}

function directNativeBorderOp(command: RenderCommand, op: NativeRenderOpSnapshot): BorderRenderOp {
  const cornerRadii = parseJsonValue<{ tl: number; tr: number; br: number; bl: number }>(op.cornerRadiiJson ?? "")
  return {
    kind: "border",
    renderObjectId: op.nodeId,
    command,
    inputs: {
      radius: Math.round(op.cornerRadius),
      width: Math.round(op.borderWidth) || 1,
      cornerRadii: cornerRadii ?? null,
    },
  }
}

function directNativeTextOp(command: RenderCommand, op: NativeRenderOpSnapshot, textMetaMap: Map<string, TextMeta>): TextRenderOp | null {
  const text = op.text || command.text || ""
  if (!text) return null
  const meta = textMetaMap.get(text) ?? (command.text ? textMetaMap.get(command.text) : undefined)
  const lineHeight = meta?.lineHeight ?? 17
  return {
    kind: "text",
    renderObjectId: op.nodeId,
    command,
    inputs: {
      text,
      fontId: op.fontId || meta?.fontId || 0,
      lineHeight,
      maxWidth: Math.max(Math.round(command.width), 1),
      textHeight: Math.round(command.height) > 0 ? Math.round(command.height) : lineHeight,
    },
  }
}

function directNativeImageOp(command: RenderCommand, op: NativeRenderOpSnapshot, queues: RenderGraphQueues): ImageRenderOp | null {
  const image = queues.images.find((entry) => entry.renderObjectId === op.nodeId) ?? null
  if (!image) return null
  const resolvedImage = {
    ...image,
    color: op.color,
    cornerRadius: op.cornerRadius,
    objectFit: op.objectFit ?? image.objectFit,
    nativeImageHandle: op.imageHandle && op.imageHandle > 0 ? BigInt(op.imageHandle) : image.nativeImageHandle,
  }
  const rect: RectangleRenderOp = {
    kind: "rectangle",
    renderObjectId: op.nodeId,
    command,
    inputs: {
      ...nativeRectangleInputs(op),
      image: resolvedImage,
    },
  }
  return {
    kind: "image",
    renderObjectId: op.nodeId,
    command,
    rect,
    image: resolvedImage,
  }
}

function directNativeCanvasOp(command: RenderCommand, op: NativeRenderOpSnapshot, queues: RenderGraphQueues): CanvasRenderOp | null {
  const canvas = queues.canvases.find((entry) => entry.renderObjectId === op.nodeId) ?? null
  if (!canvas) return null
  const viewport = parseJsonValue<{ x: number; y: number; zoom: number }>(op.canvasViewportJson ?? "")
  const resolvedCanvas = {
    ...canvas,
    color: op.color,
    viewport: viewport ?? canvas.viewport,
  }
  const rect: RectangleRenderOp = {
    kind: "rectangle",
    renderObjectId: op.nodeId,
    command,
    inputs: {
      ...nativeRectangleInputs(op),
      canvas: resolvedCanvas,
    },
  }
  return {
    kind: "canvas",
    renderObjectId: op.nodeId,
    command,
    rect,
    canvas: resolvedCanvas,
  }
}

function directNativeEffectOp(command: RenderCommand, op: NativeRenderOpSnapshot, queues: RenderGraphQueues, clipStack: NativeClipStackEntry[]): EffectRenderOp {
  const queueHint = queues.effects.find((entry) => entry.renderObjectId === op.nodeId)
  const effect = nativeEffectConfig(op, queueHint)
  const backdrop = createBackdropMetadata(effect, command, clipStack)
  const rect: RectangleRenderOp = {
    kind: "rectangle",
    renderObjectId: op.nodeId,
    command,
    inputs: nativeRectangleInputs(op, effect),
  }
  return {
    kind: "effect",
    renderObjectId: op.nodeId,
    command,
    rect,
    effect,
    backdrop,
    transformStateId: backdrop?.transformStateId ?? getTransformStateId(effect),
    clipStateId: backdrop?.clipStateId ?? createClipStateId(clipStack),
    effectStateId: backdrop?.effectStateId ?? getEffectStateId(effect),
  }
}

function directNativeOp(
  command: RenderCommand,
  op: NativeRenderOpSnapshot,
  queues: RenderGraphQueues,
  textMetaMap: Map<string, TextMeta>,
  clipStack: NativeClipStackEntry[],
): RenderGraphOp | null {
  const resolvedCommand = nativeCommand(command, op)
  if (op.kind === NATIVE_RENDER_OP_KIND.EFFECT) return directNativeEffectOp(resolvedCommand, op, queues, clipStack)
  if (op.kind === NATIVE_RENDER_OP_KIND.RECT) return directNativeRectangleOp(resolvedCommand, op)
  if (op.kind === NATIVE_RENDER_OP_KIND.BORDER) return directNativeBorderOp(resolvedCommand, op)
  if (op.kind === NATIVE_RENDER_OP_KIND.TEXT) return directNativeTextOp(resolvedCommand, op, textMetaMap)
  if (op.kind === NATIVE_RENDER_OP_KIND.IMAGE) return directNativeImageOp(resolvedCommand, op, queues)
  if (op.kind === NATIVE_RENDER_OP_KIND.CANVAS) return directNativeCanvasOp(resolvedCommand, op, queues)
  return null
}

function buildNativeOpLookup(snapshot: NativeRenderGraphSnapshot, nativeToTsNodeId?: Map<number, number>) {
  const lookup = new Map<string, NativeRenderOpSnapshot>()
  for (const op of snapshot.ops) {
    const nodeId = nativeToTsNodeId?.get(op.nodeId) ?? op.nodeId
    lookup.set(`${nodeId}:${op.kind}`, { ...op, nodeId })
  }
  return lookup
}

function pickNativeOpForCommand(command: RenderCommand, lookup: Map<string, NativeRenderOpSnapshot>) {
  if (command.nodeId === undefined) return null
  const key = (kind: NativeRenderOpKind) => `${command.nodeId}:${kind}`
  if (command.type === CMD.RECTANGLE) {
    return lookup.get(key(NATIVE_RENDER_OP_KIND.EFFECT))
      ?? lookup.get(key(NATIVE_RENDER_OP_KIND.IMAGE))
      ?? lookup.get(key(NATIVE_RENDER_OP_KIND.CANVAS))
      ?? lookup.get(key(NATIVE_RENDER_OP_KIND.RECT))
      ?? null
  }
  if (command.type === CMD.BORDER) return lookup.get(key(NATIVE_RENDER_OP_KIND.BORDER)) ?? null
  if (command.type === CMD.TEXT) return lookup.get(key(NATIVE_RENDER_OP_KIND.TEXT)) ?? null
  return null
}

export function translateNativeRenderGraphSnapshot(
  snapshot: NativeRenderGraphSnapshot,
  commands: RenderCommand[],
  queues: RenderGraphQueues,
  textMetaMap: Map<string, TextMeta>,
  nativeToTsNodeId?: Map<number, number>,
): RenderGraphFrame {
  const ops: RenderGraphOp[] = []
  const queueState = { borderEffectIndex: 0 }
  const clipStack: NativeClipStackEntry[] = []
  const nativeLookup = buildNativeOpLookup(snapshot, nativeToTsNodeId)
  for (const command of commands) {
    if (command.type === CMD.SCISSOR_START) {
      clipStack.push(createClipStackEntry(command, clipStack.length))
      continue
    }
    if (command.type === CMD.SCISSOR_END) {
      clipStack.pop()
      continue
    }
    const nativeOp = pickNativeOpForCommand(command, nativeLookup)
    if (nativeOp) {
      const op = directNativeOp(command, nativeOp, queues, textMetaMap, clipStack)
      if (op) {
        ops.push(op)
        continue
      }
    }
    const ownerIds = {
      rect: command.type === CMD.RECTANGLE ? (command.nodeId ?? null) : null,
      text: command.type === CMD.TEXT ? (command.nodeId ?? null) : null,
    }
    const op = buildRenderOp(command, queues, queueState, textMetaMap, ownerIds)
    if (!op) continue
    if (op.kind === "effect") {
      const backdrop = createBackdropMetadata(op.effect, command, clipStack)
      ops.push({
        ...op,
        backdrop,
        transformStateId: backdrop?.transformStateId ?? getTransformStateId(op.effect),
        clipStateId: backdrop?.clipStateId ?? createClipStateId(clipStack),
        effectStateId: backdrop?.effectStateId ?? getEffectStateId(op.effect),
      })
      continue
    }
    ops.push(op)
  }
  return { ops }
}
