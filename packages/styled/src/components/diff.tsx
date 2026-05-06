/**
 * VoidDiff — styled unified diff viewer using Void design tokens.
 *
 * @public
 */

import { Diff } from "@vexart/headless"
import { radius, space } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidDiffProps = {
  diff: string
  showLineNumbers?: boolean
  width?: number | string
}

/** @public */
export function VoidDiff(props: VoidDiffProps) {
  return (
    <Diff
      diff={props.diff}
      showLineNumbers={props.showLineNumbers}
      width={props.width}
      theme={{
        fg: themeColors.foreground,
        muted: themeColors.mutedForeground,
        bg: themeColors.card,
        radius: radius.md,
        addedBg: "#1a3a1a",
        removedBg: "#3a1a1a",
        contextBg: "#00000000",
        addedSign: "#4ec94e",
        removedSign: "#e05050",
        lineNumberFg: themeColors.mutedForeground,
        lineNumberBg: themeColors.muted,
        headerBg: themeColors.muted,
        headerFg: themeColors.ring,
        linePadding: space[1],
      }}
    />
  )
}
