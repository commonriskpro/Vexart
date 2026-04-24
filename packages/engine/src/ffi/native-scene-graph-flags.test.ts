import { afterEach, describe, expect, test } from "bun:test"
import {
  disableNativeSceneGraph,
  enableNativeSceneGraph,
  getNativeSceneGraphFallbackReason,
  isNativeSceneGraphEnabled,
} from "./native-scene-graph-flags"

const originalEnv = process.env.VEXART_NATIVE_SCENE_GRAPH
const originalRetainedEnv = process.env.VEXART_RETAINED

afterEach(() => {
  if (originalEnv === undefined) delete process.env.VEXART_NATIVE_SCENE_GRAPH
  else process.env.VEXART_NATIVE_SCENE_GRAPH = originalEnv
  if (originalRetainedEnv === undefined) delete process.env.VEXART_RETAINED
  else process.env.VEXART_RETAINED = originalRetainedEnv
  disableNativeSceneGraph()
})

describe("native scene graph flags", () => {
  test("enables when env override is absent", () => {
    enableNativeSceneGraph()
    expect(isNativeSceneGraphEnabled()).toBe(true)
  })

  test("stays off when env override disables it", () => {
    process.env.VEXART_NATIVE_SCENE_GRAPH = "0"
    enableNativeSceneGraph()
    expect(isNativeSceneGraphEnabled()).toBe(false)
    expect(getNativeSceneGraphFallbackReason()).toBe("VEXART_NATIVE_SCENE_GRAPH=0 (env override)")
  })

  test("stays off when global retained override disables it", () => {
    process.env.VEXART_RETAINED = "0"
    enableNativeSceneGraph()
    expect(isNativeSceneGraphEnabled()).toBe(false)
    expect(getNativeSceneGraphFallbackReason()).toBe("VEXART_RETAINED=0 (env override)")
  })
})
