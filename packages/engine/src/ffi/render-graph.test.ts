import { describe, expect, test } from "bun:test"
import {
  BACKDROP_FILTER_KIND,
  type RenderGraphOp,
  type RectangleRenderOp,
  type TextRenderOp,
  type BorderRenderOp,
  type ImageRenderOp,
  type CanvasRenderOp,
  type EffectRenderOp,
} from "./render-graph"
import { createNode, createTextNode, insertChild, ensureImageExtra, type TGENode } from "./node"
import { traverseFrame } from "../loop/pipeline-traverse"
import type { WalkTreeState } from "../loop/walk-tree"

function mockFlex(node: TGENode, left = 0, top = 0, width = 100, height = 50) {
  node._flexNode = {
    getComputedLeft: () => left,
    getComputedTop: () => top,
    getComputedWidth: () => width,
    getComputedHeight: () => height,
    setWidth: () => {},
    setHeight: () => {},
    isGridMode: () => false,
  } as any
  return node
}

function renderTree(root: TGENode, viewportW = 300, viewportH = 200): RenderGraphOp[] {
  const state: WalkTreeState = {
    scrollSpeedCap: { value: 0 },
    nodeCount: { value: 0 },
    rectNodes: [],
    textNodes: [],
    boxNodes: [],
    layerBoundaries: [],
    scrollContainers: [],
    nodeRefById: new Map(),
    rectNodeById: new Map(),
    layout: null as any,
  }
  const result = traverseFrame(root, state, viewportW, viewportH)
  return result.layerBuckets.flatMap((b) => b.ops)
}

describe("Render graph op emission through traverseFrame", () => {
  test("empty root without background produces empty ops", () => {
    const root = createNode("box")
    expect(renderTree(root)).toEqual([])
  })

  test("single rectangle node produces a rectangle op with rect inputs", () => {
    const root = createNode("box")
    const child = createNode("box")
    child.props = { backgroundColor: 0x123456ff, cornerRadius: 7 }
    insertChild(root, child)
    mockFlex(child, 10, 20, 30, 40)

    const ops = renderTree(root)
    expect(ops).toHaveLength(1)
    const op = ops[0] as RectangleRenderOp
    expect(op.kind).toBe("rectangle")
    expect(op.x).toBe(10)
    expect(op.y).toBe(20)
    expect(op.width).toBe(30)
    expect(op.height).toBe(40)
    expect(op.color).toBe(0x123456ff)
    expect(op.radius).toBe(7)
  })

  test("single text node produces a text op with text inputs", () => {
    const root = createNode("box")
    const textNode = createNode("text")
    textNode.props = {
      color: 0xffffffff,
      fontSize: 16,
      fontId: 3,
      lineHeight: 20,
      fontFamily: "JetBrains Mono",
      fontWeight: 700,
      fontStyle: "italic",
    }
    insertChild(textNode, createTextNode("hello"))
    insertChild(root, textNode)
    mockFlex(textNode, 0, 0, 80, 24)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "text") as TextRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("text")
    expect(op.text).toBe("hello")
    expect(op.fontSize).toBe(16)
    expect(op.fontId).toBe(3)
    expect(op.lineHeight).toBe(20)
    expect(op.fontFamily).toBe("JetBrains Mono")
    expect(op.fontWeight).toBe(700)
    expect(op.fontStyle).toBe("italic")
  })

  test("single border node produces a border op with border inputs", () => {
    const root = createNode("box")
    const child = createNode("box")
    child.props = { borderColor: 0x00ff00ff, cornerRadius: 6, borderWidth: 2 }
    insertChild(root, child)
    mockFlex(child, 0, 0, 100, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "border") as BorderRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("border")
    expect(op.color).toBe(0x00ff00ff)
    expect(op.radius).toBe(6)
    expect(op.borderWidth).toBe(2)
    expect(op.borderWidths).toBeNull()
  })

  test("preserves non-uniform border widths in the border op", () => {
    const widths = { left: 1, right: 3, top: 2, bottom: 4 }
    const root = createNode("box")
    const child = createNode("box")
    child.props = { borderColor: 0x00ff00ff, borderLeft: 1, borderRight: 3, borderTop: 2, borderBottom: 4 }
    insertChild(root, child)
    mockFlex(child, 0, 0, 100, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "border") as BorderRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("border")
    expect(op.borderWidths).toEqual(widths)
  })

  test("rectangle with shadow effect produces an effect op without backdrop", () => {
    const root = createNode("box")
    const child = createNode("box")
    child.props = {
      backgroundColor: 0xff0000ff,
      shadow: { x: 1, y: 2, blur: 3, color: 0x00000080 },
    }
    insertChild(root, child)
    mockFlex(child, 0, 0, 100, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "effect") as EffectRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("effect")
    expect(op.effect.shadow).toMatchObject({ x: 1, y: 2, blur: 3, color: 0x00000080 })
    expect(op.backdrop).toBeNull()
  })

  test("rectangle with backdrop blur produces an effect op with backdrop metadata", () => {
    const root = createNode("box")
    const child = createNode("box")
    child.props = {
      backgroundColor: 0xff0000ff,
      backdropBlur: 8,
      cornerRadius: 3,
    }
    insertChild(root, child)
    mockFlex(child, 4, 5, 20, 10)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "effect") as EffectRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("effect")
    expect(op.backdrop?.filterKind).toBe(BACKDROP_FILTER_KIND.BLUR)
    expect(op.backdrop?.filterParams.blur).toBe(8)
    expect(op.backdrop?.inputBounds).toEqual({ x: 4, y: 5, width: 20, height: 10 })
    expect(op.backdrop?.outputBounds).toEqual({ x: 4, y: 5, width: 20, height: 10 })
    expect(op.backdrop?.sampleBounds).toEqual({ x: -4, y: -3, width: 36, height: 26 })
  })

  test("rectangle with image produces an image op", () => {
    const root = createNode("box")
    const child = createNode("img")
    const extra = ensureImageExtra(child)
    extra.buffer = {
      data: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
    }
    child.props = {
      cornerRadius: 4,
    }
    insertChild(root, child)
    mockFlex(child, 0, 0, 100, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "image") as ImageRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("image")
    expect(op.image).toBeDefined()
  })

  test("rectangle with canvas produces a canvas op", () => {
    const root = createNode("box")
    const child = createNode("canvas")
    child.props = {
      onDraw: () => undefined,
    }
    insertChild(root, child)
    mockFlex(child, 0, 0, 100, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "canvas") as CanvasRenderOp
    expect(op).toBeDefined()
    expect(op.kind).toBe("canvas")
    expect(op.canvas).toBeDefined()
  })

  test("scroll container clips enclosed backdrop effects", () => {
    const root = createNode("box")
    const scroller = createNode("box")
    scroller.props = { scrollY: true }
    const child = createNode("box")
    child.props = { backgroundColor: 0xff0000ff, backdropBlur: 4 }
    insertChild(scroller, child)
    insertChild(root, scroller)
    mockFlex(scroller, 10, 10, 20, 20)
    mockFlex(child, 0, 0, 50, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "effect" && o.nodeId === child.id) as EffectRenderOp
    expect(op).toBeDefined()
    expect(op.backdrop?.clipBounds).toEqual({ x: 10, y: 10, width: 20, height: 20 })
    expect(op.clipStateId).not.toBe(0)
  })

  test("scroll container bounds attach to every enclosed paint op", () => {
    const root = createNode("box")
    const scroller = createNode("box")
    scroller.props = { scrollY: true }
    const child = createNode("box")
    child.props = { backgroundColor: 0x112233ff }
    insertChild(scroller, child)
    insertChild(root, scroller)
    mockFlex(scroller, 10, 12, 20, 16)
    mockFlex(child, 0, 0, 50, 50)

    const ops = renderTree(root)
    const op = ops.find((o) => o.nodeId === child.id)
    expect(op?.clipBounds).toEqual({ x: 10, y: 12, width: 20, height: 16 })
  })

  test("multiple nodes preserve render order", () => {
    const root = createNode("box")
    const r = createNode("box")
    r.props = { backgroundColor: 0xff0000ff }
    const b = createNode("box")
    b.props = { borderColor: 0x00ff00ff, borderWidth: 2 }
    const t = createNode("text")
    insertChild(t, createTextNode("ordered"))
    insertChild(root, r)
    insertChild(root, b)
    insertChild(root, t)
    mockFlex(r, 0, 0, 10, 10)
    mockFlex(b, 0, 0, 10, 10)
    mockFlex(t, 0, 0, 10, 10)

    const ops = renderTree(root)
    expect(ops.map((o) => o.kind)).toEqual(["rectangle", "border", "text"])
  })

  test("nodeId sets renderObjectId", () => {
    const root = createNode("box")
    const r = createNode("box")
    r.id = 42
    r.props = { backgroundColor: 0xff0000ff }
    insertChild(root, r)
    mockFlex(r, 0, 0, 10, 10)

    const ops = renderTree(root)
    expect(ops[0].renderObjectId).toBe(42)
  })

  test("effect with transform computes a transform state id", () => {
    const root = createNode("box")
    const child = createNode("box")
    child.props = {
      backgroundColor: 0xff0000ff,
      shadow: { x: 0, y: 1, blur: 2, color: 0x00000080 },
      transform: { translateX: 12, translateY: 24 },
    }
    insertChild(root, child)
    mockFlex(child, 0, 0, 10, 10)

    const ops = renderTree(root)
    const op = ops.find((o) => o.kind === "effect") as EffectRenderOp
    expect(op.kind).toBe("effect")
    expect(op.transformStateId).not.toBe(0)
  })

  test("effect state identity includes self-filter channels", () => {
    const root = createNode("box")
    const child1 = createNode("box")
    child1.props = { backgroundColor: 0xff0000ff, filter: { brightness: 150 } }
    const child2 = createNode("box")
    child2.props = { backgroundColor: 0xff0000ff, filter: { grayscale: 100 } }
    insertChild(root, child1)
    insertChild(root, child2)
    mockFlex(child1, 0, 0, 10, 10)
    mockFlex(child2, 0, 0, 10, 10)

    const ops = renderTree(root)
    const op1 = ops.find((o) => o.nodeId === child1.id) as EffectRenderOp
    const op2 = ops.find((o) => o.nodeId === child2.id) as EffectRenderOp
    expect(op1.effectStateId).not.toBe(op2.effectStateId)
  })

  test("hydrates a laid-out node transform into the effect op", () => {
    const root = createNode("box")
    const child = createNode("box")
    child.props = {
      backgroundColor: 0xff0000ff,
      transform: { translateX: 12, translateY: 24 },
    }
    insertChild(root, child)
    mockFlex(child, 0, 0, 10, 10)

    const ops = renderTree(root)
    const op = ops.find((o) => o.nodeId === child.id) as EffectRenderOp
    expect(op.effect.transform).toBeDefined()
    expect(op.effect.transformInverse).toBeDefined()
  })

  test("nested scissor clips affect clip stack depth and intersection", () => {
    const root = createNode("box")
    const outer = createNode("box")
    outer.props = { scrollY: true }
    const child1 = createNode("box")
    child1.props = { backgroundColor: 0xff0000ff, backdropBlur: 2 }
    const inner = createNode("box")
    inner.props = { scrollY: true }
    const child2 = createNode("box")
    child2.props = { backgroundColor: 0x00ff00ff, backdropBlur: 2 }

    insertChild(inner, child2)
    insertChild(outer, child1)
    insertChild(outer, inner)
    insertChild(root, outer)

    mockFlex(outer, 0, 0, 100, 100)
    mockFlex(child1, 10, 10, 20, 20)
    mockFlex(inner, 15, 15, 10, 10)
    mockFlex(child2, 0, 0, 20, 20)

    const ops = renderTree(root)
    const op1 = ops.find((o) => o.nodeId === child1.id) as EffectRenderOp
    const op2 = ops.find((o) => o.nodeId === child2.id) as EffectRenderOp

    expect(op1.backdrop?.clipBounds).toEqual({ x: 10, y: 10, width: 20, height: 20 })
    expect(op2.backdrop?.clipBounds).toEqual({ x: 15, y: 15, width: 10, height: 10 })
    expect(op2.clipStateId).not.toBe(op1.clipStateId)
  })

  test("keeps disjoint nested scissors as an empty clip, not no clip", () => {
    const root = createNode("box")
    const scroller1 = createNode("box")
    scroller1.props = { scrollY: true }
    const scroller2 = createNode("box")
    scroller2.props = { scrollY: true }
    const child = createNode("box")
    child.props = { backgroundColor: 0x112233ff }

    insertChild(scroller2, child)
    insertChild(scroller1, scroller2)
    insertChild(root, scroller1)

    // scroller1 at (0, 0, 20, 20), scroller2 at (100, 0, 20, 20) -> disjoint!
    mockFlex(scroller1, 0, 0, 20, 20)
    mockFlex(scroller2, 100, 0, 20, 20)
    mockFlex(child, 10, 0, 10, 10)

    const ops = renderTree(root)
    const op = ops.find((o) => o.nodeId === child.id)
    expect(op?.clipBounds).toEqual({ x: 100, y: 0, width: 0, height: 0 })
  })
})
