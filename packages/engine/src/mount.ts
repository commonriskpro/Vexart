/**
 * @vexart/engine — mount entry point and utility exports.
 * Previously lived in @vexart/engine's renderer entry point.
 */

import { createComponent, createSignal, onCleanup } from "solid-js"
import { createParser } from "./input/parser"
import { createRenderLoop } from "./loop/loop"
import { render as solidRender } from "./reconciler/reconciler"
import { createDirtyTracker, markDirty } from "./reconciler/dirty"
import { bindLoop, unbindLoop } from "./reconciler/pointer"
import { resetCompositorPathState } from "./animation/compositor-path"
import {
  createEngineContext,
  EngineSolidContext,
  getActiveEngineContext,
  setActiveEngineContext,
} from "./context"
import { createInputManager } from "./loop/input"
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

  const dirtyTracker = loop.root._dirtyTracker ?? createDirtyTracker()
  const inputManager = createInputManager()
  const engineCtx = createEngineContext({
    root: loop.root,
    loop,
    dirty: dirtyTracker,
    inputManager,
  })

  const priorActiveCtx = getActiveEngineContext()
  setActiveEngineContext(engineCtx)

  bindLoop(loop)
  const dispose = solidRender(
    () => createComponent(EngineSolidContext.Provider, {
      value: engineCtx,
      get children() {
        return createComponent(component, {})
      },
    }) as any,
    loop.root,
  )

  let cellH = terminal.size.cellHeight || 16

  const unsubResize = terminal.onResize((size) => {
    cellH = size.cellHeight || 16
  })

  let isButtonDown = false

  const caps = terminal.caps
  const parser = createParser((event) => {
    if (loop.suspended()) return
    const prev = getActiveEngineContext()
    setActiveEngineContext(engineCtx)
    try {
      engineCtx.input.dispatchInput(event)

      if (event.type === "mouse") {
        if (event.action === "press") isButtonDown = true
        else if (event.action === "release") isButtonDown = false

        loop.feedPointer(event.x, event.y, isButtonDown)

        if (event.action === "scroll") {
          const dy = event.button === 64 ? cellH : -cellH
          loop.feedScroll(0, dy)
        }

        const shouldRepaint = event.action === "press"
          || event.action === "release"
          || event.action === "scroll"
          || (event.action === "move" && (isButtonDown || loop.needsPointerRepaint()))
        if (shouldRepaint) {
          loop.requestInteractionFrame(event.action === "scroll" ? "scroll" : "pointer")
        }
        return
      }

      if (event.type === "focus") {
        return
      }

      markDirty(undefined, dirtyTracker)
      loop.requestInteractionFrame("key")
    } finally {
      setActiveEngineContext(prev)
    }
  }, {
    pixelOrigin: caps?.mousePixelOrigin ?? 1,
  })
  const unsubData = terminal.onData((data) => parser.feed(data))

  loop.start()

  return {
    suspend: () => loop.suspend(),
    resume: () => loop.resume(),
    suspended: () => loop.suspended(),
    destroy: () => {
      try {
        unsubData()
      } finally {
        try {
          unsubResize()
        } finally {
          try {
            parser.destroy()
          } finally {
            try {
              dispose()
            } finally {
              try {
                engineCtx.destroy()
                if (getActiveEngineContext() === engineCtx) {
                  setActiveEngineContext(priorActiveCtx)
                }
              } finally {
                try {
                  unbindLoop(loop)
                } finally {
                  try {
                    loop.destroy()
                  } finally {
                    resetCompositorPathState()
                  }
                }
              }
            }
          }
        }
      }
    },
  }
}

// SolidJS context re-exports
export { createContext, useContext } from "solid-js"
