/**
 * useHover — reusable hook for hover interactions with optional delays.
 *
 * Encapsulates the pattern of tracking mouse enter/leave with configurable
 * delays for show/hide behavior (e.g. tooltips, dropdown highlights).
 *
 * Usage:
 *   const { hovered, hoverProps } = useHover({
 *     delay: 500,       // show after 500ms
 *     leaveDelay: 200,  // hide 200ms after leaving
 *   })
 *
 *   <box {...hoverProps} backgroundColor={hovered() ? "#333" : "#111"}>
 *     <text>Hover me</text>
 *   </box>
 */

import { createSignal } from "solid-js"
import { type NodeMouseEvent } from "./node"

export type HoverOptions = {
  /** Called when hover starts (after delay if specified). */
  onEnter?: () => void
  /** Called when hover ends (after leaveDelay if specified). */
  onLeave?: () => void
  /** Delay in ms before onEnter fires. Default: 0 (immediate). */
  delay?: number
  /** Delay in ms before onLeave fires. Default: 0 (immediate). */
  leaveDelay?: number
  /** Whether hover tracking is disabled. */
  disabled?: () => boolean
}

export type HoverProps = {
  onMouseOver: (evt: NodeMouseEvent) => void
  onMouseOut: (evt: NodeMouseEvent) => void
}

export type HoverState = {
  /** Whether the element is currently hovered (after delay). */
  hovered: () => boolean
  /** Spread on the element for hover tracking. */
  hoverProps: HoverProps
}

export function useHover(opts?: HoverOptions): HoverState {
  const [hovered, setHovered] = createSignal(false)
  let enterTimer: ReturnType<typeof setTimeout> | null = null
  let leaveTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers() {
    if (enterTimer) { clearTimeout(enterTimer); enterTimer = null }
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null }
  }

  function handleMouseOver(_evt: NodeMouseEvent) {
    if (opts?.disabled?.()) return
    clearTimers()
    const delay = opts?.delay ?? 0
    if (delay > 0) {
      enterTimer = setTimeout(() => {
        setHovered(true)
        opts?.onEnter?.()
      }, delay)
    } else {
      setHovered(true)
      opts?.onEnter?.()
    }
  }

  function handleMouseOut(_evt: NodeMouseEvent) {
    if (opts?.disabled?.()) return
    clearTimers()
    const delay = opts?.leaveDelay ?? 0
    if (delay > 0) {
      leaveTimer = setTimeout(() => {
        setHovered(false)
        opts?.onLeave?.()
      }, delay)
    } else {
      setHovered(false)
      opts?.onLeave?.()
    }
  }

  return {
    hovered,
    hoverProps: {
      onMouseOver: handleMouseOver,
      onMouseOut: handleMouseOut,
    },
  }
}
