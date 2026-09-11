import { describe, expect, test } from "bun:test"
import { createParser, findKittyResponseEnd } from "./parser"
import type { InputEvent, KeyEvent, MouseEvent, PasteEvent, FocusEvent } from "./types"

function collect(data: string): InputEvent[] {
  const events: InputEvent[] = []
  const parser = createParser((e) => events.push(e))
  parser.feed(Buffer.from(data, "utf-8"))
  parser.destroy()
  return events
}

function collectAtSplit(data: string, split: number): InputEvent[] {
  const events: InputEvent[] = []
  const parser = createParser((e) => events.push(e))
  const bytes = Buffer.from(data, "utf-8")
  parser.feed(bytes.subarray(0, split))
  parser.feed(bytes.subarray(split))
  parser.destroy()
  return events
}

function expectSameAtEverySplit(data: string, expected: InputEvent[]) {
  const bytes = Buffer.from(data, "utf-8")
  for (let split = 1; split < bytes.length; split++) {
    expect(collectAtSplit(data, split)).toEqual(expected)
  }
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

  test("parses long SGR drag and wheel sequences at every split point", () => {
    const drag: MouseEvent = {
      type: "mouse",
      action: "move",
      button: 0,
      x: 122,
      y: 44,
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    const wheel: MouseEvent = {
      type: "mouse",
      action: "scroll",
      button: 64,
      x: 122,
      y: 44,
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    expectSameAtEverySplit("\x1b[<32;123;45M", [drag])
    expectSameAtEverySplit("\x1b[<64;123;45M", [wheel])
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

  test("parses focus events at every split point", () => {
    expectSameAtEverySplit("\x1b[I", [{ type: "focus", focused: true }])
    expectSameAtEverySplit("\x1b[O", [{ type: "focus", focused: false }])
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

  test("preserves split paste start and end markers", () => {
    expectSameAtEverySplit("\x1b[200~hello\x1b[201~", [{ type: "paste", text: "hello" }])
  })
})

describe("fragmented keyboard events", () => {
  test("parses UTF-8 text at every byte split point", () => {
    const expected: KeyEvent[] = [
      { type: "key", key: "h", char: "h", mods: { shift: false, alt: false, ctrl: false, meta: false } },
      { type: "key", key: "é", char: "é", mods: { shift: false, alt: false, ctrl: false, meta: false } },
      { type: "key", key: "🙂", char: "🙂", mods: { shift: false, alt: false, ctrl: false, meta: false } },
    ]
    expectSameAtEverySplit("hé🙂", expected)
  })

  test("parses CSI-u modifier keys at every split point", () => {
    const expected: KeyEvent = {
      type: "key",
      key: "a",
      char: "a",
      mods: { shift: false, alt: false, ctrl: true, meta: false },
    }
    expectSameAtEverySplit("\x1b[97;5u", [expected])
  })

  test("preserves Unicode text from fragmented CSI-u and modifyOtherKeys", () => {
    const plain: KeyEvent = {
      type: "key",
      key: "é",
      char: "é",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    const emoji: KeyEvent = {
      type: "key",
      key: "😀",
      char: "😀",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    const modified: KeyEvent = {
      type: "key",
      key: "é",
      char: "é",
      mods: { shift: true, alt: false, ctrl: false, meta: false },
    }
    expectSameAtEverySplit("\x1b[233u", [plain])
    expectSameAtEverySplit("\x1b[128512u", [emoji])
    expectSameAtEverySplit("\x1b[27;2;233~", [modified])
  })

  test("parses xterm modifyOtherKeys at every split point", () => {
    const regular: KeyEvent = {
      type: "key",
      key: "z",
      char: "z",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    expectSameAtEverySplit("\x1b[27;5;9~z", [{
      type: "key",
      key: "tab",
      char: "",
      mods: { shift: false, alt: false, ctrl: true, meta: false },
    }, regular])
    expectSameAtEverySplit("\x1b[27;2;9~z", [{
      type: "key",
      key: "tab",
      char: "",
      mods: { shift: true, alt: false, ctrl: false, meta: false },
    }, regular])
    expectSameAtEverySplit("\x1b[27;1;13~z", [{
      type: "key",
      key: "enter",
      char: "",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }, regular])
    expectSameAtEverySplit("\x1b[27;5;97~z", [{
      type: "key",
      key: "a",
      char: "a",
      mods: { shift: false, alt: false, ctrl: true, meta: false },
    }, regular])
    expectSameAtEverySplit("\x1b[27;2;65~z", [{
      type: "key",
      key: "a",
      char: "A",
      mods: { shift: true, alt: false, ctrl: false, meta: false },
    }, regular])
  })

  test("ignores malformed and out-of-range modifyOtherKeys and keeps later input", () => {
    const expected: KeyEvent[] = [{
      type: "key",
      key: "z",
      char: "z",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }]
    expect(collect("\x1b[27;5;~z")).toEqual(expected)
    expect(collect("\x1b[27;5;1114112~z")).toEqual(expected)
    expect(collect("\x1b[27;5;55296~z")).toEqual(expected)
  })

  test("does not turn controls or functional private-use codes into text", () => {
    for (const sequence of ["\x1b[1u", "\x1b[9u", "\x1b[13u", "\x1b[127u", "\x1b[128u", "\x1b[57344u", "\x1b[57376u"]) {
      const [event] = collect(sequence) as [KeyEvent]
      expect(event.char).toBe("")
    }
  })

  test("keeps supplementary private-use codepoints outside Kitty's key range as text", () => {
    const [event] = collect("\x1b[983040u") as [KeyEvent]
    expect(event.char).toBe(String.fromCodePoint(0xf0000))
  })

  test("parses SS3 keys at every split point", () => {
    expectSameAtEverySplit("\x1bOP", [{
      type: "key",
      key: "f1",
      char: "",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }])
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

describe("incremental buffering", () => {
  test("waits for the full paste delimiter and preserves false prefixes", () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    const startAndContent = Buffer.from("\x1b[200~line\x1b[20x", "utf-8")
    const end = Buffer.from("\x1b[201~", "utf-8")

    for (let index = 0; index < startAndContent.length; index++) {
      parser.feed(startAndContent.subarray(index, index + 1))
      expect(events).toEqual([])
    }
    for (let index = 0; index < end.length - 1; index++) {
      parser.feed(end.subarray(index, index + 1))
      expect(events).toEqual([])
    }

    parser.feed(end.subarray(end.length - 1))
    expect(events).toEqual([{ type: "paste", text: "line\x1b[20x" }])
    parser.feed(Buffer.from("z"))
    expect(events).toEqual([
      { type: "paste", text: "line\x1b[20x" },
      { type: "key", key: "z", char: "z", mods: { shift: false, alt: false, ctrl: false, meta: false } },
    ])
    parser.destroy()
  })

  test("emits a lone Escape after the real timeout", async () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    parser.feed(Buffer.from("\x1b"))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(events).toEqual([{ type: "key", key: "escape", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } }])
    parser.destroy()
  })

  test("cancels the Escape timer when the CSI continuation arrives", async () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    parser.feed(Buffer.from("\x1b"))
    await new Promise((resolve) => setTimeout(resolve, 5))
    parser.feed(Buffer.from("[A"))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(events).toEqual([{ type: "key", key: "up", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } }])
    parser.destroy()
  })

  test("destroy cancels a pending Escape timer", async () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    parser.feed(Buffer.from("\x1b"))
    parser.destroy()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(events).toEqual([])
  })
})

describe("Kitty APC responses", () => {
  const altUnderscore: KeyEvent = {
    type: "key",
    key: "_",
    char: "_",
    mods: { shift: false, alt: true, ctrl: false, meta: false },
  }

  test("keeps a non-G ESC_ continuation as Alt+underscore plus ordinary input", () => {
    expect(collect("\x1b_X")).toEqual([altUnderscore, {
      type: "key",
      key: "x",
      char: "X",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }])
  })

  test("emits Alt+underscore when the split APC prefix times out", async () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    parser.feed(Buffer.from("\x1b"))
    await new Promise((resolve) => setTimeout(resolve, 5))
    parser.feed(Buffer.from("_"))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(events).toEqual([altUnderscore])
    parser.destroy()
  })

  test("consumes a complete response before ordinary input", () => {
    const ack = "\x1b_Gi=31;OK\x1b\\"
    const expected: KeyEvent = {
      type: "key",
      key: "a",
      char: "a",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    expectSameAtEverySplit(ack + "a", [expected])
  })

  test("consumes a BEL-terminated response followed by ordinary input", () => {
    const expected: KeyEvent = {
      type: "key",
      key: "a",
      char: "a",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    expect(collect("\x1b_Gi=31;OK\x07a")).toEqual([expected])
  })

  test("consumes BEL-terminated responses at every split point", () => {
    const expected: KeyEvent = {
      type: "key",
      key: "a",
      char: "a",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    expectSameAtEverySplit("\x1b_Gi=31;OK\x07a", [expected])
  })

  test("consumes fragmented, repeated, and error responses", () => {
    const expected: KeyEvent = {
      type: "key",
      key: "z",
      char: "z",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    const responses = [
      "\x1b_Gi=31;OK\x1b\\",
      "\x1b_Gi=31;ENOENT\x1b\\",
      "\x1b_Gp=token;EIO\x1b\\",
    ].join("")
    expectSameAtEverySplit(responses + "z", [expected])
  })

  test("consumes mixed BEL and ST terminated responses in sequence", () => {
    const expected: KeyEvent = {
      type: "key",
      key: "z",
      char: "z",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }
    const responses = [
      "\x1b_Gi=31;OK\x07",
      "\x1b_Gi=32;OK\x1b\\",
      "\x1b_Gi=33;ENOENT\x07",
      "\x1b_Gp=token;EIO\x1b\\",
    ].join("")
    expectSameAtEverySplit(responses + "z", [expected])
  })

  test("keeps APC-looking text inside bracketed paste content", () => {
    const text = "paste \x1b_Gi=31;OK\x1b\\ text"
    expect(collect("\x1b[200~" + text + "\x1b[201~")).toEqual([{ type: "paste", text }])
  })

  test("bounds an unterminated oversized response and accepts later input", () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    parser.feed(Buffer.from("\x1b_G" + "x".repeat(5000), "utf-8"))
    expect(events).toEqual([])
    parser.feed(Buffer.from("z"))
    expect(events).toEqual([{
      type: "key",
      key: "z",
      char: "z",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }])
    parser.destroy()
  })

  test("preserves following escape sequence from oversized unterminated response in same buffer", () => {
    const events: InputEvent[] = []
    const parser = createParser((event) => events.push(event))
    parser.feed(Buffer.from("\x1b_G" + "x".repeat(5000) + "\x1b[A", "utf-8"))
    expect(events).toEqual([{
      type: "key",
      key: "up",
      char: "",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    }])
    parser.destroy()
  })
})

describe("findKittyResponseEnd", () => {
  test("returns null when neither terminator is present", () => {
    expect(findKittyResponseEnd("\x1b_Gi=31;OK", 3)).toBeNull()
  })

  test("finds ST terminator with length 2", () => {
    expect(findKittyResponseEnd("\x1b_Gi=31;OK\x1b\\rest", 3)).toEqual({ index: 10, length: 2 })
  })

  test("finds BEL terminator with length 1", () => {
    expect(findKittyResponseEnd("\x1b_Gi=31;OK\x07rest", 3)).toEqual({ index: 10, length: 1 })
  })

  test("returns the earliest match when both ST and BEL are present", () => {
    expect(findKittyResponseEnd("\x1b_Gi=31\x1b\\payload\x07", 3)).toEqual({ index: 7, length: 2 })
    expect(findKittyResponseEnd("\x1b_Gi=31\x07payload\x1b\\", 3)).toEqual({ index: 7, length: 1 })
  })

  test("respects fromIndex", () => {
    expect(findKittyResponseEnd("\x07\x1b_Gi=31;OK\x07", 2)).toEqual({ index: 11, length: 1 })
    expect(findKittyResponseEnd("\x1b\\\x1b_Gi=31;OK\x1b\\", 2)).toEqual({ index: 12, length: 2 })
  })
})
