/**
 * Dirty flag — global notification channel between SolidJS reconciler and render loop.
 *
 * When SolidJS updates a node (setProperty, insertNode, removeNode, replaceText),
 * the reconciler calls markDirty(). The render loop checks isDirty() each tick
 * and repaints when true.
 *
 * Also marks all layers dirty so they get repainted.
 * Future optimization: per-node layer tracking to only mark the affected layer.
 */

let dirty = true // start dirty so first frame renders

export function markDirty() {
  dirty = true
  // NOTE: we do NOT markAllDirty() here. The render loop handles
  // per-layer dirty detection by comparing pixel buffers after paint.
}

export function isDirty(): boolean {
  return dirty
}

export function clearDirty() {
  dirty = false
}
