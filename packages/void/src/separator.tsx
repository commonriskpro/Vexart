/**
 * Separator — shadcn-compatible visual divider.
 *
 * Orientation: horizontal (default), vertical
 */

import { colors } from "./tokens"

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical"
}

export function Separator(props: SeparatorProps) {
  const vertical = props.orientation === "vertical"

  if (vertical) {
    return (
      <box
        width={1}
        height="grow"
        backgroundColor={colors.border}
      />
    )
  }

  return (
    <box
      width="grow"
      height={1}
      backgroundColor={colors.border}
    />
  )
}
