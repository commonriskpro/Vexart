/**
 * Textarea — multiline text editor for TGE.
 *
 * Focus-aware with full keyboard editing:
 *   - Printable chars: insert at cursor
 *   - Backspace/Delete: remove char (or selection)
 *   - Left/Right: move cursor
 *   - Up/Down: move cursor between lines
 *   - Home/End: jump to start/end of line
 *   - Ctrl+Home/Ctrl+End: jump to start/end of buffer
 *   - PgUp/PgDown: move cursor by viewport height
 *   - Shift+arrows: select text
 *   - Ctrl+A: select all
 *   - Ctrl+V / bracketed paste: insert multi-line text
 *   - Enter: insert newline (or submit if Ctrl+Enter)
 *   - Typing with active selection replaces it
 *
 * CONTROLLED component — parent owns value state via `value` + `onChange`.
 *
 * Provides a TextareaHandle via `ref` for imperative access:
 *   - setText(text) / insertText(text) / clear()
 *   - getTextRange(start, end)
 *   - plainText / cursorOffset / cursorRow / cursorCol
 *   - gotoBufferEnd() / gotoLineEnd()
 *
 * Usage:
 *   const [code, setCode] = createSignal("")
 *   let ref: TextareaHandle
 *
 *   <Textarea
 *     ref={(h) => ref = h}
 *     value={code()}
 *     onChange={setCode}
 *     width={500}
 *     height={300}
 *   />
 */

import { createSignal, onCleanup } from "solid-js"
import { useFocus, onInput, markDirty } from "@tge/renderer"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
  alpha,
} from "@tge/tokens"

const CHAR_WIDTH = 9
const LINE_HEIGHT = 17

// ── TextareaHandle — imperative ref API ──

export type TextareaHandle = {
  /** Full text content */
  readonly plainText: string
  /** Absolute cursor offset (char index from start) */
  readonly cursorOffset: number
  /** Cursor row (0-indexed) */
  readonly cursorRow: number
  /** Cursor column (0-indexed) */
  readonly cursorCol: number
  /** Replace all text */
  setText: (text: string) => void
  /** Insert text at current cursor position */
  insertText: (text: string) => void
  /** Clear all text */
  clear: () => void
  /** Get text in a range [start, end) */
  getTextRange: (start: number, end: number) => string
  /** Move cursor to end of buffer */
  gotoBufferEnd: () => void
  /** Move cursor to end of current line */
  gotoLineEnd: () => void
  /** Focus the textarea */
  focus: () => void
}

// ── Line buffer helpers ──

function textToLines(text: string): string[] {
  return text.split("\n")
}

function linesToText(lines: string[]): string {
  return lines.join("\n")
}

/** Convert absolute offset to { row, col } */
function offsetToRowCol(lines: string[], offset: number): { row: number; col: number } {
  let remaining = offset
  for (let row = 0; row < lines.length; row++) {
    const lineLen = lines[row].length
    if (remaining <= lineLen) {
      return { row, col: remaining }
    }
    remaining -= lineLen + 1 // +1 for newline
  }
  // Past end — clamp to last position
  const lastRow = lines.length - 1
  return { row: lastRow, col: lines[lastRow].length }
}

/** Convert { row, col } to absolute offset */
function rowColToOffset(lines: string[], row: number, col: number): number {
  let offset = 0
  for (let r = 0; r < row && r < lines.length; r++) {
    offset += lines[r].length + 1 // +1 for newline
  }
  return offset + Math.min(col, (lines[row] ?? "").length)
}

// ── Props ──

export type TextareaProps = {
  /** Ref callback — receives a TextareaHandle for imperative control. */
  ref?: (handle: TextareaHandle) => void

  /** Current text value (multi-line string). */
  value: string

  /** Called with the new value on every edit. */
  onChange?: (value: string) => void

  /** Called on Ctrl+Enter (submit). */
  onSubmit?: (value: string) => void

  /** Called when the cursor moves. */
  onCursorChange?: (row: number, col: number) => void

  /** Placeholder text shown when value is empty. */
  placeholder?: string

  /** Width in pixels. Default: 400. */
  width?: number
  /** Height in pixels. Default: 200. */
  height?: number

  /** Accent color for the focused border and cursor. */
  color?: number

  /** Disabled state. */
  disabled?: boolean

  /** Focus ID override. */
  focusId?: string
}

// ── Component ──

export function Textarea(props: TextareaProps) {
  const [cursor, setCursor] = createSignal(props.value.length)
  const [selStart, setSelStart] = createSignal(-1)
  const [selEnd, setSelEnd] = createSignal(-1)
  const [blink, setBlink] = createSignal(true)

  const color = () => props.color ?? accent.thread
  const disabled = () => props.disabled ?? false
  const inputWidth = () => props.width ?? 400
  const inputHeight = () => props.height ?? 200

  // Derived line state
  const lines = () => textToLines(props.value)
  const cursorPos = () => offsetToRowCol(lines(), cursor())

  // Blink timer
  let blinkTimer: ReturnType<typeof setInterval> | null = null
  function startBlink() {
    stopBlink()
    setBlink(true)
    blinkTimer = setInterval(() => setBlink((b) => !b), 530)
  }
  function stopBlink() {
    if (blinkTimer) clearInterval(blinkTimer)
    blinkTimer = null
  }
  onCleanup(() => stopBlink())

  // ── Selection helpers ──

  function hasSelection() {
    return selStart() >= 0 && selEnd() >= 0 && selStart() !== selEnd()
  }
  function selRange(): [number, number] {
    const s = selStart()
    const e = selEnd()
    return s < e ? [s, e] : [e, s]
  }
  function clearSelection() {
    setSelStart(-1)
    setSelEnd(-1)
  }
  function deleteSelection(): string {
    if (!hasSelection()) return props.value
    const [lo, hi] = selRange()
    const next = props.value.slice(0, lo) + props.value.slice(hi)
    setCursor(lo)
    clearSelection()
    return next
  }
  function selectAll() {
    setSelStart(0)
    setSelEnd(props.value.length)
    setCursor(props.value.length)
  }

  // ── Cursor movement ──

  /** Desired column when navigating up/down (sticky column) */
  let stickyCol = -1

  function moveCursor(offset: number, keepSelection?: boolean) {
    if (keepSelection) {
      if (!hasSelection()) setSelStart(cursor())
      setCursor(offset)
      setSelEnd(offset)
    } else {
      setCursor(offset)
      clearSelection()
    }
    stickyCol = -1
    props.onCursorChange?.(cursorPos().row, cursorPos().col)
    markDirty()
  }

  function moveVertical(delta: number, shift?: boolean) {
    const ls = lines()
    const pos = cursorPos()
    const targetRow = Math.max(0, Math.min(ls.length - 1, pos.row + delta))
    if (targetRow === pos.row) return

    const col = stickyCol >= 0 ? stickyCol : pos.col
    if (stickyCol < 0) stickyCol = pos.col

    const targetCol = Math.min(col, ls[targetRow].length)
    const newOffset = rowColToOffset(ls, targetRow, targetCol)

    if (shift) {
      if (!hasSelection()) setSelStart(cursor())
      setCursor(newOffset)
      setSelEnd(newOffset)
    } else {
      setCursor(newOffset)
      clearSelection()
    }
    props.onCursorChange?.(targetRow, targetCol)
    markDirty()
  }

  // ── Input handling ──

  const focusHandle = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      startBlink()

      const val = props.value
      const pos = cursor()
      const ls = lines()
      const rc = cursorPos()

      // Ctrl+Enter → submit
      if (e.key === "enter" && e.mods.ctrl) {
        props.onSubmit?.(val)
        return
      }

      // Enter → insert newline
      if (e.key === "enter") {
        let base = val
        let insertAt = pos
        if (hasSelection()) {
          base = deleteSelection()
          insertAt = cursor()
        }
        const next = base.slice(0, insertAt) + "\n" + base.slice(insertAt)
        moveCursor(insertAt + 1)
        props.onChange?.(next)
        return
      }

      // Ctrl+A → select all
      if (e.key === "a" && e.mods.ctrl) {
        selectAll()
        return
      }

      // Ctrl+Home → start of buffer
      if (e.key === "home" && e.mods.ctrl) {
        moveCursor(0, e.mods.shift)
        return
      }
      // Ctrl+End → end of buffer
      if (e.key === "end" && e.mods.ctrl) {
        moveCursor(val.length, e.mods.shift)
        return
      }

      // Up/Down
      if (e.key === "up") { moveVertical(-1, e.mods.shift); return }
      if (e.key === "down") { moveVertical(1, e.mods.shift); return }

      // PgUp/PgDown — move by ~10 lines
      if (e.key === "pageup") { moveVertical(-10, e.mods.shift); return }
      if (e.key === "pagedown") { moveVertical(10, e.mods.shift); return }

      // Home → start of line
      if (e.key === "home") {
        const lineStart = rowColToOffset(ls, rc.row, 0)
        moveCursor(lineStart, e.mods.shift)
        return
      }
      // End → end of line
      if (e.key === "end") {
        const lineEnd = rowColToOffset(ls, rc.row, ls[rc.row].length)
        moveCursor(lineEnd, e.mods.shift)
        return
      }

      // Left/Right
      if (e.key === "left") {
        if (!e.mods.shift && hasSelection()) {
          moveCursor(selRange()[0])
        } else if (pos > 0) {
          moveCursor(pos - 1, e.mods.shift)
        }
        return
      }
      if (e.key === "right") {
        if (!e.mods.shift && hasSelection()) {
          moveCursor(selRange()[1])
        } else if (pos < val.length) {
          moveCursor(pos + 1, e.mods.shift)
        }
        return
      }

      // Backspace
      if (e.key === "backspace") {
        if (hasSelection()) {
          props.onChange?.(deleteSelection())
        } else if (pos > 0) {
          const next = val.slice(0, pos - 1) + val.slice(pos)
          setCursor(pos - 1)
          props.onChange?.(next)
        }
        clearSelection()
        stickyCol = -1
        markDirty()
        return
      }

      // Delete
      if (e.key === "delete") {
        if (hasSelection()) {
          props.onChange?.(deleteSelection())
        } else if (pos < val.length) {
          const next = val.slice(0, pos) + val.slice(pos + 1)
          props.onChange?.(next)
        }
        clearSelection()
        stickyCol = -1
        markDirty()
        return
      }

      // Printable character → insert
      if (e.char && e.char.length === 1 && !e.mods.ctrl && !e.mods.alt && !e.mods.meta) {
        let base = val
        let insertAt = pos
        if (hasSelection()) {
          base = deleteSelection()
          insertAt = cursor()
        }
        const next = base.slice(0, insertAt) + e.char + base.slice(insertAt)
        moveCursor(insertAt + 1)
        props.onChange?.(next)
        return
      }
    },
  })

  // Handle paste events
  const unsubPaste = onInput((event) => {
    if (event.type !== "paste") return
    if (!focusHandle.focused()) return
    if (disabled()) return

    startBlink()
    let base = props.value
    let insertAt = cursor()
    if (hasSelection()) {
      base = deleteSelection()
      insertAt = cursor()
    }
    // Multi-line paste — DO NOT flatten newlines (unlike Input)
    const text = event.text
    const next = base.slice(0, insertAt) + text + base.slice(insertAt)
    moveCursor(insertAt + text.length)
    props.onChange?.(next)
  })
  onCleanup(() => unsubPaste())

  // ── Ref handle ──

  if (props.ref) {
    const handle: TextareaHandle = {
      get plainText() { return props.value },
      get cursorOffset() { return cursor() },
      get cursorRow() { return cursorPos().row },
      get cursorCol() { return cursorPos().col },

      setText(text: string) {
        props.onChange?.(text)
        moveCursor(text.length)
      },
      insertText(text: string) {
        let base = props.value
        let insertAt = cursor()
        if (hasSelection()) {
          base = deleteSelection()
          insertAt = cursor()
        }
        const next = base.slice(0, insertAt) + text + base.slice(insertAt)
        moveCursor(insertAt + text.length)
        props.onChange?.(next)
      },
      clear() {
        props.onChange?.("")
        moveCursor(0)
      },
      getTextRange(start: number, end: number) {
        return props.value.slice(start, end)
      },
      gotoBufferEnd() {
        moveCursor(props.value.length)
      },
      gotoLineEnd() {
        const ls = lines()
        const rc = cursorPos()
        moveCursor(rowColToOffset(ls, rc.row, ls[rc.row].length))
      },
      focus() {
        focusHandle.focus()
      },
    }
    props.ref(handle)
  }

  // ── Focus tracking ──

  const wasFocused = { current: false }
  const checkFocus = () => {
    const f = focusHandle.focused()
    if (f && !wasFocused.current) {
      startBlink()
      setCursor(props.value.length)
    } else if (!f && wasFocused.current) {
      stopBlink()
      clearSelection()
    }
    wasFocused.current = f
    return f
  }

  // ── Render ──

  const visibleLines = () => {
    const h = inputHeight() - spacing.md * 2
    return Math.floor(h / LINE_HEIGHT)
  }

  return (
    <box
      width={inputWidth()}
      height={inputHeight()}
      backgroundColor={disabled() ? surface.context : surface.card}
      cornerRadius={radius.md}
      borderColor={checkFocus() ? color() : border.normal}
      borderWidth={checkFocus() ? 2 : 1}
      padding={spacing.md}
      direction="column"
    >
      {/* Render lines */}
      {lines().slice(0, visibleLines()).map((line, rowIndex) => (
        <box height={LINE_HEIGHT} width="100%">
          <text
            color={line.length === 0 && rowIndex === 0 && !checkFocus()
              ? textTokens.muted
              : textTokens.primary}
            fontSize={14}
          >
            {line.length === 0 && rowIndex === 0 && !checkFocus()
              ? (props.placeholder ?? "")
              : line}
          </text>

          {/* Cursor on this line */}
          {checkFocus() && blink() && cursorPos().row === rowIndex ? (
            <box
              width={2}
              height={LINE_HEIGHT}
              backgroundColor={color()}
            />
          ) : null}
        </box>
      ))}
    </box>
  )
}
