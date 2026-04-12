/**
 * Slider — truly headless numeric range input.
 *
 * CONTROLLED component — parent owns the value.
 * Focus-aware with keyboard control (Left/Right/Home/End).
 *
 * Provides:
 *   - Value tracking within [min, max]
 *   - Step increments
 *   - Keyboard navigation
 *   - Focus management
 *   - Percentage calculation for visual rendering
 *
 * ALL visual styling is the consumer's responsibility.
 * Use @tge/void VoidSlider for a styled version.
 *
 * Usage:
 *   <Slider
 *     value={volume()}
 *     onChange={setVolume}
 *     min={0} max={100} step={1}
 *     renderSlider={(ctx) => (
 *       <box width={200} height={8} backgroundColor="#333" cornerRadius={4}>
 *         <box
 *           width={`${ctx.percentage}%`}
 *           height={8}
 *           backgroundColor="#4488cc"
 *           cornerRadius={4}
 *         />
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"

// ── Types ──

export type SliderRenderContext = {
  /** Current value. */
  value: number
  /** Min value. */
  min: number
  /** Max value. */
  max: number
  /** Value as percentage 0-100. */
  percentage: number
  /** Whether the slider is focused. */
  focused: boolean
  /** Whether the slider is disabled. */
  disabled: boolean
}

export type SliderProps = {
  /** Current value. */
  value: number
  /** Called when value changes. */
  onChange: (value: number) => void
  /** Minimum value. Default: 0. */
  min?: number
  /** Maximum value. Default: 100. */
  max?: number
  /** Step increment. Default: 1. */
  step?: number
  /** Large step (Page Up/Down). Default: step * 10. */
  largeStep?: number
  /** Disabled state. */
  disabled?: boolean
  /** Focus ID override. */
  focusId?: string
  /** Render function. */
  renderSlider: (ctx: SliderRenderContext) => JSX.Element
}

export function Slider(props: SliderProps) {
  const min = () => props.min ?? 0
  const max = () => props.max ?? 100
  const step = () => props.step ?? 1
  const largeStep = () => props.largeStep ?? step() * 10
  const disabled = () => props.disabled ?? false

  const clamp = (v: number) => Math.min(max(), Math.max(min(), v))
  const snap = (v: number) => {
    const s = step()
    return Math.round(v / s) * s
  }

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      const s = step()
      const ls = largeStep()

      if (e.key === "right" || e.key === "up" || e.key === "l" || e.key === "k") {
        props.onChange(clamp(snap(props.value + s)))
        return
      }
      if (e.key === "left" || e.key === "down" || e.key === "h" || e.key === "j") {
        props.onChange(clamp(snap(props.value - s)))
        return
      }
      if (e.key === "pageup") {
        props.onChange(clamp(snap(props.value + ls)))
        return
      }
      if (e.key === "pagedown") {
        props.onChange(clamp(snap(props.value - ls)))
        return
      }
      if (e.key === "home") {
        props.onChange(min())
        return
      }
      if (e.key === "end") {
        props.onChange(max())
        return
      }
    },
  })

  const percentage = () => {
    const range = max() - min()
    if (range === 0) return 0
    return ((props.value - min()) / range) * 100
  }

  const ctx = (): SliderRenderContext => ({
    value: props.value,
    min: min(),
    max: max(),
    percentage: percentage(),
    focused: focused(),
    disabled: disabled(),
  })

  return <>{props.renderSlider(ctx())}</>
}
