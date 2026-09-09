import { describe, expect, test } from "bun:test"
import { createElement, setProp } from "./reconciler"

function grid() {
  return createElement("box")
}

function revision(node: ReturnType<typeof grid>): number {
  return node._flexNode!.getGridRevision()
}

describe("reconciler Grid property boundary", () => {
  test("same reference is a no-op and a replacement list invalidates once", () => {
    const node = grid()
    setProp(node, "layout", "grid")

    const tracks = [100]
    setProp(node, "gridTemplateColumns", tracks)
    const afterFirst = revision(node)
    setProp(node, "gridTemplateColumns", tracks)
    expect(revision(node)).toBe(afterFirst)

    setProp(node, "gridTemplateColumns", [100])
    expect(revision(node)).toBe(afterFirst + 1)
    setProp(node, "gridTemplateColumns", node.props.gridTemplateColumns)
    expect(revision(node)).toBe(afterFirst + 1)
  })

  test("does not validate each setter: areas may precede tracks in one Solid batch", () => {
    const node = grid()
    expect(() => setProp(node, "layout", "grid")).not.toThrow()
    expect(() => setProp(node, "gridTemplateAreas", [["hero"]])).not.toThrow()
    expect(() => setProp(node, "gridTemplateColumns", [100])).not.toThrow()
    expect(() => setProp(node, "gridTemplateRows", [50])).not.toThrow()

    const result = node._flexNode!.calculateLayout(100, 50)
    expect(result).toMatchObject({ error: null })
  })

  test("publishes a complete-snapshot error only at calculateLayout", () => {
    const node = grid()
    setProp(node, "layout", "grid")
    expect(() => setProp(node, "gridTemplateAreas", [["hero"], ["hero", "other"]])).not.toThrow()
    expect(() => setProp(node, "gridTemplateColumns", [100])).not.toThrow()
    expect(() => setProp(node, "gridTemplateRows", [50, 50])).not.toThrow()

    const result = node._flexNode!.calculateLayout(100, 100) as { error?: { code: string; path: string; nodeId: number } }
    expect(result.error).toEqual({ code: "GRID_INVALID_AREA", path: "areas[1]", nodeId: expect.any(Number) })
  })

  test("a corrected replacement snapshot calculates after an earlier invalid batch", () => {
    const node = grid()
    setProp(node, "layout", "grid")
    setProp(node, "gridTemplateAreas", [["hero"], ["hero", "other"]])
    setProp(node, "gridTemplateColumns", [100])
    setProp(node, "gridTemplateRows", [50, 50])
    const invalid = node._flexNode!.calculateLayout(100, 100) as { error?: unknown }
    expect(invalid.error).toBeTruthy()

    setProp(node, "gridTemplateAreas", [["hero"], ["hero"]])
    const valid = node._flexNode!.calculateLayout(100, 100)
    expect(valid).toMatchObject({ error: null })
  })

  test("tracks, placement objects, and scalar Grid props all reach the same real Node", () => {
    const node = grid()
    setProp(node, "layout", "grid")
    setProp(node, "gridAutoFlow", "row-dense")
    setProp(node, "gridColumn", { start: 1, end: 2 })
    setProp(node, "justifyItems", "center")

    expect(node._flexNode!.getGridStyle()).toMatchObject({ autoFlow: "row-dense", justifyItems: "center" })
    expect(node._flexNode!.getGridItemStyle().column).toEqual({ start: 1, end: 2 })
  })
})
