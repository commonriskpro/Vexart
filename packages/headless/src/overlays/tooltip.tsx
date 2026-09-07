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

/**
 * Popover — truly headless popover primitive.
 *
 * Similar to `Tooltip`, but intended for interactive content.
 *
 * @public
 */

/** @public */
export type PopoverTriggerContext = {
  open: boolean
  toggle: () => void
}

/** @public */
export type PopoverProps = {
  /** Controlled open state. */
  open: boolean
  /** Called when open state should change. */
  onOpenChange: (open: boolean) => void
  /** Render the trigger element. */
  renderTrigger: (ctx: PopoverTriggerContext) => JSX.Element
  /** Render the popover content (only when open). */
  renderContent: () => JSX.Element
  /** Placement. Default: "bottom". */
  placement?: "top" | "bottom" | "left" | "right"
  /** Offset from trigger. Default: 4. */
  offset?: number
}

/** @public */
export function Popover(props: PopoverProps) {
  const toggle = () => props.onOpenChange(!props.open)

  const triggerCtx = (): PopoverTriggerContext => ({
    open: props.open,
    toggle,
  })

  return (
    <box direction="column" width="fit" height="fit">
      {props.renderTrigger(triggerCtx())}
      {props.open ? (
        <box
          floating="parent"
          width="fit"
          height="fit"
          floatAttach={popoverAttach(props.placement ?? "bottom")}
          floatOffset={placementOffset(props.placement ?? "bottom", props.offset ?? 4)}
          zIndex={9998}
        >
          {props.renderContent()}
        </box>
      ) : null}
    </box>
  )
}

function popoverAttach(placement: PopoverProps["placement"]): { element: number; parent: number } {
  switch (placement) {
    case "top": return { element: ATTACH_POINT.LEFT_BOTTOM, parent: ATTACH_POINT.LEFT_TOP }
    case "left": return { element: ATTACH_POINT.RIGHT_TOP, parent: ATTACH_POINT.LEFT_TOP }
    case "right": return { element: ATTACH_POINT.LEFT_TOP, parent: ATTACH_POINT.RIGHT_TOP }
    case "bottom":
    default: return { element: ATTACH_POINT.LEFT_TOP, parent: ATTACH_POINT.LEFT_BOTTOM }
  }
}
