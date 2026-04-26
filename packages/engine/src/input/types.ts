/**
 * Input event types for @vexart/engine.
 *
 * All parsed input is normalized to one of these event types.
 * The parser transforms raw stdin bytes → typed events.
 */

// ── Modifiers ──

/** @public */
export type Modifiers = {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

/** @public */
export const NO_MODS: Modifiers = { shift: false, alt: false, ctrl: false, meta: false }

/** @public */
export function decodeMods(n: number): Modifiers {
  const m = n - 1
  return {
    shift: !!(m & 1),
    alt: !!(m & 2),
    ctrl: !!(m & 4),
    meta: !!(m & 8),
  }
}

// ── Key Event ──

/** @public */
export type KeyEvent = {
  type: "key"
  key: string          // normalized key name: "a", "enter", "f1", "tab", etc.
  char: string         // printable character or "" for special keys
  mods: Modifiers
}

// ── Mouse Event ──

/** @public */
export type MouseAction = "press" | "release" | "move" | "scroll"

/** @public */
export type MouseEvent = {
  type: "mouse"
  action: MouseAction
  button: number       // 0=left, 1=middle, 2=right, 3=release, 64/65=scroll
  x: number            // 0-based column
  y: number            // 0-based row
  mods: Modifiers
}

// ── Focus Event ──

/** @public */
export type FocusEvent = {
  type: "focus"
  focused: boolean
}

// ── Paste Event ──

/** @public */
export type PasteEvent = {
  type: "paste"
  text: string
}

// ── Resize Event ──

/** @public */
export type ResizeEvent = {
  type: "resize"
}

// ── Union ──

/** @public */
export type InputEvent = KeyEvent | MouseEvent | FocusEvent | PasteEvent | ResizeEvent
