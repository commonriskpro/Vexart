/**
 * EngineContext — instance-scoped engine lifecycle and state management.
 *
 * Implements ADR-001 Option B: Eliminates module-level singletons for focus,
 * selection, input, and pointer tracking by scoping managers to each RenderLoop
 * and providing access via SolidJS createContext and root-node inheritance.
 */

import { createContext, useContext } from "solid-js"
import type { TGENode } from "./ffi/node-types"
import type { RenderLoop } from "./loop/types"
import { createDirtyTracker, type DirtyTracker } from "./reconciler/dirty"
import { createFocusManager, defaultFocusManager, type FocusManager } from "./reconciler/focus"
import { createSelectionManager, defaultSelectionManager, type SelectionManager } from "./reconciler/selection"
import { createInputManager, defaultInputManager, type InputManager } from "./loop/input"

export type { FocusManager } from "./reconciler/focus"
export type { SelectionManager } from "./reconciler/selection"
export type { InputManager } from "./loop/input"
export { createFocusManager, defaultFocusManager } from "./reconciler/focus"
export { createSelectionManager, defaultSelectionManager } from "./reconciler/selection"
export { createInputManager, defaultInputManager } from "./loop/input"

/**
 * Main engine context instance.
 * Owns the root scene node, render loop, dirty tracker, and scoped managers.
 * @public
 */
export type EngineContext = {
  readonly id: number
  readonly root: TGENode
  readonly loop: RenderLoop
  readonly dirty: DirtyTracker
  readonly focus: FocusManager
  readonly selection: SelectionManager
  readonly input: InputManager
  destroy: () => void
}

let nextEngineContextId = 1
let activeEngineContext: EngineContext | null = null

/**
 * Get the currently active engine context outside Solid reactive ownership
 * (e.g. during render loop frame execution or terminal input handling).
 * @public
 */
export function getActiveEngineContext(): EngineContext | null {
  return activeEngineContext
}

/**
 * Set the currently active engine context.
 * @public
 */
export function setActiveEngineContext(ctx: EngineContext | null): void {
  activeEngineContext = ctx
}

/**
 * SolidJS context for component tree inheritance.
 * @public
 */
export const EngineSolidContext = createContext<EngineContext | null>(null)

/**
 * Hook to retrieve the current EngineContext from SolidJS context hierarchy,
 * falling back to the active engine context if outside component ownership.
 * @public
 */
export function useEngineContext(): EngineContext | null {
  try {
    const ctx = useContext(EngineSolidContext)
    if (ctx) return ctx
  } catch {}
  return activeEngineContext
}

/**
 * Factory to create an isolated EngineContext.
 * @public
 */
export function createEngineContext(opts: {
  root: TGENode
  loop: RenderLoop
  dirty?: DirtyTracker
  inputManager?: InputManager
}): EngineContext {
  const id = nextEngineContextId++
  const dirty = opts.dirty ?? opts.root._dirtyTracker ?? createDirtyTracker()
  const input = opts.inputManager ?? createInputManager()
  const focus = createFocusManager(input)
  const selection = createSelectionManager()

  const ctx: EngineContext = {
    id,
    root: opts.root,
    loop: opts.loop,
    dirty,
    focus,
    selection,
    input,
    destroy() {
      focus.destroy()
      selection.destroy()
      input.destroy()
      if (activeEngineContext === ctx) {
        activeEngineContext = null
      }
      if (opts.root._engineContext === ctx) {
        opts.root._engineContext = null
      }
    },
  }

  opts.root._engineContext = ctx
  return ctx
}
