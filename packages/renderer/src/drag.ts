/**
 * useDrag — reusable hook for mouse drag interactions.
 *
 * Encapsulates the common drag pattern:
 *   1. mousedown → start drag, capture pointer
 *   2. mousemove → update during drag (captured, even outside bounds)
 *   3. mouseup → end drag, auto-release capture
 *
 * Usage:
 *   const { dragging, dragProps } = useDrag({
 *     onDragStart: (evt) => { jumpToPosition(evt); return true },
 *     onDrag: (evt) => updatePosition(evt),
 *     onDragEnd: (evt) => finalize(evt),
 *   })
 *
 *   <box {...dragProps} width={200} height={12} backgroundColor="#333" />
 */

import { type NodeMouseEvent } from "./node"
import { type NodeHandle } from "./handle"
import { setPointerCapture } from "./pointer"

export type DragOptions = {
  /** Called on mousedown. Return false to prevent drag start. */
  onDragStart?: (evt: NodeMouseEvent) => boolean | void
  /** Called on each mousemove during drag. */
  onDrag: (evt: NodeMouseEvent) => void
  /** Called on mouseup to end drag. */
  onDragEnd?: (evt: NodeMouseEvent) => void
  /** Whether drag is disabled. */
  disabled?: () => boolean
}

export type DragProps = {
  ref: (handle: NodeHandle) => void
  onMouseDown: (evt: NodeMouseEvent) => void
  onMouseMove: (evt: NodeMouseEvent) => void
  onMouseUp: (evt: NodeMouseEvent) => void
}

export type DragState = {
  /** Whether currently dragging. */
  dragging: () => boolean
  /** Spread on the drag target element. */
  dragProps: DragProps
}

export function useDrag(opts: DragOptions): DragState {
  let nodeId = 0
  let isDragging = false

  function handleRef(handle: NodeHandle) {
    nodeId = handle.id
  }

  function handleMouseDown(evt: NodeMouseEvent) {
    if (opts.disabled?.()) return
    const allow = opts.onDragStart?.(evt)
    if (allow === false) return
    isDragging = true
    if (nodeId) setPointerCapture(nodeId)
  }

  function handleMouseMove(evt: NodeMouseEvent) {
    if (!isDragging) return
    if (opts.disabled?.()) return
    opts.onDrag(evt)
  }

  function handleMouseUp(evt: NodeMouseEvent) {
    if (!isDragging) return
    isDragging = false
    opts.onDragEnd?.(evt)
  }

  return {
    dragging: () => isDragging,
    dragProps: {
      ref: handleRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
    },
  }
}
