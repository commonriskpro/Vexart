/**
 * Dirty flag — global notification channel between SolidJS reconciler and render loop.
 */

import { appendFileSync } from "node:fs"

const DIRTY_DEBUG_LOG = "/tmp/tge-dirty.log"
const DIRTY_LOG_LIMIT = 200

export type DirtyTracker = {
  markDirty: () => void
  isDirty: () => boolean
  clearDirty: () => void
}

export function createDirtyTracker(): DirtyTracker {
  let dirty = true
  let dirtyLogCount = 0

  return {
    markDirty() {
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
    },
    isDirty() {
      return dirty
    },
    clearDirty() {
      dirty = false
    },
  }
}

const defaultDirtyTracker = createDirtyTracker()

/** Callback invoked whenever markDirty() is called.
 *  Used by the render loop to also mark all layers dirty. */
let _onDirtyCallback: (() => void) | null = null

/** Register a callback to be called whenever the global markDirty fires.
 *  The render loop uses this to chain markAllDirty (layer store). */
export function onGlobalDirty(cb: () => void) {
  _onDirtyCallback = cb
}

export function markDirty() {
  defaultDirtyTracker.markDirty()
  _onDirtyCallback?.()
}

export function isDirty(): boolean {
  return defaultDirtyTracker.isDirty()
}

export function clearDirty() {
  defaultDirtyTracker.clearDirty()
}
