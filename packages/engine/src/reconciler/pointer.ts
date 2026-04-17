/** Pointer capture runtime boundary. */

import type { RenderLoop } from "../loop/loop"
import type { DamageRect } from "../ffi/damage"

let activeLoop: RenderLoop | null = null

export function bindLoop(loop: RenderLoop) {
  activeLoop = loop
}

export function unbindLoop() {
  activeLoop = null
}

export function setPointerCapture(nodeId: number): void {
  activeLoop?.setPointerCapture(nodeId)
}

export function releasePointerCapture(nodeId: number): void {
  activeLoop?.releasePointerCapture(nodeId)
}

export function onPostScroll(cb: () => void): () => void {
  return activeLoop?.onPostScroll(cb) ?? (() => {})
}

export function markNodeLayerDamaged(nodeId: number, rect?: DamageRect): void {
  activeLoop?.markNodeLayerDamaged(nodeId, rect)
}

export function requestInteractionFrame(kind: "pointer" | "scroll" | "key"): void {
  activeLoop?.requestInteractionFrame(kind)
}
