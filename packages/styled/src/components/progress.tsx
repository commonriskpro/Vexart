/**
 * VoidProgress — shadcn-compatible progress bar using Void design tokens.
 *
 * Built on top of the headless @tge/components ProgressBar.
 * h-1.5 (6px track), primary fill, muted background.
 *
 * Usage:
 *   <VoidProgress value={progress()} max={100} />
 */

import { ProgressBar } from "@vexart/headless"
import type { ProgressBarRenderContext } from "@vexart/headless"
import { radius } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

export type VoidProgressProps = {
  value: number
  max?: number
  width?: number | string
  height?: number
}

export function VoidProgress(props: VoidProgressProps) {
  return (
    <ProgressBar
      value={props.value}
      max={props.max}
      renderBar={(ctx: ProgressBarRenderContext) => (
        <box
          width={props.width ?? 220}
          height={props.height ?? 6}
          backgroundColor={themeColors.card}
          borderColor={themeColors.border}
          borderWidth={1}
          cornerRadius={radius.full}
        >
          <box
            width={`${ctx.ratio * 100}%`}
            height={props.height ?? 6}
            backgroundColor={themeColors.primary}
            cornerRadius={radius.full}
          />
        </box>
      )}
    />
  )
}
