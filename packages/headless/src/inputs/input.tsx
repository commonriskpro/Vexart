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

import { createMemo, createEffect, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, onInput, measureTextWidth, type SizingUnit } from "@vexart/engine"
import { useDisabled } from "../helpers/disabled"
import { createTextEditor, previousCodePointOffset, nextCodePointOffset } from "./text-editor"

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
    focusable?: boolean
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
  width?: SizingUnit
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
  const disabled = useDisabled(props)

  const editor = createTextEditor({
    value: () => props.value,
    onChange: props.onChange,
    singleLine: true,
  })

  // ── Keyboard ──

  const { focused, focus } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      editor.startBlink()

      const val = props.value
      const pos = editor.cursor()

      if (e.key === "enter") { props.onSubmit?.(val); return }
      if (e.key === "a" && e.mods.ctrl) { editor.selectAll(); return }
      if (e.key === "z" && e.mods.ctrl && !e.mods.shift) { editor.undo(); return }
      if ((e.key === "y" && e.mods.ctrl) || (e.key === "z" && e.mods.ctrl && e.mods.shift)) { editor.redo(); return }

      // Shift+arrow selection
      if (e.mods.shift) {
        if (e.key === "left" && pos > 0) {
          if (!editor.hasSelection()) editor.setSelStart(pos)
          const next = previousCodePointOffset(val, pos)
          editor.setCursor(next); editor.setSelEnd(next); return
        }
        if (e.key === "right" && pos < val.length) {
          if (!editor.hasSelection()) editor.setSelStart(pos)
          const next = nextCodePointOffset(val, pos)
          editor.setCursor(next); editor.setSelEnd(next); return
        }
        if (e.key === "home") {
          if (!editor.hasSelection()) editor.setSelStart(pos)
          editor.setCursor(0); editor.setSelEnd(0); return
        }
        if (e.key === "end") {
          if (!editor.hasSelection()) editor.setSelStart(pos)
          editor.setCursor(val.length); editor.setSelEnd(val.length); return
        }
      }

      // Navigation
      if (e.key === "left") {
        if (editor.hasSelection()) { editor.setCursor(editor.selRange()[0]); editor.clearSelection() }
        else if (pos > 0) editor.setCursor(previousCodePointOffset(val, pos))
        return
      }
      if (e.key === "right") {
        if (editor.hasSelection()) { editor.setCursor(editor.selRange()[1]); editor.clearSelection() }
        else if (pos < val.length) editor.setCursor(nextCodePointOffset(val, pos))
        return
      }
      if (e.key === "home") { editor.setCursor(0); editor.clearSelection(); return }
      if (e.key === "end") { editor.setCursor(val.length); editor.clearSelection(); return }

      // Delete
      if (e.key === "backspace") {
        editor.deleteBackward()
        return
      }
      if (e.key === "delete") {
        editor.deleteForward()
        return
      }

      // Printable character
      if (e.char && !e.mods.ctrl && !e.mods.alt && !e.mods.meta) {
        editor.insertText(e.char)
        return
      }
    },
  })

  // ── Paste ──

  const unsubPaste = onInput((event) => {
    if (event.type !== "paste" || !focused() || disabled()) return
    editor.startBlink()
    editor.insertText(event.text)
  })
  onCleanup(() => unsubPaste())

  // ── Focus blink management ──

  const wasFocused = { current: false }
  createEffect(() => {
    const f = focused()
    if (f && !wasFocused.current) { editor.startBlink(); editor.setCursor(props.value.length) }
    else if (!f && wasFocused.current) { editor.stopBlink(); editor.clearSelection() }
    wasFocused.current = f
  })
  const checkFocus = () => focused()

  // ── Render context ──

  const showPlaceholder = () => props.value.length === 0 && !focused()

  // Headless mode — delegate to consumer's renderInput
  if (props.renderInput) {
    const renderFn = props.renderInput
    const ctx: InputRenderContext = {
      get value() { return props.value },
      get displayText() { return showPlaceholder() ? (props.placeholder ?? "") : props.value },
      get showPlaceholder() { return showPlaceholder() },
      get cursor() { return editor.cursor() },
      get blink() { return editor.blink() },
      get focused() { return checkFocus() },
      get disabled() { return disabled() },
      get selection() { return editor.selection() },
      inputProps: {
        onPress: () => { if (!disabled()) focus() },
      },
    }
    return <>{renderFn(ctx)}</>
  }

  // ── Self-rendering mode — built-in cursor (same pattern as Textarea) ──

  const th = () => ({ ...INPUT_DEFAULTS, ...props.theme })
  const cursorColor = () => th().accent
  const lineHeight = () => Math.ceil(th().fontSize * 1.2)
  const inputHeight = () => props.height ?? (lineHeight() + th().paddingY * 2 + 2)

  const rendered = createMemo(() => {
    const isFocused = checkFocus()
    const val = props.value
    const pos = editor.cursor()
    const ph = showPlaceholder()

    if (ph) {
      return (
        <box height={lineHeight()} width="100%">
          <text color={th().muted} fontSize={th().fontSize}>{props.placeholder ?? ""}</text>
        </box>
      )
    }

    const cursorX = () => {
      const prefix = val.slice(0, pos)
      if (prefix.length === 0) return 0
      try {
        return measureTextWidth(prefix, { fontSize: th().fontSize })
      } catch {
        return prefix.length * th().fontSize * 0.6
      }
    }

    return (
      <box height={lineHeight()} width="100%">
        <text color={th().fg} fontSize={th().fontSize}>
          {val}
        </text>
        {isFocused ? (
          <box
            floating="parent"
            floatOffset={{ x: cursorX(), y: 0 }}
            width={1.5}
            height={lineHeight()}
            backgroundColor={cursorColor()}
            opacity={editor.blink() ? 1 : 0}
          />
        ) : null}
      </box>
    )
  })

  return (
    <box
      onPress={() => { if (!disabled()) focus() }}
      width={props.width ?? "100%"}
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
      {rendered}
    </box>
  )
}
