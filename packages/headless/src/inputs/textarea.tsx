/**
 * Textarea — multiline text editor for Vexart.
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

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import {
  useFocus,
  onInput,
  markDirty,
  setFocusedId,
  ExtmarkManager,
  type Extmark,
  type SyntaxStyle,
  type Token,
  getTreeSitterClient,
  highlightsToTokens,
} from "@vexart/engine"
import type { KeyEvent } from "@vexart/engine"

// ── Theme type ──

/** @public */
export type TextareaTheme = {
  /** Accent color (cursor, focused border). */
  accent: string | number
  /** Primary text color. */
  fg: string | number
  /** Muted text color (placeholder, ghost text). */
  muted: string | number
  /** Background when enabled. */
  bg: string | number
  /** Background when disabled. */
  disabledBg: string | number
  /** Border color when unfocused. */
  border: string | number
  /** Corner radius. */
  radius: number
  /** Inner padding. */
  padding: number
}

const TEXTAREA_DEFAULTS: TextareaTheme = {
  accent: 0x56d4c8ff,
  fg: 0xe0e0e0ff,
  muted: 0x888888ff,
  bg: 0x1e1e2eff,
  disabledBg: 0x1a1a2eff,
  border: 0xffffff26,
  radius: 4,
  padding: 8,
}

const CHAR_WIDTH = 9
const LINE_HEIGHT = 17

// ── KeyBinding system ──

export const KEY_BINDING_ACTION = {
  CURSOR_LEFT: "cursor-left",
  CURSOR_RIGHT: "cursor-right",
  CURSOR_UP: "cursor-up",
  CURSOR_DOWN: "cursor-down",
  LINE_START: "line-start",
  LINE_END: "line-end",
  BUFFER_START: "buffer-start",
  BUFFER_END: "buffer-end",
  PAGE_UP: "page-up",
  PAGE_DOWN: "page-down",
  DELETE_BACK: "delete-back",
  DELETE_FORWARD: "delete-forward",
  SELECT_ALL: "select-all",
  NEWLINE: "newline",
  SUBMIT: "submit",
} as const

/** @public */
export type KeyBindingAction = (typeof KEY_BINDING_ACTION)[keyof typeof KEY_BINDING_ACTION]

/** @public */
export type KeyBinding = {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  action: KeyBindingAction
}

const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  { key: "left", action: KEY_BINDING_ACTION.CURSOR_LEFT },
  { key: "right", action: KEY_BINDING_ACTION.CURSOR_RIGHT },
  { key: "up", action: KEY_BINDING_ACTION.CURSOR_UP },
  { key: "down", action: KEY_BINDING_ACTION.CURSOR_DOWN },
  { key: "home", action: KEY_BINDING_ACTION.LINE_START },
  { key: "end", action: KEY_BINDING_ACTION.LINE_END },
  { key: "home", ctrl: true, action: KEY_BINDING_ACTION.BUFFER_START },
  { key: "end", ctrl: true, action: KEY_BINDING_ACTION.BUFFER_END },
  { key: "pageup", action: KEY_BINDING_ACTION.PAGE_UP },
  { key: "pagedown", action: KEY_BINDING_ACTION.PAGE_DOWN },
  { key: "backspace", action: KEY_BINDING_ACTION.DELETE_BACK },
  { key: "delete", action: KEY_BINDING_ACTION.DELETE_FORWARD },
  { key: "a", ctrl: true, action: KEY_BINDING_ACTION.SELECT_ALL },
  { key: "enter", ctrl: true, action: KEY_BINDING_ACTION.SUBMIT },
  { key: "enter", action: KEY_BINDING_ACTION.NEWLINE },
]

function matchesBinding(e: KeyEvent, b: KeyBinding): boolean {
  if (e.key !== b.key) return false
  if (b.ctrl && !e.mods.ctrl) return false
  if (!b.ctrl && e.mods.ctrl) return false
  if (b.shift && !e.mods.shift) return false
  if (b.alt && !e.mods.alt) return false
  if (b.meta && !e.mods.meta) return false
  return true
}

function mergeKeyBindings(defaults: KeyBinding[], overrides: KeyBinding[]): KeyBinding[] {
  const merged = [...defaults]
  for (const override of overrides) {
    const idx = merged.findIndex((b) =>
      b.key === override.key &&
      !!b.ctrl === !!override.ctrl &&
      !!b.shift === !!override.shift &&
      !!b.alt === !!override.alt &&
      !!b.meta === !!override.meta
    )
    if (idx >= 0) {
      merged[idx] = override
    } else {
      merged.push(override)
    }
  }
  return merged
}

// ── VisualCursor ──

/** @public */
export type VisualCursor = {
  /** Absolute offset from buffer start */
  readonly offset: number
  /** Row (0-indexed) */
  readonly row: number
  /** Column (0-indexed) */
  readonly col: number
}

// ── TextareaHandle — imperative ref API ──

/** @public */
export type TextareaHandle = {
  /** Full text content */
  readonly plainText: string
  /** Absolute cursor offset (char index from start) */
  readonly cursorOffset: number
  /** Cursor row (0-indexed) */
  readonly cursorRow: number
  /** Cursor column (0-indexed) */
  readonly cursorCol: number
  /** Visual cursor with offset, row, col */
  readonly visualCursor: VisualCursor
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
  /** Remove focus from the textarea */
  blur: () => void
  /** Cursor color used to render the caret. */
  get cursorColor(): string | number
  set cursorColor(color: string | number)
  /** Access the extmarks manager for this textarea */
  readonly extmarks: ExtmarkManager
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

/** @public */
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

  /**
   * Called on every key event BEFORE internal handling.
   * Return nothing to let default handling proceed.
   * The handler can call event-specific logic or preventDefault-style
   * by consuming the event in onChange.
   */
  onKeyDown?: (event: KeyEvent) => void

  /** Called on paste events. */
  onPaste?: (text: string) => void

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

  /** Custom key bindings — merged with defaults. */
  keyBindings?: KeyBinding[]

  /** Syntax highlighting style. When set, enables per-token coloring. */
  syntaxStyle?: SyntaxStyle

  /** Language for syntax highlighting (e.g. "typescript"). Required with syntaxStyle. */
  language?: string

  /** Visual theme — all styling comes from here. */
  theme?: Partial<TextareaTheme>
}

// ── Component ──

/** @public */
export function Textarea(props: TextareaProps) {
  const [cursor, setCursor] = createSignal(props.value.length)
  const [selStart, setSelStart] = createSignal(-1)
  const [selEnd, setSelEnd] = createSignal(-1)
  const [blink, setBlink] = createSignal(true)
  const [cursorColorSignal, setCursorColorSignal] = createSignal<string | number>(0)
  const [syntaxTokens, setSyntaxTokens] = createSignal<Token[][]>([])
  const [viewportRow, setViewportRow] = createSignal(0)

  const th = () => ({ ...TEXTAREA_DEFAULTS, ...props.theme })
  const color = () => cursorColorSignal() || props.color || th().accent
  const disabled = () => props.disabled ?? false
  const inputWidth = () => props.width ?? 400
  const inputHeight = () => props.height ?? 200
  const visibleLines = () => {
    const h = inputHeight() - th().padding * 2
    return Math.floor(h / LINE_HEIGHT)
  }

  // Extmarks manager — one per textarea instance
  const extmarkMgr = new ExtmarkManager()

  // Merged key bindings
  const bindings = () =>
    props.keyBindings
      ? mergeKeyBindings(DEFAULT_KEY_BINDINGS, props.keyBindings)
      : DEFAULT_KEY_BINDINGS

  // Derived line state
  const lines = () => textToLines(props.value)
  const cursorPos = () => offsetToRowCol(lines(), cursor())

  function ensureCursorVisible() {
    const rc = offsetToRowCol(lines(), cursor())
    const vr = viewportRow()
    const vl = visibleLines()
    if (rc.row < vr) {
      setViewportRow(rc.row)
      return
    }
    if (rc.row >= vr + vl) setViewportRow(rc.row - vl + 1)
  }

  // ── Syntax highlighting ──

  createEffect(() => {
    const style = props.syntaxStyle
    const lang = props.language
    const content = props.value
    if (!style || !lang) {
      setSyntaxTokens([])
      return
    }

    // Immediate fallback — default color
    const fallback = content.split("\n").map((line) => [{ text: line, color: style.getDefaultColor() }])
    setSyntaxTokens(fallback)

    // Async highlight via tree-sitter worker
    const client = getTreeSitterClient()
    let cancelled = false
    client.highlightOnce(content, lang).then((highlights) => {
      if (cancelled) return
      const result = highlightsToTokens(content, highlights, style)
      setSyntaxTokens(result)
      markDirty()
    })
    onCleanup(() => { cancelled = true })
  })

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
    ensureCursorVisible()
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
    ensureCursorVisible()
    markDirty()
  }

  // ── Action dispatcher ──

  function executeAction(action: KeyBindingAction, e: KeyEvent) {
    const val = props.value
    const pos = cursor()
    const ls = lines()
    const rc = cursorPos()

    switch (action) {
      case KEY_BINDING_ACTION.SUBMIT:
        props.onSubmit?.(val)
        return
      case KEY_BINDING_ACTION.NEWLINE: {
        let base = val
        let insertAt = pos
        if (hasSelection()) { base = deleteSelection(); insertAt = cursor() }
        const next = base.slice(0, insertAt) + "\n" + base.slice(insertAt)
        moveCursor(insertAt + 1)
        props.onChange?.(next)
        return
      }
      case KEY_BINDING_ACTION.SELECT_ALL:
        selectAll()
        return
      case KEY_BINDING_ACTION.BUFFER_START:
        moveCursor(0, e.mods.shift)
        return
      case KEY_BINDING_ACTION.BUFFER_END:
        moveCursor(val.length, e.mods.shift)
        return
      case KEY_BINDING_ACTION.CURSOR_UP:
        moveVertical(-1, e.mods.shift)
        return
      case KEY_BINDING_ACTION.CURSOR_DOWN:
        moveVertical(1, e.mods.shift)
        return
      case KEY_BINDING_ACTION.PAGE_UP:
        moveVertical(-10, e.mods.shift)
        return
      case KEY_BINDING_ACTION.PAGE_DOWN:
        moveVertical(10, e.mods.shift)
        return
      case KEY_BINDING_ACTION.LINE_START:
        moveCursor(rowColToOffset(ls, rc.row, 0), e.mods.shift)
        return
      case KEY_BINDING_ACTION.LINE_END:
        moveCursor(rowColToOffset(ls, rc.row, ls[rc.row].length), e.mods.shift)
        return
      case KEY_BINDING_ACTION.CURSOR_LEFT:
        if (!e.mods.shift && hasSelection()) { moveCursor(selRange()[0]) }
        else if (pos > 0) { moveCursor(pos - 1, e.mods.shift) }
        return
      case KEY_BINDING_ACTION.CURSOR_RIGHT:
        if (!e.mods.shift && hasSelection()) { moveCursor(selRange()[1]) }
        else if (pos < val.length) { moveCursor(pos + 1, e.mods.shift) }
        return
      case KEY_BINDING_ACTION.DELETE_BACK:
        if (hasSelection()) { props.onChange?.(deleteSelection()) }
        else if (pos > 0) { setCursor(pos - 1); props.onChange?.(val.slice(0, pos - 1) + val.slice(pos)) }
        clearSelection(); stickyCol = -1; markDirty()
        return
      case KEY_BINDING_ACTION.DELETE_FORWARD:
        if (hasSelection()) { props.onChange?.(deleteSelection()) }
        else if (pos < val.length) { props.onChange?.(val.slice(0, pos) + val.slice(pos + 1)) }
        clearSelection(); stickyCol = -1; markDirty()
        return
    }
  }

  // ── Input handling ──

  const focusHandle = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      startBlink()

      // Call user's onKeyDown first
      props.onKeyDown?.(e)

      // Match against key bindings
      const activeBindings = bindings()
      for (const binding of activeBindings) {
        if (matchesBinding(e, binding)) {
          executeAction(binding.action, e)
          ensureCursorVisible()
          return
        }
      }

      // Printable character → insert
      if (e.char && !e.mods.ctrl && !e.mods.alt && !e.mods.meta) {
        let base = props.value
        let insertAt = cursor()
        if (hasSelection()) { base = deleteSelection(); insertAt = cursor() }
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
    props.onPaste?.(event.text)

    let base = props.value
    let insertAt = cursor()
    if (hasSelection()) { base = deleteSelection(); insertAt = cursor() }
    const text = event.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const next = base.slice(0, insertAt) + text + base.slice(insertAt)
    moveCursor(insertAt + text.length)
    ensureCursorVisible()
    props.onChange?.(next)
  })
  onCleanup(() => unsubPaste())

  // ── Ref handle ──

  let _cursorColor: string | number = 0

  if (props.ref) {
    const handle: TextareaHandle = {
      get plainText() { return props.value },
      get cursorOffset() { return cursor() },
      get cursorRow() { return cursorPos().row },
      get cursorCol() { return cursorPos().col },
      get visualCursor(): VisualCursor {
        return { offset: cursor(), row: cursorPos().row, col: cursorPos().col }
      },

      setText(text: string) {
        props.onChange?.(text)
        moveCursor(text.length)
      },
      insertText(text: string) {
        let base = props.value
        let insertAt = cursor()
        if (hasSelection()) { base = deleteSelection(); insertAt = cursor() }
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
      blur() {
        if (focusHandle.focused()) {
          setFocusedId(null)
          markDirty()
        }
      },
      set cursorColor(c: string | number) {
        _cursorColor = c
        setCursorColorSignal(c)
        markDirty()
      },
      get cursorColor(): string | number {
        return _cursorColor || (props.color ?? th().accent)
      },
      get extmarks(): ExtmarkManager {
        return extmarkMgr
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

  // ── Line rendering with syntax + extmarks ──

  function renderLine(line: string, rowIndex: number, lineStart: number): JSX.Element {
    const isCursorLine = checkFocus() && cursorPos().row === rowIndex
    const col = cursorPos().col
    const showPH = line.length === 0 && rowIndex === 0 && !checkFocus()

    // Get tokens for this line (syntax highlighting)
    const lineTokens = syntaxTokens()[rowIndex]

    // Get extmarks overlapping this line
    const lineEnd = lineStart + line.length
    const lineExtmarks = extmarkMgr.getForLine(lineStart, lineEnd)

    // Determine token colors for each character
    function getCharColor(charIdx: number): string | number {
      // Extmarks take priority over syntax tokens
      for (const em of lineExtmarks) {
        const emStart = em.start - lineStart
        const emEnd = em.end - lineStart
        if (charIdx >= emStart && charIdx < emEnd) {
          if (em.fg) return em.fg
        }
      }
      // Fall back to syntax tokens
      if (lineTokens) {
        let pos = 0
        for (const tok of lineTokens) {
          const end = pos + tok.text.length
          if (charIdx >= pos && charIdx < end) return tok.color
          pos = end
        }
      }
      return th().fg
    }

    // Ghost text from extmarks
    const ghostMarks = lineExtmarks.filter((em) => em.ghost && em.start - lineStart === col)
    const ghostText = ghostMarks.length > 0
      ? (ghostMarks[0].data?.text as string) ?? ""
      : ""

    if (showPH) {
      return (
        <box height={LINE_HEIGHT} width="100%">
          <text color={th().muted} fontSize={14}>
            {props.placeholder ?? ""}
          </text>
        </box>
      )
    }

    // Build colored segments — group consecutive chars with same color
    type Segment = { text: string; color: string | number }
    const segments: Segment[] = []
    if (lineTokens && lineTokens.length > 0 && !lineExtmarks.length) {
      // Fast path: use syntax tokens directly
      for (const tok of lineTokens) {
        segments.push({ text: tok.text, color: tok.color })
      }
    } else if (line.length > 0) {
      let segStart = 0
      let segColor = getCharColor(0)
      for (let i = 1; i <= line.length; i++) {
        const c = i < line.length ? getCharColor(i) : -1
        if (c !== segColor) {
          segments.push({ text: line.slice(segStart, i), color: segColor })
          segStart = i
          segColor = c
        }
      }
    }

    if (isCursorLine) {
      // Split segments at cursor position to insert cursor box
      const beforeSegments: Segment[] = []
      const afterSegments: Segment[] = []
      let charCount = 0

      for (const seg of segments) {
        const segEnd = charCount + seg.text.length
        if (segEnd <= col) {
          beforeSegments.push(seg)
        } else if (charCount >= col) {
          afterSegments.push(seg)
        } else {
          // Split this segment at cursor
          const splitAt = col - charCount
          beforeSegments.push({ text: seg.text.slice(0, splitAt), color: seg.color })
          afterSegments.push({ text: seg.text.slice(splitAt), color: seg.color })
        }
        charCount = segEnd
      }

      return (
        <box height={LINE_HEIGHT} width="100%">
          {beforeSegments.map((seg) => (
            <text color={seg.color} fontSize={14}>{seg.text}</text>
          ))}
          {blink() ? (
            <box width={2} height={LINE_HEIGHT} backgroundColor={color()} />
          ) : null}
          {ghostText ? (
            <text color={th().muted} fontSize={14}>{ghostText}</text>
          ) : null}
          {afterSegments.map((seg) => (
            <text color={seg.color} fontSize={14}>{seg.text}</text>
          ))}
        </box>
      )
    }

    // Non-cursor line
    return (
      <box height={LINE_HEIGHT} width="100%">
        {segments.length > 0
          ? segments.map((seg) => (
              <text color={seg.color} fontSize={14}>{seg.text}</text>
            ))
          : <text color={th().fg} fontSize={14}>{line}</text>
        }
      </box>
    )
  }

  // ── Render ──

  return (
    <box
      width={inputWidth()}
      height={inputHeight()}
      backgroundColor={disabled() ? th().disabledBg : th().bg}
      cornerRadius={th().radius}
      borderColor={checkFocus() ? color() : th().border}
      borderWidth={checkFocus() ? 2 : 1}
      padding={th().padding}
      direction="column"
    >
      {() => {
        const ls = lines()
        const start = viewportRow()
        let offset = 0
        for (let i = 0; i < start; i++) {
          offset += ls[i].length + 1
        }
        const result: JSX.Element[] = []
        for (let i = start; i < Math.min(ls.length, start + visibleLines()); i++) {
          result.push(renderLine(ls[i], i, offset))
          offset += ls[i].length + 1 // +1 for newline
        }
        return result
      }}
    </box>
  )
}
