/**
 * Separator — styled visual divider.
 *
 * @public
 */

import { themeColors } from "../theme/theme"

/** @public */
export interface SeparatorProps {
  orientation?: "horizontal" | "vertical"
}

/** @public */
export function Separator(props: SeparatorProps) {
  const vertical = props.orientation === "vertical"

  if (vertical) {
    return (
      <box
        width={1}
        height="grow"
        backgroundColor={themeColors.border}
      />
    )
  }

  return (
    <box
      width="grow"
      height={1}
      backgroundColor={themeColors.border}
    />
  )
}
