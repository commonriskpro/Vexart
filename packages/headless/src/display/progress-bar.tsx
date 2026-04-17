/**
 * ProgressBar — truly headless progress indicator.
 *
 * Pure visual component — no focus or interaction.
 * Calculates the fill ratio from value/max.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Value clamping (0 to max)
 *   - Ratio calculation
 *   - Fill width computation
 *
 * ALL visual styling is the consumer's responsibility via renderBar.
 * Use @tge/void VoidProgressBar for a styled version.
 *
 * Usage:
 *   <ProgressBar
 *     value={75}
 *     max={100}
 *     width={200}
 *     renderBar={({ ratio, fillWidth, width, height }) => (
 *       <box width={width} height={height} backgroundColor="#333" cornerRadius={6}>
 *         <box width={fillWidth} height={height} backgroundColor="#22c55e" cornerRadius={6} />
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"

// ── Types ──

export type ProgressBarRenderContext = {
  /** Value between 0 and 1. */
  ratio: number
  /** Computed fill width in px. */
  fillWidth: number
  /** Total bar width in px. */
  width: number
  /** Bar height in px. */
  height: number
  /** Raw value. */
  value: number
  /** Max value. */
  max: number
}

export type ProgressBarProps = {
  value: number
  max?: number
  width?: number
  height?: number
  /** Render function — receives computed values, returns visual. */
  renderBar: (ctx: ProgressBarRenderContext) => JSX.Element
}

export function ProgressBar(props: ProgressBarProps) {
  const max = () => props.max ?? 100
  const barWidth = () => props.width ?? 200
  const barHeight = () => props.height ?? 12
  const ratio = () => Math.max(0, Math.min(1, props.value / max()))
  const fillWidth = () => Math.round(barWidth() * ratio())

  return (
    <>
      {props.renderBar({
        ratio: ratio(),
        fillWidth: fillWidth(),
        width: barWidth(),
        height: barHeight(),
        value: props.value,
        max: max(),
      })}
    </>
  )
}
