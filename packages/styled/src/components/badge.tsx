/**
 * Badge — shadcn-compatible badge with semantic variants.
 *
 * Variants: default, secondary, outline, destructive
 *
 * Theme reactivity: variant colors use getter functions so themeColors
 * signals are read inside SolidJS effects (not captured eagerly).
 */

import { radius, space, font, weight } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

/** @public */
export interface BadgeProps {
  variant?: BadgeVariant
  children?: any
}

// ── Variant color getters (lazy — read themeColors inside effects) ──

type VariantColors = {
  bg: () => string
  fg: () => string
  border: () => string | number | undefined
  borderWidth: number | undefined
}

const variantGetters: Record<BadgeVariant, VariantColors> = {
  default: {
    bg: () => themeColors.primary,
    fg: () => themeColors.primaryForeground,
    border: () => undefined,
    borderWidth: undefined,
  },
  secondary: {
    bg: () => themeColors.secondary,
    fg: () => themeColors.secondaryForeground,
    border: () => undefined,
    borderWidth: undefined,
  },
  outline: {
    bg: () => themeColors.transparent,
    fg: () => themeColors.foreground,
    border: () => "#ffffff38",
    borderWidth: 1,
  },
  destructive: {
    bg: () => themeColors.destructive,
    fg: () => themeColors.destructiveForeground,
    border: () => undefined,
    borderWidth: undefined,
  },
}

/** @public */
export function Badge(props: BadgeProps) {
  const v = props.variant ?? "default"
  const vg = variantGetters[v]

  return (
    <box
      direction="row"
      alignX="center"
      alignY="center"
      gap={space[1]}
      height={22}
      paddingLeft={space[2.5]}
      paddingRight={space[2.5]}
      backgroundColor={vg.bg()}
      cornerRadius={radius.full}
      borderColor={vg.border()}
      borderWidth={vg.borderWidth}
    >
      <text
        color={vg.fg()}
        fontSize={font.xs}
        fontWeight={weight.medium}
      >
        {props.children}
      </text>
    </box>
  )
}
