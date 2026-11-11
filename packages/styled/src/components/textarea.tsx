/**
 * VoidTextarea — styled multi-line text editor using Void design tokens.
 *
 * Uses Textarea's theme prop for built-in cursor, selection, and
 * syntax highlighting rendering — no manual render callback needed.
 *
 * @public
 */

import { Textarea } from "@vexart/headless"
import type { TextareaHandle, KeyBinding, Highlighter, KeyEvent, TextareaTheme } from "@vexart/headless"
import { radius, space } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import { resolveClassOverrides } from "../utils/class-overrides"

/** @public */
export type VoidTextareaProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  onCursorChange?: (row: number, col: number) => void
  onKeyDown?: (event: KeyEvent) => void
  onPaste?: (text: string) => void
  placeholder?: string
  width?: number
  height?: number
  disabled?: boolean
  focusId?: string
  keyBindings?: KeyBinding[]
  highlighter?: Highlighter
  language?: string
  theme?: Partial<TextareaTheme>
  ref?: (handle: TextareaHandle) => void
  className?: string
}

/** @public */
export function VoidTextarea(props: VoidTextareaProps) {
  const ovr = () => resolveClassOverrides(props.className)
  const voidTheme = () => {
    const o = ovr()
    return {
      accent: themeColors.ring,
      fg: (o.color as string | number | undefined) ?? themeColors.foreground,
      muted: themeColors.mutedForeground,
      bg: (o.backgroundColor as string | number | undefined) ?? themeColors.card,
      disabledBg: themeColors.muted,
      border: (o.borderColor as string | number | undefined) ?? themeColors.input,
      radius: (o.cornerRadius as number | undefined) ?? radius.md,
      padding: (o.padding as number | undefined) ?? (o.paddingX as number | undefined) ?? (o.paddingY as number | undefined) ?? (o.paddingLeft as number | undefined) ?? (o.paddingTop as number | undefined) ?? space[3],
      ...props.theme,
    }
  }

  return (
    <Textarea
      ref={props.ref}
      value={props.value}
      onChange={props.onChange}
      onSubmit={props.onSubmit}
      onCursorChange={props.onCursorChange}
      onKeyDown={props.onKeyDown}
      onPaste={props.onPaste}
      placeholder={props.placeholder}
      width={(ovr().width as number | undefined) ?? props.width}
      height={(ovr().height as number | undefined) ?? props.height}
      disabled={props.disabled}
      focusId={props.focusId}
      keyBindings={props.keyBindings}
      highlighter={props.highlighter}
      language={props.language}
      theme={voidTheme()}
    />
  )
}
