/**
 * ProgressBar — horizontal progress indicator for TGE.
 *
 * Renders a track with a filled portion based on value/max.
 * Pure visual component — no focus or interaction.
 *
 * Implementation: two nested boxes — outer (track) + inner (fill).
 * The fill width is calculated as a percentage of the track.
 *
 * Usage:
 *   <ProgressBar value={75} />
 *   <ProgressBar value={3} max={10} color={accent.green} />
 *   <ProgressBar value={downloaded()} max={total()} width={200} />
 */

import type { JSX } from "solid-js"
import { accent, surface, radius } from "@tge/tokens"

export type ProgressBarProps = {
  /** Current value. Clamped to [0, max]. */
  value: number

  /** Maximum value. Default: 100. */
  max?: number

  /** Fill color (u32 RGBA). Default: accent.thread. */
  color?: number

  /** Track color (u32 RGBA). Default: surface.context. */
  trackColor?: number

  /** Width of the bar in pixels. Default: 200. */
  width?: number

  /** Height of the bar in pixels. Default: 12. */
  height?: number
}

export function ProgressBar(props: ProgressBarProps) {
  const max = () => props.max ?? 100
  const color = () => props.color ?? accent.thread
  const trackColor = () => props.trackColor ?? surface.context
  const barWidth = () => props.width ?? 200
  const barHeight = () => props.height ?? 12
  const ratio = () => Math.max(0, Math.min(1, props.value / max()))
  const fillWidth = () => Math.round(barWidth() * ratio())

  return (
    <box
      width={barWidth()}
      height={barHeight()}
      backgroundColor={trackColor()}
      cornerRadius={radius.md}
    >
      <box
        width={fillWidth()}
        height={barHeight()}
        backgroundColor={color()}
        cornerRadius={radius.md}
      />
    </box>
  )
}
