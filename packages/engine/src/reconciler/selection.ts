import { createSignal } from "solid-js"

/** @public */
export type TextSelection = {
  text: string
  sourceId: number
  start: number
  end: number
}

const [selection, setSelectionSignal] = createSignal<TextSelection | null>(null)

/** @public */
export function getSelection(): TextSelection | null {
  return selection()
}

/** @public */
export function getSelectedText(): string {
  return selection()?.text ?? ""
}

/** @public */
export function setSelection(sel: TextSelection | null) {
  setSelectionSignal(sel)
}

/** @public */
export function clearSelection() {
  setSelectionSignal(null)
}

/** @public */
export const selectionSignal = selection

/** @public */
export function resetSelection() {
  setSelectionSignal(null)
}
