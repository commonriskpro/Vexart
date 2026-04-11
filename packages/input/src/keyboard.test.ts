import { describe, expect, test } from "bun:test"
import { parseKey } from "./keyboard"

describe("printable characters", () => {
  test("parses lowercase letter", () => {
    const result = parseKey("a")
    expect(result).not.toBeNull()
    const [event, consumed] = result!
    expect(event.key).toBe("a")
    expect(event.char).toBe("a")
    expect(consumed).toBe(1)
    expect(event.mods.ctrl).toBe(false)
  })

  test("parses uppercase letter", () => {
    const result = parseKey("A")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("a") // key is normalized to lowercase
    expect(event.char).toBe("A") // char preserves case
  })

  test("parses space", () => {
    const result = parseKey(" ")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe(" ")
    expect(event.char).toBe(" ")
  })

  test("parses digits", () => {
    const result = parseKey("5")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("5")
    expect(event.char).toBe("5")
  })

  test("parses symbols", () => {
    const result = parseKey("@")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("@")
    expect(event.char).toBe("@")
  })
})

describe("control keys", () => {
  test("parses Ctrl+C (byte 3)", () => {
    const result = parseKey("\x03")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("c")
    expect(event.mods.ctrl).toBe(true)
  })

  test("parses Tab (byte 9) without ctrl modifier", () => {
    const result = parseKey("\x09")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("tab")
    expect(event.mods.ctrl).toBe(false)
  })

  test("parses Enter (byte 13) without ctrl modifier", () => {
    const result = parseKey("\x0d")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("enter")
    expect(event.mods.ctrl).toBe(false)
  })

  test("parses Backspace (byte 127)", () => {
    const result = parseKey("\x7f")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("backspace")
  })

  test("parses Escape", () => {
    const result = parseKey("\x1b")
    expect(result).not.toBeNull()
    const [event] = result!
    expect(event.key).toBe("escape")
  })
})

describe("CSI sequences", () => {
  test("parses arrow up", () => {
    const result = parseKey("\x1b[A")
    expect(result).not.toBeNull()
    const [event, consumed] = result!
    expect(event.key).toBe("up")
    expect(consumed).toBe(3)
  })

  test("parses arrow down", () => {
    const [event] = parseKey("\x1b[B")!
    expect(event.key).toBe("down")
  })

  test("parses arrow right", () => {
    const [event] = parseKey("\x1b[C")!
    expect(event.key).toBe("right")
  })

  test("parses arrow left", () => {
    const [event] = parseKey("\x1b[D")!
    expect(event.key).toBe("left")
  })

  test("parses Home", () => {
    const [event] = parseKey("\x1b[H")!
    expect(event.key).toBe("home")
  })

  test("parses End", () => {
    const [event] = parseKey("\x1b[F")!
    expect(event.key).toBe("end")
  })

  test("parses Delete (tilde)", () => {
    const [event] = parseKey("\x1b[3~")!
    expect(event.key).toBe("delete")
  })

  test("parses Page Up", () => {
    const [event] = parseKey("\x1b[5~")!
    expect(event.key).toBe("pageup")
  })

  test("parses Page Down", () => {
    const [event] = parseKey("\x1b[6~")!
    expect(event.key).toBe("pagedown")
  })

  test("parses F5", () => {
    const [event] = parseKey("\x1b[15~")!
    expect(event.key).toBe("f5")
  })

  test("parses Shift+Tab", () => {
    const [event] = parseKey("\x1b[Z")!
    expect(event.key).toBe("shift-tab")
  })

  test("parses arrow with Shift modifier", () => {
    const [event] = parseKey("\x1b[1;2A")!
    expect(event.key).toBe("up")
    expect(event.mods.shift).toBe(true)
  })

  test("parses arrow with Ctrl modifier", () => {
    const [event] = parseKey("\x1b[1;5C")!
    expect(event.key).toBe("right")
    expect(event.mods.ctrl).toBe(true)
  })
})

describe("Kitty keyboard protocol", () => {
  test("parses Enter via Kitty", () => {
    const [event] = parseKey("\x1b[13u")!
    expect(event.key).toBe("enter")
  })

  test("parses Escape via Kitty", () => {
    const [event] = parseKey("\x1b[27u")!
    expect(event.key).toBe("escape")
  })

  test("parses Tab via Kitty", () => {
    const [event] = parseKey("\x1b[9u")!
    expect(event.key).toBe("tab")
  })

  test("parses printable char via Kitty", () => {
    const [event] = parseKey("\x1b[97u")! // 'a' = 97
    expect(event.key).toBe("a")
    expect(event.char).toBe("a")
  })

  test("parses Kitty with Shift modifier", () => {
    const [event] = parseKey("\x1b[97;2u")!
    expect(event.key).toBe("a")
    expect(event.mods.shift).toBe(true)
  })

  test("parses Kitty with Ctrl modifier", () => {
    const [event] = parseKey("\x1b[97;5u")!
    expect(event.key).toBe("a")
    expect(event.mods.ctrl).toBe(true)
  })
})

describe("Alt+key", () => {
  test("parses Alt+letter", () => {
    const [event, consumed] = parseKey("\x1ba")!
    expect(event.key).toBe("a")
    expect(event.mods.alt).toBe(true)
    expect(consumed).toBe(2)
  })
})

describe("SS3 sequences", () => {
  test("parses SS3 arrow up", () => {
    const [event] = parseKey("\x1bOA")!
    expect(event.key).toBe("up")
  })

  test("parses SS3 F1", () => {
    const [event] = parseKey("\x1bOP")!
    expect(event.key).toBe("f1")
  })

  test("parses SS3 F4", () => {
    const [event] = parseKey("\x1bOS")!
    expect(event.key).toBe("f4")
  })
})

describe("edge cases", () => {
  test("empty string returns null", () => {
    expect(parseKey("")).toBeNull()
  })

  test("consumes only the parsed bytes", () => {
    const result = parseKey("abc")
    expect(result).not.toBeNull()
    const [event, consumed] = result!
    expect(event.key).toBe("a")
    expect(consumed).toBe(1) // only consumed 'a'
  })
})
