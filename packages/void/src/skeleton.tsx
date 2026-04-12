/**
 * Skeleton — shadcn-compatible loading placeholder.
 *
 * Renders a muted rounded rectangle as a content placeholder.
 */

import { radius } from "./tokens"
import { themeColors } from "./theme"

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  cornerRadius?: number
}

export function Skeleton(props: SkeletonProps) {
  return (
    <box
      width={props.width ?? "grow"}
      height={props.height ?? 16}
      cornerRadius={props.cornerRadius ?? radius.md}
      backgroundColor={themeColors.muted}
    />
  )
}
