/**
 * Tooltip — truly headless tooltip/popover primitive.
 *
 * Provides delayed show/hide behavior plus portal rendering.
 * Consumers own all visuals through `renderTooltip`.
 *
 * @public
 */

import { createSignal, onCleanup } from "solid-js"
import type { JSX } from "solid-js"

// Floating attach points are intentionally kept internal to the engine.  The
// 3x3 grid is stable in TGEProps (left/center/right × top/center/bottom).
const ATTACH_POINT = {
  LEFT_TOP: 0,
  LEFT_CENTER: 1,
  LEFT_BOTTOM: 2,
  CENTER_TOP: 3,
  CENTER_BOTTOM: 5,
  RIGHT_TOP: 6,
  RIGHT_CENTER: 7,
  RIGHT_BOTTOM: 8,
} as const

// ── Types ──

/** @public */
export type TooltipProps = {
  /** Text content to show in the tooltip. */
  content: string
  /** Render function for the tooltip visual. Receives the content string. */
  renderTooltip: (content: string) => JSX.Element
  /** Trigger element(s). */
  children: JSX.Element
  /** Delay before showing (ms). Default: 0 (instant). */
  showDelay?: number
  /** Delay before hiding (ms). Default: 0 (instant). */
  hideDelay?: number
  /** Whether the tooltip is disabled. */
  disabled?: boolean
  /** Placement relative to trigger. Default: "top". */
  placement?: "top" | "bottom" | "left" | "right"
  /** Offset from trigger in pixels. Default: 4. */
  offset?: number
}

/** @public */
export function Tooltip(props: TooltipProps) {
  const [visible, setVisible] = createSignal(false)
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  onCleanup(() => {
    if (showTimer) clearTimeout(showTimer)
    if (hideTimer) clearTimeout(hideTimer)
  })

  const show = () => {
    if (props.disabled) return
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
    const delay = props.showDelay ?? 0
    if (delay > 0) {
      showTimer = setTimeout(() => setVisible(true), delay)
    } else {
      setVisible(true)
    }
  }

  const hide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null }
    const delay = props.hideDelay ?? 0
    if (delay > 0) {
      hideTimer = setTimeout(() => setVisible(false), delay)
    } else {
      setVisible(false)
    }
  }

  return (
    <box direction="column" width="fit" height="fit">
      <box width="fit" height="fit" onMouseOver={show} onMouseOut={hide}>
        {props.children}
        {visible() ? (
          <box
            floating="parent"
            width="fit"
            height="fit"
            floatAttach={placementAttach(props.placement)}
            floatOffset={placementOffset(props.placement, props.offset ?? 4)}
            zIndex={9999}
            pointerPassthrough
          >
            {props.renderTooltip(props.content)}
          </box>
        ) : null}
      </box>
    </box>
  )
}

function placementAttach(placement: TooltipProps["placement"]): { element: number; parent: number } {
  switch (placement) {
    case "bottom": return { element: ATTACH_POINT.CENTER_TOP, parent: ATTACH_POINT.CENTER_BOTTOM }
    case "left": return { element: ATTACH_POINT.RIGHT_CENTER, parent: ATTACH_POINT.LEFT_CENTER }
    case "right": return { element: ATTACH_POINT.LEFT_CENTER, parent: ATTACH_POINT.RIGHT_CENTER }
    case "top":
    default: return { element: ATTACH_POINT.CENTER_BOTTOM, parent: ATTACH_POINT.CENTER_TOP }
  }
}

function placementOffset(placement: TooltipProps["placement"], offset: number): { x: number; y: number } {
  switch (placement) {
    case "left": return { x: -offset, y: 0 }
    case "right": return { x: offset, y: 0 }
    case "bottom": return { x: 0, y: offset }
    case "top":
    default: return { x: 0, y: -offset }
  }
}

export { Popover } from "./popover"
export type { PopoverTriggerContext, PopoverProps } from "./popover"
