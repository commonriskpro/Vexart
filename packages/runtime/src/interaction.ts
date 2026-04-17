import { createSignal } from "solid-js"
import type { InteractionMode, TGENode } from "../../core/src/node"
import type { NodeHandle } from "./handle"

function getNodeInteractionMode(node: TGENode): InteractionMode {
  return (node.props.interactionMode as InteractionMode | undefined) ?? node._interactionMode
}

export function beginNodeInteraction(node: TGENode, mode: Exclude<InteractionMode, "none">) {
  if (node.destroyed) return
  if (node._interactionMode === mode) return
  node._interactionMode = mode
}

export function endNodeInteraction(node: TGENode, mode?: Exclude<InteractionMode, "none">) {
  if (node.destroyed) return
  if (mode && node._interactionMode !== mode) return
  if (node._interactionMode === "none") return
  node._interactionMode = "none"
}

export function hasActiveNodeInteraction(node: TGENode | null | undefined): boolean {
  if (!node) return false
  return getNodeInteractionMode(node) !== "none"
}

export function hasInteractionInSubtree(node: TGENode | null | undefined): boolean {
  if (!node) return false
  if (getNodeInteractionMode(node) !== "none") return true
  if (node.kind === "text") return false
  return node.children.some((child) => hasInteractionInSubtree(child))
}

export function shouldPromoteInteractionLayer(node: TGENode | null | undefined): boolean {
  if (!node) return false
  return getNodeInteractionMode(node) === "drag"
}

export function shouldFreezeInteractionLayer(node: TGENode | null | undefined): boolean {
  if (!node) return false
  return getNodeInteractionMode(node) === "drag"
}

export type InteractionLayerState = {
  ref: (handle: NodeHandle) => void
  node: () => TGENode | null
  mode: () => InteractionMode
  begin: (mode?: Exclude<InteractionMode, "none">) => void
  end: (mode?: Exclude<InteractionMode, "none">) => void
}

export type InteractionBinding = "auto" | "none" | InteractionLayerState

export function useInteractionLayer(): InteractionLayerState {
  let node: TGENode | null = null
  const [mode, setMode] = createSignal<InteractionMode>("none")

  function ref(handle: NodeHandle) {
    node = handle._node
  }

  function begin(nextMode: Exclude<InteractionMode, "none"> = "drag") {
    setMode(nextMode)
    if (node) beginNodeInteraction(node, nextMode)
  }

  function end(expectedMode?: Exclude<InteractionMode, "none">) {
    if (expectedMode && mode() !== expectedMode) return
    setMode("none")
    if (node) endNodeInteraction(node, expectedMode)
  }

  return { ref, node: () => node, mode, begin, end }
}
