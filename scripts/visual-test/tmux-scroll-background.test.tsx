import assert from "node:assert/strict"
import { expect, test } from "bun:test"
import { VoidScrollView } from "@vexart/styled"
import { renderToBuffer, renderToBufferAfterInteractions, type RenderToBufferResult } from "../../packages/engine/src/testing/render-to-buffer"
import { createNode } from "../../packages/engine/src/ffi/node"
import { CMD } from "../../packages/engine/src/ffi/render-graph"
import { assignLayersSpatial } from "../../packages/engine/src/loop/assign-layers"
import type { RenderCommand } from "../../packages/engine/src/ffi/render-graph"
import type { LayerBoundary } from "../../packages/engine/src/loop/types"
import type { ScrollHandle } from "@vexart/headless"

const WIDTH = 660
const HEIGHT = 240
const ROW_EVEN = [30, 41, 59] as const
const ROW_ODD = [51, 65, 85] as const
const SURFACE = 0x262626ff
const OUTER = 0x09090bff

function rows() {
  return Array.from({ length: 8 }, (_, index) => (
    <box
      width="100%"
      height={24}
      backgroundColor={index % 2 === 0 ? 0x1e293bff : 0x334155ff}
    >
      <text color={0xffffffff} fontSize={12}>{`Row ${index + 1}`}</text>
    </box>
  ))
}

function ScrollBackgroundScene(props: { onScrollHandle?: (handle: ScrollHandle) => void }) {
  return (
    <box width={WIDTH} height={HEIGHT} direction="row" gap={12} padding={12} backgroundColor={OUTER}>
      <VoidScrollView
        ref={props.onScrollHandle}
        width={300}
        height={180}
        scrollY
        showScrollbar={false}
        padding={6}
        gap={2}
      >
        {rows()}
      </VoidScrollView>
      <box width={300} height={180} layer scrollY backgroundColor={SURFACE} padding={6} gap={2}>
        {rows()}
      </box>
    </box>
  )
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return [frame.pixels[index], frame.pixels[index + 1], frame.pixels[index + 2], frame.pixels[index + 3]] as const
}

function countColor(frame: RenderToBufferResult, color: readonly number[], left: number, top: number, right: number, bottom: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sample = pixel(frame, x, y)
      if (sample.every((value, channel) => value === (color[channel] ?? 255))) count++
    }
  }
  return count
}

function assertStripePixels(frame: RenderToBufferResult, left: number, label: string) {
  const even = countColor(frame, ROW_EVEN, left, 12, left + 300, 192)
  const odd = countColor(frame, ROW_ODD, left, 12, left + 300, 192)
  assert.ok(even > 500, `${label} lost even child row fills (${even})`)
  assert.ok(odd > 500, `${label} lost odd child row fills (${odd})`)
}

function countDifferences(a: RenderToBufferResult, b: RenderToBufferResult, left: number, top: number, right: number, bottom: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const ai = (y * a.width + x) * 4
      const bi = (y * b.width + x) * 4
      for (let channel = 0; channel < 4; channel++) {
        if (a.pixels[ai + channel] !== b.pixels[bi + channel]) {
          count++
          break
        }
      }
    }
  }
  return count
}

function rectangle(x: number, y: number, width: number, height: number, color = SURFACE): RenderCommand {
  return {
    type: CMD.RECTANGLE,
    x,
    y,
    width,
    height,
    color,
    cornerRadius: 0,
    extra1: 0,
    extra2: 0,
  }
}

test("scroll layer keeps source command order around its background", () => {
  const root = createNode("root")
  const scroll = createNode("box")
  scroll.props.layer = true
  scroll.props.scrollY = true
  scroll.props.backgroundColor = SURFACE
  root.children.push(scroll)
  scroll.parent = root

  const commands: RenderCommand[] = [
    rectangle(10, 10, 300, 180),
    { type: CMD.SCISSOR_START, x: 10, y: 10, width: 300, height: 180, color: 0, cornerRadius: 0, extra1: 0, extra2: 0 },
    rectangle(16, 16, 288, 24, ROW_EVEN[0] << 24 | ROW_EVEN[1] << 16 | ROW_EVEN[2] << 8 | 0xff),
    rectangle(16, 42, 288, 24, ROW_ODD[0] << 24 | ROW_ODD[1] << 16 | ROW_ODD[2] << 8 | 0xff),
    { type: CMD.SCISSOR_END, x: 10, y: 10, width: 300, height: 180, color: 0, cornerRadius: 0, extra1: 0, extra2: 0 },
    { type: CMD.BORDER, x: 10, y: 10, width: 300, height: 180, color: SURFACE, cornerRadius: 0, extra1: 0, extra2: 0 },
  ]
  const boundaries: LayerBoundary[] = [{
    nodeId: scroll.id,
    z: 0,
    isScroll: true,
    hasBg: true,
    insideScroll: false,
    hasSubtreeTransform: false,
  }]
  const plan = assignLayersSpatial(commands, boundaries, {
    root,
    collectText: () => "",
    nodeRefById: new Map([[scroll.id, scroll]]),
    scrollContainers: [scroll],
  })
  const indices = plan.contentSlots[0].cmdIndices
  expect(indices).toEqual([...indices].sort((a, b) => a - b))
  expect(indices).toEqual([0, 1, 2, 3, 4, 5])
})

test("VoidScrollView preserves striped fills at offset zero and after scrolling", async () => {
  const initial = await renderToBuffer(() => <ScrollBackgroundScene />, WIDTH, HEIGHT, 3)
  assertStripePixels(initial, 12, "VoidScrollView at offset zero")
  assertStripePixels(initial, 324, "raw scroll control at offset zero")

  let handle: ScrollHandle | null = null
  const scrolled = await renderToBufferAfterInteractions(
    () => <ScrollBackgroundScene onScrollHandle={(next) => { handle = next }} />,
    WIDTH,
    HEIGHT,
    async (helpers) => {
      if (!handle) return
      handle.scrollTo(-60)
      await helpers.frame()
      assert.ok(handle.scrollTop > 0, "scroll handle did not move")
    },
    3,
  )
  assertStripePixels(scrolled, 12, "VoidScrollView after scrolling")
  assertStripePixels(scrolled, 324, "raw scroll control after scrolling")
  assert.ok(countDifferences(initial, scrolled, 12, 12, 312, 192) > 500, "VoidScrollView pixels did not move after scrolling")
  assert.equal(countDifferences(initial, scrolled, 324, 12, 624, 192), 0, "raw scroll control changed during VoidScrollView scroll")
})
