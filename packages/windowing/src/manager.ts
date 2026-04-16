import {
  WINDOW_PLACEMENT,
  WINDOW_STATUS,
  type WindowBounds,
  type WindowCapabilities,
  type WindowConstraints,
  type WindowDescriptor,
  type WindowManager,
  type WindowManagerListener,
  type WindowManagerOptions,
  type WindowManagerState,
  type WindowOpenInput,
  type WindowPlacement,
  type WindowPositionPatch,
  type WindowSizePatch,
} from "./types"

const WINDOW_Z_INDEX_BASE = 100

const DEFAULT_WINDOW_CAPABILITIES: WindowCapabilities = {
  movable: true,
  resizable: true,
  minimizable: true,
  maximizable: true,
  closable: true,
}

function cloneBounds(bounds: WindowBounds): WindowBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

function cloneConstraints(constraints?: WindowConstraints): WindowConstraints {
  if (!constraints) return {}
  return {
    minWidth: constraints.minWidth,
    minHeight: constraints.minHeight,
    maxWidth: constraints.maxWidth,
    maxHeight: constraints.maxHeight,
  }
}

function cloneCapabilities(capabilities: WindowCapabilities): WindowCapabilities {
  return {
    movable: capabilities.movable,
    resizable: capabilities.resizable,
    minimizable: capabilities.minimizable,
    maximizable: capabilities.maximizable,
    closable: capabilities.closable,
  }
}

function cloneDescriptor(window: WindowDescriptor): WindowDescriptor {
  return {
    id: window.id,
    kind: window.kind,
    title: window.title,
    status: window.status,
    bounds: cloneBounds(window.bounds),
    restoreBounds: window.restoreBounds ? cloneBounds(window.restoreBounds) : undefined,
    restorePlacement: window.restorePlacement,
    zIndex: window.zIndex,
    focused: window.focused,
    modal: window.modal,
    keepAlive: window.keepAlive,
    capabilities: cloneCapabilities(window.capabilities),
    constraints: cloneConstraints(window.constraints),
  }
}

function cloneState(state: WindowManagerState): WindowManagerState {
  const windowsById = state.order.reduce<Record<string, WindowDescriptor>>((next, id) => {
    const window = state.windowsById[id]
    if (!window) return next
    next[id] = cloneDescriptor(window)
    return next
  }, {})

  return {
    windowsById,
    order: state.order.slice(),
    focusedWindowId: state.focusedWindowId,
    activeModalId: state.activeModalId,
  }
}

function clampDimension(value: number, min?: number, max?: number): number {
  const minValue = min ?? 1
  const lowerBound = Math.max(1, minValue)
  if (value < lowerBound) return lowerBound
  if (max !== undefined && value > max) return max
  return value
}

function clampBounds(bounds: WindowBounds, constraints: WindowConstraints): WindowBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: clampDimension(bounds.width, constraints.minWidth, constraints.maxWidth),
    height: clampDimension(bounds.height, constraints.minHeight, constraints.maxHeight),
  }
}

function createWindowDescriptor(input: WindowOpenInput): WindowDescriptor {
  const capabilities: WindowCapabilities = {
    movable: input.capabilities?.movable ?? DEFAULT_WINDOW_CAPABILITIES.movable,
    resizable: input.capabilities?.resizable ?? DEFAULT_WINDOW_CAPABILITIES.resizable,
    minimizable: input.capabilities?.minimizable ?? DEFAULT_WINDOW_CAPABILITIES.minimizable,
    maximizable: input.capabilities?.maximizable ?? DEFAULT_WINDOW_CAPABILITIES.maximizable,
    closable: input.capabilities?.closable ?? DEFAULT_WINDOW_CAPABILITIES.closable,
  }

  const constraints = cloneConstraints(input.constraints)
  const bounds = clampBounds(cloneBounds(input.bounds), constraints)
  const status = input.status ?? WINDOW_STATUS.NORMAL
  const restorePlacement = status === WINDOW_STATUS.MINIMIZED
    ? (input.restorePlacement ?? WINDOW_PLACEMENT.NORMAL)
    : undefined

  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    status,
    bounds,
    restoreBounds: input.restoreBounds ? cloneBounds(input.restoreBounds) : undefined,
    restorePlacement,
    zIndex: WINDOW_Z_INDEX_BASE,
    focused: false,
    modal: input.modal ?? false,
    keepAlive: input.keepAlive ?? false,
    capabilities,
    constraints,
  }
}

function moveIdToEnd(order: string[], id: string): string[] {
  return order.filter((entry) => entry !== id).concat(id)
}

function normalizeState(state: WindowManagerState): WindowManagerState {
  const orderedIds = state.order.filter((id, index, list) => list.indexOf(id) === index && state.windowsById[id] !== undefined)
  const missingIds = Object.keys(state.windowsById).filter((id) => !orderedIds.includes(id))
  const order = orderedIds.concat(missingIds)
  const focusableIds = order.filter((id) => state.windowsById[id].status !== WINDOW_STATUS.MINIMIZED)

  const focusedWindowId = focusableIds.includes(state.focusedWindowId ?? "")
    ? state.focusedWindowId
    : (focusableIds.length > 0 ? focusableIds[focusableIds.length - 1] : null)

  const windowsById = order.reduce<Record<string, WindowDescriptor>>((next, id, index) => {
    const current = state.windowsById[id]
    next[id] = {
      id: current.id,
      kind: current.kind,
      title: current.title,
      status: current.status,
      bounds: cloneBounds(current.bounds),
      restoreBounds: current.restoreBounds ? cloneBounds(current.restoreBounds) : undefined,
      restorePlacement: current.restorePlacement,
      zIndex: WINDOW_Z_INDEX_BASE + index,
      focused: focusedWindowId === id,
      modal: current.modal,
      keepAlive: current.keepAlive,
      capabilities: cloneCapabilities(current.capabilities),
      constraints: cloneConstraints(current.constraints),
    }
    return next
  }, {})

  const activeModalId = order.reduce<string | null>((currentActive, id) => {
    const window = windowsById[id]
    if (!window.modal) return currentActive
    if (window.status === WINDOW_STATUS.MINIMIZED) return currentActive
    return id
  }, null)

  return {
    windowsById,
    order,
    focusedWindowId,
    activeModalId,
  }
}

function nextStateWithWindow(
  state: WindowManagerState,
  id: string,
  updater: (window: WindowDescriptor) => WindowDescriptor,
): WindowManagerState {
  const current = state.windowsById[id]
  if (!current) throw new Error(`Window '${id}' does not exist`)

  const windowsById = {
    ...state.windowsById,
    [id]: updater(current),
  }

  return {
    windowsById,
    order: state.order.slice(),
    focusedWindowId: state.focusedWindowId,
    activeModalId: state.activeModalId,
  }
}

function assertWindowExists(state: WindowManagerState, id: string): WindowDescriptor {
  const window = state.windowsById[id]
  if (!window) throw new Error(`Window '${id}' does not exist`)
  return window
}

function isVisibleWindow(window: WindowDescriptor): boolean {
  return window.status !== WINDOW_STATUS.MINIMIZED
}

function isMaximizedWindow(window: WindowDescriptor): boolean {
  return window.status === WINDOW_STATUS.MAXIMIZED
}

function createInitialState(options?: WindowManagerOptions): WindowManagerState {
  const windowsById = (options?.initialWindows ?? []).reduce<Record<string, WindowDescriptor>>((next, input) => {
    if (next[input.id]) {
      throw new Error(`Window '${input.id}' already exists`)
    }
    next[input.id] = createWindowDescriptor(input)
    return next
  }, {})

  const order = (options?.initialWindows ?? []).map((window) => window.id)
  const focusableInitialIds = order.filter((id) => windowsById[id].status !== WINDOW_STATUS.MINIMIZED)

  return normalizeState({
    windowsById,
    order,
    focusedWindowId: focusableInitialIds.length > 0 ? focusableInitialIds[focusableInitialIds.length - 1] : null,
    activeModalId: null,
  })
}

export function createWindowManager(options?: WindowManagerOptions): WindowManager {
  let state = createInitialState(options)
  const listeners = new Set<WindowManagerListener>()

  function emit() {
    const snapshot = cloneState(state)
    listeners.forEach((listener) => listener(snapshot))
  }

  function commit(next: WindowManagerState) {
    state = normalizeState(next)
    emit()
  }

  function openWindow(input: WindowOpenInput) {
    if (state.windowsById[input.id]) {
      throw new Error(`Window '${input.id}' already exists`)
    }

    const window = createWindowDescriptor(input)
    const windowsById = {
      ...state.windowsById,
      [window.id]: window,
    }
    const order = state.order.concat(window.id)
    const focusedWindowId = window.status === WINDOW_STATUS.MINIMIZED ? state.focusedWindowId : window.id

    commit({
      windowsById,
      order,
      focusedWindowId,
      activeModalId: state.activeModalId,
    })
  }

  function closeWindow(id: string) {
    const window = assertWindowExists(state, id)
    if (!window.capabilities.closable) return

    const windowsById = Object.keys(state.windowsById).reduce<Record<string, WindowDescriptor>>((next, entryId) => {
      if (entryId === id) return next
      next[entryId] = state.windowsById[entryId]
      return next
    }, {})

    const focusedWindowId = state.focusedWindowId === id ? null : state.focusedWindowId

    commit({
      windowsById,
      order: state.order.filter((entryId) => entryId !== id),
      focusedWindowId,
      activeModalId: state.activeModalId,
    })
  }

  function focusWindow(id: string) {
    const window = assertWindowExists(state, id)
    if (!isVisibleWindow(window)) return

    commit({
      windowsById: state.windowsById,
      order: moveIdToEnd(state.order, id),
      focusedWindowId: id,
      activeModalId: state.activeModalId,
    })
  }

  function bringToFront(id: string) {
    const window = assertWindowExists(state, id)
    if (!isVisibleWindow(window)) return

    commit({
      windowsById: state.windowsById,
      order: moveIdToEnd(state.order, id),
      focusedWindowId: state.focusedWindowId,
      activeModalId: state.activeModalId,
    })
  }

  function moveWindow(id: string, next: WindowPositionPatch) {
    const window = assertWindowExists(state, id)
    if (!window.capabilities.movable) return
    if (!isVisibleWindow(window)) return
    if (isMaximizedWindow(window)) return

    commit(nextStateWithWindow(state, id, (current) => ({
      id: current.id,
      kind: current.kind,
      title: current.title,
      status: current.status,
      bounds: {
        x: next.x ?? current.bounds.x,
        y: next.y ?? current.bounds.y,
        width: current.bounds.width,
        height: current.bounds.height,
      },
      restoreBounds: current.restoreBounds ? cloneBounds(current.restoreBounds) : undefined,
      restorePlacement: current.restorePlacement,
      zIndex: current.zIndex,
      focused: current.focused,
      modal: current.modal,
      keepAlive: current.keepAlive,
      capabilities: cloneCapabilities(current.capabilities),
      constraints: cloneConstraints(current.constraints),
    })))
  }

  function resizeWindow(id: string, next: WindowSizePatch) {
    const window = assertWindowExists(state, id)
    if (!window.capabilities.resizable) return
    if (!isVisibleWindow(window)) return
    if (isMaximizedWindow(window)) return

    commit(nextStateWithWindow(state, id, (current) => {
      const rawBounds: WindowBounds = {
        x: next.x ?? current.bounds.x,
        y: next.y ?? current.bounds.y,
        width: next.width ?? current.bounds.width,
        height: next.height ?? current.bounds.height,
      }

      const bounds = clampBounds(rawBounds, current.constraints)

      return {
        id: current.id,
        kind: current.kind,
        title: current.title,
        status: current.status,
        bounds,
        restoreBounds: current.restoreBounds ? cloneBounds(current.restoreBounds) : undefined,
        restorePlacement: current.restorePlacement,
        zIndex: current.zIndex,
        focused: current.focused,
        modal: current.modal,
        keepAlive: current.keepAlive,
        capabilities: cloneCapabilities(current.capabilities),
        constraints: cloneConstraints(current.constraints),
      }
    }))
  }

  function minimizeWindow(id: string) {
    const window = assertWindowExists(state, id)
    if (!window.capabilities.minimizable) return
    if (window.status === WINDOW_STATUS.MINIMIZED) return

    const restorePlacement: WindowPlacement = window.status === WINDOW_STATUS.MAXIMIZED
      ? WINDOW_PLACEMENT.MAXIMIZED
      : WINDOW_PLACEMENT.NORMAL

    commit(nextStateWithWindow(state, id, (current) => ({
      id: current.id,
      kind: current.kind,
      title: current.title,
      status: WINDOW_STATUS.MINIMIZED,
      bounds: cloneBounds(current.bounds),
      restoreBounds: current.restoreBounds ? cloneBounds(current.restoreBounds) : undefined,
      restorePlacement,
      zIndex: current.zIndex,
      focused: current.focused,
      modal: current.modal,
      keepAlive: current.keepAlive,
      capabilities: cloneCapabilities(current.capabilities),
      constraints: cloneConstraints(current.constraints),
    })))
  }

  function maximizeWindow(id: string, workspace: WindowBounds) {
    const window = assertWindowExists(state, id)
    if (!window.capabilities.maximizable) return

    const restoreBounds = window.restoreBounds
      ? cloneBounds(window.restoreBounds)
      : cloneBounds(window.bounds)
    const bounds = clampBounds(cloneBounds(workspace), window.constraints)

    const next = nextStateWithWindow(state, id, (current) => ({
      id: current.id,
      kind: current.kind,
      title: current.title,
      status: WINDOW_STATUS.MAXIMIZED,
      bounds,
      restoreBounds,
      restorePlacement: undefined,
      zIndex: current.zIndex,
      focused: current.focused,
      modal: current.modal,
      keepAlive: current.keepAlive,
      capabilities: cloneCapabilities(current.capabilities),
      constraints: cloneConstraints(current.constraints),
    }))

    commit({
      windowsById: next.windowsById,
      order: moveIdToEnd(next.order, id),
      focusedWindowId: id,
      activeModalId: next.activeModalId,
    })
  }

  function restoreWindow(id: string) {
    const window = assertWindowExists(state, id)

    if (window.status === WINDOW_STATUS.MINIMIZED) {
      const nextStatus = window.restorePlacement ?? WINDOW_PLACEMENT.NORMAL
      const next = nextStateWithWindow(state, id, (current) => ({
        id: current.id,
        kind: current.kind,
        title: current.title,
        status: nextStatus,
        bounds: cloneBounds(current.bounds),
        restoreBounds: current.restoreBounds ? cloneBounds(current.restoreBounds) : undefined,
        restorePlacement: undefined,
        zIndex: current.zIndex,
        focused: current.focused,
        modal: current.modal,
        keepAlive: current.keepAlive,
        capabilities: cloneCapabilities(current.capabilities),
        constraints: cloneConstraints(current.constraints),
      }))

      commit({
        windowsById: next.windowsById,
        order: moveIdToEnd(next.order, id),
        focusedWindowId: id,
        activeModalId: next.activeModalId,
      })
      return
    }

    if (window.status !== WINDOW_STATUS.MAXIMIZED) return

    const nextBounds = window.restoreBounds ? cloneBounds(window.restoreBounds) : cloneBounds(window.bounds)

    commit(nextStateWithWindow(state, id, (current) => ({
      id: current.id,
      kind: current.kind,
      title: current.title,
      status: WINDOW_STATUS.NORMAL,
      bounds: nextBounds,
      restoreBounds: undefined,
      restorePlacement: undefined,
      zIndex: current.zIndex,
      focused: current.focused,
      modal: current.modal,
      keepAlive: current.keepAlive,
      capabilities: cloneCapabilities(current.capabilities),
      constraints: cloneConstraints(current.constraints),
    })))
  }

  function toggleMinimize(id: string) {
    const window = assertWindowExists(state, id)
    if (window.status === WINDOW_STATUS.MINIMIZED) {
      restoreWindow(id)
      return
    }
    minimizeWindow(id)
  }

  function toggleMaximize(id: string, workspace: WindowBounds) {
    const window = assertWindowExists(state, id)
    if (window.status === WINDOW_STATUS.MAXIMIZED) {
      restoreWindow(id)
      return
    }
    maximizeWindow(id, workspace)
  }

  function listWindows(): WindowDescriptor[] {
    return state.order
      .map((id) => state.windowsById[id])
      .filter((window): window is WindowDescriptor => window !== undefined)
      .map((window) => cloneDescriptor(window))
  }

  function getWindow(id: string): WindowDescriptor | undefined {
    const window = state.windowsById[id]
    if (!window) return undefined
    return cloneDescriptor(window)
  }

  function subscribe(listener: WindowManagerListener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    getState: () => cloneState(state),
    subscribe,
    openWindow,
    closeWindow,
    focusWindow,
    bringToFront,
    moveWindow,
    resizeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    toggleMinimize,
    toggleMaximize,
    listWindows,
    getWindow,
  }
}
