/**
 * Focus system — manages which element receives keyboard events.
 *
 * Architecture:
 *   - Components register as "focusable" via useFocus() (component-level)
 *   - Box elements with `focusable` prop auto-register via the reconciler (node-level)
 *   - Tab/Shift+Tab cycles through focusable elements in registration order
 *   - The focused element's onKeyDown callback receives keyboard events
 *   - Focus state is a SolidJS signal → components re-render on focus change
 *
 * Focus scopes:
 *   - pushFocusScope() creates a new scope (for Dialog focus trap)
 *   - Tab only cycles within the active (topmost) scope
 *   - popFocusScope() restores the previous scope and focus
 *
 * Node-level focus:
 *   - Nodes with `focusable` prop get a focus entry auto-created
 *   - node._focused is set to true/false based on focusedId()
 *   - focusStyle is applied by resolveProps() when _focused is true
 *   - onPress fires on Enter/Space when focused, or on mouse click
 */

import { createSignal } from "solid-js"
import { onInput } from "./input"
import type { KeyEvent } from "@tge/input"
import type { TGENode, PressEvent } from "./node"

// ── Focus registry ──

export type FocusEntry = {
  id: string
  onKeyDown?: (event: KeyEvent) => void
  onPress?: (event?: PressEvent) => void
  /** Associated TGENode — set for node-level focusables (focusable prop). */
  node?: TGENode
}

// ── Focus scope stack ──
// Each scope contains its own entries. Tab cycles within the topmost scope only.
// The global scope (index 0) is always present.

type FocusScope = {
  entries: FocusEntry[]
  /** Focus ID that was active when this scope was pushed (for restore). */
  previousFocusId: string | null
}

const scopes: FocusScope[] = [{ entries: [], previousFocusId: null }]

/** Get the active (topmost) scope. */
function activeScope(): FocusScope {
  return scopes[scopes.length - 1]
}

/** Get the active registry (entries of the topmost scope). */
function activeRegistry(): FocusEntry[] {
  return activeScope().entries
}

export const [focusedId, setFocusedId] = createSignal<string | null>(null)

/** Register a focusable element in the ACTIVE scope. Returns unregister function. */
function registerFocusable(entry: FocusEntry): () => void {
  const scope = activeScope()
  scope.entries.push(entry)
  // Auto-focus first element if nothing is focused
  if (scope.entries.length === 1 && !focusedId()) {
    setFocusedId(entry.id)
  }
  return () => {
    const idx = scope.entries.indexOf(entry)
    if (idx >= 0) scope.entries.splice(idx, 1)
    // If the removed element was focused, focus the next in scope
    if (focusedId() === entry.id) {
      const reg = activeRegistry()
      setFocusedId(reg.length > 0 ? reg[0].id : null)
    }
  }
}

/** Move focus to the next focusable element within the active scope. */
function focusNext() {
  const reg = activeRegistry()
  if (reg.length === 0) return
  const current = focusedId()
  const idx = reg.findIndex((e) => e.id === current)
  const next = (idx + 1) % reg.length
  setFocusedId(reg[next].id)
}

/** Move focus to the previous focusable element within the active scope. */
function focusPrev() {
  const reg = activeRegistry()
  if (reg.length === 0) return
  const current = focusedId()
  const idx = reg.findIndex((e) => e.id === current)
  const prev = idx <= 0 ? reg.length - 1 : idx - 1
  setFocusedId(reg[prev].id)
}

/** Set focus to a specific element by ID (must be in any scope). */
export function setFocus(id: string) {
  // Search all scopes for the ID
  for (const scope of scopes) {
    if (scope.entries.some((e) => e.id === id)) {
      setFocusedId(id)
      return
    }
  }
}

/**
 * Push a new focus scope (focus trap).
 * Tab/Shift+Tab will only cycle within this scope.
 * Returns a cleanup function that pops the scope and restores previous focus.
 */
export function pushFocusScope(): () => void {
  const scope: FocusScope = {
    entries: [],
    previousFocusId: focusedId(),
  }
  scopes.push(scope)
  setFocusedId(null) // clear focus — first registered element in scope will auto-focus
  return () => {
    const idx = scopes.indexOf(scope)
    if (idx > 0) {
      scopes.splice(idx, 1)
      // Restore previous focus
      setFocusedId(scope.previousFocusId)
    }
  }
}

/**
 * Get the focused entry (for dispatching keyboard events).
 * Searches the active scope first, then all scopes.
 */
export function getFocusedEntry(): FocusEntry | undefined {
  const current = focusedId()
  if (!current) return undefined
  // Search active scope first
  const entry = activeRegistry().find((e) => e.id === current)
  if (entry) return entry
  // Fallback: search all scopes
  for (const scope of scopes) {
    const found = scope.entries.find((e) => e.id === current)
    if (found) return found
  }
  return undefined
}

// ── Global keyboard handler for Tab navigation + event dispatch ──

let focusInputConnected = false

function ensureFocusInput() {
  if (focusInputConnected) return
  focusInputConnected = true

  onInput((event) => {
    if (event.type !== "key") return

    // Tab / Shift+Tab for focus navigation (within active scope)
    if (event.key === "tab") {
      if (event.mods.shift) {
        focusPrev()
      } else {
        focusNext()
      }
      return
    }

    // Enter/Space fires onPress on the focused element
    if (event.key === "enter" || event.key === " ") {
      const entry = getFocusedEntry()
      if (entry?.onPress) {
        entry.onPress()
        return // don't also dispatch onKeyDown for press events
      }
    }

    // Dispatch keyboard events to the focused element
    const entry = getFocusedEntry()
    if (entry?.onKeyDown) {
      entry.onKeyDown(event)
    }
  })
}

// ── Component hook ──

export type FocusHandle = {
  /** Whether this element is currently focused. */
  focused: () => boolean
  /** Programmatically focus this element. */
  focus: () => void
  /** The focus ID (pass as `focusId` prop to connect to node-level focus). */
  id: string
}

let nextId = 0

/**
 * Make a component focusable.
 *
 * Registers the component in the focus ring and returns reactive focus state.
 * Tab/Shift+Tab cycles through focusable components in registration order.
 * The focused component's onKeyDown receives keyboard events.
 *
 * Usage:
 *   function Button(props: { label: string; onPress: () => void }) {
 *     const { focused } = useFocus({
 *       onKeyDown(e) {
 *         if (e.key === "enter" || e.key === " ") props.onPress()
 *       }
 *     })
 *
 *     return (
 *       <Box
 *         borderColor={focused() ? border.focus : border.subtle}
 *         borderWidth={focused() ? 2 : 1}
 *       >
 *         <Text>{props.label}</Text>
 *       </Box>
 *     )
 *   }
 */
export function useFocus(opts: {
  id?: string
  onKeyDown?: (event: KeyEvent) => void
  onPress?: () => void
} = {}): FocusHandle {
  ensureFocusInput()

  const id = opts.id ?? `focus-${nextId++}`

  const unregister = registerFocusable({
    id,
    onKeyDown: opts.onKeyDown,
    onPress: opts.onPress,
  })

  // Note: unregister should be called on component cleanup.
  // SolidJS onCleanup is available in component scope.
  // For now, we rely on mount() cleanup tearing down everything.

  return {
    focused: () => focusedId() === id,
    focus: () => setFocusedId(id),
    id,
  }
}

// ── Node-level focus (for `focusable` prop on <box>) ──

/** Map from node ID to focus entry ID for node-level focusables. */
const nodeFocusMap = new Map<number, string>()

/**
 * Register a TGENode as focusable. Called by the reconciler when
 * a node has `focusable: true`.
 */
export function registerNodeFocusable(node: TGENode): () => void {
  ensureFocusInput()
  const id = `node-focus-${node.id}`
  nodeFocusMap.set(node.id, id)
  return registerFocusable({
    id,
    onKeyDown: node.props.onKeyDown,
    onPress: node.props.onPress,
    node,
  })
}

/**
 * Update the focus entry for a node (when onKeyDown/onPress props change).
 */
export function updateNodeFocusEntry(node: TGENode) {
  const focusId = nodeFocusMap.get(node.id)
  if (!focusId) return
  for (const scope of scopes) {
    const entry = scope.entries.find(e => e.id === focusId)
    if (entry) {
      entry.onKeyDown = node.props.onKeyDown
      entry.onPress = node.props.onPress
      return
    }
  }
}

/**
 * Unregister a node's focus entry. Called when node is destroyed
 * or `focusable` prop is removed.
 */
export function unregisterNodeFocusable(node: TGENode) {
  const focusId = nodeFocusMap.get(node.id)
  if (!focusId) return
  nodeFocusMap.delete(node.id)
  for (const scope of scopes) {
    const idx = scope.entries.findIndex(e => e.id === focusId)
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

/**
 * Get the focus ID for a node (used to check if a node is focused).
 */
export function getNodeFocusId(node: TGENode): string | undefined {
  return nodeFocusMap.get(node.id)
}

/** Reset the focus system. Called by mount() cleanup. */
export function resetFocus() {
  scopes.length = 1
  scopes[0].entries.length = 0
  scopes[0].previousFocusId = null
  setFocusedId(null)
  focusInputConnected = false
  nextId = 0
  nodeFocusMap.clear()
}
