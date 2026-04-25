import { createSignal } from "solid-js"

export const LIGHTCODE_WINDOW_STATUS = {
  NORMAL: "normal",
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
  CLOSED: "closed",
} as const

export type LightcodeWindowStatus = (typeof LIGHTCODE_WINDOW_STATUS)[keyof typeof LIGHTCODE_WINDOW_STATUS]

export const LIGHTCODE_RESIZE_EDGE = {
  RIGHT: "right",
  BOTTOM: "bottom",
  CORNER: "corner",
} as const

export type LightcodeResizeEdge = (typeof LIGHTCODE_RESIZE_EDGE)[keyof typeof LIGHTCODE_RESIZE_EDGE]

export interface LightcodeWindowRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LightcodeDesktopRect {
  width: number
  height: number
  inset: number
}

export interface LightcodeWindowInput {
  id: string
  title: string
  subtitle?: string
  rect: LightcodeWindowRect
  minWidth?: number
  minHeight?: number
  status?: LightcodeWindowStatus
  zIndex?: number
}

export interface LightcodeWindowSnapshot {
  id: string
  title: string
  subtitle: string
  rect: LightcodeWindowRect
  restoreRect: LightcodeWindowRect
  minWidth: number
  minHeight: number
  status: LightcodeWindowStatus
  zIndex: number
  active: boolean
}

export interface LightcodeWindowManagerOptions {
  windows: LightcodeWindowInput[]
  desktop: LightcodeDesktopRect
  baseZIndex?: number
}

export interface LightcodeWindowManager {
  windows: () => readonly LightcodeWindowSnapshot[]
  visibleWindows: () => readonly LightcodeWindowSnapshot[]
  minimizedWindows: () => readonly LightcodeWindowSnapshot[]
  activeId: () => string | null
  focus: (id: string) => void
  move: (id: string, rect: LightcodeWindowRect) => void
  moveBy: (id: string, deltaX: number, deltaY: number) => void
  resize: (id: string, rect: LightcodeWindowRect) => void
  resizeBy: (id: string, edge: LightcodeResizeEdge, deltaX: number, deltaY: number) => void
  minimize: (id: string) => void
  maximize: (id: string) => void
  restore: (id: string) => void
  toggleMaximize: (id: string) => void
  close: (id: string) => void
  reopen: (id: string) => void
}

const DEFAULT_MIN_WIDTH = 220
const DEFAULT_MIN_HEIGHT = 120
const DEFAULT_BASE_Z_INDEX = 100
const MAX_WINDOW_Z_INDEX = 8_999

function cloneRect(rect: LightcodeWindowRect): LightcodeWindowRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

function clampRect(rect: LightcodeWindowRect, minWidth: number, minHeight: number): LightcodeWindowRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(minWidth, Math.round(rect.width)),
    height: Math.max(minHeight, Math.round(rect.height)),
  }
}

function maximizedRect(desktop: LightcodeDesktopRect): LightcodeWindowRect {
  const inset = desktop.inset
  return {
    x: inset,
    y: inset,
    width: Math.max(0, desktop.width - inset * 2),
    height: Math.max(0, desktop.height - inset * 2),
  }
}

function createSnapshot(input: LightcodeWindowInput, index: number, baseZIndex: number, desktop: LightcodeDesktopRect): LightcodeWindowSnapshot {
  const status = input.status ?? LIGHTCODE_WINDOW_STATUS.NORMAL
  const rect = status === LIGHTCODE_WINDOW_STATUS.MAXIMIZED
    ? maximizedRect(desktop)
    : cloneRect(input.rect)
  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle ?? "",
    rect,
    restoreRect: cloneRect(input.rect),
    minWidth: input.minWidth ?? DEFAULT_MIN_WIDTH,
    minHeight: input.minHeight ?? DEFAULT_MIN_HEIGHT,
    status,
    zIndex: input.zIndex ?? baseZIndex + index,
    active: false,
  }
}

function sortByZIndex(windows: readonly LightcodeWindowSnapshot[]): LightcodeWindowSnapshot[] {
  return [...windows].sort((a, b) => a.zIndex - b.zIndex)
}

function canActivate(window: LightcodeWindowSnapshot): boolean {
  if (window.status === LIGHTCODE_WINDOW_STATUS.CLOSED) return false
  if (window.status === LIGHTCODE_WINDOW_STATUS.MINIMIZED) return false
  return true
}

function renormalizeZIndexes(items: readonly LightcodeWindowSnapshot[], active: string, baseZIndex: number): LightcodeWindowSnapshot[] {
  const ordered = sortByZIndex(items.filter((window) => window.id !== active))
  let zIndex = baseZIndex
  const zById = new Map<string, number>()
  for (const window of ordered) {
    zById.set(window.id, zIndex)
    zIndex = Math.min(zIndex + 1, MAX_WINDOW_Z_INDEX - 1)
  }
  zById.set(active, Math.min(Math.max(zIndex, baseZIndex + 1), MAX_WINDOW_Z_INDEX))
  return items.map((window) => ({ ...window, zIndex: zById.get(window.id) ?? window.zIndex }))
}

function activateTopmost(items: readonly LightcodeWindowSnapshot[]): { activeId: string | null; windows: LightcodeWindowSnapshot[] } {
  const active = sortByZIndex(items.filter(canActivate)).at(-1)
  return {
    activeId: active?.id ?? null,
    windows: items.map((window) => ({ ...window, active: active?.id === window.id })),
  }
}

/**
 * Application-local Lightcode window manager.
 *
 * This is intentionally not a public Vexart package yet. The API can harden in
 * Lightcode first, then graduate to `@vexart/windowing` once proven.
 */
export function createWindowManager(options: LightcodeWindowManagerOptions): LightcodeWindowManager {
  const baseZIndex = options.baseZIndex ?? DEFAULT_BASE_Z_INDEX
  const initial = options.windows.map((window, index) => createSnapshot(window, index, baseZIndex, options.desktop))
  const firstOpen = initial.find((window) => window.status !== LIGHTCODE_WINDOW_STATUS.CLOSED)
  const [windows, setWindows] = createSignal<readonly LightcodeWindowSnapshot[]>(initial)
  const [activeId, setActiveId] = createSignal<string | null>(firstOpen?.id ?? null)

  if (firstOpen) {
    const id = firstOpen.id
    setWindows((current) => current.map((window) => ({ ...window, active: window.id === id })))
  }

  function updateWindow(id: string, update: (window: LightcodeWindowSnapshot, current: readonly LightcodeWindowSnapshot[]) => LightcodeWindowSnapshot) {
    setWindows((current) => current.map((window) => (window.id === id ? update(window, current) : window)))
  }

  function focus(id: string) {
    const current = windows()
    const target = current.find((window) => window.id === id)
    if (!target) return
    if (target.status === LIGHTCODE_WINDOW_STATUS.CLOSED) return

    setActiveId(id)
    setWindows((items) => renormalizeZIndexes(items.map((window) => {
      if (window.id !== id) return { ...window, active: false }
      if (window.status !== LIGHTCODE_WINDOW_STATUS.MINIMIZED) return { ...window, active: true }
      return {
        ...window,
        active: true,
        rect: cloneRect(window.restoreRect),
        status: LIGHTCODE_WINDOW_STATUS.NORMAL,
      }
    }), id, baseZIndex))
  }

  function move(id: string, rect: LightcodeWindowRect) {
    updateWindow(id, (window) => {
      if (window.status !== LIGHTCODE_WINDOW_STATUS.NORMAL) return window
      const next = clampRect(rect, window.minWidth, window.minHeight)
      return { ...window, rect: next, restoreRect: cloneRect(next) }
    })
  }

  function moveBy(id: string, deltaX: number, deltaY: number) {
    const target = windows().find((window) => window.id === id)
    if (!target) return
    move(id, {
      x: target.rect.x + deltaX,
      y: target.rect.y + deltaY,
      width: target.rect.width,
      height: target.rect.height,
    })
  }

  function resize(id: string, rect: LightcodeWindowRect) {
    updateWindow(id, (window) => {
      if (window.status !== LIGHTCODE_WINDOW_STATUS.NORMAL) return window
      const next = clampRect(rect, window.minWidth, window.minHeight)
      return { ...window, rect: next, restoreRect: cloneRect(next) }
    })
  }

  function resizeBy(id: string, edge: LightcodeResizeEdge, deltaX: number, deltaY: number) {
    const target = windows().find((window) => window.id === id)
    if (!target) return
    const width = edge === LIGHTCODE_RESIZE_EDGE.BOTTOM ? target.rect.width : target.rect.width + deltaX
    const height = edge === LIGHTCODE_RESIZE_EDGE.RIGHT ? target.rect.height : target.rect.height + deltaY
    resize(id, {
      x: target.rect.x,
      y: target.rect.y,
      width,
      height,
    })
  }

  function minimize(id: string) {
    setWindows((current) => {
      const changed = current.map((window) => {
        if (window.id !== id) return window
        if (window.status === LIGHTCODE_WINDOW_STATUS.CLOSED) return window
        if (window.status === LIGHTCODE_WINDOW_STATUS.MAXIMIZED) {
          return { ...window, active: false, rect: cloneRect(window.restoreRect), status: LIGHTCODE_WINDOW_STATUS.MINIMIZED }
        }
        return { ...window, active: false, status: LIGHTCODE_WINDOW_STATUS.MINIMIZED }
      })
      const next = activeId() === id ? activateTopmost(changed) : { activeId: activeId(), windows: changed.map((window) => ({ ...window, active: window.id === activeId() })) }
      setActiveId(next.activeId)
      return next.windows
    })
  }

  function maximize(id: string) {
    focus(id)
    updateWindow(id, (window) => {
      if (window.status === LIGHTCODE_WINDOW_STATUS.CLOSED) return window
      if (window.status === LIGHTCODE_WINDOW_STATUS.MAXIMIZED) return window
      return {
        ...window,
        rect: maximizedRect(options.desktop),
        restoreRect: cloneRect(window.rect),
        status: LIGHTCODE_WINDOW_STATUS.MAXIMIZED,
      }
    })
  }

  function restore(id: string) {
    focus(id)
    updateWindow(id, (window) => {
      if (window.status === LIGHTCODE_WINDOW_STATUS.CLOSED) return window
      return {
        ...window,
        rect: cloneRect(window.restoreRect),
        status: LIGHTCODE_WINDOW_STATUS.NORMAL,
      }
    })
  }

  function toggleMaximize(id: string) {
    const target = windows().find((window) => window.id === id)
    if (!target) return
    if (target.status === LIGHTCODE_WINDOW_STATUS.MAXIMIZED) {
      restore(id)
      return
    }
    maximize(id)
  }

  function close(id: string) {
    setWindows((current) => {
      const changed = current.map((window) => (window.id === id ? { ...window, active: false, status: LIGHTCODE_WINDOW_STATUS.CLOSED } : window))
      const next = activeId() === id ? activateTopmost(changed) : { activeId: activeId(), windows: changed.map((window) => ({ ...window, active: window.id === activeId() })) }
      setActiveId(next.activeId)
      return next.windows
    })
  }

  function reopen(id: string) {
    updateWindow(id, (window) => {
      if (window.status !== LIGHTCODE_WINDOW_STATUS.CLOSED) return window
      return { ...window, status: LIGHTCODE_WINDOW_STATUS.NORMAL }
    })
    focus(id)
  }

  return {
    windows,
    visibleWindows: () => sortByZIndex(windows().filter((window) => {
      if (window.status === LIGHTCODE_WINDOW_STATUS.CLOSED) return false
      if (window.status === LIGHTCODE_WINDOW_STATUS.MINIMIZED) return false
      return true
    })),
    minimizedWindows: () => sortByZIndex(windows().filter((window) => window.status === LIGHTCODE_WINDOW_STATUS.MINIMIZED)),
    activeId,
    focus,
    move,
    moveBy,
    resize,
    resizeBy,
    minimize,
    maximize,
    restore,
    toggleMaximize,
    close,
    reopen,
  }
}
