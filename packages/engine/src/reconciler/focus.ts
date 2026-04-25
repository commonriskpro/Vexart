/** Focus runtime system. */

import { createSignal } from "solid-js"
import { onInput } from "../loop/input"
import type { InputEvent, KeyEvent } from "../input/types"
import type { TGENode, PressEvent } from "../ffi/node"

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

const scopes: FocusScope[] = [{ entries: [], previousFocusId: null }]

function activeScope(): FocusScope { return scopes[scopes.length - 1] }
function activeRegistry(): FocusEntry[] { return activeScope().entries }

const [focusedIdSignal, setFocusedIdSignal] = createSignal<string | null>(null)

/** @public */
export const focusedId = focusedIdSignal

/** @public */
export const setFocusedId = setFocusedIdSignal

function registerFocusable(entry: FocusEntry): () => void {
  const scope = activeScope()
  scope.entries.push(entry)
  if (scope.entries.length === 1 && !focusedId()) setFocusedId(entry.id)
  return () => {
    const idx = scope.entries.indexOf(entry)
    if (idx >= 0) scope.entries.splice(idx, 1)
    if (focusedId() === entry.id) {
      const reg = activeRegistry()
      setFocusedId(reg.length > 0 ? reg[0].id : null)
    }
  }
}

function focusNext() {
  const reg = activeRegistry()
  if (reg.length === 0) return
  const current = focusedId()
  const idx = reg.findIndex((e) => e.id === current)
  const next = (idx + 1) % reg.length
  setFocusedId(reg[next].id)
}

function focusPrev() {
  const reg = activeRegistry()
  if (reg.length === 0) return
  const current = focusedId()
  const idx = reg.findIndex((e) => e.id === current)
  const prev = idx <= 0 ? reg.length - 1 : idx - 1
  setFocusedId(reg[prev].id)
}

/** @public */
export function setFocus(id: string) {
  for (const scope of scopes) {
    if (scope.entries.some((e) => e.id === id)) {
      setFocusedId(id)
      return
    }
  }
}

/** @public */
export function pushFocusScope(): () => void {
  const scope: FocusScope = { entries: [], previousFocusId: focusedId() }
  scopes.push(scope)
  setFocusedId(null)
  return () => {
    const idx = scopes.indexOf(scope)
    if (idx > 0) {
      scopes.splice(idx, 1)
      setFocusedId(scope.previousFocusId)
    }
  }
}

/** @public */
export function getFocusedEntry(): FocusEntry | undefined {
  const current = focusedId()
  if (!current) return undefined
  const entry = activeRegistry().find((e) => e.id === current)
  if (entry) return entry
  for (const scope of scopes) {
    const found = scope.entries.find((e) => e.id === current)
    if (found) return found
  }
  return undefined
}

let focusInputConnected = false

function ensureFocusInput() {
  if (focusInputConnected) return
  focusInputConnected = true
  onInput(dispatchFocusInput)
}

export function dispatchFocusInput(event: InputEvent) {
  if (event.type !== "key") return
  if (event.key === "tab") {
    if (event.mods.shift) focusPrev()
    else focusNext()
    return
  }
  if (event.key === "enter" || event.key === " ") {
    const entry = getFocusedEntry()
    if (entry?.onPress) {
      entry.onPress()
      return
    }
  }
  const entry = getFocusedEntry()
  if (entry?.onKeyDown) entry.onKeyDown(event)
}

/** @public */
export type FocusHandle = {
  focused: () => boolean
  focus: () => void
  id: string
}

let nextId = 0

/** @public */
export function useFocus(opts: { id?: string; onKeyDown?: (event: KeyEvent) => void; onPress?: () => void } = {}): FocusHandle {
  ensureFocusInput()
  const id = opts.id ?? `focus-${nextId++}`
  registerFocusable({ id, onKeyDown: opts.onKeyDown, onPress: opts.onPress })
  return { focused: () => focusedId() === id, focus: () => setFocusedId(id), id }
}

const nodeFocusMap = new Map<number, string>()

/** @public */
export function registerNodeFocusable(node: TGENode): () => void {
  ensureFocusInput()
  const id = `node-focus-${node.id}`
  nodeFocusMap.set(node.id, id)
  return registerFocusable({ id, onKeyDown: node.props.onKeyDown, onPress: node.props.onPress, node })
}

/** @public */
export function updateNodeFocusEntry(node: TGENode) {
  const focusId = nodeFocusMap.get(node.id)
  if (!focusId) return
  for (const scope of scopes) {
    const entry = scope.entries.find((e) => e.id === focusId)
    if (entry) {
      entry.onKeyDown = node.props.onKeyDown
      entry.onPress = node.props.onPress
      return
    }
  }
}

/** @public */
export function unregisterNodeFocusable(node: TGENode) {
  const focusId = nodeFocusMap.get(node.id)
  if (!focusId) return
  nodeFocusMap.delete(node.id)
  for (const scope of scopes) {
    const idx = scope.entries.findIndex((e) => e.id === focusId)
    if (idx >= 0) {
      scope.entries.splice(idx, 1)
      if (focusedId() === focusId) {
        const reg = activeRegistry()
        setFocusedId(reg.length > 0 ? reg[0].id : null)
      }
      return
    }
  }
}

/** @public */
export function getNodeFocusId(node: TGENode): string | undefined {
  return nodeFocusMap.get(node.id)
}

/** @public */
export function resetFocus() {
  scopes.length = 1
  scopes[0].entries.length = 0
  scopes[0].previousFocusId = null
  setFocusedId(null)
  focusInputConnected = false
  nextId = 0
  nodeFocusMap.clear()
}
