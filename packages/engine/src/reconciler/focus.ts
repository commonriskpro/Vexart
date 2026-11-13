/** Focus runtime system. */

import { createSignal, onCleanup } from "solid-js"
import { onInput } from "../loop/input"
import type { InputManager } from "../loop/input"
import type { InputEvent, KeyEvent } from "../input/types"
import { createPressEvent, type TGENode, type PressEvent } from "../ffi/node"
import { useEngineContext } from "../context"

/** @public */
export type FocusEntry = {
  id: string
  onKeyDown?: (event: KeyEvent) => void
  onPress?: (event?: PressEvent) => void
  node?: TGENode
}

type FocusScope = {
  entries: FocusEntry[]
  previousFocusId: string | null
}

/** @public */
export type FocusHandle = {
  focused: () => boolean
  focus: () => void
  id: string
}

/** @public */
export type FocusManager = {
  readonly focusedId: () => string | null
  setFocusedId: (id: string | null) => void
  clearFocus: () => void
  setFocus: (id: string | null) => void
  pushFocusScope: () => () => void
  getFocusedEntry: () => FocusEntry | undefined
  dispatchFocusInput: (event: InputEvent) => void
  useFocus: (opts?: { id?: string; onKeyDown?: (event: KeyEvent) => void; onPress?: () => void }) => FocusHandle
  registerNodeFocusable: (node: TGENode) => () => void
  updateNodeFocusEntry: (node: TGENode) => void
  updateNodeFocusId: (node: TGENode, newFocusId: string) => void
  unregisterNodeFocusable: (node: TGENode) => void
  getNodeFocusId: (node: TGENode) => string | undefined
  resetFocus: () => void
  destroy: () => void
}

/**
 * Factory to create an isolated FocusManager.
 * @public
 */
export function createFocusManager(inputManager?: InputManager): FocusManager {
  const scopes: FocusScope[] = [{ entries: [], previousFocusId: null }]
  const [focusedIdSignal, setFocusedIdSignal] = createSignal<string | null>(null)
  let pendingFocusRepair: number | null = null
  let focusRepairQueued = false
  let focusResetGeneration = 0
  let nextId = 0
  const nodeFocusMap = new Map<number, string>()
  let focusInputConnected = false
  let focusInputUnsub: (() => void) | null = null

  function activeScope(): FocusScope { return scopes[scopes.length - 1] }
  function activeRegistry(): FocusEntry[] { return activeScope().entries }

  function ensureFocusInput() {
    if (focusInputConnected) return
    focusInputConnected = true
    if (inputManager) {
      focusInputUnsub = inputManager.onInput(dispatchFocusInput)
    } else {
      focusInputUnsub = onInput(dispatchFocusInput)
    }
  }

  function registerFocusable(entry: FocusEntry): () => void {
    const scope = activeScope()
    scope.entries.push(entry)
    if (scope.entries.length === 1 && !focusedIdSignal()) setFocusedIdSignal(entry.id)
    return () => {
      const idx = scope.entries.indexOf(entry)
      if (idx >= 0) {
        scope.entries.splice(idx, 1)
        if (focusedIdSignal() === entry.id) {
          const reg = activeRegistry()
          if (reg.length > 0) queueFocusRepair(idx)
          else setFocusedIdSignal(null)
        }
      }
    }
  }

  function focusNext() {
    const reg = activeRegistry()
    if (reg.length === 0) return
    const current = focusedIdSignal()
    const idx = reg.findIndex((e) => e.id === current)
    const next = (idx + 1) % reg.length
    setFocusedIdSignal(reg[next].id)
  }

  function focusPrev() {
    const reg = activeRegistry()
    if (reg.length === 0) return
    const current = focusedIdSignal()
    const idx = reg.findIndex((e) => e.id === current)
    const prev = idx <= 0 ? reg.length - 1 : idx - 1
    setFocusedIdSignal(reg[prev].id)
  }

  function repairFocus() {
    const current = focusedIdSignal()
    if (current && activeRegistry().some((entry) => entry.id === current)) {
      pendingFocusRepair = null
      return
    }
    const reg = activeRegistry()
    if (reg.length === 0) {
      setFocusedIdSignal(null)
      pendingFocusRepair = null
      return
    }
    const index = pendingFocusRepair === null ? 0 : Math.min(pendingFocusRepair, reg.length - 1)
    pendingFocusRepair = null
    setFocusedIdSignal(reg[index].id)
  }

  function queueFocusRepair(index: number) {
    pendingFocusRepair = pendingFocusRepair === null ? index : Math.min(pendingFocusRepair, index)
    if (focusRepairQueued) return
    focusRepairQueued = true
    const currentGen = focusResetGeneration
    queueMicrotask(() => {
      if (currentGen !== focusResetGeneration) return
      focusRepairQueued = false
      repairFocus()
    })
  }

  function clearFocus(): void {
    setFocusedIdSignal(null)
  }

  function setFocus(id: string | null) {
    if (id === null) {
      setFocusedIdSignal(null)
      return
    }
    for (const scope of scopes) {
      if (scope.entries.some((e) => e.id === id)) {
        setFocusedIdSignal(id)
        return
      }
    }
  }

  function pushFocusScope(): () => void {
    const scope: FocusScope = { entries: [], previousFocusId: focusedIdSignal() }
    scopes.push(scope)
    setFocusedIdSignal(null)
    return () => {
      const idx = scopes.indexOf(scope)
      if (idx > 0) {
        scopes.splice(idx, 1)
        const prevId = scope.previousFocusId
        const targetScope = activeScope()
        if (prevId && targetScope.entries.some((e) => e.id === prevId)) {
          setFocusedIdSignal(prevId)
        } else {
          setFocusedIdSignal(targetScope.entries[0]?.id ?? null)
        }
      }
    }
  }

  function getFocusedEntry(): FocusEntry | undefined {
    const current = focusedIdSignal()
    if (!current) return undefined
    const entry = activeRegistry().find((e) => e.id === current)
    if (entry) return entry
    for (const scope of scopes) {
      const found = scope.entries.find((e) => e.id === current)
      if (found) return found
    }
    return undefined
  }

  function dispatchFocusInput(event: InputEvent) {
    if (event.type !== "key") return
    // A second key in the same synchronous burst may arrive before the cleanup
    // microtask; never dispatch it to an entry that was already removed.
    repairFocus()
    if (event.key === "tab") {
      if (event.mods.shift) focusPrev()
      else focusNext()
      return
    }
    if (event.key === "enter" || event.key === " ") {
      const entry = getFocusedEntry()
      if (entry?.onPress) {
        entry.onPress(createPressEvent())
        return
      }
    }
    const entry = getFocusedEntry()
    if (entry?.onKeyDown) entry.onKeyDown(event)
  }

  function useFocus(opts: { id?: string; onKeyDown?: (event: KeyEvent) => void; onPress?: () => void } = {}): FocusHandle {
    ensureFocusInput()
    const id = opts.id ?? ("focus-" + (nextId++))
    const unregister = registerFocusable({ id, onKeyDown: opts.onKeyDown, onPress: opts.onPress })
    try { onCleanup(unregister) } catch {}
    return { focused: () => focusedIdSignal() === id, focus: () => setFocusedIdSignal(id), id }
  }

  function registerNodeFocusable(node: TGENode): () => void {
    ensureFocusInput()
    const propsRecord = node.props as Record<string, unknown>
    const id = (node.props.focusId as string | undefined) ?? (propsRecord.id ? String(propsRecord.id) : undefined) ?? ("node-focus-" + node.id)
    nodeFocusMap.set(node.id, id)
    return registerFocusable({
      id,
      onKeyDown: node.props.onKeyDown,
      onPress: node.props.onPress ?? node.props.onClick,
      node,
    })
  }

  function updateNodeFocusEntry(node: TGENode) {
    const focusId = nodeFocusMap.get(node.id)
    if (!focusId) return
    for (const scope of scopes) {
      const entry = scope.entries.find((e) => e.id === focusId)
      if (entry) {
        entry.onKeyDown = node.props.onKeyDown
        entry.onPress = node.props.onPress ?? node.props.onClick
        return
      }
    }
  }

  function updateNodeFocusId(node: TGENode, newFocusId: string) {
    const oldFocusId = nodeFocusMap.get(node.id)
    if (!oldFocusId || oldFocusId === newFocusId) return
    nodeFocusMap.set(node.id, newFocusId)
    for (const scope of scopes) {
      const entry = scope.entries.find((e) => e.id === oldFocusId)
      if (entry) {
        entry.id = newFocusId
        break
      }
    }
    if (focusedIdSignal() === oldFocusId) {
      setFocusedIdSignal(newFocusId)
    }
  }

  function unregisterNodeFocusable(node: TGENode) {
    const focusId = nodeFocusMap.get(node.id)
    if (!focusId) return
    nodeFocusMap.delete(node.id)
    for (const scope of scopes) {
      const idx = scope.entries.findIndex((e) => e.id === focusId)
      if (idx >= 0) {
        scope.entries.splice(idx, 1)
        if (focusedIdSignal() === focusId) {
          const reg = activeRegistry()
          if (reg.length > 0) queueFocusRepair(idx)
          else setFocusedIdSignal(null)
        }
        return
      }
    }
  }

  function getNodeFocusId(node: TGENode): string | undefined {
    return nodeFocusMap.get(node.id)
  }

  function resetFocus() {
    focusResetGeneration++
    for (const scope of scopes) {
      scope.entries.length = 0
      scope.previousFocusId = null
    }
    scopes.length = 1
    scopes[0].entries.length = 0
    scopes[0].previousFocusId = null
    setFocusedIdSignal(null)
    // Unsubscribe the existing input handler before resetting the flag,
    // otherwise the next ensureFocusInput() adds a SECOND subscriber.
    if (focusInputUnsub) {
      focusInputUnsub()
      focusInputUnsub = null
    }
    focusInputConnected = false
    nextId = 0
    nodeFocusMap.clear()
    pendingFocusRepair = null
    focusRepairQueued = false
  }

  function destroy() {
    resetFocus()
  }

  return {
    focusedId: focusedIdSignal,
    setFocusedId: setFocusedIdSignal,
    clearFocus,
    setFocus,
    pushFocusScope,
    getFocusedEntry,
    dispatchFocusInput,
    useFocus,
    registerNodeFocusable,
    updateNodeFocusEntry,
    updateNodeFocusId,
    unregisterNodeFocusable,
    getNodeFocusId,
    resetFocus,
    destroy,
  }
}

/** Module-level default focus manager for backward compatibility and standalone tests. */
export const defaultFocusManager = createFocusManager()

function resolveFocusManager(node?: TGENode): FocusManager {
  if (node?._engineContext?.focus) return node._engineContext.focus
  return useEngineContext()?.focus ?? defaultFocusManager
}

/** @public */
export function focusedId(): string | null {
  return resolveFocusManager().focusedId()
}

/** @public */
export function setFocusedId(id: string | null): void {
  resolveFocusManager().setFocusedId(id)
}

/** @public Clear active focus. */
export function clearFocus(): void {
  resolveFocusManager().clearFocus()
}

/** @public */
export function setFocus(id: string | null): void {
  resolveFocusManager().setFocus(id)
}

/** @public */
export function pushFocusScope(): () => void {
  return resolveFocusManager().pushFocusScope()
}

/** @public */
export function getFocusedEntry(): FocusEntry | undefined {
  return resolveFocusManager().getFocusedEntry()
}

export function dispatchFocusInput(event: InputEvent): void {
  resolveFocusManager().dispatchFocusInput(event)
}

/** @public */
export function useFocus(opts: { id?: string; onKeyDown?: (event: KeyEvent) => void; onPress?: () => void } = {}): FocusHandle {
  return resolveFocusManager().useFocus(opts)
}

/** @public */
export function registerNodeFocusable(node: TGENode): () => void {
  return resolveFocusManager(node).registerNodeFocusable(node)
}

/** @public */
export function updateNodeFocusEntry(node: TGENode) {
  resolveFocusManager(node).updateNodeFocusEntry(node)
}

/** @public */
export function updateNodeFocusId(node: TGENode, newFocusId: string) {
  resolveFocusManager(node).updateNodeFocusId(node, newFocusId)
}

/** @public */
export function unregisterNodeFocusable(node: TGENode) {
  resolveFocusManager(node).unregisterNodeFocusable(node)
}

/** @public */
export function getNodeFocusId(node: TGENode): string | undefined {
  return resolveFocusManager(node).getNodeFocusId(node)
}

/** @public */
export function resetFocus() {
  resolveFocusManager().resetFocus()
}
