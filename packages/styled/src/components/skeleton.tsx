/**
 * Skeleton — styled loading placeholder.
 *
 * @public
 */

import { radius } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export interface SkeletonProps {
  width?: number | string
  height?: number | string
  cornerRadius?: number
}

/** @public */
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
