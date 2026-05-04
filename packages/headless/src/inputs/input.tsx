/**
 * Input — single-line text input with built-in cursor rendering.
 *
 * Two modes:
 *   1. **Self-rendering** (default): renders its own visual with a native
 *      block cursor, styled via `theme`. Same pattern as Textarea.
 *   2. **Headless**: pass `renderInput` to take full control of visuals.
 *      The cursor/blink state is exposed in the render context.
 *
 * @public
 */

import { createSignal, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, onInput } from "@vexart/engine"
import { useDisabled } from "../helpers/disabled"

// ── Constants ──

const LINE_HEIGHT = 17
const FONT_SIZE = 14

// ── Theme ──

/** @public */
export type InputTheme = {
  /** Cursor / focused border accent color. */
  accent: string | number
  /** Primary text color. */
  fg: string | number
  /** Placeholder / muted text color. */
  muted: string | number
  /** Background color. */
  bg: string | number
  /** Border color when unfocused. */
  border: string | number
  /** Corner radius. */
  radius: number
  /** Inner padding (horizontal). */
  paddingX: number
  /** Inner padding (vertical). */
  paddingY: number
  /** Font size. */
  fontSize: number
}

const INPUT_DEFAULTS: InputTheme = {
  accent: 0x56d4c8ff,
  fg: 0xe0e0e0ff,
  muted: 0x666680ff,
  bg: 0x1a1a2eff,
  border: 0xffffff33,
  radius: 6,
  paddingX: 10,
  paddingY: 6,
  fontSize: FONT_SIZE,
}

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
  /** Width. Default: "grow". */
  width?: number | string
  /** Height. Default: auto from theme padding + line height. */
  height?: number
  /** Visual theme for self-rendering mode. Ignored when renderInput is set. */
  theme?: Partial<InputTheme>
  /**
   * Optional render function for fully headless mode.
   * When provided, the Input delegates ALL visuals to this function
   * and ignores the theme prop.
   */
  renderInput?: (ctx: InputRenderContext) => JSX.Element
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
        clearSelection()
        props.onChange?.(next)
        setCursor(insertAt + 1)
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
    clearSelection()
    props.onChange?.(next)
    setCursor(insertAt + text.length)
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

  // Headless mode — delegate to consumer's renderInput
  if (props.renderInput) {
    const renderFn = props.renderInput
    return (
      <>
        {() => renderFn({
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

  // ── Self-rendering mode — built-in cursor (same pattern as Textarea) ──

  const th = () => ({ ...INPUT_DEFAULTS, ...props.theme })
  const cursorColor = () => th().accent
  const lineHeight = () => Math.ceil(th().fontSize * 1.2)
  const inputHeight = () => props.height ?? (lineHeight() + th().paddingY * 2 + 2)

  return (
    <box
      onPress={() => { if (!disabled()) focus() }}
      width={props.width ?? "grow"}
      height={inputHeight()}
      backgroundColor={th().bg}
      cornerRadius={th().radius}
      borderColor={checkFocus() ? cursorColor() : th().border}
      borderWidth={1}
      paddingLeft={th().paddingX}
      paddingRight={th().paddingX}
      paddingTop={th().paddingY}
      paddingBottom={th().paddingY}
      focusStyle={{
        borderColor: cursorColor(),
      }}
    >
      {() => {
        const isFocused = checkFocus()
        const val = props.value
        const pos = cursor()
        const ph = showPlaceholder()

        if (ph) {
          return (
            <box height={lineHeight()} width="100%">
              <text color={th().muted} fontSize={th().fontSize}>{props.placeholder ?? ""}</text>
            </box>
          )
        }

        return (
          <box height={lineHeight()} width="100%">
            <text color={th().fg} fontSize={th().fontSize}>
              {val.slice(0, pos) + (isFocused ? (blink() ? "│" : " ") : "") + val.slice(pos)}
            </text>
          </box>
        )
      }}
    </box>
  )
}
