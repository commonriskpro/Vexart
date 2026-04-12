/**
 * Button — shadcn-compatible button with variants and sizes.
 *
 * Variants: default, secondary, outline, ghost, destructive
 * Sizes: xs, sm, default, lg
 *
 * Theme reactivity: themeColors getters MUST be read inside JSX props
 * (not in intermediate objects) so SolidJS wraps them in tracked effects.
 */

import { radius, space, font, weight, shadows } from "./tokens"
import { themeColors } from "./theme"

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive"
type ButtonSize = "xs" | "sm" | "default" | "lg"

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: any
}

// ── Size styles (static — no theme dependency) ──

const sizeStyles: Record<ButtonSize, {
  height: number
  paddingX: number
  paddingY: number
  fontSize: number
  gap: number
  cornerRadius: number
}> = {
  xs: { height: 24, paddingX: space[2], paddingY: 0, fontSize: font.xs, gap: space[1], cornerRadius: radius.md },
  sm: { height: 32, paddingX: space[3], paddingY: 0, fontSize: font.sm, gap: space[1.5], cornerRadius: radius.md },
  default: { height: 36, paddingX: space[4], paddingY: space[2], fontSize: font.sm, gap: space[2], cornerRadius: radius.md },
  lg: { height: 40, paddingX: space[6], paddingY: 0, fontSize: font.sm, gap: space[2], cornerRadius: radius.md },
}

// ── Variant color getters ──
// Returns a function so the themeColors getter is evaluated lazily inside
// JSX props (where SolidJS creates tracked effects), not eagerly in the
// component body (which runs once and captures static values).

type VariantColors = {
  bg: () => string | number
  fg: () => string | number
  border: () => string | number | undefined
  borderWidth: number | undefined
  shadow: any
  hoverBg: () => string | number
  activeBg: () => string | number
}

const variantGetters: Record<ButtonVariant, VariantColors> = {
  default: {
    bg: () => themeColors.primary,
    fg: () => themeColors.primaryForeground,
    border: () => undefined,
    borderWidth: undefined,
    shadow: shadows.sm,
    hoverBg: () => "#d4d4d4ff",
    activeBg: () => "#bababaff",
  },
  secondary: {
    bg: () => themeColors.secondary,
    fg: () => themeColors.secondaryForeground,
    border: () => undefined,
    borderWidth: undefined,
    shadow: undefined,
    hoverBg: () => "#333333ff",
    activeBg: () => "#3d3d3dff",
  },
  outline: {
    bg: () => "#0a0a0aff",
    fg: () => themeColors.foreground,
    border: () => "#ffffff38",
    borderWidth: 1,
    shadow: undefined,
    hoverBg: () => themeColors.accent,
    activeBg: () => "#333333ff",
  },
  ghost: {
    bg: () => themeColors.transparent,
    fg: () => themeColors.mutedForeground,
    border: () => undefined,
    borderWidth: undefined,
    shadow: undefined,
    hoverBg: () => themeColors.accent,
    activeBg: () => "#333333ff",
  },
  destructive: {
    bg: () => themeColors.destructive,
    fg: () => themeColors.destructiveForeground,
    border: () => undefined,
    borderWidth: undefined,
    shadow: shadows.sm,
    hoverBg: () => "#c72222ff",
    activeBg: () => "#b01e1eff",
  },
}

export function Button(props: ButtonProps) {
  const v = props.variant ?? "default"
  const s = props.size ?? "default"
  const vg = variantGetters[v]
  const ss = sizeStyles[s]

  return (
    <box
      direction="row"
      alignX="center"
      alignY="center"
      gap={ss.gap}
      height={ss.height}
      paddingLeft={ss.paddingX}
      paddingRight={ss.paddingX}
      paddingTop={ss.paddingY}
      paddingBottom={ss.paddingY}
      backgroundColor={vg.bg()}
      cornerRadius={ss.cornerRadius}
      borderColor={vg.border()}
      borderWidth={vg.borderWidth}
      shadow={vg.shadow}
      hoverStyle={{ backgroundColor: vg.hoverBg() }}
      activeStyle={{ backgroundColor: vg.activeBg() }}
    >
      <text
        color={vg.fg()}
        fontSize={ss.fontSize}
        fontWeight={weight.medium}
      >
        {props.children}
      </text>
    </box>
  )
}
