/**
 * Dirty flag — global notification channel between SolidJS reconciler and render loop.
 */

import { appendFileSync } from "node:fs"
import type { DamageRect } from "../ffi/damage"

const DIRTY_DEBUG_LOG = "/tmp/tge-dirty.log"
const DIRTY_LOG_LIMIT = 200

/** @public */
export const DIRTY_KIND = {
  FULL: "full",
  INTERACTION: "interaction",
  NODE_VISUAL: "node-visual",
} as const

/** @public */
export type DirtyKind = (typeof DIRTY_KIND)[keyof typeof DIRTY_KIND]

/** @public */
export type DirtyScope = {
  kind: DirtyKind
  nodeId?: number
  rect?: DamageRect
}

/** @public */
export type DirtyTracker = {
  markDirty: () => void
  isDirty: () => boolean
  clearDirty: (expectedVersion?: number) => void
  dirtyVersion: () => number
}

/** @public */
export function createDirtyTracker(): DirtyTracker {
  let dirty = true
  let version = 0
  let dirtyLogCount = 0

  return {
    markDirty() {
      dirty = true
      version += 1
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
    clearDirty(expectedVersion?: number) {
      if (expectedVersion !== undefined && expectedVersion !== version) return
      dirty = false
    },
    dirtyVersion() {
      return version
    },
  }
}

const defaultDirtyTracker = createDirtyTracker()

/** Callback invoked whenever markDirty() is called.
 *  Used by the render loop to also mark all layers dirty. */
let _onDirtyCallback: ((scope: DirtyScope) => void) | null = null

/** Register a callback to be called whenever the global markDirty fires.
 *  The render loop uses this to chain markAllDirty (layer store). */
/** @public */
export function onGlobalDirty(cb: (scope: DirtyScope) => void) {
  _onDirtyCallback = cb
}

/** @public */
export function markDirty(scope?: DirtyScope) {
  defaultDirtyTracker.markDirty()
  _onDirtyCallback?.(scope ?? { kind: DIRTY_KIND.FULL })
}

/** @public */
export function isDirty(): boolean {
  return defaultDirtyTracker.isDirty()
}

/** @public */
export function clearDirty(expectedVersion?: number) {
  defaultDirtyTracker.clearDirty(expectedVersion)
}

export function dirtyVersion() {
  return defaultDirtyTracker.dirtyVersion()
}
