/**
 * VoidInput — styled single-line text input using Void design tokens.
 *
 * Uses Input's self-rendering mode with a Void theme for built-in
 * cursor rendering (no manual renderInput needed).
 *
 * @public
 */

import { Input } from "@vexart/headless"
import { radius, space, font } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidInputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
}

/** @public */
export function VoidInput(props: VoidInputProps) {
  return (
    <Input
      value={props.value}
      onChange={props.onChange}
      onSubmit={props.onSubmit}
      placeholder={props.placeholder}
      disabled={props.disabled}
      focusId={props.focusId}
      width={props.width}
      theme={{
        accent: themeColors.ring,
        fg: themeColors.foreground,
        muted: themeColors.mutedForeground,
        bg: themeColors.card,
        border: themeColors.input,
        radius: radius.md,
        paddingX: space[3],
        paddingY: 8,
        fontSize: font.sm,
      }}
    />
  )
}
