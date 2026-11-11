/**
 * VoidInput — styled single-line text input using Void design tokens.
 *
 * Uses Input's self-rendering mode with a Void theme for built-in
 * cursor rendering (no manual renderInput needed).
 *
 * @public
 */

import { Input, type InputTheme } from "@vexart/headless"
import { radius, space, font } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import type { SizingUnit } from "@vexart/engine"
import { resolveClassOverrides } from "../utils/class-overrides"

/** @public */
export type VoidInputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: SizingUnit
  theme?: Partial<InputTheme>
  className?: string
}

/** @public */
export function VoidInput(props: VoidInputProps) {
  const ovr = () => resolveClassOverrides(props.className)
  const voidTheme = () => {
    const o = ovr()
    return {
      accent: themeColors.ring,
      fg: (o.color as string | number | undefined) ?? themeColors.foreground,
      muted: themeColors.mutedForeground,
      bg: (o.backgroundColor as string | number | undefined) ?? themeColors.card,
      border: (o.borderColor as string | number | undefined) ?? themeColors.input,
      radius: (o.cornerRadius as number | undefined) ?? radius.md,
      paddingX: (o.paddingLeft as number | undefined) ?? (o.paddingRight as number | undefined) ?? (o.paddingX as number | undefined) ?? (o.padding as number | undefined) ?? space[3],
      paddingY: (o.paddingTop as number | undefined) ?? (o.paddingBottom as number | undefined) ?? (o.paddingY as number | undefined) ?? (o.padding as number | undefined) ?? 8,
      fontSize: (o.fontSize as number | undefined) ?? font.sm,
      ...props.theme,
    }
  }

  return (
    <Input
      value={props.value}
      onChange={props.onChange}
      onSubmit={props.onSubmit}
      placeholder={props.placeholder}
      disabled={props.disabled}
      focusId={props.focusId}
      width={(ovr().width as SizingUnit | undefined) ?? props.width}
      height={ovr().height as number | undefined}
      theme={voidTheme()}
    />
  )
}
