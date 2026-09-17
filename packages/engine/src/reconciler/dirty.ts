/**
 * Dirty flag — global notification channel between SolidJS reconciler and render loop.
 */

import type { DamageRect } from "../ffi/damage"

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
  markLayoutDirty: () => void
  isLayoutDirty: () => boolean
  clearLayoutDirty: () => void
  setLayoutDirty: (value: boolean) => void
}

/** @public */
export function createDirtyTracker(): DirtyTracker {
  let dirty = true
  let layoutDirty = true
  let version = 0

  return {
    markDirty() {
      dirty = true
      version += 1
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
    markLayoutDirty() {
      layoutDirty = true
    },
    isLayoutDirty() {
      return layoutDirty
    },
    clearLayoutDirty() {
      layoutDirty = false
    },
    setLayoutDirty(value: boolean) {
      layoutDirty = value
    },
  }
}

// WARNING: Module-level singleton — prevents multi-loop usage.
const defaultDirtyTracker = createDirtyTracker()

const DEFAULT_FULL_SCOPE: DirtyScope = Object.freeze({ kind: DIRTY_KIND.FULL }) as DirtyScope

/** Callbacks invoked whenever markDirty() is called.
 *  Used by render loops to also mark all layers dirty. */
const _onDirtyCallbacks = new Set<(scope: DirtyScope) => void>()
const _onLayoutDirtyCallbacks = new Set<() => void>()

/** Register a callback to be called whenever global markLayoutDirty fires. */
/** @public */
export function onGlobalLayoutDirty(cb: () => void): () => void {
  _onLayoutDirtyCallbacks.add(cb)
  return () => { _onLayoutDirtyCallbacks.delete(cb) }
}

/** Register a callback to be called whenever the global markDirty fires.
 *  The render loop uses this to chain markAllDirty (layer store). */
/** @public */
export function onGlobalDirty(cb: (scope: DirtyScope) => void): () => void {
  _onDirtyCallbacks.add(cb)
  return () => { _onDirtyCallbacks.delete(cb) }
}

/** @public */
export function markDirty(scope?: DirtyScope, tracker?: DirtyTracker) {
  defaultDirtyTracker.markDirty()
  tracker?.markDirty()
  const s = scope ?? DEFAULT_FULL_SCOPE
  if (s.kind === DIRTY_KIND.FULL) {
    markLayoutDirty(tracker)
  }
  for (const cb of _onDirtyCallbacks) cb(s)
}

/** @public */
export function isDirty(tracker?: DirtyTracker): boolean {
  return tracker ? tracker.isDirty() : defaultDirtyTracker.isDirty()
}

/** @public */
export function clearDirty(expectedVersion?: number, tracker?: DirtyTracker) {
  if (tracker) tracker.clearDirty(expectedVersion)
  else defaultDirtyTracker.clearDirty(expectedVersion)
}

/** @public */
export function dirtyVersion(tracker?: DirtyTracker): number {
  return tracker ? tracker.dirtyVersion() : defaultDirtyTracker.dirtyVersion()
}

/** @public */
export function markLayoutDirty(tracker?: DirtyTracker) {
  defaultDirtyTracker.markLayoutDirty()
  tracker?.markLayoutDirty()
  for (const cb of _onLayoutDirtyCallbacks) cb()
}

/** @public */
export function isLayoutDirty(tracker?: DirtyTracker): boolean {
  return tracker ? tracker.isLayoutDirty() : defaultDirtyTracker.isLayoutDirty()
}

/** @public */
export function clearLayoutDirty(tracker?: DirtyTracker) {
  if (tracker) tracker.clearLayoutDirty()
  else defaultDirtyTracker.clearLayoutDirty()
}

/** @public */
export function setLayoutDirty(value: boolean, tracker?: DirtyTracker) {
  if (value) markLayoutDirty(tracker)
  else clearLayoutDirty(tracker)
}
