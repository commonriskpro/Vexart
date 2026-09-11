/**
 * VoidSkeleton — styled loading placeholder using Void design tokens.
 *
 * @public
 */

import { radius } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import type { SizingUnit } from "@vexart/engine"

/** @public */
export interface VoidSkeletonProps {
  width?: SizingUnit
  height?: SizingUnit
  cornerRadius?: number
  className?: string
}

/** @public */
export function VoidSkeleton(props: VoidSkeletonProps) {
  return (
    <box
      className={props.className}
      width={props.width ?? "grow"}
      height={props.height ?? 16}
      cornerRadius={props.cornerRadius ?? radius.md}
      backgroundColor={themeColors.muted}
    />
  )
}
