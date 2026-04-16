/**
 * Input → SolidJS signals bridge.
 *
 * Provides reactive hooks that wrap @tge/input events as SolidJS signals.
 * When the user presses a key or moves the mouse, the signals update
 * and SolidJS automatically re-renders affected components.
 *
 * The input system is initialized by mount() — it creates a parser,
 * connects terminal.onData → parser.feed, and stores the parser globally.
 * Hooks read from that global parser via a subscriber pattern.
 *
 * Architecture:
 *   terminal.onData → parser.feed → InputEvent → subscriber callbacks
 *     → subscriber calls setSignal(event) → SolidJS reactivity kicks in
 *       → reconciler calls setProperty/replaceText → markDirty()
 *         → render loop repaints next frame
 */

import { createSignal } from "solid-js"
import type { KeyEvent, MouseEvent as TGEMouseEvent, InputEvent } from "@tge/input"

// ── Global event bus ──

type InputSubscriber = (event: InputEvent) => void

const subscribers: InputSubscriber[] = []

export type InteractionTrace = {
  seq: number
  at: number
  kind: string | null
}

let interactionSeq = 0
let latestInteraction: InteractionTrace = { seq: 0, at: 0, kind: null }

/** Subscribe to all input events. Returns unsubscribe. */
export function onInput(handler: InputSubscriber): () => void {
  subscribers.push(handler)
  return () => {
    const idx = subscribers.indexOf(handler)
    if (idx >= 0) subscribers.splice(idx, 1)
  }
}

/** Dispatch an event to all subscribers. Called by the parser bridge in mount(). */
export function dispatchInput(event: InputEvent) {
  if (event.type === "key") {
    interactionSeq += 1
    latestInteraction = { seq: interactionSeq, at: performance.now(), kind: `key:${event.key}` }
  } else if (event.type === "mouse") {
    interactionSeq += 1
    latestInteraction = { seq: interactionSeq, at: performance.now(), kind: "mouse" }
  }
  for (const sub of subscribers) {
    sub(event)
  }
}

export function getLatestInteractionTrace(): InteractionTrace {
  return latestInteraction
}

// ── Keyboard hook ──

export type KeyboardState = {
  /** Last key event. Null until first keypress. */
  key: () => KeyEvent | null
  /** Whether a specific key is currently the last pressed key. */
  pressed: (name: string) => boolean
}

/**
 * Reactive keyboard hook.
 *
 * Returns a signal that updates on every keypress.
 * Use inside SolidJS components — re-renders automatically.
 *
 * Usage:
 *   const kb = useKeyboard()
 *   // In JSX:
 *   <Text>{kb.key()?.key ?? "none"}</Text>
 */
export function useKeyboard(): KeyboardState {
  const [key, setKey] = createSignal<KeyEvent | null>(null)

  onInput((event) => {
    if (event.type === "key") setKey(event)
  })

  return {
    key,
    pressed: (name: string) => key()?.key === name,
  }
}

// ── Mouse hook ──

export type MouseState = {
  /** Last mouse event. Null until first mouse activity. */
  mouse: () => TGEMouseEvent | null
  /** Current mouse position in terminal cells. */
  pos: () => { x: number; y: number }
}

/**
 * Reactive mouse hook.
 *
 * Returns a signal that updates on mouse events.
 *
 * Usage:
 *   const ms = useMouse()
 *   <Text>Mouse: {ms.pos().x}, {ms.pos().y}</Text>
 */
export function useMouse(): MouseState {
  const [mouse, setMouse] = createSignal<TGEMouseEvent | null>(null)

  onInput((event) => {
    if (event.type === "mouse") setMouse(event)
  })

  return {
    mouse,
    pos: () => {
      const m = mouse()
      return m ? { x: m.x, y: m.y } : { x: 0, y: 0 }
    },
  }
}

// ── Generic input hook ──

/**
 * Low-level hook: subscribe to ALL input events as a signal.
 *
 * Useful for custom input handling (paste, focus, etc.)
 */
export function useInput(): () => InputEvent | null {
  const [event, setEvent] = createSignal<InputEvent | null>(null)

  onInput((e) => setEvent(e))

  return event
}
