/**
 * Slider — truly headless numeric range input.
 *
 * Handles value math, keyboard control, and drag interaction while visuals are supplied by `renderSlider`.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { useFocus, useDrag, type NodeMouseEvent } from "@vexart/engine"

// ── Types ──

/** @public */
export type SliderTrackProps = {
  ref: (handle: any) => void
  onMouseDown: (evt: NodeMouseEvent) => void
  onMouseMove: (evt: NodeMouseEvent) => void
  onMouseUp: (evt: NodeMouseEvent) => void
  focusable: true
}

/** @public */
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
  /** Whether the user is currently dragging the slider. */
  dragging: boolean
  /** Spread these props on the track element for mouse interaction. */
  trackProps: SliderTrackProps
}

/** @public */
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

/** @public */
export function Slider(props: SliderProps) {
  const min = () => props.min ?? 0
  const max = () => props.max ?? 100
  const step = () => props.step ?? 1
  const largeStep = () => props.largeStep ?? step() * 10
  const disabled = () => props.disabled ?? false

  const clamp = (v: number) => Math.min(max(), Math.max(min(), v))
  const snap = (v: number) => {
    const s = step()
    const result = Math.round(v / s) * s
    const decimals = (s.toString().split(".")[1] || "").length
    return Number(result.toFixed(decimals))
  }

  /** Convert a mouse event's X position to a value within [min, max]. */
  function valueFromMouse(evt: NodeMouseEvent): number {
    if (evt.width <= 0) return min()
    const ratio = Math.max(0, Math.min(1, evt.nodeX / evt.width))
    return clamp(snap(min() + ratio * (max() - min())))
  }

  // ── Mouse drag via useDrag hook ──
  const { dragging, dragProps } = useDrag({
    onDragStart: (evt) => { props.onChange(valueFromMouse(evt)) },
    onDrag: (evt) => { props.onChange(valueFromMouse(evt)) },
    disabled,
  })

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

  const trackProps: SliderTrackProps = {
    ...dragProps,
    focusable: true,
  }

  // Return a dynamic expression — SolidJS re-evaluates this when any
  // reactive dependency changes (props.value, focused(), etc.)
  return <>{() => props.renderSlider({
    value: props.value,
    min: min(),
    max: max(),
    percentage: percentage(),
    focused: focused(),
    disabled: disabled(),
    dragging: dragging(),
    trackProps,
  })}</>
}
