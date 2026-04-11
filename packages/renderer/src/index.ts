/**
 * @tge/renderer — SolidJS createRenderer + Clay layout integration.
 *
 * Connects JSX to pixels:
 *   1. SolidJS reconciler translates JSX → TGENode tree
 *   2. TGENode tree → Clay layout elements (immediate mode, each frame)
 *   3. Clay calculates layout (microseconds) → RenderCommandArray
 *   4. Each RenderCommand → @tge/pixel paint call
 *   5. Composited buffer → @tge/output
 *
 * Usage:
 *   import { mount } from "@tge/renderer"
 *
 *   function App() {
 *     return <box backgroundColor="#16213e" cornerRadius={12} padding={16}>
 *       <text color="#e0e0e0" fontSize={16}>Hello TGE</text>
 *     </box>
 *   }
 *
 *   const terminal = await createTerminal()
 *   const cleanup = mount(() => <App />, terminal)
 */

import type { Terminal } from "@tge/terminal"
import { createParser } from "@tge/input"
import { createRenderLoop } from "./loop"
import { render as solidRender } from "./reconciler"
import { dispatchInput } from "./input"
import { resetFocus } from "./focus"

export type { RenderLoop } from "./loop"
export { createRenderLoop } from "./loop"

// Re-export SolidJS control flow
export { For, Show, Switch, Match, Index, ErrorBoundary } from "./reconciler"

// Re-export all reconciler primitives that babel-preset-solid imports.
// When generate: "universal" + moduleName: "@tge/renderer", babel emits:
//   import { createElement, createTextNode, insertNode, insert, setProp, createComponent, ... } from "@tge/renderer"
export {
  createComponent,
  createElement,
  solidCreateTextNode as createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  effect,
  memo,
  use,
} from "./reconciler"

// Named export for advanced use
export { render as solidRender } from "./reconciler"

// Re-export input hooks so apps import everything from @tge/renderer
export { useKeyboard, useMouse, useInput, onInput } from "./input"
export type { KeyboardState, MouseState } from "./input"

// Re-export focus system
export { useFocus, setFocus } from "./focus"
export type { FocusHandle } from "./focus"

// Re-export dirty flag for advanced use
export { markDirty } from "./dirty"

/**
 * Mount a SolidJS component tree onto the terminal.
 *
 * This is the main entry point for TGE apps:
 *   - Creates the render loop (Clay layout + Zig paint + output)
 *   - Mounts SolidJS component tree
 *   - Connects terminal stdin → input parser → event dispatch
 *   - Starts the 30fps render loop with dirty-flag optimization
 *
 * The input parser feeds events into the global dispatch system.
 * Components use useKeyboard()/useMouse() hooks to subscribe reactively.
 *
 * Returns a cleanup function that tears down everything.
 */
export function mount(component: () => any, terminal: Terminal): () => void {
  const loop = createRenderLoop(terminal)

  // SolidJS render mounts the component tree into the root TGENode
  const dispose = solidRender(component, loop.root)

  // Connect terminal stdin → input parser → dispatch
  // Feed mouse events into Clay for scroll tracking + pointer state
  const cellW = terminal.size.cellWidth || 8
  const cellH = terminal.size.cellHeight || 16
  const parser = createParser((event) => {
    dispatchInput(event)
    if (event.type === "mouse") {
      // Feed pointer position (convert cells to pixels)
      loop.feedPointer(event.x * cellW, event.y * cellH, event.action === "press")
      // Feed scroll delta — 1 line per tick for smooth scrolling
      if (event.action === "scroll") {
        // button 64 = scroll up, 65 = scroll down
        const dy = event.button === 64 ? cellH : -cellH
        loop.feedScroll(0, dy)
      }
    }
  })
  const unsubData = terminal.onData((data) => parser.feed(data))

  // Start the render loop (30fps, only repaints when dirty)
  loop.start()

  return () => {
    unsubData()
    parser.destroy()
    resetFocus()
    dispose()
    loop.destroy()
  }
}
