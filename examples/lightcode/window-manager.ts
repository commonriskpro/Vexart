import { createSignal } from "solid-js"

export const LIGHTCODE_OS_WINDOW_STATE = {
  NORMAL: "normal",
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
  CLOSED: "closed",
} as const

export const LIGHTCODE_OS_RESIZE_EDGE = {
  RIGHT: "right",
  BOTTOM: "bottom",
  BOTTOM_RIGHT: "bottom-right",
} as const

export const LIGHTCODE_OS_WINDOW_KIND = {
  EDITOR: "editor",
  DIFF: "diff",
  MEMORY: "memory",
  AGENT: "agent",
  RUNNER: "runner",
} as const

export const LIGHTCODE_OS_SURFACE_KIND = {
  DESKTOP: "desktop",
  WINDOW: "window",
  DIALOG: "dialog",
  MENU: "menu",
  TOOLTIP: "tooltip",
  DOCK: "dock",
  NOTIFICATION: "notification",
  DRAG: "drag",
} as const

export const LIGHTCODE_OS_SURFACE_LAYER = {
  BACKGROUND: "background",
  DESKTOP: "desktop",
  BELOW: "below",
  WINDOW: "window",
  ABOVE: "above",
  DOCK: "dock",
  MODAL: "modal",
  POPUP: "popup",
  TOOLTIP: "tooltip",
  DRAG: "drag",
  OVERLAY: "overlay",
  SYSTEM: "system",
} as const

export const LIGHTCODE_OS_KEYBOARD_MODE = {
  NONE: "none",
  ON_DEMAND: "on-demand",
  EXCLUSIVE: "exclusive",
} as const

export const LIGHTCODE_OS_POINTER_MODE = {
  AUTO: "auto",
  NONE: "none",
  PASSTHROUGH: "passthrough",
} as const

export type LightcodeOsWindowState = (typeof LIGHTCODE_OS_WINDOW_STATE)[keyof typeof LIGHTCODE_OS_WINDOW_STATE]
export type LightcodeOsResizeEdge = (typeof LIGHTCODE_OS_RESIZE_EDGE)[keyof typeof LIGHTCODE_OS_RESIZE_EDGE]
export type LightcodeOsWindowKind = (typeof LIGHTCODE_OS_WINDOW_KIND)[keyof typeof LIGHTCODE_OS_WINDOW_KIND]
export type LightcodeOsSurfaceKind = (typeof LIGHTCODE_OS_SURFACE_KIND)[keyof typeof LIGHTCODE_OS_SURFACE_KIND]
export type LightcodeOsSurfaceLayer = (typeof LIGHTCODE_OS_SURFACE_LAYER)[keyof typeof LIGHTCODE_OS_SURFACE_LAYER]
export type LightcodeOsKeyboardMode = (typeof LIGHTCODE_OS_KEYBOARD_MODE)[keyof typeof LIGHTCODE_OS_KEYBOARD_MODE]
export type LightcodeOsPointerMode = (typeof LIGHTCODE_OS_POINTER_MODE)[keyof typeof LIGHTCODE_OS_POINTER_MODE]

export interface LightcodeOsRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LightcodeOsDesktopRect {
  width: number
  height: number
  topbarHeight: number
  dockHeight: number
}

export interface LightcodeOsWindowInput {
  id: string
  title: string
  subtitle: string
  kind: LightcodeOsWindowKind
  surfaceKind?: LightcodeOsSurfaceKind
  layer?: LightcodeOsSurfaceLayer
  ownerId?: string
  modalFor?: string
  focusable?: boolean
  keyboardMode?: LightcodeOsKeyboardMode
  pointerMode?: LightcodeOsPointerMode
  rect: LightcodeOsRect
  minWidth?: number
  minHeight?: number
  state?: LightcodeOsWindowState
}

export interface LightcodeOsWindowSnapshot extends LightcodeOsWindowInput {
  rect: LightcodeOsRect
  restoreRect: LightcodeOsRect
  minWidth: number
  minHeight: number
  state: LightcodeOsWindowState
  surfaceKind: LightcodeOsSurfaceKind
  layer: LightcodeOsSurfaceLayer
  focusable: boolean
  keyboardMode: LightcodeOsKeyboardMode
  pointerMode: LightcodeOsPointerMode
  stackIndex: number
  zIndex: number
  active: boolean
  main: boolean
  keyboard: boolean
}

export interface LightcodeOsWindowManagerOptions {
  windows: LightcodeOsWindowInput[]
  desktop: LightcodeOsDesktopRect
  baseZIndex?: number
}

export interface LightcodeOsWindowManager {
  windows: () => readonly LightcodeOsWindowSnapshot[]
  visibleWindows: () => readonly LightcodeOsWindowSnapshot[]
  paintWindows: () => readonly LightcodeOsWindowSnapshot[]
  hitWindows: () => readonly LightcodeOsWindowSnapshot[]
  minimizedWindows: () => readonly LightcodeOsWindowSnapshot[]
  activeId: () => string | null
  mainId: () => string | null
  keyboardId: () => string | null
  layerZIndex: (layer: LightcodeOsSurfaceLayer) => number
  focus: (id: string) => void
  raise: (id: string) => void
  moveTo: (id: string, rect: LightcodeOsRect) => void
  resizeTo: (id: string, rect: LightcodeOsRect) => void
  resizeBy: (id: string, edge: LightcodeOsResizeEdge, deltaX: number, deltaY: number) => void
  minimize: (id: string) => void
  restore: (id: string) => void
  toggleMaximize: (id: string) => void
  close: (id: string) => void
  reopen: (id: string) => void
}

function cloneRect(rect: LightcodeOsRect): LightcodeOsRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function workArea(desktop: LightcodeOsDesktopRect) {
  return {
    x: 12,
    y: desktop.topbarHeight + 10,
    width: Math.max(180, desktop.width - 24),
    height: Math.max(120, desktop.height - desktop.topbarHeight - desktop.dockHeight - 20),
  }
}

const LIGHTCODE_OS_LAYER_ORDER: Record<LightcodeOsSurfaceLayer, number> = {
  [LIGHTCODE_OS_SURFACE_LAYER.BACKGROUND]: 0,
  [LIGHTCODE_OS_SURFACE_LAYER.DESKTOP]: 1,
  [LIGHTCODE_OS_SURFACE_LAYER.BELOW]: 2,
  [LIGHTCODE_OS_SURFACE_LAYER.WINDOW]: 3,
  [LIGHTCODE_OS_SURFACE_LAYER.ABOVE]: 4,
  [LIGHTCODE_OS_SURFACE_LAYER.DOCK]: 5,
  [LIGHTCODE_OS_SURFACE_LAYER.MODAL]: 6,
  [LIGHTCODE_OS_SURFACE_LAYER.POPUP]: 7,
  [LIGHTCODE_OS_SURFACE_LAYER.TOOLTIP]: 8,
  [LIGHTCODE_OS_SURFACE_LAYER.DRAG]: 9,
  [LIGHTCODE_OS_SURFACE_LAYER.OVERLAY]: 10,
  [LIGHTCODE_OS_SURFACE_LAYER.SYSTEM]: 11,
}

const LIGHTCODE_OS_LAYER_STRIDE = 1_000

function layerOrder(layer: LightcodeOsSurfaceLayer) {
  return LIGHTCODE_OS_LAYER_ORDER[layer]
}

export function lightcodeOsLayerZIndex(layer: LightcodeOsSurfaceLayer, baseZIndex = 100) {
  return baseZIndex + layerOrder(layer) * LIGHTCODE_OS_LAYER_STRIDE
}

function defaultLayer(surfaceKind: LightcodeOsSurfaceKind): LightcodeOsSurfaceLayer {
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DESKTOP) return LIGHTCODE_OS_SURFACE_LAYER.DESKTOP
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DOCK) return LIGHTCODE_OS_SURFACE_LAYER.DOCK
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DIALOG) return LIGHTCODE_OS_SURFACE_LAYER.MODAL
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.MENU) return LIGHTCODE_OS_SURFACE_LAYER.POPUP
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.TOOLTIP) return LIGHTCODE_OS_SURFACE_LAYER.TOOLTIP
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.NOTIFICATION) return LIGHTCODE_OS_SURFACE_LAYER.OVERLAY
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DRAG) return LIGHTCODE_OS_SURFACE_LAYER.DRAG
  return LIGHTCODE_OS_SURFACE_LAYER.WINDOW
}

function defaultFocusable(surfaceKind: LightcodeOsSurfaceKind) {
  return surfaceKind === LIGHTCODE_OS_SURFACE_KIND.WINDOW || surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DIALOG || surfaceKind === LIGHTCODE_OS_SURFACE_KIND.MENU
}

function defaultKeyboardMode(surfaceKind: LightcodeOsSurfaceKind): LightcodeOsKeyboardMode {
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DIALOG || surfaceKind === LIGHTCODE_OS_SURFACE_KIND.MENU) return LIGHTCODE_OS_KEYBOARD_MODE.EXCLUSIVE
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.WINDOW) return LIGHTCODE_OS_KEYBOARD_MODE.ON_DEMAND
  return LIGHTCODE_OS_KEYBOARD_MODE.NONE
}

function defaultPointerMode(surfaceKind: LightcodeOsSurfaceKind): LightcodeOsPointerMode {
  if (surfaceKind === LIGHTCODE_OS_SURFACE_KIND.DESKTOP || surfaceKind === LIGHTCODE_OS_SURFACE_KIND.TOOLTIP) return LIGHTCODE_OS_POINTER_MODE.PASSTHROUGH
  return LIGHTCODE_OS_POINTER_MODE.AUTO
}

function maximizedRect(desktop: LightcodeOsDesktopRect): LightcodeOsRect {
  const area = workArea(desktop)
  return { x: area.x, y: area.y, width: area.width, height: area.height }
}

function clampRect(rect: LightcodeOsRect, desktop: LightcodeOsDesktopRect, minWidth: number, minHeight: number): LightcodeOsRect {
  const area = workArea(desktop)
  const width = Math.min(Math.max(rect.width, minWidth), area.width)
  const height = Math.min(Math.max(rect.height, minHeight), area.height)
  const maxX = area.x + Math.max(0, area.width - Math.min(88, width))
  const maxY = area.y + Math.max(0, area.height - Math.min(42, height))

  return {
    x: clampNumber(rect.x, area.x - width + 88, maxX),
    y: clampNumber(rect.y, area.y, maxY),
    width,
    height,
  }
}

function sortByPaintOrder(windows: readonly LightcodeOsWindowSnapshot[]) {
  return [...windows].sort((a, b) => a.zIndex - b.zIndex)
}

function canActivate(window: LightcodeOsWindowSnapshot) {
  return window.focusable && window.state !== LIGHTCODE_OS_WINDOW_STATE.CLOSED && window.state !== LIGHTCODE_OS_WINDOW_STATE.MINIMIZED
}

function canReceiveKeyboard(window: LightcodeOsWindowSnapshot) {
  return canActivate(window) && window.keyboardMode !== LIGHTCODE_OS_KEYBOARD_MODE.NONE
}

function visible(window: LightcodeOsWindowSnapshot) {
  return window.state !== LIGHTCODE_OS_WINDOW_STATE.CLOSED && window.state !== LIGHTCODE_OS_WINDOW_STATE.MINIMIZED
}

function computeZIndex(window: LightcodeOsWindowSnapshot, baseZIndex: number) {
  return lightcodeOsLayerZIndex(window.layer, baseZIndex) + window.stackIndex
}

function normalizeZ(windows: readonly LightcodeOsWindowSnapshot[], activeId: string | null, mainId: string | null, keyboardId: string | null, baseZIndex: number) {
  return windows.map((window) => ({
    ...window,
    zIndex: computeZIndex(window, baseZIndex),
    active: activeId === window.id && canActivate(window),
    main: mainId === window.id && canActivate(window),
    keyboard: keyboardId === window.id && canReceiveKeyboard(window),
  }))
}

function activateTopmost(windows: readonly LightcodeOsWindowSnapshot[]) {
  const active = sortByPaintOrder(windows).reverse().find(canActivate)
  return active?.id ?? null
}

function keyboardTopmost(windows: readonly LightcodeOsWindowSnapshot[]) {
  const keyboard = sortByPaintOrder(windows).reverse().find(canReceiveKeyboard)
  return keyboard?.id ?? null
}

function nextStackIndex(windows: readonly LightcodeOsWindowSnapshot[], layer: LightcodeOsSurfaceLayer) {
  const stack = windows.filter((window) => window.layer === layer).map((window) => window.stackIndex)
  return stack.length === 0 ? 0 : Math.max(...stack) + 1
}

function raiseFamily(windows: readonly LightcodeOsWindowSnapshot[], id: string) {
  const target = windows.find((window) => window.id === id)
  if (!target || !visible(target)) return windows
  const owned = windows.filter((window) => window.ownerId === id && visible(window))
  const targetIndex = nextStackIndex(windows, target.layer)
  const targetRaised = windows.map((window) => window.id === id ? { ...window, stackIndex: targetIndex } : window)
  return owned.reduce((current, child) => {
    const childIndex = nextStackIndex(current, child.layer)
    return current.map((window) => window.id === child.id ? { ...window, stackIndex: childIndex } : window)
  }, targetRaised)
}

function snapshot(input: LightcodeOsWindowInput, index: number, desktop: LightcodeOsDesktopRect, baseZIndex: number): LightcodeOsWindowSnapshot {
  const state = input.state ?? LIGHTCODE_OS_WINDOW_STATE.NORMAL
  const minWidth = input.minWidth ?? 240
  const minHeight = input.minHeight ?? 150
  const surfaceKind = input.surfaceKind ?? LIGHTCODE_OS_SURFACE_KIND.WINDOW
  const layer = input.layer ?? defaultLayer(surfaceKind)
  const focusable = input.focusable ?? defaultFocusable(surfaceKind)
  const keyboardMode = input.keyboardMode ?? defaultKeyboardMode(surfaceKind)
  const pointerMode = input.pointerMode ?? defaultPointerMode(surfaceKind)
  const rect = state === LIGHTCODE_OS_WINDOW_STATE.MAXIMIZED
    ? maximizedRect(desktop)
    : clampRect(input.rect, desktop, minWidth, minHeight)
  const stackIndex = index

  return {
    ...input,
    rect,
    restoreRect: cloneRect(input.rect),
    minWidth,
    minHeight,
    state,
    surfaceKind,
    layer,
    focusable,
    keyboardMode,
    pointerMode,
    stackIndex,
    zIndex: lightcodeOsLayerZIndex(layer, baseZIndex) + stackIndex,
    active: false,
    main: false,
    keyboard: false,
  }
}

export function createLightcodeOsWindowManager(options: LightcodeOsWindowManagerOptions): LightcodeOsWindowManager {
  const baseZIndex = options.baseZIndex ?? 100
  const initial = options.windows.map((window, index) => snapshot(window, index, options.desktop, baseZIndex))
  const firstActive = activateTopmost(initial)
  const firstKeyboard = keyboardTopmost(initial)
  const [windows, setWindows] = createSignal<readonly LightcodeOsWindowSnapshot[]>(normalizeZ(initial, firstActive, firstActive, firstKeyboard, baseZIndex))

  function update(updateFn: (window: LightcodeOsWindowSnapshot, list: readonly LightcodeOsWindowSnapshot[]) => LightcodeOsWindowSnapshot) {
    setWindows((current) => {
      const next = current.map((window) => updateFn(window, current))
      const active = next.find((window) => window.active && canActivate(window))?.id ?? activateTopmost(next)
      const main = next.find((window) => window.main && canActivate(window))?.id ?? active
      const keyboard = next.find((window) => window.keyboard && canReceiveKeyboard(window))?.id ?? keyboardTopmost(next)
      return normalizeZ(next, active, main, keyboard, baseZIndex)
    })
  }

  function raise(id: string) {
    setWindows((current) => {
      const raised = raiseFamily(current, id)
      const active = current.find((window) => window.active && canActivate(window))?.id ?? activateTopmost(raised)
      const main = current.find((window) => window.main && canActivate(window))?.id ?? active
      const keyboard = current.find((window) => window.keyboard && canReceiveKeyboard(window))?.id ?? keyboardTopmost(raised)
      return normalizeZ(raised, active, main, keyboard, baseZIndex)
    })
  }

  function focus(id: string) {
    setWindows((current) => {
      const target = current.find((window) => window.id === id)
      if (!target || !canActivate(target)) return current
      const raised = raiseFamily(current, id)
      const keyboard = target.keyboardMode === LIGHTCODE_OS_KEYBOARD_MODE.NONE ? keyboardTopmost(raised) : id
      return normalizeZ(raised, id, id, keyboard, baseZIndex)
    })
  }

  function moveTo(id: string, rect: LightcodeOsRect) {
    update((window) => {
      if (window.id !== id || window.state !== LIGHTCODE_OS_WINDOW_STATE.NORMAL) return window
      const next = clampRect({ ...window.rect, x: rect.x, y: rect.y }, options.desktop, window.minWidth, window.minHeight)
      return { ...window, rect: next, restoreRect: cloneRect(next), active: true }
    })
    focus(id)
  }

  function resizeTo(id: string, rect: LightcodeOsRect) {
    update((window) => {
      if (window.id !== id || window.state !== LIGHTCODE_OS_WINDOW_STATE.NORMAL) return window
      const next = clampRect(rect, options.desktop, window.minWidth, window.minHeight)
      return { ...window, rect: next, restoreRect: cloneRect(next), active: true }
    })
    focus(id)
  }

  function resizeBy(id: string, edge: LightcodeOsResizeEdge, deltaX: number, deltaY: number) {
    const target = windows().find((window) => window.id === id)
    if (!target) return
    const width = edge === LIGHTCODE_OS_RESIZE_EDGE.BOTTOM ? target.rect.width : target.rect.width + deltaX
    const height = edge === LIGHTCODE_OS_RESIZE_EDGE.RIGHT ? target.rect.height : target.rect.height + deltaY
    resizeTo(id, { ...target.rect, width, height })
  }

  function minimize(id: string) {
    update((window) => {
      if (window.id !== id || window.state === LIGHTCODE_OS_WINDOW_STATE.CLOSED) return window
      return { ...window, state: LIGHTCODE_OS_WINDOW_STATE.MINIMIZED, active: false }
    })
    update((window) => window.ownerId === id && window.state !== LIGHTCODE_OS_WINDOW_STATE.CLOSED ? { ...window, state: LIGHTCODE_OS_WINDOW_STATE.MINIMIZED, active: false } : window)
  }

  function restore(id: string) {
    update((window) => {
      if (window.id !== id || window.state === LIGHTCODE_OS_WINDOW_STATE.CLOSED) return window
      const rect = clampRect(window.restoreRect, options.desktop, window.minWidth, window.minHeight)
      return { ...window, rect, state: LIGHTCODE_OS_WINDOW_STATE.NORMAL, active: true }
    })
    update((window) => {
      if (window.ownerId !== id || window.state === LIGHTCODE_OS_WINDOW_STATE.CLOSED) return window
      return { ...window, state: LIGHTCODE_OS_WINDOW_STATE.NORMAL }
    })
    focus(id)
  }

  function toggleMaximize(id: string) {
    update((window) => {
      if (window.id !== id || window.state === LIGHTCODE_OS_WINDOW_STATE.CLOSED || window.state === LIGHTCODE_OS_WINDOW_STATE.MINIMIZED) return window
      if (window.state === LIGHTCODE_OS_WINDOW_STATE.MAXIMIZED) {
        return { ...window, rect: clampRect(window.restoreRect, options.desktop, window.minWidth, window.minHeight), state: LIGHTCODE_OS_WINDOW_STATE.NORMAL, active: true }
      }
      return { ...window, restoreRect: cloneRect(window.rect), rect: maximizedRect(options.desktop), state: LIGHTCODE_OS_WINDOW_STATE.MAXIMIZED, active: true }
    })
    focus(id)
  }

  function close(id: string) {
    update((window) => window.id === id ? { ...window, state: LIGHTCODE_OS_WINDOW_STATE.CLOSED, active: false } : window)
    update((window) => window.ownerId === id ? { ...window, state: LIGHTCODE_OS_WINDOW_STATE.CLOSED, active: false } : window)
  }

  function reopen(id: string) {
    update((window) => {
      if (window.id !== id) return window
      return { ...window, state: LIGHTCODE_OS_WINDOW_STATE.NORMAL, rect: clampRect(window.restoreRect, options.desktop, window.minWidth, window.minHeight), active: true }
    })
    focus(id)
  }

  return {
    windows,
    visibleWindows: () => sortByPaintOrder(windows().filter(visible)),
    paintWindows: () => sortByPaintOrder(windows().filter(visible)),
    hitWindows: () => sortByPaintOrder(windows().filter((window) => visible(window) && window.pointerMode !== LIGHTCODE_OS_POINTER_MODE.NONE)).reverse(),
    minimizedWindows: () => sortByPaintOrder(windows().filter((window) => window.state === LIGHTCODE_OS_WINDOW_STATE.MINIMIZED)),
    activeId: () => windows().find((window) => window.active)?.id ?? null,
    mainId: () => windows().find((window) => window.main)?.id ?? null,
    keyboardId: () => windows().find((window) => window.keyboard)?.id ?? null,
    layerZIndex: (layer) => lightcodeOsLayerZIndex(layer, baseZIndex),
    focus,
    raise,
    moveTo,
    resizeTo,
    resizeBy,
    minimize,
    restore,
    toggleMaximize,
    close,
    reopen,
  }
}
