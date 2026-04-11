/**
 * Dirty flag — global notification channel between SolidJS reconciler and render loop.
 *
 * When SolidJS updates a node (setProperty, insertNode, removeNode, replaceText),
 * the reconciler calls markDirty(). The render loop checks isDirty() each tick
 * and repaints when true.
 *
 * This is intentionally a simple module-level flag — there's only one render
 * loop per process. No dependency injection needed.
 */

let dirty = true // start dirty so first frame renders

export function markDirty() {
  dirty = true
}

export function isDirty(): boolean {
  return dirty
}

export function clearDirty() {
  dirty = false
}
