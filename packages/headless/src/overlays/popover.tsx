/**
 * Popover — truly headless popover primitive.
 *
 * Provides focus trapping, Escape key dismissal (coordinated via overlay-stack),
 * and outside click dismissal.
 *
 * @public
 */

import { onCleanup, Show, type JSX } from "solid-js"
import { focusedId, onInput, pushFocusScope, setFocus } from "@vexart/engine"
import { isTopOverlay, pushOverlayDismiss } from "./overlay-stack"

// Floating attach points are intentionally kept internal to the engine. The
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
  /** Whether the popover traps focus and blocks background interaction. Default: true. */
  modal?: boolean
}

type PopoverPanelProps = {
  modal?: boolean
  placement?: PopoverProps["placement"]
  offset?: number
  onClose: () => void
  renderContent: () => JSX.Element
}

function PopoverPanel(props: PopoverPanelProps) {
  const isModal = props.modal !== false
  const savedFocusId = isModal ? focusedId() : null
  const popScope = isModal ? pushFocusScope() : null

  const close = () => props.onClose()
  const popDismiss = pushOverlayDismiss(close)

  const unsubscribe = onInput((event) => {
    if (event.type === "key" && event.key === "escape" && isTopOverlay(close)) {
      close()
    }
  })

  onCleanup(() => {
    unsubscribe()
    popDismiss()
    if (popScope) popScope()
    if (savedFocusId) setFocus(savedFocusId)
  })

  return (
    <>
      <Show when={isModal}>
        <box
          floating="root"
          width="100%"
          height="100%"
          zIndex={9997}
          onPress={close}
        />
      </Show>
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
    </>
  )
}

/** @public */
export function Popover(props: PopoverProps) {
  const toggle = () => props.onOpenChange(!props.open)

  const triggerCtx: PopoverTriggerContext = {
    get open() { return props.open },
    toggle,
  }

  return (
    <box direction="column" width="fit" height="fit">
      {props.renderTrigger(triggerCtx)}
      <Show when={props.open}>
        <PopoverPanel
          modal={props.modal}
          placement={props.placement}
          offset={props.offset}
          onClose={() => props.onOpenChange(false)}
          renderContent={props.renderContent}
        />
      </Show>
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

function placementOffset(placement: PopoverProps["placement"], offset: number): { x: number; y: number } {
  switch (placement) {
    case "left": return { x: -offset, y: 0 }
    case "right": return { x: offset, y: 0 }
    case "bottom": return { x: 0, y: offset }
    case "top":
    default: return { x: 0, y: -offset }
  }
}
