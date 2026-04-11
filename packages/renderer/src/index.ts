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
 *   mount(() => <App />, terminal)
 */

import type { Terminal } from "@tge/terminal"
import { createRenderLoop } from "./loop"
import { render as solidRender, createComponent } from "./reconciler"

export type { RenderLoop } from "./loop"
export { createRenderLoop } from "./loop"

// Re-export SolidJS control flow
export { For, Show, Switch, Match, Index, ErrorBoundary } from "./reconciler"
export { render as solidRender, createComponent, createElement, effect, memo } from "./reconciler"

/**
 * Mount a SolidJS component tree onto the terminal.
 *
 * This is the main entry point for TGE apps.
 * Returns a cleanup function.
 */
export function mount(component: () => any, terminal: Terminal): () => void {
  const loop = createRenderLoop(terminal)

  // SolidJS render mounts the component tree into the root TGENode
  const dispose = solidRender(component, loop.root)

  // Start the render loop
  loop.frame() // initial render

  return () => {
    dispose()
    loop.destroy()
  }
}
