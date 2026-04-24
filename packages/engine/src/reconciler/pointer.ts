/** Pointer capture runtime boundary. */

import type { RenderLoop } from "../loop/loop"
import type { DamageRect } from "../ffi/damage"

let activeLoop: RenderLoop | null = null

/** @public */
export function bindLoop(loop: RenderLoop) {
  activeLoop = loop
}

/** @public */
export function unbindLoop() {
  activeLoop = null
}

/** @public */
export function setPointerCapture(nodeId: number): void {
  activeLoop?.setPointerCapture(nodeId)
}

/** @public */
export function releasePointerCapture(nodeId: number): void {
  activeLoop?.releasePointerCapture(nodeId)
}

/** @public */
export function onPostScroll(cb: () => void): () => void {
  return activeLoop?.onPostScroll(cb) ?? (() => {})
}

/** @public */
export function markNodeLayerDamaged(nodeId: number, rect?: DamageRect): void {
  activeLoop?.markNodeLayerDamaged(nodeId, rect)
}

/** @public */
export function requestInteractionFrame(kind: "pointer" | "scroll" | "key"): void {
  activeLoop?.requestInteractionFrame(kind)
}
