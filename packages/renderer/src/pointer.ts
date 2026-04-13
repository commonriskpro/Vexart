/**
 * Pointer capture — module-level API for mouse drag handling.
 *
 * When a node "captures" the pointer, ALL mouse events (move, up, etc.)
 * are routed to that node regardless of cursor position — essential for
 * drag interactions like Slider or resize handles.
 *
 * Works like Element.setPointerCapture() in the DOM:
 *   1. Component calls setPointerCapture(nodeId) on mousedown
 *   2. Engine routes all mouse events to that node (even outside bounds)
 *   3. Auto-released on button release, or manual releasePointerCapture()
 *
 * Architecture:
 *   Components call setPointerCapture/releasePointerCapture (module API)
 *   → delegates to the active RenderLoop instance
 *   → updateInteractiveStates checks capturedNodeId before hit-testing
 */

import type { RenderLoop } from "./loop"

/** The currently active render loop — set by mount(), cleared on destroy. */
let activeLoop: RenderLoop | null = null

/** Bind the active render loop. Called by mount(). */
export function bindLoop(loop: RenderLoop) {
  activeLoop = loop
}

/** Unbind the active render loop. Called on destroy. */
export function unbindLoop() {
  activeLoop = null
}

/**
 * Capture the pointer for the given node.
 * While captured, all mouse events route to this node regardless of cursor position.
 * Auto-released on mouse button release.
 */
export function setPointerCapture(nodeId: number): void {
  activeLoop?.setPointerCapture(nodeId)
}

/**
 * Release pointer capture for the given node.
 * Only releases if this node currently holds capture.
 */
export function releasePointerCapture(nodeId: number): void {
  activeLoop?.releasePointerCapture(nodeId)
}

/**
 * Register a callback that runs after Clay processes scroll but before walkTree.
 * Returns an unregister function. Used by VirtualList for zero-latency scroll sync.
 */
export function onPostScroll(cb: () => void): () => void {
  return activeLoop?.onPostScroll(cb) ?? (() => {})
}


