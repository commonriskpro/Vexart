export type TerminalTransportLifecycleEvent = "suspend" | "resume" | "destroy"
export type TerminalTransportLifecycleCallback = (event: TerminalTransportLifecycleEvent) => void

type LifecycleState = {
  callbacks: Set<TerminalTransportLifecycleCallback>
  destroyed: boolean
}

const states = new WeakMap<object, LifecycleState>()

/** Subscribe to transport lifecycle changes without extending Terminal's public shape. */
export function onTerminalTransportLifecycle(
  term: object,
  callback: TerminalTransportLifecycleCallback,
): () => void {
  let state = states.get(term)
  if (!state) {
    state = { callbacks: new Set(), destroyed: false }
    states.set(term, state)
  }
  if (state.destroyed) return () => {}
  state.callbacks.add(callback)
  return () => { state?.callbacks.delete(callback) }
}

/** Internal bridge used by createTerminal; intentionally not re-exported publicly. */
export function notifyTerminalTransportLifecycle(term: object, event: TerminalTransportLifecycleEvent) {
  const state = states.get(term)
  if (!state) return
  if (state.destroyed) return
  const callbacks = [...state.callbacks]
  if (event === "destroy") {
    state.destroyed = true
    state.callbacks.clear()
  }
  let firstError: unknown = null
  for (const callback of callbacks) {
    try {
      callback(event)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}
