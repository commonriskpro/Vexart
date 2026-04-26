/**
 * Button — shadcn-compatible button with variants and sizes.
 *
 * Variants: default, secondary, outline, ghost, destructive, link
 * Sizes: xs, sm, default, lg
 *
 * Interaction: hoverStyle/activeStyle/focusStyle handled by the engine.
 * The consumer wraps with <box focusable onPress={...}> for keyboard + mouse.
 *
 * Theme reactivity: themeColors getters MUST be read inside JSX props
 * (not in intermediate objects) so SolidJS wraps them in tracked effects.
 */

import type { PressEvent } from "@vexart/engine"
import { Button as HeadlessButton } from "@vexart/headless"
import { radius, space, font, weight, shadows, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link"
/** @public */
export type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg"

/** @public */
export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  onPress?: (event?: PressEvent) => void
  focusId?: string
  children?: any
}

// ── Size styles (static — no theme dependency) ──

const sizeStyles: Record<ButtonSize, {
  height: number
  width?: number
  paddingX: number
  paddingY: number
  fontSize: number
  gap: number
  cornerRadius: number
}> = {
  xs:       { height: 24, paddingX: space[2],  paddingY: 0,        fontSize: font.xs,   gap: space[1],   cornerRadius: radius.md },
  sm:       { height: 32, paddingX: space[3],  paddingY: 0,        fontSize: font.sm,   gap: space[1.5], cornerRadius: radius.md },
  default:  { height: 36, paddingX: space[4],  paddingY: space[2], fontSize: font.sm,   gap: space[2],   cornerRadius: radius.md },
  lg:       { height: 40, paddingX: space[6],  paddingY: 0,        fontSize: font.base, gap: space[2],   cornerRadius: radius.md },
  "icon":    { height: 36, width: 36, paddingX: 0, paddingY: 0,    fontSize: font.sm,   gap: 0,          cornerRadius: radius.md },
  "icon-sm": { height: 32, width: 32, paddingX: 0, paddingY: 0,    fontSize: font.sm,   gap: 0,          cornerRadius: radius.md },
  "icon-lg": { height: 40, width: 40, paddingX: 0, paddingY: 0,    fontSize: font.base, gap: 0,          cornerRadius: radius.md },
}

// ── Variant color getters ──
// Each value is a getter function so themeColors signals are read
// inside SolidJS effects (inside JSX props), not eagerly in body.

type VariantColors = {
  bg: () => string | number
  fg: () => string | number
  border: () => string | number | undefined
  borderWidth: number | undefined
  shadow: any
  hoverBg: () => string | number
  activeBg: () => string | number
  focusBorder: () => string | number
}

const variantGetters: Record<ButtonVariant, VariantColors> = {
  default: {
    bg:          () => themeColors.primary,
    fg:          () => themeColors.primaryForeground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      shadows.xs,
    hoverBg:     () => "#d4d4d4ff",
    activeBg:    () => "#bababaff",
    focusBorder: () => themeColors.ring,
  },
  secondary: {
    bg:          () => themeColors.secondary,
    fg:          () => themeColors.secondaryForeground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      undefined,
    hoverBg:     () => "#2e2e2eff",
    activeBg:    () => "#3d3d3dff",
    focusBorder: () => themeColors.ring,
  },
  outline: {
    bg:          () => themeColors.transparent,
    fg:          () => themeColors.foreground,
    border:      () => themeColors.input,
    borderWidth: 1,
    shadow:      shadows.xs,
    hoverBg:     () => themeColors.accent,
    activeBg:    () => "#333333ff",
    focusBorder: () => themeColors.ring,
  },
  ghost: {
    bg:          () => themeColors.transparent,
    fg:          () => themeColors.foreground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      undefined,
    hoverBg:     () => themeColors.accent,
    activeBg:    () => "#333333ff",
    focusBorder: () => themeColors.ring,
  },
  destructive: {
    bg:          () => themeColors.destructive,
    fg:          () => themeColors.destructiveForeground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      shadows.xs,
    hoverBg:     () => "#c72222ff",
    activeBg:    () => "#b01e1eff",
    focusBorder: () => themeColors.destructive,
  },
  link: {
    bg:          () => themeColors.transparent,
    fg:          () => themeColors.primary,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      undefined,
    hoverBg:     () => themeColors.transparent,
    activeBg:    () => themeColors.transparent,
    focusBorder: () => themeColors.ring,
  },
}

/** @public */
export function Button(props: ButtonProps) {
  const v = props.variant ?? "default"
  const s = props.size ?? "default"
  const vg = variantGetters[v]
  const ss = sizeStyles[s]
  const isLink = v === "link"

  return (
    <HeadlessButton
      onPress={props.onPress}
      disabled={props.disabled}
      focusId={props.focusId}
      renderButton={(ctx) => (
        <box
          {...ctx.buttonProps}
          direction="row"
          alignX="center"
          alignY="center"
          gap={ss.gap}
          height={ss.height}
          width={ss.width}
          paddingLeft={ss.paddingX}
          paddingRight={ss.paddingX}
          paddingTop={ss.paddingY}
          paddingBottom={ss.paddingY}
          backgroundColor={vg.bg()}
          cornerRadius={ss.cornerRadius}
          borderColor={vg.border()}
          borderWidth={vg.borderWidth}
          shadow={vg.shadow}
          opacity={props.disabled ? 0.5 : 1}
          hoverStyle={{ backgroundColor: vg.hoverBg() }}
          activeStyle={{ backgroundColor: vg.activeBg() }}
          focusStyle={{
            borderColor: vg.focusBorder(),
            borderWidth: 2,
            glow: isLink ? undefined : glows.ring,
          }}
        >
          <text
            color={vg.fg()}
            fontSize={ss.fontSize}
            fontWeight={isLink ? weight.normal : weight.medium}
          >
            {props.children}
          </text>
        </box>
      )}
    />
  )
}
