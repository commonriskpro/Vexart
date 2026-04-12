/**
 * Badge — shadcn-compatible badge with semantic variants.
 *
 * Variants: default, secondary, outline, destructive
 */

import { radius, space, font, weight } from "./tokens"
import { themeColors } from "./theme"

type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

export interface BadgeProps {
  variant?: BadgeVariant
  children?: any
}

export function Badge(props: BadgeProps) {
  const v = props.variant ?? "default"

  // Must be inside the function so themeColors getters evaluate reactively
  const variantStyles: Record<BadgeVariant, {
    bg: string
    fg: string
    border?: string | number
    borderWidth?: number
  }> = {
    default: {
      bg: themeColors.primary,
      fg: themeColors.primaryForeground,
    },
    secondary: {
      bg: themeColors.secondary,
      fg: themeColors.secondaryForeground,
    },
    outline: {
      bg: themeColors.transparent,
      fg: themeColors.foreground,
      border: "#ffffff38",       // white ~22% — visible on dark bg
      borderWidth: 1,
    },
    destructive: {
      bg: themeColors.destructive,
      fg: themeColors.destructiveForeground,
    },
  }

  const vs = variantStyles[v]

  return (
    <box
      direction="row"
      alignX="center"
      alignY="center"
      gap={space[1]}
      height={22}
      paddingLeft={space[2.5]}
      paddingRight={space[2.5]}
      backgroundColor={vs.bg}
      cornerRadius={radius.full}
      borderColor={vs.border}
      borderWidth={vs.borderWidth}
    >
      <text
        color={vs.fg}
        fontSize={font.xs}
        fontWeight={weight.medium}
      >
        {props.children}
      </text>
    </box>
  )
}
