/**
 * Tooltip — truly headless tooltip/popover primitive.
 *
 * Provides behavior only:
 *   - Trigger element that shows/hides content
 *   - Delayed show/hide (configurable)
 *   - Portal rendering (above all content)
 *   - Keyboard: Escape to dismiss
 *
 * ALL visual styling is the consumer's responsibility.
 * Use @tge/void VoidTooltip for a styled version.
 *
 * Usage:
 *   <Tooltip
 *     content="Save your work"
 *     renderTooltip={(content) => (
 *       <box backgroundColor="#333" padding={4} cornerRadius={4}>
 *         <text color="#fff" fontSize={12}>{content}</text>
 *       </box>
 *     )}
 *   >
 *     <text>Hover me</text>
 *   </Tooltip>
 */

import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { Portal } from "./portal"

// ── Types ──

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

export function Tooltip(props: TooltipProps) {
  const [visible, setVisible] = createSignal(false)
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

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
    <box direction="column">
      <box onMouseOver={show} onMouseOut={hide}>
        {props.children}
      </box>
      {visible() ? (
        <Portal>
          <box
            floating="root"
            floatOffset={{ x: 0, y: -(props.offset ?? 4) }}
            zIndex={9999}
            pointerPassthrough
          >
            {props.renderTooltip(props.content)}
          </box>
        </Portal>
      ) : null}
    </box>
  )
}

/**
 * Popover — truly headless popover primitive.
 *
 * Like Tooltip but for interactive content (forms, menus).
 * Stays open until explicitly closed. Supports focus trap.
 *
 * Usage:
 *   <Popover
 *     open={isOpen()}
 *     onOpenChange={setOpen}
 *     renderTrigger={(ctx) => (
 *       <box focusable onPress={() => ctx.toggle()}>
 *         <text>Open menu</text>
 *       </box>
 *     )}
 *     renderContent={() => (
 *       <box backgroundColor="#1a1a2e" padding={8} cornerRadius={8}>
 *         <text>Popover content</text>
 *       </box>
 *     )}
 *   />
 */

export type PopoverTriggerContext = {
  open: boolean
  toggle: () => void
}

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

export function Popover(props: PopoverProps) {
  const toggle = () => props.onOpenChange(!props.open)

  const triggerCtx = (): PopoverTriggerContext => ({
    open: props.open,
    toggle,
  })

  return (
    <box direction="column">
      {props.renderTrigger(triggerCtx())}
      {props.open ? (
        <box
          floating="parent"
          floatOffset={{ x: 0, y: props.offset ?? 4 }}
          zIndex={9998}
        >
          {props.renderContent()}
        </box>
      ) : null}
    </box>
  )
}
