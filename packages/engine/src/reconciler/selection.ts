import { createSignal } from "solid-js"

export type TextSelection = {
  text: string
  sourceId: number
  start: number
  end: number
}

const [selection, setSelectionSignal] = createSignal<TextSelection | null>(null)

export function getSelection(): TextSelection | null {
  return selection()
}

export function getSelectedText(): string {
  return selection()?.text ?? ""
}

export function setSelection(sel: TextSelection | null) {
  setSelectionSignal(sel)
}

export function clearSelection() {
  setSelectionSignal(null)
}

export const selectionSignal = selection

export function resetSelection() {
  setSelectionSignal(null)
}
