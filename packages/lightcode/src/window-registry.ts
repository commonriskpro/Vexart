/**
 * WindowRegistry — maps window kinds to render functions.
 *
 * VS Code pattern: register a kind once, open N instances anywhere.
 * Each instance carries its own content state (typed, reactive signal).
 *
 * Decoupled from WindowManager: the registry owns CONTENT state,
 * WindowManager owns POSITION/SIZE/STATUS state. Two separate concerns.
 */

import type { JSX, Accessor } from "solid-js"
import { createSignal } from "solid-js"
import type {
  WindowManager,
  WindowBounds,
  WindowStatus,
  WindowOpenInput,
} from "../../windowing/src/types"

// ── Public types ──

export type WindowKindDef<S = unknown> = {
  kind: string
  /** Static string or function deriving title from initial state */
  defaultTitle: string | ((state: S) => string)
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
  /**
   * Render the window content. Receives a reactive state accessor
   * and an updater so the content can mutate its own state.
   */
  render: (
    windowId: string,
    state: Accessor<S>,
    update: (patch: Partial<S>) => void,
  ) => JSX.Element
}

export type PersistedWindow = {
  id: string
  kind: string
  bounds: WindowBounds
  status: WindowStatus
  zIndex: number
  contentState: unknown
}

export type WindowRegistryHandle = {
  register: <S>(def: WindowKindDef<S>) => void
  /** Open a new window instance. Returns the generated window id. */
  open: <S>(
    kind: string,
    state: S,
    opts?: { x?: number; y?: number; width?: number; height?: number; title?: string },
  ) => string
  /** Restore persisted windows. Call before mount. */
  restore: (windows: PersistedWindow[], order: string[], focusedId: string | null) => void
  /** Get current content state snapshot for a window (for persistence). */
  getContentState: (windowId: string) => unknown
  /** Render the content of a window. Call inside renderWindow prop of Desktop. */
  renderWindow: (windowId: string) => JSX.Element | null
  /** Clean up signals when a window closes. */
  cleanup: (windowId: string) => void
}

// ── Internal types ──

type ContentEntry = {
  state: Accessor<unknown>
  update: (patch: unknown) => void
}

// ── Implementation ──

let nextId = 1

export function createWindowRegistry(manager: WindowManager): WindowRegistryHandle {
  const defs = new Map<string, WindowKindDef<any>>()
  const content = new Map<string, ContentEntry>()

  function register<S>(def: WindowKindDef<S>) {
    defs.set(def.kind, def as WindowKindDef<any>)
  }

  function makeEntry<S>(initial: S): ContentEntry {
    const [state, setState] = createSignal<S>(initial)
    return {
      state: state as Accessor<unknown>,
      update: (patch: unknown) =>
        setState(prev => ({ ...prev as object, ...patch as object }) as S),
    }
  }

  function resolveTitle<S>(def: WindowKindDef<S>, state: S, override?: string): string {
    if (override) return override
    return typeof def.defaultTitle === "function"
      ? def.defaultTitle(state)
      : def.defaultTitle
  }

  function openWindow(input: WindowOpenInput) {
    manager.openWindow(input)
  }

  function open<S>(
    kind: string,
    state: S,
    opts?: { x?: number; y?: number; width?: number; height?: number; title?: string },
  ): string {
    const def = defs.get(kind)
    if (!def) throw new Error(`WindowRegistry: unknown kind "${kind}"`)

    const id = `${kind}-${nextId++}`
    const title = resolveTitle(def, state, opts?.title)

    content.set(id, makeEntry(state))

    openWindow({
      id,
      kind,
      title,
      bounds: {
        x: opts?.x ?? 60 + (nextId % 8) * 24,
        y: opts?.y ?? 60 + (nextId % 8) * 24,
        width: opts?.width ?? def.defaultSize.width,
        height: opts?.height ?? def.defaultSize.height,
      },
      constraints: def.minSize
        ? { minWidth: def.minSize.width, minHeight: def.minSize.height }
        : undefined,
    })

    return id
  }

  function restore(windows: PersistedWindow[], order: string[], focusedId: string | null) {
    for (const w of windows) {
      const def = defs.get(w.kind)
      if (!def) continue

      content.set(w.id, makeEntry(w.contentState))

      openWindow({
        id: w.id,
        kind: w.kind,
        title: resolveTitle(def, w.contentState),
        bounds: w.bounds,
        status: w.status,
      })

      // Bump the id counter so new windows never collide
      const num = parseInt(w.id.split("-").pop() ?? "0", 10)
      if (num >= nextId) nextId = num + 1
    }

    // Re-establish z-order by bringing windows to front in saved order
    for (const id of order) {
      if (manager.getWindow(id)) manager.bringToFront(id)
    }

    if (focusedId && manager.getWindow(focusedId)) {
      manager.focusWindow(focusedId)
    }
  }

  function getContentState(windowId: string): unknown {
    return content.get(windowId)?.state()
  }

  function renderWindow(windowId: string): JSX.Element | null {
    const win = manager.getWindow(windowId)
    if (!win) return null

    const def = defs.get(win.kind)
    if (!def) return null

    const entry = content.get(windowId)
    if (!entry) return null

    return def.render(windowId, entry.state as Accessor<any>, entry.update as any)
  }

  function cleanup(windowId: string) {
    content.delete(windowId)
  }

  return { register, open, restore, getContentState, renderWindow, cleanup }
}
