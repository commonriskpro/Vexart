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

import { createSignal } from "solid-js"
import { type NodeMouseEvent } from "./node"
import { type NodeHandle } from "./handle"
import { setPointerCapture } from "./pointer"
import { beginNodeInteraction, endNodeInteraction } from "./interaction"
import type { InteractionBinding, InteractionLayerState } from "./interaction"

export type DragOptions = {
  /** Called on mousedown. Return false to prevent drag start. */
  onDragStart?: (evt: NodeMouseEvent) => boolean | void
  /** Called on each mousemove during drag. */
  onDrag: (evt: NodeMouseEvent) => void
  /** Called on mouseup to end drag. */
  onDragEnd?: (evt: NodeMouseEvent) => void
  /** Whether drag is disabled. */
  disabled?: () => boolean
  /** Engine interaction handling. "auto" marks the drag target, "none" disables it, or pass an interaction layer state. */
  interaction?: InteractionBinding
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
  let node: NodeHandle["_node"] | null = null
  const [dragging, setDragging] = createSignal(false)

  function getInteractionLayer(): InteractionLayerState | null {
    const interaction = opts.interaction
    if (!interaction || interaction === "auto" || interaction === "none") return null
    return interaction
  }

  function beginInteraction() {
    const interaction = opts.interaction ?? "auto"
    if (interaction === "none") return
    if (interaction !== "auto") {
      interaction.begin("drag")
      return
    }
    if (node) beginNodeInteraction(node, "drag")
  }

  function endInteraction() {
    const interaction = opts.interaction ?? "auto"
    if (interaction === "none") return
    if (interaction !== "auto") {
      interaction.end("drag")
      return
    }
    if (node) endNodeInteraction(node, "drag")
  }

  function handleRef(handle: NodeHandle) {
    nodeId = handle.id
    node = handle._node
    const interaction = getInteractionLayer()
    if (interaction) interaction.ref(handle)
  }

  function handleMouseDown(evt: NodeMouseEvent) {
    if (opts.disabled?.()) return
    const allow = opts.onDragStart?.(evt)
    if (allow === false) return
    setDragging(true)
    beginInteraction()
    if (nodeId) setPointerCapture(nodeId)
  }

  function handleMouseMove(evt: NodeMouseEvent) {
    if (!dragging()) return
    if (opts.disabled?.()) return
    opts.onDrag(evt)
  }

  function handleMouseUp(evt: NodeMouseEvent) {
    if (!dragging()) return
    setDragging(false)
    endInteraction()
    opts.onDragEnd?.(evt)
  }

  return {
    dragging,
    dragProps: {
      ref: handleRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
    },
  }
}
