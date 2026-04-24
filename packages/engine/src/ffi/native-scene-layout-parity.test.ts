import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "./node"
import {
  destroyNativeScene,
  nativeSceneComputeLayout,
  nativeSceneCreateNode,
  nativeSceneInsert,
  nativeSceneSetProp,
  nativeSceneSetText,
} from "./native-scene"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "./native-scene-graph-flags"
import { createVexartLayoutCtx } from "../loop/layout-adapter"
import { walkTree } from "../loop/walk-tree"
import type { TextMeta } from "./render-graph"

type FixtureNode = TGENode & { _label?: string }

function box(label: string, props: TGEProps, children: FixtureNode[] = []) {
  const node = createNode("box") as FixtureNode
  node._label = label
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  for (const child of children) insertChild(node, child)
  return node
}

function text(label: string, value: string, props: TGEProps = {}) {
  const node = createTextNode(value) as FixtureNode
  node._label = label
  node.props = props
  return node
}

function collectFixtureNodes(node: FixtureNode, out = new Map<string, FixtureNode>()) {
  if (node._label) out.set(node._label, node)
  for (const child of node.children as FixtureNode[]) collectFixtureNodes(child, out)
  return out
}

function mirrorToNative(node: FixtureNode, parentNativeId?: bigint | null) {
  const nativeKind = node.kind === "root" ? "root" : node.kind === "text" ? "text" : "box"
  node._nativeId = nativeSceneCreateNode(nativeKind as "root" | "text" | "box")
  if (parentNativeId) nativeSceneInsert(parentNativeId, node._nativeId)
  for (const [key, value] of Object.entries(node.props)) {
    if (value !== undefined) nativeSceneSetProp(node._nativeId, key, value)
  }
  if (node.kind === "text") nativeSceneSetText(node._nativeId, node.text)
  for (const child of node.children as FixtureNode[]) mirrorToNative(child, node._nativeId)
}

function computeCompatLayout(root: FixtureNode) {
  const clay = createVexartLayoutCtx()
  clay.init(400, 300)
  clay.beginLayout()

  const rectNodes: TGENode[] = []
  const textNodes: TGENode[] = []
  const boxNodes: TGENode[] = []
  const textMetas: TextMeta[] = []
  const nodePathById = new Map<number, string>()
  const nodeRefById = new Map<number, TGENode>()
  const effectsQueue: [] = []
  const imageQueue: [] = []
  const canvasQueue: [] = []
  const textMetaMap = new Map<string, TextMeta>()
  const rectNodeById = new Map<number, TGENode>()

  walkTree(root, {
    scrollIdCounter: { value: 0 },
    textMeasureIndex: { value: 0 },
    scrollSpeedCap: { value: 0 },
    rectNodes,
    textNodes,
    boxNodes,
    textMetas,
    nodePathById,
    nodeRefById,
    effectsQueue,
    imageQueue,
    canvasQueue,
    textMetaMap,
    rectNodeById,
    clay,
  })

  clay.endLayout()
  const layoutMap = clay.getLastLayoutMap()
  clay.destroy()
  return { layoutMap }
}

function parityFixture() {
  return box("root", { width: 400, height: 300, direction: "column", gap: 20, padding: 20 }, [
    box("header", { width: 200, height: 40 }, []),
    box("row", { direction: "row", gap: 10, paddingX: 12, paddingY: 8, width: 200, height: 80 }, [
      box("left", { width: 50, height: 20 }, []),
      box("right", { width: 70, height: 20 }, []),
    ]),
    text("footer", "hello"),
  ])
}

function advancedParityFixture() {
  return box("root", { width: 320, height: 240, direction: "column", gap: 10, padding: 10 }, [
    box("percent", { width: "50%", height: 30 }, []),
    box("row", { width: 280, height: 60, direction: "row", gap: 10, alignItems: "center" }, [
      box("fixed", { width: 40, height: 20 }, []),
      box("grow", { width: "grow", height: 20, minWidth: 30 }, []),
      box("capped", { width: "grow", height: 20, maxWidth: 50 }, []),
    ]),
  ])
}

function alignmentParityFixture() {
  return box("root", { width: 300, height: 220, direction: "column", gap: 12, padding: 12 }, [
    box("centerRow", { width: 220, height: 80, direction: "row", justifyContent: "center", alignItems: "flex-end", gap: 8 }, [
      box("startChip", { width: 30, height: 20 }, []),
      box("endChip", { width: 50, height: 30 }, []),
    ]),
    box("spaceBetweenCol", { width: 100, height: 100, direction: "column", alignY: "space-between", alignX: "center" }, [
      box("topDot", { width: 10, height: 10 }, []),
      box("bottomDot", { width: 20, height: 20 }, []),
    ]),
  ])
}

function scrollParityFixture() {
  return box("root", { width: 260, height: 220, direction: "column", gap: 10, padding: 10 }, [
    box("scroll", { width: 140, height: 90, direction: "column", gap: 6, padding: 8, scrollY: true }, [
      box("scrollChildA", { width: 100, height: 40 }, []),
      box("scrollChildB", { width: 100, height: 70 }, []),
    ]),
    box("nestedRow", { width: 200, height: 50, direction: "row", gap: 10, paddingX: 6, paddingY: 4 }, [
      box("nestedLeft", { width: 60, height: 20 }, []),
      box("nestedRight", { width: 80, height: 20 }, []),
    ]),
  ])
}

function textContainerParityFixture() {
  const container = createNode("text") as FixtureNode
  container._label = "textContainer"
  container.props = { fontSize: 16 }
  insertChild(container, createTextNode("Hello from TGE") as FixtureNode)
  return box("root", { width: 300, height: 120, direction: "column", padding: 12 }, [container])
}

function nestedScrollParityFixture() {
  return box("root", { width: 320, height: 240, direction: "column", padding: 12 }, [
    box("outerScroll", { width: 180, height: 120, direction: "column", padding: 6, gap: 4, scrollY: true }, [
      box("innerScroll", { width: 140, height: 80, direction: "column", padding: 5, gap: 3, scrollY: true }, [
        box("innerA", { width: 90, height: 20 }, []),
        box("innerB", { width: 100, height: 30 }, []),
      ]),
      box("outerTail", { width: 120, height: 25 }, []),
    ]),
  ])
}

function borderPaddingParityFixture() {
  return box("root", { width: 260, height: 180, direction: "column", padding: 10 }, [
    box("card", { width: 180, height: 100, direction: "column", padding: 12, borderWidth: 3, gap: 6 }, [
      box("cardHeader", { width: 120, height: 20, borderWidth: 2, paddingX: 4, paddingY: 2 }, []),
      box("cardBody", { width: 130, height: 30, paddingLeft: 8, paddingTop: 4 }, []),
    ]),
  ])
}

function assertParity(root: FixtureNode, labels: string[]) {
  const nodes = collectFixtureNodes(root)
  mirrorToNative(root)

  const compat = computeCompatLayout(root).layoutMap ?? new Map()
  const native = nativeSceneComputeLayout()

  for (const label of labels) {
    const node = nodes.get(label)
    expect(node).toBeDefined()
    const compatPos = compat.get(BigInt(node!.id))
    const nativePos = native.get(node!._nativeId!)
    expect(nativePos).toBeDefined()
    expect(nativePos?.x).toBe(compatPos?.x)
    expect(nativePos?.y).toBe(compatPos?.y)
    expect(nativePos?.width).toBe(compatPos?.width)
    expect(nativePos?.height).toBe(compatPos?.height)
  }
}

beforeEach(() => {
  enableNativeSceneGraph()
})

afterEach(() => {
  destroyNativeScene()
  disableNativeSceneGraph()
})

describe("native scene layout parity", () => {
  test("matches compat layout for core row/column gap padding fixture", () => {
    assertParity(parityFixture(), ["root", "header", "row", "left", "right", "footer"])
  })

  test("matches compat layout for percent grow and constraint fixture", () => {
    assertParity(advancedParityFixture(), ["root", "percent", "row", "fixed", "grow", "capped"])
  })

  test("matches compat layout for alignment fixture", () => {
    assertParity(alignmentParityFixture(), ["root", "centerRow", "startChip", "endChip", "spaceBetweenCol", "topDot", "bottomDot"])
  })

  test("matches compat layout for scroll and nested layout fixture", () => {
    assertParity(scrollParityFixture(), ["root", "scroll", "scrollChildA", "scrollChildB", "nestedRow", "nestedLeft", "nestedRight"])
  })

  test("matches compat layout for text containers with child text nodes", () => {
    assertParity(textContainerParityFixture(), ["root", "textContainer"])
  })

  test("matches compat layout for nested scroll containers", () => {
    assertParity(nestedScrollParityFixture(), ["root", "outerScroll", "innerScroll", "innerA", "innerB", "outerTail"])
  })

  test("matches compat layout for border and padding combinations", () => {
    assertParity(borderPaddingParityFixture(), ["root", "card", "cardHeader", "cardBody"])
  })

  test.todo("matches compat layout for multiline text wrapping", () => {})
})
