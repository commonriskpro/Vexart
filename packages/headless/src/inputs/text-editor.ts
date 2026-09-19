/**
 * Shared text editing engine for Input and Textarea.
 *
 * Manages cursor positioning, selection ranges, text insertion,
 * code-point boundary deletions, blink state, and undo/redo history.
 *
 * @public
 */

import { createSignal, createMemo, createComputed, untrack, onCleanup, type Accessor } from "solid-js"
import { previousCodePointOffset, nextCodePointOffset } from "./text-offset"

export { previousCodePointOffset, nextCodePointOffset } from "./text-offset"

/** @public */
export type TextEditorOptions = {
  /** Current text value, or reactive accessor returning the value. */
  value: string | (() => string)
  /** Called when text changes through editor operations. */
  onChange?: (value: string) => void
  /** Initial cursor position. Defaults to value length. */
  initialCursor?: number
  /** Whether single-line mode is enforced (collapses newlines and tabs to space). Default: false. */
  singleLine?: boolean
  /** Maximum undo/redo history stack size. Default: 100. */
  maxHistory?: number
  /** Blink interval in milliseconds. Default: 530. */
  blinkInterval?: number
}

type HistoryEntry = {
  value: string
  cursor: number
  selStart: number
  selEnd: number
}

/** @public */
export type TextEditorReturn = {
  /** Reactive accessor for cursor position (offset from buffer start). */
  cursor: Accessor<number>
  /** Set cursor position, clamped within [0, text.length]. */
  setCursor: (pos: number) => void
  /** Reactive accessor for normalized selection range [start, end] or null. */
  selection: Accessor<[number, number] | null>
  /** Raw selection start offset (-1 if inactive). */
  selStart: Accessor<number>
  /** Raw selection end offset (-1 if inactive). */
  selEnd: Accessor<number>
  /** Set raw selection start offset. */
  setSelStart: (pos: number) => void
  /** Set raw selection end offset. */
  setSelEnd: (pos: number) => void
  /** Returns true if there is an active selection range. */
  hasSelection: () => boolean
  /** Returns normalized [min, max] selection range. */
  selRange: () => [number, number]
  /** Programmatically set selection range or null to clear. */
  setSelection: (range: [number, number] | null) => void
  /** Select all text. */
  selectAll: () => void
  /** Clear active selection. */
  clearSelection: () => void
  /** Delete active selection and return resulting string without committing. */
  deleteSelection: () => string
  /** Insert text at cursor, replacing selection if active. */
  insertText: (text: string) => void
  /** Delete backward (backspace) on code point boundary or remove selection. */
  deleteBackward: () => void
  /** Delete forward (delete) on code point boundary or remove selection. */
  deleteForward: () => void
  /** Reactive accessor for cursor blink state. */
  blink: Accessor<boolean>
  /** Start or restart blinking. */
  startBlink: () => void
  /** Stop blinking. */
  stopBlink: () => void
  /** Undo last edit. */
  undo: () => void
  /** Redo last undone edit. */
  redo: () => void
  /** True if undo is available. */
  canUndo: Accessor<boolean>
  /** True if redo is available. */
  canRedo: Accessor<boolean>
}

/**
 * Shared hook managing text editing primitives for singleline and multiline inputs.
 *
 * @public
 */
export function createTextEditor(options: TextEditorOptions): TextEditorReturn {
  const getValue = () => (typeof options.value === "function" ? options.value() : options.value)

  const initialVal = getValue()
  const initialCursor =
    options.initialCursor !== undefined
      ? Math.max(0, Math.min(options.initialCursor, initialVal.length))
      : initialVal.length

  const [cursor, setCursorInternal] = createSignal(initialCursor)
  const [selStart, setSelStart] = createSignal(-1)
  const [selEnd, setSelEnd] = createSignal(-1)
  const [blink, setBlink] = createSignal(true)

  const [canUndo, setCanUndo] = createSignal(false)
  const [canRedo, setCanRedo] = createSignal(false)

  const undoStack: HistoryEntry[] = []
  const redoStack: HistoryEntry[] = []
  const maxHistory = options.maxHistory ?? 100
  const blinkInterval = options.blinkInterval ?? 530

  function setCursor(pos: number) {
    const len = getValue().length
    setCursorInternal(Math.max(0, Math.min(pos, len)))
  }

  // Keep cursor clamped if value length shrinks
  createComputed(() => {
    const len = getValue().length
    if (untrack(cursor) > len) {
      setCursorInternal(len)
    }
  })

  // ── Blink ──
  let blinkTimer: ReturnType<typeof setInterval> | null = null

  function startBlink() {
    stopBlink()
    setBlink(true)
    blinkTimer = setInterval(() => setBlink((b) => !b), blinkInterval)
  }

  function stopBlink() {
    if (blinkTimer) {
      clearInterval(blinkTimer)
      blinkTimer = null
    }
  }

  onCleanup(() => stopBlink())

  // ── Selection helpers ──
  function hasSelection(): boolean {
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

  function setSelection(range: [number, number] | null) {
    if (!range) {
      clearSelection()
      return
    }
    const len = getValue().length
    const s = Math.max(0, Math.min(range[0], len))
    const e = Math.max(0, Math.min(range[1], len))
    setSelStart(s)
    setSelEnd(e)
  }

  const selection = createMemo<[number, number] | null>(() => {
    return hasSelection() ? selRange() : null
  })

  function selectAll() {
    const len = getValue().length
    setSelStart(0)
    setSelEnd(len)
    setCursorInternal(len)
  }

  // ── History (Undo / Redo) ──
  function pushHistory(val: string, cur: number, sStart: number, sEnd: number) {
    undoStack.push({ value: val, cursor: cur, selStart: sStart, selEnd: sEnd })
    if (undoStack.length > maxHistory) {
      undoStack.shift()
    }
    redoStack.length = 0
    setCanUndo(true)
    setCanRedo(false)
  }

  function undo() {
    if (undoStack.length === 0) return
    const currentEntry: HistoryEntry = {
      value: getValue(),
      cursor: cursor(),
      selStart: selStart(),
      selEnd: selEnd(),
    }
    redoStack.push(currentEntry)
    const prev = undoStack.pop()!
    setCanUndo(undoStack.length > 0)
    setCanRedo(true)
    setCursorInternal(prev.cursor)
    setSelStart(prev.selStart)
    setSelEnd(prev.selEnd)
    options.onChange?.(prev.value)
  }

  function redo() {
    if (redoStack.length === 0) return
    const currentEntry: HistoryEntry = {
      value: getValue(),
      cursor: cursor(),
      selStart: selStart(),
      selEnd: selEnd(),
    }
    undoStack.push(currentEntry)
    const next = redoStack.pop()!
    setCanUndo(true)
    setCanRedo(redoStack.length > 0)
    setCursorInternal(next.cursor)
    setSelStart(next.selStart)
    setSelEnd(next.selEnd)
    options.onChange?.(next.value)
  }

  // ── Deletion and Insertion ──
  function deleteSelection(): string {
    if (!hasSelection()) return getValue()
    const val = getValue()
    const [lo, hi] = selRange()
    const next = val.slice(0, lo) + val.slice(hi)
    setCursorInternal(lo)
    clearSelection()
    return next
  }

  function insertText(text: string) {
    const clean = options.singleLine ? text.replace(/[\r\n\t]/g, " ") : text
    const val = getValue()
    let base = val
    let insertAt = cursor()

    if (hasSelection()) {
      pushHistory(val, cursor(), selStart(), selEnd())
      const [lo, hi] = selRange()
      base = val.slice(0, lo) + val.slice(hi)
      insertAt = lo
      clearSelection()
    } else {
      pushHistory(val, cursor(), selStart(), selEnd())
    }

    const next = base.slice(0, insertAt) + clean + base.slice(insertAt)
    const nextPos = insertAt + clean.length
    options.onChange?.(next)
    setCursorInternal(nextPos)
  }

  function deleteBackward() {
    const val = getValue()
    const pos = cursor()
    if (hasSelection()) {
      pushHistory(val, pos, selStart(), selEnd())
      const next = deleteSelection()
      options.onChange?.(next)
      return
    }
    if (pos > 0) {
      pushHistory(val, pos, selStart(), selEnd())
      const start = previousCodePointOffset(val, pos)
      const next = val.slice(0, start) + val.slice(pos)
      clearSelection()
      options.onChange?.(next)
      setCursorInternal(start)
    }
  }

  function deleteForward() {
    const val = getValue()
    const pos = cursor()
    if (hasSelection()) {
      pushHistory(val, pos, selStart(), selEnd())
      const next = deleteSelection()
      options.onChange?.(next)
      return
    }
    if (pos < val.length) {
      pushHistory(val, pos, selStart(), selEnd())
      const end = nextCodePointOffset(val, pos)
      const next = val.slice(0, pos) + val.slice(end)
      clearSelection()
      options.onChange?.(next)
    }
  }

  return {
    cursor,
    setCursor,
    selection,
    selStart,
    selEnd,
    setSelStart,
    setSelEnd,
    hasSelection,
    selRange,
    setSelection,
    selectAll,
    clearSelection,
    deleteSelection,
    insertText,
    deleteBackward,
    deleteForward,
    blink,
    startBlink,
    stopBlink,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
