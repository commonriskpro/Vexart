import { describe, expect, test } from "bun:test"
import { parseMouse } from "./mouse"

describe("SGR mouse parsing", () => {
  test("parses left button press", () => {
    const result = parseMouse("\x1b[<0;10;20M")
    expect(result).not.toBeNull()
    const [event, consumed] = result!
    expect(event.action).toBe("press")
    expect(event.button).toBe(0)
    expect(event.x).toBe(9) // 0-based
    expect(event.y).toBe(19)
    expect(consumed).toBe("\x1b[<0;10;20M".length)
  })

  test("parses left button release", () => {
    const [event] = parseMouse("\x1b[<0;10;20m")!
    expect(event.action).toBe("release")
    expect(event.button).toBe(0)
  })

  test("parses right button press", () => {
    const [event] = parseMouse("\x1b[<2;5;5M")!
    expect(event.action).toBe("press")
    expect(event.button).toBe(2)
  })

  test("parses scroll up", () => {
    const [event] = parseMouse("\x1b[<64;10;10M")!
    expect(event.action).toBe("scroll")
    expect(event.button).toBe(64)
  })

  test("parses scroll down", () => {
    const [event] = parseMouse("\x1b[<65;10;10M")!
    expect(event.action).toBe("scroll")
    expect(event.button).toBe(65)
  })

  test("parses motion with left button held", () => {
    const [event] = parseMouse("\x1b[<32;15;25M")!
    expect(event.action).toBe("move")
    expect(event.button).toBe(0)
  })

  test("decodes Shift modifier", () => {
    const [event] = parseMouse("\x1b[<4;10;10M")!
    expect(event.mods.shift).toBe(true)
    expect(event.mods.alt).toBe(false)
    expect(event.mods.ctrl).toBe(false)
  })

  test("decodes Alt modifier", () => {
    const [event] = parseMouse("\x1b[<8;10;10M")!
    expect(event.mods.alt).toBe(true)
  })

  test("decodes Ctrl modifier", () => {
    const [event] = parseMouse("\x1b[<16;10;10M")!
    expect(event.mods.ctrl).toBe(true)
  })

  test("coordinates are 0-based (SGR is 1-based)", () => {
    const [event] = parseMouse("\x1b[<0;1;1M")!
    expect(event.x).toBe(0)
    expect(event.y).toBe(0)
  })

  test("returns null for non-mouse input", () => {
    expect(parseMouse("abc")).toBeNull()
    expect(parseMouse("\x1b[A")).toBeNull()
  })
})
