import { createSignal } from "solid-js"
import type { InteractionMode, TGENode } from "../ffi/node"
import { getHandleNode, type NodeHandle } from "./handle"

function getNodeInteractionMode(node: TGENode): InteractionMode {
  return (node.props.interactionMode as InteractionMode | undefined) ?? node._interactionMode ?? "none"
}

/** @public */
export function beginNodeInteraction(node: TGENode, mode: Exclude<InteractionMode, "none">) {
  if (node.destroyed) return
  if (node._interactionMode === mode) return
  node._interactionMode = mode
}

/** @public */
export function endNodeInteraction(node: TGENode, mode?: Exclude<InteractionMode, "none">) {
  if (node.destroyed) return
  if (mode && node._interactionMode !== mode) return
  if (node._interactionMode === "none") return
  node._interactionMode = "none"
}

/** @public */
export function hasActiveNodeInteraction(node: TGENode | null | undefined): boolean {
  if (!node) return false
  return getNodeInteractionMode(node) !== "none"
}

/** @public */
export function hasInteractionInSubtree(node: TGENode | null | undefined): boolean {
  if (!node) return false
  if (getNodeInteractionMode(node) !== "none") return true
  if (node.kind === "text") return false
  return node.children.some((child) => hasInteractionInSubtree(child))
}

/** @public */
export function shouldPromoteInteractionLayer(node: TGENode | null | undefined): boolean {
  if (!node) return false
  const mode = getNodeInteractionMode(node)
  if (mode === "drag" || (mode as string) === "hover" || (mode as string) === "active") return true
  const props = node.props
  if (!props) return false
  if (props.hoverStyle || props.activeStyle) return true
  return !!(
    props.onClick ||
    props.onPress ||
    props.onMouseDown ||
    props.onMouseUp ||
    props.onMouseOver ||
    props.onMouseOut
  )
}

/** @public */
export function shouldFreezeInteractionLayer(node: TGENode | null | undefined): boolean {
  if (!node) return false
  return getNodeInteractionMode(node) === "drag"
}

/** @public */
export type InteractionLayerState = {
  ref: (handle: NodeHandle) => void
  node: () => NodeHandle | null
  mode: () => InteractionMode
  begin: (mode?: Exclude<InteractionMode, "none">) => void
  end: (mode?: Exclude<InteractionMode, "none">) => void
}

/** @public */
export type InteractionBinding = "auto" | "none" | InteractionLayerState

/** @public */
export function useInteractionLayer(): InteractionLayerState {
  let handle: NodeHandle | null = null
  const [mode, setMode] = createSignal<InteractionMode>("none")

  function ref(next: NodeHandle) {
    handle = next
  }

  function begin(nextMode: Exclude<InteractionMode, "none"> = "drag") {
    setMode(nextMode)
    if (handle) {
      beginNodeInteraction(getHandleNode(handle), nextMode)
    }
  }

  function end(expectedMode?: Exclude<InteractionMode, "none">) {
    if (expectedMode && mode() !== expectedMode) return
    setMode("none")
    if (handle) {
      endNodeInteraction(getHandleNode(handle), expectedMode)
    }
  }

  return { ref, node: () => handle, mode, begin, end }
}
