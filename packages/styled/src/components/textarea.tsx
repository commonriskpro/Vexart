/**
 * VoidTextarea — styled multi-line text editor using Void design tokens.
 *
 * Uses Textarea's theme prop for built-in cursor, selection, and
 * syntax highlighting rendering — no manual render callback needed.
 *
 * @public
 */

import { Textarea } from "@vexart/headless"
import type { TextareaHandle, KeyBinding, SyntaxStyle, KeyEvent } from "@vexart/headless"
import { radius, space } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

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
  syntaxStyle?: SyntaxStyle
  language?: string
  ref?: (handle: TextareaHandle) => void
}

/** @public */
export function VoidTextarea(props: VoidTextareaProps) {
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
      width={props.width}
      height={props.height}
      disabled={props.disabled}
      focusId={props.focusId}
      keyBindings={props.keyBindings}
      syntaxStyle={props.syntaxStyle}
      language={props.language}
      theme={{
        accent: themeColors.ring,
        fg: themeColors.foreground,
        muted: themeColors.mutedForeground,
        bg: themeColors.card,
        disabledBg: themeColors.muted,
        border: themeColors.input,
        radius: radius.md,
        padding: space[3],
      }}
    />
  )
}
