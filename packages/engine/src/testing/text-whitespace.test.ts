import { expect, test } from "bun:test"
import { createNode, createTextNode, insertChild } from "../ffi/node"
import { measureForLayout } from "../ffi/text-layout"
import { setProp } from "../reconciler/reconciler"
import { renderNodeToBuffer, renderNodeToBufferAfterInteractions } from "./render-to-buffer"

const WIDTH = 160
const HEIGHT = 96
const PANEL = 0x101827ff
const INK = 0xffffffff
// Fit the preformatted first pair while leaving the third word for line two.
const WRAP_PANEL_WIDTH = Math.ceil(measureForLayout("one     two", 0, 18).width) + 16

type Frame = { pixels: Uint8Array; width: number; height: number }

type Bounds = { left: number; right: number; top: number; bottom: number }

function prop<T extends ReturnType<typeof createNode>>(node: T, name: string, value: unknown) {
  setProp(node, name, value)
  return node
}

function sceneGraph(
  content: string,
  whiteSpace: "normal" | "pre-wrap",
  panelHeight = HEIGHT,
  panelWidth = WIDTH,
  wordBreak?: "normal" | "keep-all",
) {
  const root = prop(prop(prop(createNode("box"), "width", WIDTH), "height", HEIGHT), "backgroundColor", 0x080b16ff)
  const panel = prop(
    prop(
      prop(
        prop(prop(createNode("box"), "width", panelWidth), "height", panelHeight),
        "padding",
        8,
      ),
      "backgroundColor",
      PANEL,
    ),
    "scrollY",
    true,
  )
  const text = prop(
    prop(
      prop(
        prop(createTextNode(content), "fontSize", 18),
        "lineHeight",
        22,
      ),
      "color",
      INK,
    ),
    "whiteSpace",
    whiteSpace,
  )
  if (wordBreak !== undefined) prop(text, "wordBreak", wordBreak)
  insertChild(panel, text)
  insertChild(root, panel)
  return { root, text }
}

function scene(
  content: string,
  whiteSpace: "normal" | "pre-wrap",
  panelHeight = HEIGHT,
  panelWidth = WIDTH,
  wordBreak?: "normal" | "keep-all",
) {
  return sceneGraph(content, whiteSpace, panelHeight, panelWidth, wordBreak).root
}

function brightBounds(frame: Frame): Bounds | null {
  return brightBoundsIn(frame, 0, frame.width, 0, frame.height)
}

function brightBoundsIn(frame: Frame, x0: number, x1: number, y0: number, y1: number): Bounds | null {
  let left = frame.width
  let right = -1
  let top = frame.height
  let bottom = -1
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const offset = (y * frame.width + x) * 4
      const r = frame.pixels[offset]!
      const g = frame.pixels[offset + 1]!
      const b = frame.pixels[offset + 2]!
      if (r < 150 || g < 150 || b < 150) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { left, right, top, bottom }
}

function brightPixels(frame: Frame, y0: number, y1: number) {
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < frame.width; x++) {
      const offset = (y * frame.width + x) * 4
      if (frame.pixels[offset]! >= 150 && frame.pixels[offset + 1]! >= 150 && frame.pixels[offset + 2]! >= 150) count++
    }
  }
  return count
}

test("pre-wrap preserves leading, repeated, and trailing whitespace in native readback", async () => {
  const content = "  A  B  "
  const normal = await renderNodeToBuffer(scene(content, "normal"), WIDTH, HEIGHT)
  const preWrap = await renderNodeToBuffer(scene(content, "pre-wrap"), WIDTH, HEIGHT)
  const normalBounds = brightBounds(normal)
  const preWrapBounds = brightBounds(preWrap)

  expect(normalBounds).not.toBeNull()
  expect(preWrapBounds).not.toBeNull()
  // Native readback must start after the two leading spaces and extend through
  // the repeated spaces; the trailing run remains part of the preformatted line.
  expect(preWrapBounds!.left).toBeGreaterThan(normalBounds!.left + 5)
  expect(preWrapBounds!.right).toBeGreaterThan(normalBounds!.right + 8)
  expect(preWrapBounds!.bottom).toBeGreaterThanOrEqual(normalBounds!.bottom)
})

test("pre-wrap hard breaks produce a second painted line while normal collapses them", async () => {
  const content = "alpha\nbeta"
  const normal = await renderNodeToBuffer(scene(content, "normal"), WIDTH, HEIGHT)
  const preWrap = await renderNodeToBuffer(scene(content, "pre-wrap"), WIDTH, HEIGHT)

  // The fixed-width, scroll-clipped panel is the geometry oracle: normal text
  // has one line, while pre-wrap retains the source newline and paints line 2.
  expect(brightPixels(normal, 28, 52)).toBe(0)
  expect(brightPixels(preWrap, 28, 52)).toBeGreaterThan(0)
})

test("pre-wrap text remains clipped to a fixed-height scroll viewport", async () => {
  const clipped = await renderNodeToBuffer(scene("alpha\nbeta", "pre-wrap", 30), WIDTH, HEIGHT)

  // The first line fits in the 30px viewport; the second line starts below it
  // and must not leak into the root background after clipping.
  expect(brightPixels(clipped, 30, 52)).toBe(0)
})

test("pre-wrap uses the constrained width when preserving whitespace around wraps", async () => {
  const content = "one     two     three"
  const normal = await renderNodeToBuffer(scene(content, "normal", HEIGHT, WRAP_PANEL_WIDTH), WIDTH, HEIGHT)
  const preWrap = await renderNodeToBuffer(scene(content, "pre-wrap", HEIGHT, WRAP_PANEL_WIDTH), WIDTH, HEIGHT)
  const normalFirst = brightBoundsIn(normal, 0, WRAP_PANEL_WIDTH, 8, 30)
  const normalSecond = brightBoundsIn(normal, 0, WRAP_PANEL_WIDTH, 30, 52)
  const preWrapFirst = brightBoundsIn(preWrap, 0, WRAP_PANEL_WIDTH, 8, 30)
  const preWrapSecond = brightBoundsIn(preWrap, 0, WRAP_PANEL_WIDTH, 30, 52)

  expect(normalFirst).not.toBeNull()
  expect(normalSecond).not.toBeNull()
  expect(preWrapFirst).not.toBeNull()
  expect(preWrapSecond).not.toBeNull()
  expect(preWrapFirst!.right).toBeGreaterThan(normalFirst!.right + 10)
  expect(preWrapSecond!.left).toBeGreaterThan(normalSecond!.left + 10)
  expect(preWrapFirst!.right).toBeLessThan(WRAP_PANEL_WIDTH)
})

test("pre-wrap honors keep-all word breaking through native readback", async () => {
  const content = "supercalifragilisticexpialidocious"
  const normal = await renderNodeToBuffer(scene(content, "pre-wrap", HEIGHT, 100, "normal"), WIDTH, HEIGHT)
  const keepAll = await renderNodeToBuffer(scene(content, "pre-wrap", HEIGHT, 100, "keep-all"), WIDTH, HEIGHT)
  const normalBounds = brightBounds(normal)
  const keepAllBounds = brightBounds(keepAll)

  expect(normalBounds).not.toBeNull()
  expect(keepAllBounds).not.toBeNull()
  // The constrained layout breaks the normal word into lines; keep-all keeps
  // its oversized line intact, which is only safe because native receives the
  // already-laid-out text with wrapping disabled.
  expect(normalBounds!.bottom).toBeGreaterThan(keepAllBounds!.bottom + 30)
})

test("changing whiteSpace reflows and repaints an existing text node", async () => {
  const content = "  A  B  "
  const normal = await renderNodeToBuffer(scene(content, "normal"), WIDTH, HEIGHT)
  const graph = sceneGraph(content, "normal")
  const preWrap = await renderNodeToBufferAfterInteractions(graph.root, WIDTH, HEIGHT, async ({ frame }) => {
    prop(graph.text, "whiteSpace", "pre-wrap")
    await frame()
  })
  const normalBounds = brightBounds(normal)
  const preWrapBounds = brightBounds(preWrap)

  expect(normalBounds).not.toBeNull()
  expect(preWrapBounds).not.toBeNull()
  expect(preWrapBounds!.left).toBeGreaterThan(normalBounds!.left + 5)
  expect(preWrapBounds!.right).toBeGreaterThan(normalBounds!.right + 8)
})
