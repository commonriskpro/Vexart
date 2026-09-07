import { describe, expect, test } from "bun:test"
import { BACKDROP_FILTER_KIND, buildRenderGraphFrame, CMD, type CanvasPaintConfig, type EffectConfig, type ImagePaintConfig, type RenderCommand, type RenderGraphOp } from "./render-graph"
import { createNode } from "./node"

type CommandBacked = { command?: RenderCommand }
type RectFields = {
  x?: number
  y?: number
  width?: number
  height?: number
  color?: number
  cornerRadius?: number
  radius?: number
  image?: ImagePaintConfig | null
  canvas?: CanvasPaintConfig | null
  effect?: EffectConfig | null
  borderWidth?: number
  text?: string
  fontId?: number
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  fontWeight?: number
  fontStyle?: string
}
type InputBacked = { inputs?: RectFields; rect?: RectFields & InputBacked & CommandBacked }
type Graph = RenderGraphOp & RectFields & InputBacked & CommandBacked

function cmd(overrides: Partial<RenderCommand> = {}): RenderCommand {
  return {
    type: CMD.RECTANGLE,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    color: 0xff0000ff,
    cornerRadius: 0,
    extra1: 0,
    extra2: 0,
    ...overrides,
  }
}

function field(op: Graph, key: keyof RectFields) {
  if (op.kind === "border" && key === "width" && op.borderWidth !== undefined) return op.borderWidth
  if (op[key] !== undefined) return op[key]
  if (op.inputs?.[key] !== undefined) return op.inputs[key]
  if (op.command?.[key as keyof RenderCommand] !== undefined) return op.command[key as keyof RenderCommand]
  return op.rect?.[key] ?? op.rect?.inputs?.[key] ?? op.rect?.command?.[key as keyof RenderCommand]
}

function graph(command: RenderCommand) {
  return buildRenderGraphFrame([command]).ops[0] as Graph
}

function effectOp(op: RenderGraphOp) {
  if (op.kind !== "effect") throw new Error(`Expected effect op, received ${op.kind}`)
  return op
}

describe("buildRenderGraphFrame", () => {
  test("empty commands produce empty ops", () => {
    expect(buildRenderGraphFrame([]).ops).toEqual([])
  })

  test("single rectangle command produces a rectangle op with rect inputs", () => {
    const op = graph(cmd({ x: 10, y: 20, width: 30, height: 40, color: 0x123456ff, cornerRadius: 7 }))

    expect(op.kind).toBe("rectangle")
    expect(field(op, "x")).toBe(10)
    expect(field(op, "y")).toBe(20)
    expect(field(op, "width")).toBe(30)
    expect(field(op, "height")).toBe(40)
    expect(field(op, "color")).toBe(0x123456ff)
    expect(field(op, "radius")).toBe(7)
  })

  test("single text command produces a text op with text inputs", () => {
    const op = graph(cmd({
      type: CMD.TEXT,
      text: "hello",
      width: 80,
      height: 24,
      color: 0xffffffff,
      extra1: 16,
      extra2: 3,
      lineHeight: 20,
      fontFamily: "JetBrains Mono",
      fontWeight: 700,
      fontStyle: "italic",
    }))

    expect(op.kind).toBe("text")
    expect(field(op, "text")).toBe("hello")
    expect(field(op, "fontSize")).toBe(16)
    expect(field(op, "fontId")).toBe(3)
    expect(field(op, "lineHeight")).toBe(20)
    expect(field(op, "fontFamily")).toBe("JetBrains Mono")
    expect(field(op, "fontWeight")).toBe(700)
    expect(field(op, "fontStyle")).toBe("italic")
  })

  test("single border command produces a border op with border inputs", () => {
    const op = graph(cmd({ type: CMD.BORDER, color: 0x00ff00ff, cornerRadius: 6, extra1: 2 }))

    expect(op.kind).toBe("border")
    expect(field(op, "color")).toBe(0x00ff00ff)
    expect(field(op, "radius")).toBe(6)
    expect(field(op, "width")).toBe(2)
  })

  test("rectangle with shadow effect produces an effect op without backdrop", () => {
    const effect: EffectConfig = { color: 0xff0000ff, shadow: { x: 1, y: 2, blur: 3, color: 0x00000080 } }
    const op = graph(cmd({ effect }))

    expect(op.kind).toBe("effect")
    expect(op.effect).toBe(effect)
    expect(effectOp(op).backdrop).toBeNull()
  })

  test("rectangle with backdrop blur produces an effect op with backdrop metadata", () => {
    const effect: EffectConfig = { color: 0xff0000ff, backdropBlur: 8 }
    const op = graph(cmd({ x: 4, y: 5, width: 20, height: 10, cornerRadius: 3, effect }))

    expect(op.kind).toBe("effect")
    const out = effectOp(op)
    expect(out.backdrop?.filterKind).toBe(BACKDROP_FILTER_KIND.BLUR)
    expect(out.backdrop?.filterParams.blur).toBe(8)
    expect(out.backdrop?.inputBounds).toEqual({ x: 4, y: 5, width: 20, height: 10 })
    expect(out.backdrop?.outputBounds).toEqual({ x: 4, y: 5, width: 20, height: 10 })
    expect(out.backdrop?.sampleBounds).toEqual({ x: -4, y: -3, width: 36, height: 26 })
  })

  test("rectangle with image produces an image op", () => {
    const image: ImagePaintConfig = {
      color: 0xffffffff,
      cornerRadius: 4,
      imageBuffer: { data: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1 },
      objectFit: "cover",
    }
    const op = graph(cmd({ image }))

    expect(op.kind).toBe("image")
    expect(op.image).toBe(image)
    expect(field(op, "image")).toBe(image)
  })

  test("rectangle with canvas produces a canvas op", () => {
    const canvas: CanvasPaintConfig = { color: 0xffffffff, onDraw: () => undefined }
    const op = graph(cmd({ canvas }))

    expect(op.kind).toBe("canvas")
    expect(op.canvas).toBe(canvas)
    expect(field(op, "canvas")).toBe(canvas)
  })

  test("scissor commands are skipped but clip enclosed backdrop effects", () => {
    const effect: EffectConfig = { color: 0xff0000ff, backdropBlur: 4 }
    const frame = buildRenderGraphFrame([
      cmd({ type: CMD.SCISSOR_START, x: 10, y: 10, width: 20, height: 20 }),
      cmd({ x: 0, y: 0, width: 50, height: 50, effect }),
      cmd({ type: CMD.SCISSOR_END }),
    ])
    const op = effectOp(frame.ops[0])

    expect(frame.ops).toHaveLength(1)
    expect(op.backdrop?.clipBounds).toEqual({ x: 10, y: 10, width: 20, height: 20 })
    expect(op.clipStateId).not.toBe(0)
  })

  test("scissor bounds attach to every enclosed paint op", () => {
    const frame = buildRenderGraphFrame([
      cmd({ type: CMD.SCISSOR_START, x: 10, y: 12, width: 20, height: 16 }),
      cmd({ x: 0, y: 0, width: 50, height: 50 }),
      cmd({ type: CMD.SCISSOR_END }),
    ])

    expect(frame.ops[0].clipBounds).toEqual({ x: 10, y: 12, width: 20, height: 16 })
  })

  test("multiple commands preserve render order", () => {
    const frame = buildRenderGraphFrame([
      cmd({ type: CMD.RECTANGLE }),
      cmd({ type: CMD.BORDER }),
      cmd({ type: CMD.TEXT, text: "ordered" }),
    ])

    expect(frame.ops.map((op) => op.kind)).toEqual(["rectangle", "border", "text"])
  })

  test("command nodeId sets renderObjectId", () => {
    const rect = graph(cmd({ nodeId: 42 }))
    const text = graph(cmd({ type: CMD.TEXT, text: "node", nodeId: 43 }))

    expect(rect.renderObjectId).toBe(42)
    expect(text.renderObjectId).toBe(43)
  })

  test("effect with transform computes a transform state id", () => {
    const transform = new Float64Array([1, 0, 12, 0, 1, 24, 0, 0, 1])
    const op = graph(cmd({ effect: { color: 0xff0000ff, shadow: { x: 0, y: 1, blur: 2, color: 0x00000080 }, transform } }))

    expect(op.kind).toBe("effect")
    expect(effectOp(op).transformStateId).not.toBe(0)
  })

  test("effect state identity includes self-filter channels", () => {
    const brightness = graph(cmd({ effect: { color: 0xff0000ff, filter: { brightness: 150 } } }))
    const grayscale = graph(cmd({ effect: { color: 0xff0000ff, filter: { grayscale: 100 } } }))

    expect(effectOp(brightness).effectStateId).not.toBe(effectOp(grayscale).effectStateId)
  })

  test("hydrates a laid-out node transform into the effect op", () => {
    const node = createNode("box")
    const transform = new Float64Array([1, 0, 12, 0, 1, 24, 0, 0, 1])
    node._transform = transform
    node._transformInverse = transform
    const effect: EffectConfig = { color: 0xff0000ff, transform: new Float64Array(9), _node: node }
    const op = effectOp(graph(cmd({ effect })))

    expect(op.effect.transform).toBe(transform)
    expect(op.effect.transformInverse).toBe(transform)
  })

  test("removes the pre-layout placeholder when the laid-out transform is identity", () => {
    const node = createNode("box")
    const effect: EffectConfig = { color: 0xff0000ff, transform: new Float64Array(9), _node: node }
    const op = effectOp(graph(cmd({ effect })))

    expect(op.effect.transform).toBeUndefined()
    expect(op.effect.transformInverse).toBeUndefined()
  })

  test("nested scissor clips affect clip stack depth and intersection", () => {
    const frame = buildRenderGraphFrame([
      cmd({ type: CMD.SCISSOR_START, x: 0, y: 0, width: 100, height: 100 }),
      cmd({ x: 10, y: 10, width: 20, height: 20, effect: { color: 0xff0000ff, backdropBlur: 2 } }),
      cmd({ type: CMD.SCISSOR_START, x: 15, y: 15, width: 10, height: 10 }),
      cmd({ x: 10, y: 10, width: 20, height: 20, effect: { color: 0x00ff00ff, backdropBlur: 2 } }),
      cmd({ type: CMD.SCISSOR_END }),
      cmd({ type: CMD.SCISSOR_END }),
    ])
    const outer = effectOp(frame.ops[0])
    const inner = effectOp(frame.ops[1])

    expect(frame.ops).toHaveLength(2)
    expect(outer.backdrop?.clipBounds).toEqual({ x: 10, y: 10, width: 20, height: 20 })
    expect(inner.backdrop?.clipBounds).toEqual({ x: 15, y: 15, width: 10, height: 10 })
    expect(inner.clipStateId).not.toBe(outer.clipStateId)
  })
})
