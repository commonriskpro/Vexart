/**
 * @vexart/engine — mount entry point and utility exports.
 * Previously lived in @vexart/engine's renderer entry point.
 */

import { createSignal, onCleanup } from "solid-js"
import { createParser } from "./input/parser"
import { createRenderLoop } from "./loop/loop"
import { render as solidRender } from "./reconciler/reconciler"
import { dispatchInput } from "./loop/input"
import { markDirty } from "./reconciler/dirty"
import { resetFocus } from "./reconciler/focus"
import { resetSelection } from "./reconciler/selection"
import { bindLoop, unbindLoop } from "./reconciler/pointer"
import type { Terminal } from "./terminal/index"

// ── Mouse button constants ──

/** @public */
export const MouseButton = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  RELEASE: 3,
  SCROLL_UP: 64,
  SCROLL_DOWN: 65,
} as const

// ── RGBA utility class ──

/** @public */
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

  static fromInts(r: number, g: number, b: number, a = 255): RGBA {
    const c = Object.create(RGBA.prototype) as RGBA
    ;(c as { r: number }).r = r
    ;(c as { g: number }).g = g
    ;(c as { b: number }).b = b
    ;(c as { a: number }).a = a
    return c
  }

  static fromHex(hex: string): RGBA {
    const h = hex.startsWith("#") ? hex.slice(1) : hex
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255
    return RGBA.fromInts(r, g, b, a)
  }

  static fromValues(r: number, g: number, b: number, a = 1): RGBA {
    return new RGBA(r, g, b, a)
  }

  toU32(): number {
    return ((this.r << 24) | (this.g << 16) | (this.b << 8) | this.a) >>> 0
  }

  valueOf(): number {
    return this.toU32()
  }

  toString(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${(this.a / 255).toFixed(2)})`
  }
}

// ── useTerminalDimensions hook ──

/** @public */
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

  const unsub = terminal.onResize((size) => {
    setWidth(size.pixelWidth || size.cols * (size.cellWidth || 8))
    setHeight(size.pixelHeight || size.rows * (size.cellHeight || 16))
    setCols(size.cols)
    setRows(size.rows)
    setCellW(size.cellWidth || 8)
    setCellH(size.cellHeight || 16)
  })

  onCleanup(() => unsub())

  return { width, height, cols, rows, cellWidth: cellW, cellHeight: cellH }
}

/**
 * Decode paste bytes to string — normalizes line endings.
 */
/** @public */
export function decodePasteBytes(bytes: Uint8Array | string): string {
  if (typeof bytes === "string") return bytes
  return new TextDecoder().decode(bytes)
}

// ── Mount types ──

/** @public */
export type MountOptions = {
  maxFps?: number
  experimental?: {
    idleMaxFps?: number
    interactionMaxFps?: number
    frameBudgetMs?: number
    forceLayerRepaint?: boolean
    nativePresentation?: boolean
    nativeLayerRegistry?: boolean
  }
}

/** @public */
export type MountHandle = {
  suspend: () => void
  resume: () => void
  suspended: () => boolean
  destroy: () => void
}

// ── mount ──

/** @public */
export function mount(component: () => any, terminal: Terminal, opts?: MountOptions): MountHandle {
  const loop = createRenderLoop(terminal, {
    experimental: {
      ...opts?.experimental,
      maxFps: opts?.maxFps,
      interactionMaxFps: opts?.experimental?.interactionMaxFps ?? opts?.maxFps,
    },
  })

  bindLoop(loop)
  const dispose = solidRender(component, loop.root)

  const cellW = terminal.size.cellWidth || 8
  const cellH = terminal.size.cellHeight || 16
  const pixW = terminal.size.pixelWidth || terminal.size.cols * cellW
  const pixH = terminal.size.pixelHeight || terminal.size.rows * cellH
  const cellWf = pixW / terminal.size.cols
  const cellHf = pixH / terminal.size.rows

  let isButtonDown = false

  const parser = createParser((event) => {
    if (loop.suspended()) return
    dispatchInput(event)

    if (event.type === "mouse") {
      if (event.action === "press") isButtonDown = true
      else if (event.action === "release") isButtonDown = false

      const px = event.x * cellWf + cellWf * 0.5
      const py = (event.y + 1) * cellHf
      loop.feedPointer(px, py, isButtonDown)

      if (event.action === "scroll") {
        const dy = event.button === 64 ? cellH : -cellH
        loop.feedScroll(0, dy)
      }

      const shouldRepaint = event.action === "press"
        || event.action === "release"
        || event.action === "scroll"
        || (event.action === "move" && (isButtonDown || loop.needsPointerRepaint()))
      if (shouldRepaint) {
        const shouldGlobalDirty = event.action !== "move" || !isButtonDown
        if (shouldGlobalDirty) markDirty()
        loop.requestInteractionFrame(event.action === "scroll" ? "scroll" : "pointer")
      }
      return
    }

    markDirty()
    loop.requestInteractionFrame("key")
  })
  const unsubData = terminal.onData((data) => parser.feed(data))

  loop.start()

  return {
    suspend: () => loop.suspend(),
    resume: () => loop.resume(),
    suspended: () => loop.suspended(),
    destroy: () => {
      unsubData()
      parser.destroy()
      unbindLoop()
      resetFocus()
      resetSelection()
      dispose()
      loop.destroy()
    },
  }
}

// SolidJS context re-exports
export { createContext, useContext } from "solid-js"
