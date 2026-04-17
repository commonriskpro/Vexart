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

/** @deprecated Use createDirtyTracker() and keep state per render loop instance. */
export function markDirty() {
  defaultDirtyTracker.markDirty()
}

/** @deprecated Use createDirtyTracker() and keep state per render loop instance. */
export function isDirty(): boolean {
  return defaultDirtyTracker.isDirty()
}

/** @deprecated Use createDirtyTracker() and keep state per render loop instance. */
export function clearDirty() {
  defaultDirtyTracker.clearDirty()
}
