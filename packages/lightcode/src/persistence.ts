/**
 * LayoutPersistence — reads and writes the app layout to disk.
 *
 * Saves: window positions/sizes/status + window content state + graph state.
 * Location: ./lightcode-layout.json (option B — current dir).
 *
 * Design decisions:
 * - Debounced write (500ms) — drag moves produce many calls, only one write.
 * - Versioned schema — v1 now, easy to migrate if shape changes.
 * - flush() for clean shutdown (e.g. process exit).
 */

import type { WindowStatus } from "../../windowing/src/types"

// ── Schema ──

export type PersistedWindow = {
  id: string
  kind: string
  bounds: { x: number; y: number; width: number; height: number }
  status: WindowStatus
  zIndex: number
  contentState: unknown
}

export type PersistedLayout = {
  version: 1
  windows: PersistedWindow[]
  order: string[]
  focusedId: string | null
  graph: {
    positions: Record<string, { x: number; y: number }>
    viewport: { x: number; y: number; zoom: number }
  }
}

// ── Handle ──

export type PersistenceHandle = {
  load: () => Promise<PersistedLayout | null>
  save: (layout: PersistedLayout) => void
  flush: () => Promise<void>
}

// ── Implementation ──

const DEBOUNCE_MS = 500

export function createLayoutPersistence(filename: string): PersistenceHandle {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: PersistedLayout | null = null

  async function load(): Promise<PersistedLayout | null> {
    const file = Bun.file(filename)
    const exists = await file.exists()
    if (!exists) return null
    const text = await file.text()
    const data = JSON.parse(text) as PersistedLayout
    // Version guard — discard incompatible layouts silently
    if (data.version !== 1) return null
    return data
  }

  async function flush(): Promise<void> {
    if (!pending) return
    const data = pending
    pending = null
    if (timer) { clearTimeout(timer); timer = null }
    await Bun.write(filename, JSON.stringify(data, null, 2))
  }

  function save(layout: PersistedLayout) {
    pending = layout
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void flush() }, DEBOUNCE_MS)
  }

  return { load, save, flush }
}
