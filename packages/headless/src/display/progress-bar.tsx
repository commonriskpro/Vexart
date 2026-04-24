/**
 * ProgressBar — truly headless progress indicator.
 *
 * Computes ratio and fill width while leaving visuals to `renderBar`.
 *
 * @public
 */

import type { JSX } from "solid-js"

// ── Types ──

/** @public */
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

/** @public */
export type ProgressBarProps = {
  value: number
  max?: number
  width?: number
  height?: number
  /** Render function — receives computed values, returns visual. */
  renderBar: (ctx: ProgressBarRenderContext) => JSX.Element
}

/** @public */
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
