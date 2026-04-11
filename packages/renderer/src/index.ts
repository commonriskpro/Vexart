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
import { resetSelection } from "./selection"

export type { RenderLoop, RenderLoopOptions } from "./loop"
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
export { useFocus, setFocus, focusedId, setFocusedId } from "./focus"
export type { FocusHandle } from "./focus"

// Re-export dirty flag for advanced use
export { markDirty } from "./dirty"

// Re-export ref handle system
export type { NodeHandle } from "./handle"
export { createHandle } from "./handle"

// Re-export text layout system
export { registerFont, getFont, clearTextCache } from "./text-layout"
export type { FontDescriptor } from "./text-layout"

// Re-export scroll system
export type { ScrollHandle } from "./scroll"
export { createScrollHandle, resetScrollHandles } from "./scroll"

// Re-export selection system
export type { TextSelection } from "./selection"
export { getSelection, getSelectedText, setSelection, clearSelection, selectionSignal } from "./selection"

// Re-export debug overlay
export {
  toggleDebug,
  setDebug,
  isDebugEnabled,
  debugFrameStart,
  debugUpdateStats,
  debugState,
  debugStatsLine,
} from "./debug"
export type { DebugStats } from "./debug"

// Re-export plugin slot system
export { createSlotRegistry, createSlot } from "./plugins"
export type { SlotRegistry, SlotComponent, TgePlugin, TgePluginApi } from "./plugins"

// Re-export extmarks system
export { ExtmarkManager } from "./extmarks"
export type { Extmark, CreateExtmarkOptions } from "./extmarks"

// Re-export syntax highlighting system
export {
  TreeSitterClient,
  getTreeSitterClient,
  addDefaultParsers,
  SyntaxStyle,
  ONE_DARK,
  KANAGAWA,
  highlightsToTokens,
} from "./tree-sitter"
export type {
  Token,
  SimpleHighlight,
  FiletypeParserConfig,
  StyleDefinition,
  ThemeTokenStyle,
} from "./tree-sitter"

// Re-export Clay layout constants for advanced use
export { ATTACH_TO, ATTACH_POINT, POINTER_CAPTURE, SIZING, DIRECTION, ALIGN_X, ALIGN_Y } from "./clay"

// ── RGBA utility class ──

/**
 * RGBA color helper — compatible API for code migrating from opentui.
 * Internally converts to TGE's packed u32 format (0xRRGGBBAA).
 */
export class RGBA {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number

  constructor(r: number, g: number, b: number, a = 1) {
    this.r = Math.round(r * 255)
    this.g = Math.round(g * 255)
    this.b = Math.round(b * 255)
    this.a = Math.round(a * 255)
  }

  /** Create from 0-255 int values. */
  static fromInts(r: number, g: number, b: number, a = 255): RGBA {
    const c = new RGBA(0, 0, 0, 0)
    ;(c as any).r = r
    ;(c as any).g = g
    ;(c as any).b = b
    ;(c as any).a = a
    return c
  }

  /** Create from hex string ("#ff0000" or "#ff0000ff"). */
  static fromHex(hex: string): RGBA {
    const h = hex.startsWith("#") ? hex.slice(1) : hex
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255
    return RGBA.fromInts(r, g, b, a)
  }

  /** Create from 0-1 float values. */
  static fromValues(r: number, g: number, b: number, a = 1): RGBA {
    return new RGBA(r, g, b, a)
  }

  /** Convert to TGE packed u32 (0xRRGGBBAA). */
  toU32(): number {
    return ((this.r << 24) | (this.g << 16) | (this.b << 8) | this.a) >>> 0
  }

  /** Shorthand — call as color value in JSX props. */
  valueOf(): number {
    return this.toU32()
  }

  toString(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${(this.a / 255).toFixed(2)})`
  }
}

// ── useTerminalDimensions hook ──

import { createSignal, onCleanup } from "solid-js"

/**
 * Reactive terminal dimensions hook.
 * Returns pixel width/height and cell counts that update on resize.
 */
export function useTerminalDimensions(terminal: Terminal): {
  width: () => number
  height: () => number
  cols: () => number
  rows: () => number
  cellWidth: () => number
  cellHeight: () => number
} {
  const [width, setWidth] = createSignal(terminal.size.pixelWidth || terminal.size.cols * (terminal.size.cellWidth || 8))
  const [height, setHeight] = createSignal(terminal.size.pixelHeight || terminal.size.rows * (terminal.size.cellHeight || 16))
  const [cols, setCols] = createSignal(terminal.size.cols)
  const [rows, setRows] = createSignal(terminal.size.rows)
  const [cellW, setCellW] = createSignal(terminal.size.cellWidth || 8)
  const [cellH, setCellH] = createSignal(terminal.size.cellHeight || 16)

  const unsub = terminal.onResize(() => {
    setWidth(terminal.size.pixelWidth || terminal.size.cols * (terminal.size.cellWidth || 8))
    setHeight(terminal.size.pixelHeight || terminal.size.rows * (terminal.size.cellHeight || 16))
    setCols(terminal.size.cols)
    setRows(terminal.size.rows)
    setCellW(terminal.size.cellWidth || 8)
    setCellH(terminal.size.cellHeight || 16)
  })

  onCleanup(() => unsub())

  return { width, height, cols, rows, cellWidth: cellW, cellHeight: cellH }
}

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
export type MountOptions = {
  /** Render text as ANSI (selectable/copiable) instead of bitmap pixels. */
  selectableText?: boolean
}

export type MountHandle = {
  /** Suspend rendering — restore terminal for external process ($EDITOR). */
  suspend: () => void
  /** Resume rendering after suspend — re-enter TGE mode, full repaint. */
  resume: () => void
  /** Whether the renderer is currently suspended. */
  suspended: () => boolean
  /** Destroy everything — terminal, loop, SolidJS tree. */
  destroy: () => void
}

export function mount(component: () => any, terminal: Terminal, opts?: MountOptions): MountHandle {
  const loop = createRenderLoop(terminal, { selectableText: opts?.selectableText })

  // SolidJS render mounts the component tree into the root TGENode
  const dispose = solidRender(component, loop.root)

  // Connect terminal stdin → input parser → dispatch
  // Feed mouse events into Clay for scroll tracking + pointer state
  const cellW = terminal.size.cellWidth || 8
  const cellH = terminal.size.cellHeight || 16
  const parser = createParser((event) => {
    if (loop.suspended()) return
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

  return {
    suspend: () => loop.suspend(),
    resume: () => loop.resume(),
    suspended: () => loop.suspended(),
    destroy: () => {
      unsubData()
      parser.destroy()
      resetFocus()
      resetSelection()
      dispose()
      loop.destroy()
    },
  }
}
