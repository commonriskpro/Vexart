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

import { appendFileSync } from "node:fs"

let dirty = true // start dirty so first frame renders
const DIRTY_DEBUG_LOG = "/tmp/tge-dirty.log"
let dirtyLogCount = 0
const DIRTY_LOG_LIMIT = 200

export function markDirty() {
  dirty = true
  if (process.env.TGE_DEBUG_DIRTY === "1" && dirtyLogCount < DIRTY_LOG_LIMIT) {
    dirtyLogCount++
    const stack = new Error().stack
      ?.split("\n")
      .slice(2, 7)
      .map((line) => line.trim())
      .join(" | ")
    appendFileSync(DIRTY_DEBUG_LOG, `[markDirty #${dirtyLogCount}] ${stack || "no stack"}\n`)
  }
  // NOTE: we do NOT markAllDirty() here. The render loop handles
  // per-layer dirty detection by comparing pixel buffers after paint.
}

export function isDirty(): boolean {
  return dirty
}

export function clearDirty() {
  dirty = false
}
