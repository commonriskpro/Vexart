/**
 * VoidSeparator — styled visual divider using Void design tokens.
 *
 * @public
 */

import { themeColors } from "../theme/theme"

/** @public */
export interface VoidSeparatorProps {
  orientation?: "horizontal" | "vertical"
  className?: string
}

/** @public */
export function VoidSeparator(props: VoidSeparatorProps) {
  return (
    <box
      className={props.className}
      width={props.orientation === "vertical" ? 1 : "grow"}
      height={props.orientation === "vertical" ? "grow" : 1}
      backgroundColor={themeColors.border}
    />
  )
}
