/**
 * Button — shadcn-compatible button with variants and sizes.
 *
 * Variants: default, secondary, outline, ghost, destructive
 * Sizes: xs, sm, default, lg
 */

import { colors, radius, space, font, weight, shadows } from "./tokens"

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive"
type ButtonSize = "xs" | "sm" | "default" | "lg"

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: any
}

// ── Variant styles ──

const variantStyles: Record<ButtonVariant, {
  bg: string | number
  fg: string | number
  border?: string | number
  borderWidth?: number
  shadow?: any
  hoverBg: string | number
  activeBg: string | number
}> = {
  default: {
    bg: colors.primary,
    fg: colors.primaryForeground,
    shadow: shadows.sm,
    hoverBg: "#d4d4d4ff",    // primary/90
    activeBg: "#bababaff",
  },
  secondary: {
    bg: colors.secondary,
    fg: colors.secondaryForeground,
    hoverBg: "#333333ff",    // secondary brighter
    activeBg: "#3d3d3dff",
  },
  outline: {
    bg: "#0a0a0aff",
    fg: colors.foreground,
    border: "#ffffff38",       // white ~22% — visible on dark bg
    borderWidth: 1,
    hoverBg: colors.accent,
    activeBg: "#333333ff",
  },
  ghost: {
    bg: colors.transparent,
    fg: colors.mutedForeground,  // muted text so it's clearly "quiet"
    hoverBg: colors.accent,
    activeBg: "#333333ff",
  },
  destructive: {
    bg: colors.destructive,
    fg: colors.destructiveForeground,
    shadow: shadows.sm,
    hoverBg: "#c72222ff",    // destructive/90
    activeBg: "#b01e1eff",
  },
}

// ── Size styles ──

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

export function Button(props: ButtonProps) {
  const v = props.variant ?? "default"
  const s = props.size ?? "default"
  const vs = variantStyles[v]
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
      backgroundColor={vs.bg}
      cornerRadius={ss.cornerRadius}
      borderColor={vs.border}
      borderWidth={vs.borderWidth}
      shadow={vs.shadow}
      hoverStyle={{ backgroundColor: vs.hoverBg }}
      activeStyle={{ backgroundColor: vs.activeBg }}
    >
      <text
        color={vs.fg}
        fontSize={ss.fontSize}
        fontWeight={weight.medium}
      >
        {props.children}
      </text>
    </box>
  )
}
