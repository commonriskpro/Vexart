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

export type ImagePaintConfig = {
  color: number
  cornerRadius: number
  imageBuffer: { data: Uint8Array; width: number; height: number }
  objectFit: "contain" | "cover" | "fill" | "none"
}

export type CanvasPaintConfig = {
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
  command: RenderCommand
  inputs: RectangleRenderInputs
}

export type ImageRenderOp = {
  kind: "image"
  command: RenderCommand
  rect: RectangleRenderOp
  image: ImagePaintConfig
}

export type CanvasRenderOp = {
  kind: "canvas"
  command: RenderCommand
  rect: RectangleRenderOp
  canvas: CanvasPaintConfig
}

export type EffectRenderOp = {
  kind: "effect"
  command: RenderCommand
  rect: RectangleRenderOp
  effect: EffectConfig
}

export type BorderRenderOp = {
  kind: "border"
  command: RenderCommand
  inputs: BorderRenderInputs
}

export type TextRenderOp = {
  kind: "text"
  command: RenderCommand
  inputs: TextRenderInputs
}

export type RawCommandRenderOp = {
  kind: "raw-command"
  command: RenderCommand
}

export type RenderGraphOp = RectangleRenderOp | ImageRenderOp | CanvasRenderOp | EffectRenderOp | BorderRenderOp | TextRenderOp | RawCommandRenderOp

export type RenderGraphFrame = {
  ops: RenderGraphOp[]
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

export function getRectangleRenderInputs(cmd: RenderCommand, queues: RenderGraphQueues): RectangleRenderInputs {
  const radius = Math.round(cmd.cornerRadius)
  const color = packColor(cmd.color[0], cmd.color[1], cmd.color[2], cmd.color[3])

  const imageIdx = queues.images.findIndex((entry) => entry.color === color && entry.cornerRadius === radius)
  const image = imageIdx >= 0 ? queues.images.splice(imageIdx, 1)[0] : null

  const canvasIdx = queues.canvases.findIndex((entry) => entry.color === color)
  const canvas = canvasIdx >= 0 ? queues.canvases.splice(canvasIdx, 1)[0] : null

  const effectIdx = queues.effects.findIndex((entry) => entry.color === color && entry.cornerRadius === radius)
  const effect = effectIdx >= 0 ? queues.effects.splice(effectIdx, 1)[0] : null

  return { color, radius, image, canvas, effect }
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

export function buildRenderOp(cmd: RenderCommand, queues: RenderGraphQueues, textMetaMap: Map<string, TextMeta>): RenderGraphOp | null {
  if (cmd.type === CMD.RECTANGLE) {
    const rect = {
      kind: "rectangle",
      command: cmd,
      inputs: getRectangleRenderInputs(cmd, queues),
    }
    if (rect.inputs.image) {
      return {
        kind: "image",
        command: cmd,
        rect,
        image: rect.inputs.image,
      }
    }
    if (rect.inputs.canvas) {
      return {
        kind: "canvas",
        command: cmd,
        rect,
        canvas: rect.inputs.canvas,
      }
    }
    if (rect.inputs.effect) {
      return {
        kind: "effect",
        command: cmd,
        rect,
        effect: rect.inputs.effect,
      }
    }
    return rect
  }
  if (cmd.type === CMD.BORDER) {
    return {
      kind: "border",
      command: cmd,
      inputs: getBorderRenderInputs(cmd, queues),
    }
  }
  if (cmd.type === CMD.TEXT) {
    const inputs = getTextRenderInputs(cmd, textMetaMap)
    if (!inputs) return null
    return {
      kind: "text",
      command: cmd,
      inputs,
    }
  }
  return {
    kind: "raw-command",
    command: cmd,
  }
}

export function buildRenderGraphFrame(commands: RenderCommand[], queues: RenderGraphQueues, textMetaMap: Map<string, TextMeta>): RenderGraphFrame {
  const ops: RenderGraphOp[] = []
  for (const cmd of commands) {
    const op = buildRenderOp(cmd, queues, textMetaMap)
    if (op) ops.push(op)
  }
  return { ops }
}
