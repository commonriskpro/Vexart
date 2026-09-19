/**
 * VoidDiff — styled unified diff viewer using Void design tokens.
 *
 * @public
 */

import { Diff, type DiffTheme, type DiffLine } from "@vexart/headless"
import type { SizingUnit } from "@vexart/engine"
import type { JSX } from "solid-js"
import { radius, space } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidDiffProps = {
  diff: string
  showLineNumbers?: boolean
  width?: SizingUnit
  /** Visual theme overrides. */
  theme?: Partial<DiffTheme>
  /** Custom line renderer. */
  children?: (line: DiffLine) => JSX.Element
}

/** @public */
export function VoidDiff(props: VoidDiffProps) {
  const voidTheme = () => ({
    fg: themeColors.foreground,
    muted: themeColors.mutedForeground,
    bg: themeColors.card,
    radius: radius.md,
    addedBg: "#1a3a1a",
    removedBg: "#3a1a1a",
    contextBg: "transparent",
    addedSign: "#4ec94e",
    removedSign: "#e05050",
    lineNumberFg: themeColors.mutedForeground,
    lineNumberBg: themeColors.card,
    headerBg: themeColors.muted,
    headerFg: themeColors.foreground,
    linePadding: space[2],
    ...props.theme,
  })

  return (
    <Diff
      diff={props.diff}
      showLineNumbers={props.showLineNumbers}
      width={props.width}
      theme={voidTheme()}
    >
      {props.children}
    </Diff>
  )
}
