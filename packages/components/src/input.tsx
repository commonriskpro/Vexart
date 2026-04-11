/**
 * Input — text input field for TGE.
 *
 * Focus-aware with full keyboard editing:
 *   - Printable chars: insert at cursor
 *   - Backspace/Delete: remove char
 *   - Left/Right: move cursor
 *   - Home/End: jump to start/end
 *   - Shift+Left/Right/Home/End: select text
 *   - Ctrl+A: select all
 *   - Ctrl+V / bracketed paste: insert clipboard
 *   - Typing with active selection replaces it
 *
 * CONTROLLED component — parent owns value state.
 * The input calls onChange with the new string value.
 *
 * The cursor is rendered as a colored box at the character position.
 * Font is monospace (9px per char at 14px size) so cursor position
 * is calculated as cursorIndex * charWidth.
 *
 * Usage:
 *   const [name, setName] = createSignal("")
 *   <Input
 *     value={name()}
 *     onChange={setName}
 *     placeholder="Enter your name..."
 *   />
 */

import { createSignal, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, onInput } from "@tge/renderer"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
  alpha,
} from "@tge/tokens"

/** Char width at 14px font size (SF Mono atlas: 9px per glyph). */
const CHAR_WIDTH = 9
/** Line height matching the font atlas cell height. */
const LINE_HEIGHT = 17

export type InputProps = {
  /** Current text value. */
  value: string

  /** Called with the new value on every edit. */
  onChange?: (value: string) => void

  /** Called when Enter is pressed. Use for form submission. */
  onSubmit?: (value: string) => void

  /** Placeholder text shown when value is empty. */
  placeholder?: string

  /** Width of the input in pixels. Default: 200. */
  width?: number

  /** Accent color for the focused border and cursor. Default: accent.thread. */
  color?: number

  /** Disabled state. */
  disabled?: boolean

  /** Focus ID override. */
  focusId?: string
}

export function Input(props: InputProps) {
  const [cursor, setCursor] = createSignal(props.value.length)
  const [selStart, setSelStart] = createSignal(-1) // -1 = no selection
  const [selEnd, setSelEnd] = createSignal(-1)
  const [blink, setBlink] = createSignal(true)

  const color = () => props.color ?? accent.thread
  const disabled = () => props.disabled ?? false
  const inputWidth = () => props.width ?? 200

  // Blink cursor every 530ms when focused
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

  // ── Input handling ──

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return

      // Reset blink on any key
      startBlink()

      const val = props.value
      const pos = cursor()

      // Enter → submit
      if (e.key === "enter") {
        props.onSubmit?.(val)
        return
      }

      // Ctrl+A → select all
      if (e.key === "a" && e.mods.ctrl) {
        selectAll()
        return
      }

      // Shift+arrow selection
      if (e.mods.shift) {
        if (e.key === "left" && pos > 0) {
          if (!hasSelection()) setSelStart(pos)
          setCursor(pos - 1)
          setSelEnd(pos - 1)
          return
        }
        if (e.key === "right" && pos < val.length) {
          if (!hasSelection()) setSelStart(pos)
          setCursor(pos + 1)
          setSelEnd(pos + 1)
          return
        }
        if (e.key === "home") {
          if (!hasSelection()) setSelStart(pos)
          setCursor(0)
          setSelEnd(0)
          return
        }
        if (e.key === "end") {
          if (!hasSelection()) setSelStart(pos)
          setCursor(val.length)
          setSelEnd(val.length)
          return
        }
      }

      // Navigation (clears selection)
      if (e.key === "left") {
        if (hasSelection()) {
          setCursor(selRange()[0])
          clearSelection()
        } else if (pos > 0) {
          setCursor(pos - 1)
        }
        return
      }
      if (e.key === "right") {
        if (hasSelection()) {
          setCursor(selRange()[1])
          clearSelection()
        } else if (pos < val.length) {
          setCursor(pos + 1)
        }
        return
      }
      if (e.key === "home") {
        setCursor(0)
        clearSelection()
        return
      }
      if (e.key === "end") {
        setCursor(val.length)
        clearSelection()
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
        return
      }

      // Printable character → insert (or replace selection)
      if (e.char && e.char.length === 1 && !e.mods.ctrl && !e.mods.alt && !e.mods.meta) {
        let base = val
        let insertAt = pos
        if (hasSelection()) {
          base = deleteSelection()
          insertAt = cursor() // deleteSelection updates cursor
        }
        const next = base.slice(0, insertAt) + e.char + base.slice(insertAt)
        setCursor(insertAt + 1)
        clearSelection()
        props.onChange?.(next)
        return
      }
    },
  })

  // Handle paste events (from bracketed paste)
  const unsubPaste = onInput((event) => {
    if (event.type !== "paste") return
    if (!focused()) return
    if (disabled()) return

    startBlink()
    let base = props.value
    let insertAt = cursor()
    if (hasSelection()) {
      base = deleteSelection()
      insertAt = cursor()
    }
    const text = event.text.replace(/\n/g, " ") // flatten newlines
    const next = base.slice(0, insertAt) + text + base.slice(insertAt)
    setCursor(insertAt + text.length)
    clearSelection()
    props.onChange?.(next)
  })
  onCleanup(() => unsubPaste())

  // Start/stop blink based on focus
  // We check focus reactively by reading focused() in a derived signal
  const wasFocused = { current: false }

  // ── Visual state ──

  const showPlaceholder = () => props.value.length === 0 && !focused()
  const displayText = () => {
    if (showPlaceholder()) return props.placeholder ?? ""
    return props.value
  }

  const cursorX = () => cursor() * CHAR_WIDTH

  // Selection highlight — rendered as a colored box behind the text
  const selectionBox = () => {
    if (!hasSelection() || !focused()) return null
    const [lo, hi] = selRange()
    return {
      x: lo * CHAR_WIDTH,
      w: (hi - lo) * CHAR_WIDTH,
    }
  }

  // Manage blink timer with focus
  const checkFocus = () => {
    const f = focused()
    if (f && !wasFocused.current) {
      startBlink()
      // Move cursor to end when focusing
      setCursor(props.value.length)
    } else if (!f && wasFocused.current) {
      stopBlink()
      clearSelection()
    }
    wasFocused.current = f
    return f
  }

  return (
    <box
      width={inputWidth()}
      height={LINE_HEIGHT + spacing.md * 2}
      backgroundColor={disabled() ? surface.context : surface.card}
      cornerRadius={radius.md}
      borderColor={checkFocus() ? color() : border.normal}
      borderWidth={checkFocus() ? 2 : 1}
      padding={spacing.md}
    >
      {/* Selection highlight */}
      {selectionBox() ? (
        <box
          width={selectionBox()!.w}
          height={LINE_HEIGHT}
          backgroundColor={alpha(color(), 0x44)}
        />
      ) : null}

      {/* Text content */}
      <text
        color={showPlaceholder() ? textTokens.muted : textTokens.primary}
        fontSize={14}
      >
        {displayText()}
      </text>

      {/* Cursor — thin box (only when focused + blink on) */}
      {checkFocus() && blink() ? (
        <box
          width={2}
          height={LINE_HEIGHT}
          backgroundColor={color()}
        />
      ) : null}
    </box>
  )
}
