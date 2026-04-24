import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode } from "./node"
import { createElement, insertNode, setProp, solidCreateTextNode } from "../reconciler/reconciler"
import { destroyNativeScene, nativeSceneCreateNode, nativeSceneSetLayout } from "./native-scene"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "./native-scene-graph-flags"
import { nativeRenderGraphSnapshot, translateNativeRenderGraphSnapshot, type NativeRenderGraphSnapshot, type NativeRenderOpSnapshot } from "./native-render-graph"
import { CMD, type RenderGraphQueues } from "./render-graph"
import { resetFocus } from "../reconciler/focus"

beforeEach(() => {
  enableNativeSceneGraph()
})

afterEach(() => {
  destroyNativeScene()
  resetFocus()
  disableNativeSceneGraph()
})

function nativeOp(overrides: Partial<NativeRenderOpSnapshot>): NativeRenderOpSnapshot {
  return {
    kind: "rect",
    nodeId: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: 0x000000ff,
    cornerRadius: 0,
    borderWidth: 0,
    opacity: 1,
    text: "",
    fontSize: 0,
    fontId: 0,
    objectFit: "contain",
    canvasViewportJson: "",
    materialKey: "pipeline:rect:1",
    effectKey: "",
    imageSource: "",
    hasGradient: false,
    hasShadow: false,
    hasGlow: false,
    hasFilter: false,
    hasBackdrop: false,
    hasTransform: false,
    hasOpacity: false,
    hasCornerRadii: false,
    gradientJson: "",
    shadowJson: "",
    glowJson: "",
    filterJson: "",
    transformJson: "",
    cornerRadiiJson: "",
    backdropBlur: null,
    backdropBrightness: null,
    backdropContrast: null,
    backdropSaturate: null,
    backdropGrayscale: null,
    backdropInvert: null,
    backdropSepia: null,
    backdropHueRotate: null,
    ...overrides,
  }
}

describe("native render graph snapshot", () => {
  test("emits rect border and text ops from scene and layout", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const box = createElement("box")
    setProp(box, "backgroundColor", 0xff00ffff)
    setProp(box, "borderColor", 0x00ff00ff)
    setProp(box, "borderWidth", 2)
    setProp(box, "cornerRadius", 6)

    const text = solidCreateTextNode("hello")
    setProp(text, "color", 0xffffffff)
    setProp(text, "fontSize", 16)

    insertNode(root, box)
    insertNode(box, text)

    nativeSceneSetLayout(box._nativeId, 10, 20, 50, 30)
    nativeSceneSetLayout(text._nativeId, 12, 24, 40, 12)

    const snapshot = nativeRenderGraphSnapshot()
    expect(snapshot).not.toBeNull()
    expect(snapshot?.ops).toHaveLength(3)
    expect(snapshot?.batches.length).toBeGreaterThan(0)
    expect(snapshot?.ops[0]).toMatchObject({ kind: "rect", nodeId: Number(box._nativeId), x: 10, y: 20, width: 50, height: 30, color: 0xff00ffff, cornerRadius: 6 })
    expect(snapshot?.ops[1]).toMatchObject({ kind: "border", nodeId: Number(box._nativeId), borderWidth: 2, color: 0x00ff00ff })
    expect(snapshot?.ops[2]).toMatchObject({ kind: "text", nodeId: Number(text._nativeId), text: "hello", fontSize: 16, color: 0xffffffff })
    expect(snapshot?.ops[2]?.materialKey).toContain("pipeline:text")
  })

  test("emits text op for JSX-style text container with child text node", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const text = createElement("text")
    setProp(text, "color", 0xffffffff)
    setProp(text, "fontSize", 16)
    const leaf = solidCreateTextNode("Hello from TGE")

    insertNode(root, text)
    insertNode(text, leaf)
    nativeSceneSetLayout(text._nativeId, 8, 9, 100, 17)

    const snapshot = nativeRenderGraphSnapshot()
    expect(snapshot).not.toBeNull()
    expect(snapshot?.ops).toHaveLength(1)
    expect(snapshot?.ops[0]).toMatchObject({
      kind: "text",
      nodeId: Number(text._nativeId),
      text: "Hello from TGE",
      fontSize: 16,
      color: 0xffffffff,
    })
  })

  test("emits effect image and canvas ops with batches", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const effectBox = createElement("box")
    setProp(effectBox, "backgroundColor", 0x11223344)
    setProp(effectBox, "gradient", { type: "linear", from: 0x000000ff, to: 0xffffffff, angle: 90 })
    setProp(effectBox, "shadow", { x: 0, y: 4, blur: 12, color: 0x00000088 })
    setProp(effectBox, "glow", { radius: 10, color: 0x56d4c8ff, intensity: 50 })
    setProp(effectBox, "filter", { blur: 3 })
    setProp(effectBox, "backdropBlur", 12)
    setProp(effectBox, "opacity", 0.5)
    setProp(effectBox, "transform", { rotate: 12 })

    const image = createElement("img")
    setProp(image, "src", "demo.png")
    setProp(image, "opacity", 0.7)
    setProp(image, "transform", { scale: 1.1 })
    const canvas = createElement("canvas")
    setProp(canvas, "opacity", 0.6)

    insertNode(root, effectBox)
    insertNode(root, image)
    insertNode(root, canvas)

    nativeSceneSetLayout(effectBox._nativeId, 0, 0, 20, 20)
    nativeSceneSetLayout(image._nativeId, 30, 0, 20, 20)
    nativeSceneSetLayout(canvas._nativeId, 60, 0, 20, 20)

    const snapshot = nativeRenderGraphSnapshot()
    expect(snapshot).not.toBeNull()
    expect(snapshot?.ops.map((op) => op.kind)).toEqual(["effect", "image", "canvas"])
    expect(snapshot?.ops[0]?.effectKey).toContain("gradient")
    expect(snapshot?.ops[0]).toMatchObject({ hasGradient: true, hasShadow: true, hasGlow: true, hasFilter: true, hasBackdrop: true, hasTransform: true, hasOpacity: true })
    expect(snapshot?.ops[1]).toMatchObject({ imageSource: "demo.png", hasTransform: true, hasOpacity: true })
    expect(snapshot?.ops[2]).toMatchObject({ hasOpacity: true })
    expect(snapshot?.batches).toHaveLength(3)
  })

  test("translates native snapshot into backend render graph ops", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        { kind: "rect", nodeId: 1, x: 0, y: 0, width: 10, height: 10, color: 1, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, materialKey: "pipeline:rect:1", effectKey: "", imageSource: "", hasGradient: false, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: false, hasOpacity: false, gradientJson: "", shadowJson: "", glowJson: "", filterJson: "", transformJson: "", backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
        { kind: "text", nodeId: 2, x: 0, y: 0, width: 20, height: 10, color: 2, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "hello", fontSize: 12, fontId: 0, materialKey: "pipeline:text:2", effectKey: "", imageSource: "", hasGradient: false, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: false, hasOpacity: false, gradientJson: "", shadowJson: "", glowJson: "", filterJson: "", transformJson: "", backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
      ],
      batches: [],
    }

    const commands = [
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 10, height: 10, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
      { type: CMD.TEXT, x: 0, y: 0, width: 20, height: 10, color: [255, 255, 255, 255] as [number, number, number, number], cornerRadius: 0, extra1: 12, extra2: 0, text: "hello", nodeId: 2 },
    ]
    const queues: RenderGraphQueues = { effects: [], images: [], canvases: [] }
    const textMetaMap = new Map([["hello", { content: "hello", fontId: 0, fontSize: 12, lineHeight: 14 }]])

    const graph = translateNativeRenderGraphSnapshot(snapshot, commands, queues, textMetaMap)
    expect(graph.ops.map((op) => op.kind)).toEqual(["rectangle", "text"])
  })

  test("translates rect border and text directly from native snapshot values", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        nativeOp({ kind: "rect", nodeId: 1, color: 0x11223344, cornerRadius: 7 }),
        nativeOp({ kind: "border", nodeId: 1, color: 0xaabbccdd, cornerRadius: 7, borderWidth: 3 }),
        nativeOp({ kind: "text", nodeId: 2, color: 0x55667788, text: "native text", fontSize: 15, fontId: 4 }),
      ],
      batches: [],
    }

    const commands = [
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 10, height: 10, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
      { type: CMD.BORDER, x: 0, y: 0, width: 10, height: 10, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
      { type: CMD.TEXT, x: 0, y: 12, width: 80, height: 18, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, text: "fallback text", nodeId: 2 },
    ]

    const graph = translateNativeRenderGraphSnapshot(snapshot, commands, { effects: [], images: [], canvases: [] }, new Map())

    expect(graph.ops.map((op) => op.kind)).toEqual(["rectangle", "border", "text"])
    expect(graph.ops[0]?.kind).toBe("rectangle")
    if (graph.ops[0]?.kind === "rectangle") {
      expect(graph.ops[0].inputs.color).toBe(0x11223344)
      expect(graph.ops[0].inputs.radius).toBe(7)
      expect(graph.ops[0].command.color).toEqual([0x11, 0x22, 0x33, 0x44])
    }
    expect(graph.ops[1]?.kind).toBe("border")
    if (graph.ops[1]?.kind === "border") {
      expect(graph.ops[1].inputs.width).toBe(3)
      expect(graph.ops[1].inputs.radius).toBe(7)
      expect(graph.ops[1].command.color).toEqual([0xaa, 0xbb, 0xcc, 0xdd])
    }
    expect(graph.ops[2]?.kind).toBe("text")
    if (graph.ops[2]?.kind === "text") {
      expect(graph.ops[2].inputs.text).toBe("native text")
      expect(graph.ops[2].inputs.fontId).toBe(4)
      expect(graph.ops[2].command.color).toEqual([0x55, 0x66, 0x77, 0x88])
      expect(graph.ops[2].command.text).toBe("native text")
    }
  })

  test("translates effect image and canvas snapshot ops into backend graph ops", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        { kind: "effect", nodeId: 1, x: 0, y: 0, width: 10, height: 10, color: 1, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, materialKey: "pipeline:effect:1", effectKey: "gradient+shadow", imageSource: "", hasGradient: true, hasShadow: true, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: false, hasOpacity: false, gradientJson: '{"type":"linear","from":1,"to":2,"angle":90}', shadowJson: '{"x":0,"y":2,"blur":4,"color":3}', glowJson: "", filterJson: "", transformJson: "", backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
        { kind: "image", nodeId: 2, x: 0, y: 0, width: 20, height: 10, color: 0, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, objectFit: "cover", canvasViewportJson: "", materialKey: "pipeline:image:0", effectKey: "", imageSource: "demo.png", imageHandle: 7, hasGradient: false, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: false, hasOpacity: false, gradientJson: "", shadowJson: "", glowJson: "", filterJson: "", transformJson: "", backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
        { kind: "canvas", nodeId: 3, x: 0, y: 0, width: 20, height: 10, color: 0, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, objectFit: "contain", canvasViewportJson: '{"x":3,"y":4,"zoom":2}', materialKey: "pipeline:canvas:0", effectKey: "", imageSource: "", hasGradient: false, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: false, hasOpacity: false, gradientJson: "", shadowJson: "", glowJson: "", filterJson: "", transformJson: "", backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
      ],
      batches: [],
    }

    const commands = [
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 10, height: 10, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 20, height: 10, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 2 },
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 20, height: 10, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 3 },
    ]
    const queues: RenderGraphQueues = {
      effects: [{ renderObjectId: 1, color: 1, cornerRadius: 0, gradient: { type: "linear", from: 1, to: 2, angle: 90 }, shadow: { x: 0, y: 2, blur: 4, color: 3 } }],
      images: [{ renderObjectId: 2, color: 0, cornerRadius: 0, imageBuffer: { data: new Uint8Array(4), width: 1, height: 1 }, objectFit: "contain" }],
      canvases: [{ renderObjectId: 3, color: 0, onDraw: () => {} }],
    }
    const textMetaMap = new Map()

    const graph = translateNativeRenderGraphSnapshot(snapshot, commands, queues, textMetaMap)
    expect(graph.ops.map((op) => op.kind)).toEqual(["effect", "image", "canvas"])
    expect(graph.ops[0]?.kind).toBe("effect")
    if (graph.ops[0]?.kind === "effect") expect(graph.ops[0].rect.inputs.color).toBe(1)
    expect(graph.ops[1]?.kind).toBe("image")
    if (graph.ops[1]?.kind === "image") {
      expect(graph.ops[1].image.imageBuffer).toBe(queues.images[0]?.imageBuffer)
      expect(graph.ops[1].image.objectFit).toBe("cover")
      expect(graph.ops[1].image.nativeImageHandle).toBe(7n)
      expect(graph.ops[1].rect.inputs.color).toBe(0)
    }
    expect(graph.ops[2]?.kind).toBe("canvas")
    if (graph.ops[2]?.kind === "canvas") {
      expect(graph.ops[2].canvas.onDraw).toBe(queues.canvases[0]?.onDraw)
      expect(graph.ops[2].canvas.viewport).toEqual({ x: 3, y: 4, zoom: 2 })
      expect(graph.ops[2].rect.inputs.color).toBe(0)
    }
  })

  test("translates effect snapshot with transform json into backend effect op", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        { kind: "effect", nodeId: 1, x: 0, y: 0, width: 20, height: 10, color: 1, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, materialKey: "pipeline:effect:1", effectKey: "transform+gradient", imageSource: "", hasGradient: true, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: true, hasOpacity: false, gradientJson: '{"type":"linear","from":1,"to":2,"angle":90}', shadowJson: "", glowJson: "", filterJson: "", transformJson: '{"rotate":12}', backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
      ],
      batches: [],
    }
    const commands = [
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 20, height: 10, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
    ]
    const queues: RenderGraphQueues = { effects: [], images: [], canvases: [] }
    const graph = translateNativeRenderGraphSnapshot(snapshot, commands, queues, new Map())
    expect(graph.ops).toHaveLength(1)
    expect(graph.ops[0]?.kind).toBe("effect")
    if (graph.ops[0]?.kind === "effect") {
      expect(graph.ops[0].effect.transform).toBeDefined()
      expect(graph.ops[0].effect.gradient).toBeDefined()
    }
  })

  test("translates native corner radii effect metadata without JS effect queue", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        nativeOp({
          kind: "effect",
          nodeId: 1,
          color: 0x123456ff,
          cornerRadius: 0,
          effectKey: "cornerRadii",
          materialKey: "pipeline:effect:305419903:cornerRadii",
          hasCornerRadii: true,
          cornerRadiiJson: '{"tl":24,"tr":8,"br":24,"bl":8}',
        }),
      ],
      batches: [],
    }
    const commands = [
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 20, height: 10, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
    ]

    const graph = translateNativeRenderGraphSnapshot(snapshot, commands, { effects: [], images: [], canvases: [] }, new Map())

    expect(graph.ops).toHaveLength(1)
    expect(graph.ops[0]?.kind).toBe("effect")
    if (graph.ops[0]?.kind === "effect") {
      expect(graph.ops[0].effect.cornerRadii).toEqual({ tl: 24, tr: 8, br: 24, bl: 8 })
      expect(graph.ops[0].rect.inputs.effect?.cornerRadii).toEqual({ tl: 24, tr: 8, br: 24, bl: 8 })
      expect(graph.ops[0].effectStateId).toContain("cornerRadii:24:8:24:8")
    }
  })

  test("preserves fallback ops for uncovered commands in mixed native layers", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        { kind: "effect", nodeId: 1, x: 0, y: 0, width: 20, height: 10, color: 1, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, materialKey: "pipeline:effect:1", effectKey: "gradient", imageSource: "", hasGradient: true, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: false, hasTransform: false, hasOpacity: false, gradientJson: '{"type":"linear","from":1,"to":2,"angle":90}', shadowJson: "", glowJson: "", filterJson: "", transformJson: "", backdropBlur: null, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
      ],
      batches: [],
    }
    const commands = [
      { type: CMD.RECTANGLE, x: 0, y: 0, width: 20, height: 10, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
      { type: CMD.TEXT, x: 0, y: 12, width: 20, height: 10, color: [255, 255, 255, 255] as [number, number, number, number], cornerRadius: 0, extra1: 12, extra2: 0, text: "hello", nodeId: 2 },
    ]
    const graph = translateNativeRenderGraphSnapshot(
      snapshot,
      commands,
      { effects: [], images: [], canvases: [] },
      new Map([["hello", { content: "hello", fontId: 0, fontSize: 12, lineHeight: 14 }]]),
    )

    expect(graph.ops.map((op) => op.kind)).toEqual(["effect", "text"])
  })

  test("translates native backdrop effects with clip-aware metadata", () => {
    const snapshot: NativeRenderGraphSnapshot = {
      ops: [
        { kind: "effect", nodeId: 1, x: 10, y: 10, width: 20, height: 20, color: 1, cornerRadius: 0, borderWidth: 0, opacity: 1, text: "", fontSize: 0, fontId: 0, materialKey: "pipeline:effect:1", effectKey: "backdrop", imageSource: "", hasGradient: false, hasShadow: false, hasGlow: false, hasFilter: false, hasBackdrop: true, hasTransform: false, hasOpacity: false, gradientJson: "", shadowJson: "", glowJson: "", filterJson: "", transformJson: "", backdropBlur: 8, backdropBrightness: null, backdropContrast: null, backdropSaturate: null, backdropGrayscale: null, backdropInvert: null, backdropSepia: null, backdropHueRotate: null },
      ],
      batches: [],
    }
    const commands = [
      { type: CMD.SCISSOR_START, x: 0, y: 0, width: 24, height: 24, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 99 },
      { type: CMD.RECTANGLE, x: 10, y: 10, width: 20, height: 20, color: [0, 0, 0, 255] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 1 },
      { type: CMD.SCISSOR_END, x: 0, y: 0, width: 24, height: 24, color: [0, 0, 0, 0] as [number, number, number, number], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 99 },
    ]
    const graph = translateNativeRenderGraphSnapshot(snapshot, commands, { effects: [], images: [], canvases: [] }, new Map())

    expect(graph.ops).toHaveLength(1)
    expect(graph.ops[0]?.kind).toBe("effect")
    if (graph.ops[0]?.kind === "effect") {
      expect(graph.ops[0].backdrop).not.toBeNull()
      expect(graph.ops[0].clipStateId).not.toBe("clip:none")
      expect(graph.ops[0].backdrop?.clipBounds).toEqual({ x: 10, y: 10, width: 14, height: 14 })
    }
  })
})
