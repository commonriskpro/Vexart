/**
 * Input — truly headless single-line text input.
 *
 * Handles editing, selection, paste, focus, and caret state while visuals are supplied by `renderInput`.
 *
 * @public
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, onInput } from "@vexart/engine"
import { useDisabled } from "../helpers/disabled"

// ── Types ──

/** @public */
export type InputRenderContext = {
  /** Current text value. */
  value: string
  /** Text to display (value or placeholder). */
  displayText: string
  /** Whether showing placeholder. */
  showPlaceholder: boolean
  /** Cursor position (character index). */
  cursor: number
  /** Whether the cursor blink is visible. */
  blink: boolean
  /** Whether the input is focused. */
  focused: boolean
  /** Whether the input is disabled. */
  disabled: boolean
  /** Selection range [start, end] or null. */
  selection: [number, number] | null
  /** Spread on the root element — adds focusable + click-to-focus support. */
  inputProps: {
    focusable: true
    onPress: () => void
  }
}

/** @public */
export type InputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  /** Render function — receives state, returns visual. */
  renderInput: (ctx: InputRenderContext) => JSX.Element
}

/** @public */
export function Input(props: InputProps) {
  const [cursor, setCursor] = createSignal(props.value.length)
  const [selStart, setSelStart] = createSignal(-1)
  const [selEnd, setSelEnd] = createSignal(-1)
  const [blink, setBlink] = createSignal(true)

  const disabled = useDisabled(props)

  createEffect(() => {
    const len = props.value.length
    if (cursor() > len) setCursor(len)
  })

  // ── Blink ──

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

  // ── Keyboard ──

  const { focused, focus } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      startBlink()

      const val = props.value
      const pos = cursor()

      if (e.key === "enter") { props.onSubmit?.(val); return }
      if (e.key === "a" && e.mods.ctrl) { selectAll(); return }

      // Shift+arrow selection
      if (e.mods.shift) {
        if (e.key === "left" && pos > 0) {
          if (!hasSelection()) setSelStart(pos)
          setCursor(pos - 1); setSelEnd(pos - 1); return
        }
        if (e.key === "right" && pos < val.length) {
          if (!hasSelection()) setSelStart(pos)
          setCursor(pos + 1); setSelEnd(pos + 1); return
        }
        if (e.key === "home") {
          if (!hasSelection()) setSelStart(pos)
          setCursor(0); setSelEnd(0); return
        }
        if (e.key === "end") {
          if (!hasSelection()) setSelStart(pos)
          setCursor(val.length); setSelEnd(val.length); return
        }
      }

      // Navigation
      if (e.key === "left") {
        if (hasSelection()) { setCursor(selRange()[0]); clearSelection() }
        else if (pos > 0) setCursor(pos - 1)
        return
      }
      if (e.key === "right") {
        if (hasSelection()) { setCursor(selRange()[1]); clearSelection() }
        else if (pos < val.length) setCursor(pos + 1)
        return
      }
      if (e.key === "home") { setCursor(0); clearSelection(); return }
      if (e.key === "end") { setCursor(val.length); clearSelection(); return }

      // Delete
      if (e.key === "backspace") {
        if (hasSelection()) { props.onChange?.(deleteSelection()) }
        else if (pos > 0) { setCursor(pos - 1); props.onChange?.(val.slice(0, pos - 1) + val.slice(pos)) }
        clearSelection(); return
      }
      if (e.key === "delete") {
        if (hasSelection()) { props.onChange?.(deleteSelection()) }
        else if (pos < val.length) { props.onChange?.(val.slice(0, pos) + val.slice(pos + 1)) }
        clearSelection(); return
      }

      // Printable character
      if (e.char && !e.mods.ctrl && !e.mods.alt && !e.mods.meta) {
        let base = val
        let insertAt = pos
        if (hasSelection()) { base = deleteSelection(); insertAt = cursor() }
        const next = base.slice(0, insertAt) + e.char + base.slice(insertAt)
        setCursor(insertAt + 1)
        clearSelection()
        props.onChange?.(next)
        return
      }
    },
  })

  // ── Paste ──

  const unsubPaste = onInput((event) => {
    if (event.type !== "paste" || !focused() || disabled()) return
    startBlink()
    let base = props.value
    let insertAt = cursor()
    if (hasSelection()) { base = deleteSelection(); insertAt = cursor() }
    const text = event.text.replace(/[\r\n\t]/g, " ")
    const next = base.slice(0, insertAt) + text + base.slice(insertAt)
    setCursor(insertAt + text.length)
    clearSelection()
    props.onChange?.(next)
  })
  onCleanup(() => unsubPaste())

  // ── Focus blink management ──

  const wasFocused = { current: false }

  const checkFocus = () => {
    const f = focused()
    if (f && !wasFocused.current) { startBlink(); setCursor(props.value.length) }
    else if (!f && wasFocused.current) { stopBlink(); clearSelection() }
    wasFocused.current = f
    return f
  }

  // ── Render context ──

  const showPlaceholder = () => props.value.length === 0 && !focused()

  return (
    <>
      {() => props.renderInput({
        value: props.value,
        displayText: showPlaceholder() ? (props.placeholder ?? "") : props.value,
        showPlaceholder: showPlaceholder(),
        cursor: cursor(),
        blink: blink(),
        focused: checkFocus(),
        disabled: disabled(),
        selection: hasSelection() ? selRange() : null,
        inputProps: {
          focusable: true,
          onPress: () => { if (!disabled()) focus() },
        },
      })}
    </>
  )
}
