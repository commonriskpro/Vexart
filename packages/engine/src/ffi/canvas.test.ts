import { describe, expect, test } from "bun:test"
import { CanvasContext, hashCanvasDisplayList, serializeCanvasDisplayList } from "./canvas"

describe("canvas display list serialization and hashing", () => {
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
})
