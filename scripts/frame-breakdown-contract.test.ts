import { describe, expect, test } from "bun:test"
import { computeNodeLocalTransform } from "../packages/engine/src/loop/composite-retained"
import { createNode, resolveProps } from "../packages/engine/src/ffi/node"
import { setProp } from "../packages/engine/src/reconciler/reconciler"
import {
  applyCompositorTransform,
  compositorTransformForFrame,
  compositorTransformValue,
  DEFAULT_FRAME_BREAKDOWN_REPORT_PATH,
  hasChangingCompositorTransforms,
  parseFrameBreakdownOptions,
} from "./frame-breakdown-contract"

describe("frame breakdown options", () => {
  test("defaults to native presentation and an explicit temporary report", () => {
    const options = parseFrameBreakdownOptions([])

    expect(options.nativePresentation).toBe(true)
    expect(options.transport).toBe("shm")
    expect(options.output).toBe(DEFAULT_FRAME_BREAKDOWN_REPORT_PATH)
  })

  test("keeps an explicit native presentation opt-out truthful", () => {
    const options = parseFrameBreakdownOptions(["--no-native-presentation", "--transport=file"])

    expect(options.nativePresentation).toBe(false)
    expect(options.transport).toBe("file")
  })
})

describe("compositor workload", () => {
  test("changes a real node prop and its resolved transform matrix", () => {
    const node = createNode("box")
    node.layout.width = 320
    node.layout.height = 180

    const first = applyCompositorTransform(node, (target, name, value) => setProp(target, name, value), 0)
    const firstMatrix = computeNodeLocalTransform(node)
    const firstValue = compositorTransformValue(node)
    const second = applyCompositorTransform(node, (target, name, value) => setProp(target, name, value), 1)
    const secondMatrix = computeNodeLocalTransform(node)
    const secondValue = compositorTransformValue(node)

    expect(first).toEqual(compositorTransformForFrame(0))
    expect(second).toEqual(compositorTransformForFrame(1))
    expect(firstValue).toBe(-8)
    expect(secondValue).toBe(8)
    expect(resolveProps(node).transform).toEqual(second)
    expect(firstMatrix).not.toBeNull()
    expect(secondMatrix).not.toBeNull()
    expect(Array.from(firstMatrix ?? [])).not.toEqual(Array.from(secondMatrix ?? []))
    expect(hasChangingCompositorTransforms([firstValue, secondValue])).toBe(true)
  })

  test("does not claim a change from one sample", () => {
    expect(hasChangingCompositorTransforms([-8])).toBe(false)
    expect(hasChangingCompositorTransforms([-8, -8])).toBe(false)
  })
})
