/**
 * Avatar — shadcn-compatible avatar with fallback initial.
 *
 * Sizes: sm (24px), default (32px), lg (40px)
 * Shows a colored circle with the first character of the name.
 */

import { colors, font, weight } from "./tokens"

type AvatarSize = "sm" | "default" | "lg"

export interface AvatarProps {
  name: string
  size?: AvatarSize
  color?: string | number
}

const sizeMap: Record<AvatarSize, { px: number; fontSize: number }> = {
  sm:      { px: 24, fontSize: font.xs },
  default: { px: 32, fontSize: font.sm },
  lg:      { px: 40, fontSize: font.base },
}

export function Avatar(props: AvatarProps) {
  const s = props.size ?? "default"
  const ss = sizeMap[s]
  const initial = props.name.charAt(0).toUpperCase()
  const bg = props.color ?? colors.muted

  return (
    <box
      width={ss.px}
      height={ss.px}
      cornerRadius={ss.px / 2}
      backgroundColor={bg}
      alignX="center"
      alignY="center"
    >
      <text
        color={colors.foreground}
        fontSize={ss.fontSize}
        fontWeight={weight.medium}
      >
        {initial}
      </text>
    </box>
  )
}
