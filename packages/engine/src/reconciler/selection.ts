import { createSignal } from "solid-js"
import { useEngineContext } from "../context"

/** @public */
export type TextSelection = {
  text: string
  sourceId: number
  start: number
  end: number
}

/** @public */
export type SelectionManager = {
  getSelection: () => TextSelection | null
  getSelectedText: () => string
  setSelection: (sel: TextSelection | null) => void
  clearSelection: () => void
  readonly selectionSignal: () => TextSelection | null
  destroy: () => void
}

/**
 * Factory to create an isolated SelectionManager.
 * @public
 */
export function createSelectionManager(): SelectionManager {
  const [selection, setSelectionSignal] = createSignal<TextSelection | null>(null)

  return {
    getSelection: () => selection(),
    getSelectedText: () => selection()?.text ?? "",
    setSelection: (sel: TextSelection | null) => setSelectionSignal(sel),
    clearSelection: () => setSelectionSignal(null),
    selectionSignal: selection,
    destroy: () => setSelectionSignal(null),
  }
}

/** Module-level default selection manager for backward compatibility and standalone tests. */
export const defaultSelectionManager = createSelectionManager()

function resolveSelectionManager(): SelectionManager {
  return useEngineContext()?.selection ?? defaultSelectionManager
}

/** @public */
export function getSelection(): TextSelection | null {
  return resolveSelectionManager().getSelection()
}

/** @public */
export function getSelectedText(): string {
  return resolveSelectionManager().getSelectedText()
}

/** @public */
export function setSelection(sel: TextSelection | null) {
  resolveSelectionManager().setSelection(sel)
}

/** @public */
export function clearSelection() {
  resolveSelectionManager().clearSelection()
}

/** @public */
export const selectionSignal = () => resolveSelectionManager().selectionSignal()
