/** useDrag runtime hook. */

import { createSignal } from "solid-js"
import { type NodeMouseEvent } from "../../core/src/node"
import { type NodeHandle } from "./handle"
import { setPointerCapture } from "./pointer"
import { beginNodeInteraction, endNodeInteraction } from "./interaction"
import type { InteractionBinding, InteractionLayerState } from "./interaction"

export type DragOptions = {
  onDragStart?: (evt: NodeMouseEvent) => boolean | void
  onDrag: (evt: NodeMouseEvent) => void
  onDragEnd?: (evt: NodeMouseEvent) => void
  disabled?: () => boolean
  interaction?: InteractionBinding
}

export type DragProps = {
  ref: (handle: NodeHandle) => void
  onMouseDown: (evt: NodeMouseEvent) => void
  onMouseMove: (evt: NodeMouseEvent) => void
  onMouseUp: (evt: NodeMouseEvent) => void
}

export type DragState = {
  dragging: () => boolean
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
