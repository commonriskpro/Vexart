import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { CanvasContext, hashCanvasDisplayList, serializeCanvasDisplayList } from "./canvas"
import { destroyNativeScene } from "./native-scene"
import { nativeCanvasDisplayListRelease, nativeCanvasDisplayListTouch, nativeCanvasDisplayListUpdate } from "./native-canvas-display-list"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "./native-scene-graph-flags"
import { getNativeResourceStats } from "./resource-stats"

beforeEach(() => {
  enableNativeSceneGraph()
})

afterEach(() => {
  destroyNativeScene()
  disableNativeSceneGraph()
})

describe("native canvas display lists", () => {
  test("serializes canvas commands deterministically", () => {
    const a = new CanvasContext()
    a.line(0, 1, 2, 3, { color: 0xff00ffff, width: 2 })
    a.rect(4, 5, 6, 7, { fill: 0x11223344, radius: 3 })

    const b = new CanvasContext()
    b.line(0, 1, 2, 3, { color: 0xff00ffff, width: 2 })
    b.rect(4, 5, 6, 7, { fill: 0x11223344, radius: 3 })

    const bytesA = serializeCanvasDisplayList(a._commands)
    const bytesB = serializeCanvasDisplayList(b._commands)

    expect(new TextDecoder().decode(bytesA)).toBe(new TextDecoder().decode(bytesB))
    expect(hashCanvasDisplayList(bytesA)).toBe(hashCanvasDisplayList(bytesB))
  })

  test("updates and reuses native display-list handles", () => {
    const ctx = new CanvasContext()
    ctx.circle(4, 5, 6, { fill: 0xaabbccdd })
    const bytes = serializeCanvasDisplayList(ctx._commands)
    const key = `canvas-test-${Date.now()}-${Math.random()}`

    const first = nativeCanvasDisplayListUpdate({ key, bytes })
    const second = nativeCanvasDisplayListUpdate({ key, bytes })

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(nativeCanvasDisplayListTouch(first!)).toBe(true)
    expect(nativeCanvasDisplayListRelease(first!)).toBe(true)
  })

  test("registered display lists contribute to native resource stats", () => {
    const before = getNativeResourceStats()
    const beforeBytes = before?.resourcesByKind.CanvasDisplayList?.bytes ?? 0
    const ctx = new CanvasContext()
    ctx.glow(10, 11, 12, 13, 0xffaa00ff)
    const bytes = serializeCanvasDisplayList(ctx._commands)
    const key = `canvas-stats-${Date.now()}-${Math.random()}`

    const handle = nativeCanvasDisplayListUpdate({ key, bytes })
    const after = getNativeResourceStats()

    expect(handle).not.toBeNull()
    expect((after?.resourcesByKind.CanvasDisplayList?.bytes ?? 0) - beforeBytes).toBe(bytes.byteLength)
    expect(nativeCanvasDisplayListRelease(handle!)).toBe(true)
  })
})
