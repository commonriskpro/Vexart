/**
 * Badge — shadcn-compatible badge with semantic variants.
 *
 * Variants: default, secondary, outline, destructive
 */

import { colors, radius, space, font, weight } from "./tokens"

type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

export interface BadgeProps {
  variant?: BadgeVariant
  children?: any
}

const variantStyles: Record<BadgeVariant, {
  bg: string
  fg: string
  border?: string | number
  borderWidth?: number
}> = {
  default: {
    bg: colors.primary,
    fg: colors.primaryForeground,
  },
  secondary: {
    bg: colors.secondary,
    fg: colors.secondaryForeground,
  },
  outline: {
    bg: colors.transparent,
    fg: colors.foreground,
    border: "#ffffff38",       // white ~22% — visible on dark bg
    borderWidth: 1,
  },
  destructive: {
    bg: colors.destructive,
    fg: colors.destructiveForeground,
  },
}

export function Badge(props: BadgeProps) {
  const v = props.variant ?? "default"
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
