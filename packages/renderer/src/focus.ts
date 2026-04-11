/**
 * Focus system — manages which element receives keyboard events.
 *
 * Architecture:
 *   - Components register as "focusable" via useFocus()
 *   - Tab/Shift+Tab cycles through focusable elements in registration order
 *   - The focused element's onKeyDown callback receives keyboard events
 *   - Focus state is a SolidJS signal → components re-render on focus change
 *
 * The focus ring is NOT painted by the focus system — components read
 * the `focused()` signal and apply their own visual treatment (border,
 * glow, highlight). This follows SolidJS's reactive model: data flows
 * through signals, rendering is declarative.
 */

import { createSignal } from "solid-js"
import { onInput } from "./input"
import type { KeyEvent } from "@tge/input"

// ── Focus registry ──

type FocusEntry = {
  id: string
  onKeyDown?: (event: KeyEvent) => void
}

const registry: FocusEntry[] = []
export const [focusedId, setFocusedId] = createSignal<string | null>(null)

/** Register a focusable element. Returns unregister function. */
function registerFocusable(entry: FocusEntry): () => void {
  registry.push(entry)
  // Auto-focus first element if nothing is focused
  if (registry.length === 1 && !focusedId()) {
    setFocusedId(entry.id)
  }
  return () => {
    const idx = registry.indexOf(entry)
    if (idx >= 0) registry.splice(idx, 1)
    // If the removed element was focused, focus the next one
    if (focusedId() === entry.id) {
      setFocusedId(registry.length > 0 ? registry[0].id : null)
    }
  }
}

/** Move focus to the next focusable element. */
function focusNext() {
  if (registry.length === 0) return
  const current = focusedId()
  const idx = registry.findIndex((e) => e.id === current)
  const next = (idx + 1) % registry.length
  setFocusedId(registry[next].id)
}

/** Move focus to the previous focusable element. */
function focusPrev() {
  if (registry.length === 0) return
  const current = focusedId()
  const idx = registry.findIndex((e) => e.id === current)
  const prev = idx <= 0 ? registry.length - 1 : idx - 1
  setFocusedId(registry[prev].id)
}

/** Set focus to a specific element by ID. */
export function setFocus(id: string) {
  if (registry.some((e) => e.id === id)) {
    setFocusedId(id)
  }
}

// ── Global keyboard handler for Tab navigation + event dispatch ──

let focusInputConnected = false

function ensureFocusInput() {
  if (focusInputConnected) return
  focusInputConnected = true

  onInput((event) => {
    if (event.type !== "key") return

    // Tab / Shift+Tab for focus navigation
    if (event.key === "tab") {
      if (event.mods.shift) {
        focusPrev()
      } else {
        focusNext()
      }
      return
    }

    // Dispatch keyboard events to the focused element
    const current = focusedId()
    if (!current) return
    const entry = registry.find((e) => e.id === current)
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
} = {}): FocusHandle {
  ensureFocusInput()

  const id = opts.id ?? `focus-${nextId++}`

  const unregister = registerFocusable({
    id,
    onKeyDown: opts.onKeyDown,
  })

  // Note: unregister should be called on component cleanup.
  // SolidJS onCleanup is available in component scope.
  // For now, we rely on mount() cleanup tearing down everything.

  return {
    focused: () => focusedId() === id,
    focus: () => setFocusedId(id),
  }
}

/** Reset the focus system. Called by mount() cleanup. */
export function resetFocus() {
  registry.length = 0
  setFocusedId(null)
  focusInputConnected = false
  nextId = 0
}
