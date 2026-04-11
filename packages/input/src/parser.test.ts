import { describe, expect, test } from "bun:test"
import { createParser } from "./parser"
import type { InputEvent, KeyEvent, MouseEvent, PasteEvent, FocusEvent } from "./types"

function collect(data: string): InputEvent[] {
  const events: InputEvent[] = []
  const parser = createParser((e) => events.push(e))
  parser.feed(Buffer.from(data, "utf-8"))
  parser.destroy()
  return events
}

describe("keyboard events", () => {
  test("parses printable character", () => {
    const events = collect("a")
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("key")
    expect((events[0] as KeyEvent).key).toBe("a")
  })

  test("parses multiple characters", () => {
    const events = collect("abc")
    expect(events).toHaveLength(3)
    expect((events[0] as KeyEvent).key).toBe("a")
    expect((events[1] as KeyEvent).key).toBe("b")
    expect((events[2] as KeyEvent).key).toBe("c")
  })

  test("parses Ctrl+C", () => {
    const events = collect("\x03")
    expect(events).toHaveLength(1)
    expect((events[0] as KeyEvent).key).toBe("c")
    expect((events[0] as KeyEvent).mods.ctrl).toBe(true)
  })

  test("parses arrow keys", () => {
    const events = collect("\x1b[A\x1b[B")
    expect(events).toHaveLength(2)
    expect((events[0] as KeyEvent).key).toBe("up")
    expect((events[1] as KeyEvent).key).toBe("down")
  })
})

describe("mouse events", () => {
  test("parses SGR mouse click", () => {
    const events = collect("\x1b[<0;5;10M")
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("mouse")
    expect((events[0] as MouseEvent).action).toBe("press")
    expect((events[0] as MouseEvent).x).toBe(4)
    expect((events[0] as MouseEvent).y).toBe(9)
  })
})

describe("focus events", () => {
  test("parses focus in", () => {
    const events = collect("\x1b[I")
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("focus")
    expect((events[0] as FocusEvent).focused).toBe(true)
  })

  test("parses focus out", () => {
    const events = collect("\x1b[O")
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("focus")
    expect((events[0] as FocusEvent).focused).toBe(false)
  })
})

describe("bracketed paste", () => {
  test("parses paste content", () => {
    const events = collect("\x1b[200~hello world\x1b[201~")
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("paste")
    expect((events[0] as PasteEvent).text).toBe("hello world")
  })

  test("paste can contain special characters", () => {
    const events = collect("\x1b[200~line1\nline2\ttab\x1b[201~")
    expect(events).toHaveLength(1)
    expect((events[0] as PasteEvent).text).toBe("line1\nline2\ttab")
  })

  test("paste with empty content", () => {
    const events = collect("\x1b[200~\x1b[201~")
    expect(events).toHaveLength(1)
    expect((events[0] as PasteEvent).text).toBe("")
  })
})

describe("mixed input", () => {
  test("parses interleaved key and mouse events", () => {
    const events = collect("a\x1b[<0;1;1Mb")
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe("key")
    expect(events[1].type).toBe("mouse")
    expect(events[2].type).toBe("key")
  })
})
