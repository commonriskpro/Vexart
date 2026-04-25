/**
 * Input → SolidJS signals bridge.
 */

import { createSignal, onCleanup } from "solid-js"
import type { KeyEvent, MouseEvent as TGEMouseEvent, InputEvent } from "../input/types"

/** @public */
export type InputSubscriber = (event: InputEvent) => void

const subscribers = new Set<InputSubscriber>()

/** @public */
export type InteractionTrace = {
  seq: number
  at: number
  kind: string | null
}

let interactionSeq = 0
let latestInteraction: InteractionTrace = { seq: 0, at: 0, kind: null }

/** @public */
export function onInput(handler: InputSubscriber): () => void {
  subscribers.add(handler)
  return () => subscribers.delete(handler)
}

function cleanupOnOwner(unsub: () => void) {
  try { onCleanup(unsub) } catch {}
}

/** @public */
export function dispatchInput(event: InputEvent) {
  if (event.type === "key") {
    interactionSeq += 1
    latestInteraction = { seq: interactionSeq, at: performance.now(), kind: `key:${event.key}` }
  } else if (event.type === "mouse") {
    interactionSeq += 1
    latestInteraction = { seq: interactionSeq, at: performance.now(), kind: "mouse" }
  }
  for (const sub of subscribers) sub(event)
}

/** @public */
export function getLatestInteractionTrace(): InteractionTrace {
  return latestInteraction
}

/** @public */
export type KeyboardState = {
  key: () => KeyEvent | null
  pressed: (name: string) => boolean
}

/** @public */
export function useKeyboard(): KeyboardState {
  const [key, setKey] = createSignal<KeyEvent | null>(null)
  const unsub = onInput((event) => {
    if (event.type === "key") setKey(event)
  })
  cleanupOnOwner(unsub)
  return {
    key,
    pressed: (name: string) => key()?.key === name,
  }
}

/** @public */
export type MouseState = {
  mouse: () => TGEMouseEvent | null
  pos: () => { x: number; y: number }
}

/** @public */
export function useMouse(): MouseState {
  const [mouse, setMouse] = createSignal<TGEMouseEvent | null>(null)
  const unsub = onInput((event) => {
    if (event.type === "mouse") setMouse(event)
  })
  cleanupOnOwner(unsub)
  return {
    mouse,
    pos: () => {
      const m = mouse()
      return m ? { x: m.x, y: m.y } : { x: 0, y: 0 }
    },
  }
}

/** @public */
export function useInput(): () => InputEvent | null {
  const [event, setEvent] = createSignal<InputEvent | null>(null)
  const unsub = onInput((e) => setEvent(e))
  cleanupOnOwner(unsub)
  return event
}
