/**
 * Selection system — renderer-level text selection state.
 *
 * Provides a global selection model that components can use
 * to track selected text ranges across the UI.
 *
 * Architecture:
 *   - Selection state is a SolidJS signal pair (reactive)
 *   - Components that support selection call `setSelection()` when
 *     the user selects text (e.g., mouse drag in a text area)
 *   - Any code can read the current selection via `getSelection()`
 *   - `getSelectedText()` returns the selected text string
 *   - `clearSelection()` clears the selection
 *
 * This is NOT a visual system — it only tracks the logical selection.
 * Visual highlighting is the responsibility of each component that
 * renders selectable text.
 *
 * Usage:
 *   import { getSelection, getSelectedText, clearSelection, setSelection } from "@tge/renderer"
 *
 *   // Set selection (from a component that handles mouse events):
 *   setSelection({ text: "hello world", sourceId: myNode.id })
 *
 *   // Read selection (from a copy/paste handler):
 *   const sel = getSelection()
 *   if (sel) {
 *     terminal.writeClipboard(sel.text)
 *   }
 *
 *   // Clear:
 *   clearSelection()
 */

import { createSignal } from "solid-js"

/** A text selection anywhere in the TGE UI. */
export type TextSelection = {
  /** The selected text string */
  text: string
  /** ID of the source node (for identifying which component owns the selection) */
  sourceId: number
  /** Start offset in the source text */
  start: number
  /** End offset in the source text (exclusive) */
  end: number
}

const [selection, setSelectionSignal] = createSignal<TextSelection | null>(null)

/** Get the current text selection, or null if nothing is selected. */
export function getSelection(): TextSelection | null {
  return selection()
}

/** Get the selected text string, or empty string if nothing selected. */
export function getSelectedText(): string {
  return selection()?.text ?? ""
}

/** Set the current text selection. */
export function setSelection(sel: TextSelection | null) {
  setSelectionSignal(sel)
}

/** Clear the current selection. */
export function clearSelection() {
  setSelectionSignal(null)
}

/** Reactive signal accessor for selection — use in SolidJS components. */
export const selectionSignal = selection

/** Reset selection state. Called on mount cleanup. */
export function resetSelection() {
  setSelectionSignal(null)
}
