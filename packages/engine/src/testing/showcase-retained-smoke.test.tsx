import { afterEach, describe, expect, test } from "bun:test"
import { renderNodeToBuffer } from "./render-to-buffer"
import { createShowcaseTab2Scene, SHOWCASE_TAB2_H, SHOWCASE_TAB2_W } from "./showcase-tab2-scene"
import { destroyNativeScene } from "../ffi/native-scene"
import { disableNativeEventDispatch, enableNativeEventDispatch } from "../ffi/native-event-dispatch-flags"
import { disableNativeRenderGraph, enableNativeRenderGraph } from "../ffi/native-render-graph-flags"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "../ffi/native-scene-graph-flags"
import { disableNativeSceneLayout, enableNativeSceneLayout } from "../ffi/native-scene-layout-flags"

const WIDTH = SHOWCASE_TAB2_W
const HEIGHT = SHOWCASE_TAB2_H

function diffPercent(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return 100
  let diff = 0
  const total = a.length / 4
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i] - b[i])
    const dg = Math.abs(a[i + 1] - b[i + 1])
    const db = Math.abs(a[i + 2] - b[i + 2])
    const da = Math.abs(a[i + 3] - b[i + 3])
    if (dr > 4 || dg > 4 || db > 4 || da > 4) diff++
  }
  return (diff / total) * 100
}

afterEach(() => {
  destroyNativeScene()
  disableNativeSceneLayout()
  disableNativeEventDispatch()
  disableNativeRenderGraph()
  disableNativeSceneGraph()
})

describe("showcase retained smoke", () => {
  test("showcase tab2 retained path stays close to compat offscreen output", async () => {
    const compat = await renderNodeToBuffer(createShowcaseTab2Scene(), WIDTH, HEIGHT)

    enableNativeSceneGraph()
    enableNativeEventDispatch()
    enableNativeSceneLayout()

    const retained = await renderNodeToBuffer(createShowcaseTab2Scene(), WIDTH, HEIGHT)

    expect(retained.width).toBe(compat.width)
    expect(retained.height).toBe(compat.height)

    const diff = diffPercent(compat.pixels, retained.pixels)
    expect(diff).toBeLessThan(2.5)
  })

  test("showcase tab2 retained path stays close with native render graph enabled", async () => {
    const compat = await renderNodeToBuffer(createShowcaseTab2Scene(), WIDTH, HEIGHT)

    enableNativeSceneGraph()
    enableNativeEventDispatch()
    enableNativeSceneLayout()
    enableNativeRenderGraph()

    const retained = await renderNodeToBuffer(createShowcaseTab2Scene(), WIDTH, HEIGHT)

    expect(retained.width).toBe(compat.width)
    expect(retained.height).toBe(compat.height)

    const diff = diffPercent(compat.pixels, retained.pixels)
    expect(diff).toBeLessThan(2.5)
  })
})
