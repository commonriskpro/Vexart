/**
 * Dirty flag — global notification channel between SolidJS reconciler and render loop.
 */

import { appendFileSync } from "node:fs"

let dirty = true
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
}

export function isDirty(): boolean {
  return dirty
}

export function clearDirty() {
  dirty = false
}
