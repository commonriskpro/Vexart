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

  test("parses neutral motion in SGR 1003", () => {
    const [event] = parseMouse("\x1b[<35;10;20M")!
    expect(event.action).toBe("move")
    expect(event.button).toBe(0)
  })

  test("prioritizes release with code 32 or 35 and lowercase m suffix", () => {
    const [event32] = parseMouse("\x1b[<32;10;20m")!
    expect(event32.action).toBe("release")
    expect(event32.button).toBe(0)

    const [event35] = parseMouse("\x1b[<35;10;20m")!
    expect(event35.action).toBe("release")
    expect(event35.button).toBe(0)
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

describe("SGR-Pixel (mode 1016) mouse parsing", () => {
  test("parses pixel mode with 0-based origin (Kitty/Ghostty)", () => {
    const [event] = parseMouse("\x1b[<0;100;200M", "pixel", 0)!
    expect(event.action).toBe("press")
    expect(event.button).toBe(0)
    expect(event.x).toBe(100)
    expect(event.y).toBe(200)
    expect(event.pixel).toBe(true)
  })

  test("parses pixel mode with 1-based origin (WezTerm/foot)", () => {
    const [event] = parseMouse("\x1b[<0;100;200M", "pixel", 1)!
    expect(event.action).toBe("press")
    expect(event.button).toBe(0)
    expect(event.x).toBe(99)
    expect(event.y).toBe(199)
    expect(event.pixel).toBe(true)
  })

  test("parses pixel mode release", () => {
    const [event] = parseMouse("\x1b[<0;500;300m", "pixel", 0)!
    expect(event.action).toBe("release")
    expect(event.button).toBe(0)
    expect(event.x).toBe(500)
    expect(event.y).toBe(300)
    expect(event.pixel).toBe(true)
  })

  test("parses pixel mode with modifiers", () => {
    const [event] = parseMouse("\x1b[<4;150;250M", "pixel", 0)!
    expect(event.pixel).toBe(true)
    expect(event.mods.shift).toBe(true)
    expect(event.x).toBe(150)
    expect(event.y).toBe(250)
  })

  test("parses pixel mode scroll", () => {
    const [event] = parseMouse("\x1b[<64;300;400M", "pixel", 1)!
    expect(event.pixel).toBe(true)
    expect(event.action).toBe("scroll")
    expect(event.x).toBe(299)
    expect(event.y).toBe(399)
  })

  test("parses pixel mode motion/drag", () => {
    const [event] = parseMouse("\x1b[<35;200;100M", "pixel", 0)!
    expect(event.pixel).toBe(true)
    expect(event.action).toBe("move")
    expect(event.x).toBe(200)
    expect(event.y).toBe(100)
  })

  test("pixel mode edge case — origin at (0,0)", () => {
    const [event] = parseMouse("\x1b[<0;0;0M", "pixel", 0)!
    expect(event.x).toBe(0)
    expect(event.y).toBe(0)
    expect(event.pixel).toBe(true)
  })

  test("pixel mode edge case — origin at (1,1) with 1-based", () => {
    const [event] = parseMouse("\x1b[<0;1;1M", "pixel", 1)!
    expect(event.x).toBe(0)
    expect(event.y).toBe(0)
    expect(event.pixel).toBe(true)
  })

  test("cell mode backward compatibility with default params", () => {
    const [event] = parseMouse("\x1b[<0;10;20M")!
    expect(event.x).toBe(9)
    expect(event.y).toBe(19)
    expect(event.pixel).toBe(false)
  })
})
