import { createSignal } from "solid-js"
import { type NodeMouseEvent } from "../../engine/src/ffi/node"

export type HoverOptions = {
  onEnter?: () => void
  onLeave?: () => void
  delay?: number
  leaveDelay?: number
  disabled?: () => boolean
}

export type HoverProps = {
  onMouseOver: (evt: NodeMouseEvent) => void
  onMouseOut: (evt: NodeMouseEvent) => void
}

export type HoverState = {
  hovered: () => boolean
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
