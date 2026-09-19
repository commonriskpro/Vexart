import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import {
  createTextEditor,
  previousCodePointOffset,
  nextCodePointOffset,
} from "./text-editor"

describe("text-editor UTF-16 code point helpers", () => {
  test("previousCodePointOffset handles ASCII and surrogate pairs", () => {
    const ascii = "hello"
    expect(previousCodePointOffset(ascii, 5)).toBe(4)
    expect(previousCodePointOffset(ascii, 1)).toBe(0)
    expect(previousCodePointOffset(ascii, 0)).toBe(0)

    // "a👋b": 'a' (len 1) + '👋' (len 2: surrogate pair) + 'b' (len 1)
    const emoji = "a👋b"
    expect(emoji.length).toBe(4)
    // from end of string (offset 4, after 'b') -> 3
    expect(previousCodePointOffset(emoji, 4)).toBe(3)
    // from after emoji (offset 3) -> 1 (skips both code units of surrogate pair)
    expect(previousCodePointOffset(emoji, 3)).toBe(1)
    // from middle of emoji (offset 2) -> 1
    expect(previousCodePointOffset(emoji, 2)).toBe(1)
    // from after 'a' (offset 1) -> 0
    expect(previousCodePointOffset(emoji, 1)).toBe(0)
  })

  test("nextCodePointOffset handles ASCII and surrogate pairs", () => {
    const ascii = "hello"
    expect(nextCodePointOffset(ascii, 0)).toBe(1)
    expect(nextCodePointOffset(ascii, 4)).toBe(5)
    expect(nextCodePointOffset(ascii, 5)).toBe(5)

    const emoji = "a👋b"
    // from 0 ('a') -> 1
    expect(nextCodePointOffset(emoji, 0)).toBe(1)
    // from 1 (start of surrogate pair) -> 3 (skips both units)
    expect(nextCodePointOffset(emoji, 1)).toBe(3)
    // from 3 ('b') -> 4
    expect(nextCodePointOffset(emoji, 3)).toBe(4)
  })
})

describe("createTextEditor core engine", () => {
  test("manages cursor and clamps to text boundaries", () => {
    createRoot((dispose) => {
      const [val, setVal] = createSignal("hello")
      const editor = createTextEditor({
        value: val,
        onChange: setVal,
      })

      expect(editor.cursor()).toBe(5)

      editor.setCursor(2)
      expect(editor.cursor()).toBe(2)

      editor.setCursor(100)
      expect(editor.cursor()).toBe(5)

      editor.setCursor(-10)
      expect(editor.cursor()).toBe(0)

      editor.setCursor(5)
      setVal("hi")
      expect(editor.cursor()).toBe(2)

      dispose()
    })
  })

  test("handles selection lifecycle: selectAll, clearSelection, selRange, deleteSelection", () => {
    createRoot((dispose) => {
      let text = "hello world"
      const editor = createTextEditor({
        value: () => text,
        onChange: (v) => { text = v },
      })

      expect(editor.hasSelection()).toBe(false)
      expect(editor.selection()).toBeNull()

      editor.selectAll()
      expect(editor.hasSelection()).toBe(true)
      expect(editor.selStart()).toBe(0)
      expect(editor.selEnd()).toBe(11)
      expect(editor.selRange()).toEqual([0, 11])
      expect(editor.selection()).toEqual([0, 11])
      expect(editor.cursor()).toBe(11)

      editor.clearSelection()
      expect(editor.hasSelection()).toBe(false)
      expect(editor.selection()).toBeNull()

      editor.setSelStart(8)
      editor.setSelEnd(3)
      expect(editor.hasSelection()).toBe(true)
      expect(editor.selRange()).toEqual([3, 8])
      expect(editor.selection()).toEqual([3, 8])

      const deleted = editor.deleteSelection()
      expect(deleted).toBe("helrld")
      expect(editor.cursor()).toBe(3)
      expect(editor.hasSelection()).toBe(false)

      dispose()
    })
  })

  test("insertText inserts at cursor and replaces active selection", () => {
    createRoot((dispose) => {
      let text = "hello"
      const editor = createTextEditor({
        value: () => text,
        onChange: (v) => { text = v },
        initialCursor: 5,
      })

      editor.insertText(" world")
      expect(text).toBe("hello world")
      expect(editor.cursor()).toBe(11)

      editor.setSelStart(6)
      editor.setSelEnd(11)
      editor.insertText("there!")
      expect(text).toBe("hello there!")
      expect(editor.cursor()).toBe(12)
      expect(editor.hasSelection()).toBe(false)

      dispose()
    })
  })

  test("singleLine mode collapses newlines and tabs to space", () => {
    createRoot((dispose) => {
      let text = ""
      const editor = createTextEditor({
        value: () => text,
        onChange: (v) => { text = v },
        singleLine: true,
      })

      editor.insertText("line1" + String.fromCharCode(13, 10) + "line2" + String.fromCharCode(9) + "tab")
      expect(text).toBe("line1  line2 tab")
      dispose()
    })
  })

  test("deleteBackward and deleteForward respect code point boundaries and selections", () => {
    createRoot((dispose) => {
      let text = "a👋b"
      const editor = createTextEditor({
        value: () => text,
        onChange: (v) => { text = v },
        initialCursor: 4,
      })

      editor.deleteBackward()
      expect(text).toBe("a👋")
      expect(editor.cursor()).toBe(3)

      editor.deleteBackward()
      expect(text).toBe("a")
      expect(editor.cursor()).toBe(1)

      text = "a👋b"
      editor.setCursor(1)
      editor.deleteForward()
      expect(text).toBe("ab")
      expect(editor.cursor()).toBe(1)

      text = "hello world"
      editor.setSelStart(5)
      editor.setSelEnd(11)
      editor.deleteBackward()
      expect(text).toBe("hello")
      expect(editor.cursor()).toBe(5)
      expect(editor.hasSelection()).toBe(false)

      dispose()
    })
  })

  test("undo and redo history stack works correctly", () => {
    createRoot((dispose) => {
      let text = "foo"
      const editor = createTextEditor({
        value: () => text,
        onChange: (v) => { text = v },
        initialCursor: 3,
      })

      expect(editor.canUndo()).toBe(false)
      expect(editor.canRedo()).toBe(false)

      editor.insertText(" bar")
      expect(text).toBe("foo bar")
      expect(editor.canUndo()).toBe(true)
      expect(editor.canRedo()).toBe(false)

      editor.insertText(" baz")
      expect(text).toBe("foo bar baz")

      editor.undo()
      expect(text).toBe("foo bar")
      expect(editor.canUndo()).toBe(true)
      expect(editor.canRedo()).toBe(true)

      editor.undo()
      expect(text).toBe("foo")
      expect(editor.canUndo()).toBe(false)
      expect(editor.canRedo()).toBe(true)

      editor.redo()
      expect(text).toBe("foo bar")
      expect(editor.canUndo()).toBe(true)

      editor.redo()
      expect(text).toBe("foo bar baz")
      expect(editor.canRedo()).toBe(false)

      dispose()
    })
  })

  test("blink timer toggles blink state", () => {
    createRoot((dispose) => {
      const editor = createTextEditor({
        value: "test",
        blinkInterval: 10,
      })

      expect(editor.blink()).toBe(true)
      editor.stopBlink()
      expect(editor.blink()).toBe(true)
      editor.startBlink()
      expect(editor.blink()).toBe(true)

      dispose()
    })
  })
})
