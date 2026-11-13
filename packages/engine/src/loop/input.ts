/**
 * Input → SolidJS signals bridge with multi-instance support.
 */

import { createSignal, onCleanup, getOwner } from "solid-js"
import type { KeyEvent, MouseEvent as TGEMouseEvent, InputEvent } from "../input/types"
import { useEngineContext } from "../context"

/** @public */
export type InputSubscriber = (event: InputEvent) => void

/** @public */
export type InteractionTrace = {
  seq: number
  at: number
  kind: string | null
}

/** @public */
export type KeyboardState = {
  key: () => KeyEvent | null
  pressed: (name: string) => boolean
}

/** @public */
export type MouseState = {
  mouse: () => TGEMouseEvent | null
  pos: () => { x: number; y: number }
}

/** @public */
export type InputManager = {
  onInput: (handler: InputSubscriber) => () => void
  dispatchInput: (event: InputEvent) => void
  resetInputSubscribers: () => void
  getLatestInteractionTrace: () => InteractionTrace
  useKeyboard: () => KeyboardState
  useMouse: () => MouseState
  useInput: () => () => InputEvent | null
  destroy: () => void
}

function cleanupOnOwner(unsub: () => void) {
  if (getOwner()) onCleanup(unsub)
}

/**
 * Factory to create an isolated InputManager.
 * @public
 */
export function createInputManager(): InputManager {
  const subscribers = new Set<InputSubscriber>()
  let interactionSeq = 0
  let latestInteraction: InteractionTrace = { seq: 0, at: 0, kind: null }

  function onInput(handler: InputSubscriber): () => void {
    subscribers.add(handler)
    return () => subscribers.delete(handler)
  }

  function resetInputSubscribers() {
    subscribers.clear()
  }

  function dispatchInput(event: InputEvent) {
    if (event.type === "key") {
      interactionSeq += 1
      latestInteraction = { seq: interactionSeq, at: performance.now(), kind: "key:" + event.key }
    } else if (event.type === "mouse") {
      interactionSeq += 1
      latestInteraction = { seq: interactionSeq, at: performance.now(), kind: "mouse" }
    }
    for (const sub of subscribers) sub(event)
  }

  function getLatestInteractionTrace(): InteractionTrace {
    return latestInteraction
  }

  function useKeyboard(): KeyboardState {
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

  function useMouse(): MouseState {
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

  function useInput(): () => InputEvent | null {
    const [event, setEvent] = createSignal<InputEvent | null>(null)
    const unsub = onInput((e) => setEvent(e))
    cleanupOnOwner(unsub)
    return event
  }

  function destroy() {
    subscribers.clear()
    interactionSeq = 0
    latestInteraction = { seq: 0, at: 0, kind: null }
  }

  return {
    onInput,
    dispatchInput,
    resetInputSubscribers,
    getLatestInteractionTrace,
    useKeyboard,
    useMouse,
    useInput,
    destroy,
  }
}

/** Module-level default input manager for backward compatibility and standalone tests. */
export const defaultInputManager = createInputManager()

function resolveInputManager(): InputManager {
  return useEngineContext()?.input ?? defaultInputManager
}

/** @public */
export function onInput(handler: InputSubscriber): () => void {
  return resolveInputManager().onInput(handler)
}

/** @public */
export function resetInputSubscribers() {
  resolveInputManager().resetInputSubscribers()
}

/** @public */
export function dispatchInput(event: InputEvent) {
  const ctx = useEngineContext()
  if (ctx && ctx.input !== defaultInputManager) {
    ctx.input.dispatchInput(event)
  }
  defaultInputManager.dispatchInput(event)
}

/** @public */
export function getLatestInteractionTrace(): InteractionTrace {
  return resolveInputManager().getLatestInteractionTrace()
}

/** @public */
export function useKeyboard(): KeyboardState {
  return resolveInputManager().useKeyboard()
}

/** @public */
export function useMouse(): MouseState {
  return resolveInputManager().useMouse()
}

/** @public */
export function useInput(): () => InputEvent | null {
  return resolveInputManager().useInput()
}
