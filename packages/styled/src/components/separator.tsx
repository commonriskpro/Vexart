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
  const vertical = props.orientation === "vertical"

  if (vertical) {
    return (
      <box
        className={props.className}
        width={1}
        height="grow"
        backgroundColor={themeColors.border}
      />
    )
  }

  return (
    <box
      className={props.className}
      width="grow"
      height={1}
      backgroundColor={themeColors.border}
    />
  )
}
