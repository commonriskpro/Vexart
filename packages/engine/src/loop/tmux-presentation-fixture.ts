import { createNode, insertChild, removeChild } from "../ffi/node"
import type { Terminal } from "../terminal/index"
import type { TerminalSize } from "../terminal/size"
import { setProp } from "../reconciler/reconciler"
import { markDirty } from "../reconciler/dirty"
import { debugState, setDebug } from "./debug"
import { createRenderLoop } from "./loop"
import {
  getLastNativePresentationStatsForTest,
  waitForTmuxPresentationForTest,
} from "../ffi/gpu-renderer-backend"
import { getRendererBackend } from "../ffi/renderer-backend"
import { notifyTerminalTransportLifecycle } from "../terminal/transport-lifecycle"

const cellWidth = 8
const cellHeight = 16

function size(width: number, height: number): TerminalSize {
  return {
    cols: Math.ceil(width / cellWidth),
    rows: Math.ceil(height / cellHeight),
    pixelWidth: width,
    pixelHeight: height,
    cellWidth,
    cellHeight,
  }
}

type FixtureTerminal = {
  term: Terminal
  emitResize: (width: number, height: number) => void
  lifecycle: () => { suspend: number; resume: number }
}

function createFixtureTerminal(width: number, height: number, tmux: boolean): FixtureTerminal {
  const resizeHandlers: Array<(next: TerminalSize) => void> = []
  let suspendCount = 0
  let resumeCount = 0
  const term = {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: !tmux,
      kittyPlaceholder: tmux,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux,
      parentKind: tmux ? "kitty" as const : null,
      transmissionMode: tmux ? "shm" as const : "direct" as const,
    },
    size: size(width, height),
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize(handler: (next: TerminalSize) => void) {
      resizeHandlers.push(handler)
      return () => {
        const index = resizeHandlers.indexOf(handler)
        if (index >= 0) resizeHandlers.splice(index, 1)
      }
    },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {
      suspendCount++
      notifyTerminalTransportLifecycle(term, "suspend")
    },
    resume() {
      resumeCount++
      notifyTerminalTransportLifecycle(term, "resume")
    },
    destroy() {},
  } satisfies Terminal

  return {
    term,
    lifecycle: () => ({ suspend: suspendCount, resume: resumeCount }),
    emitResize(nextWidth, nextHeight) {
      const next = size(nextWidth, nextHeight)
      // Terminal.size is a mutable object in the real terminal. Updating it
      // before subscribers run verifies the backend's per-emission callback.
      term.size = next
      for (const handler of resizeHandlers) handler(next)
    },
  }
}

type FixtureStats = {
  label: string
  cols: number
  rows: number
  width: number
  height: number
  rgbaBytesRead: number | null
  transport: number | null
  flags: number | null
  compressUs: number | null
  rawBytes: number | null
  payloadBytes: number | null
}

async function main() {
  const tmux = process.env.VEXART_FIXTURE_TMUX === "1"
  const fixture = createFixtureTerminal(320, 200, tmux)
  const loop = createRenderLoop(fixture.term, {
    experimental: {
      forceLayerRepaint: true,
      nativePresentation: true,
      nativeLayerRegistry: true,
    },
  })
  const backend = getRendererBackend()
  if (!backend) throw new Error("fixture did not install a renderer backend")
  setDebug(true)

  const backdrop = createNode("box")
  const panel = createNode("box")
  const accent = createNode("box")
  insertChild(loop.root, backdrop)
  insertChild(loop.root, panel)
  insertChild(loop.root, accent)
  setProp(loop.root, "direction", "row")
  setProp(loop.root, "paddingLeft", 13)
  setProp(loop.root, "paddingTop", 19)
  // Keep each graphic inside the viewport so pixel comparisons exercise the
  // effects rather than relying on flex shrink or clipped layer bounds.
  setProp(backdrop, "width", 120)
  setProp(backdrop, "height", 176)
  setProp(backdrop, "backgroundColor", 0x18202cff)
  setProp(panel, "width", 64)
  setProp(panel, "height", 42)
  setProp(panel, "marginLeft", 11)
  setProp(panel, "backgroundColor", 0x26496dff)
  setProp(panel, "gradient", { type: "linear", from: 0x2366aaff, to: 0x863cc4ff, angle: 35 })
  setProp(panel, "cornerRadius", 7)
  setProp(panel, "shadow", { x: 4, y: 5, blur: 8, color: 0x000000a0 })
  setProp(panel, "layer", true)
  setProp(accent, "width", 27)
  setProp(accent, "height", 18)
  setProp(accent, "marginLeft", 7)
  setProp(accent, "marginTop", 9)
  setProp(accent, "backgroundColor", 0xe8b84aff)
  setProp(accent, "cornerRadius", 5)
  setProp(accent, "glow", { color: 0xffb020d0, radius: 6, intensity: 0.7 })
  setProp(accent, "layer", true)

  const reports: FixtureStats[] = []
  const record = (label: string) => {
    const stats = getLastNativePresentationStatsForTest() ?? debugState.nativeStats
    reports.push({
      label,
      cols: fixture.term.size.cols,
      rows: fixture.term.size.rows,
      width: fixture.term.size.pixelWidth,
      height: fixture.term.size.pixelHeight,
      rgbaBytesRead: stats?.rgbaBytesRead ?? null,
      transport: stats?.transport ?? null,
      flags: stats?.flags ?? null,
      compressUs: stats?.compressUs ?? null,
      rawBytes: stats?.rawBytes ?? null,
      payloadBytes: stats?.payloadBytes ?? null,
    })
  }

  const waitForPresentation = async () => {
    await waitForTmuxPresentationForTest(backend)
  }

  markDirty()
  loop.start()
  await waitForPresentation()
  record("initial")

  // Update both visual pixels and layer geometry; the final-frame presenter
  // must continue to emit a complete image rather than stale grid cells.
  setProp(panel, "marginLeft", 37)
  setProp(panel, "backgroundColor", 0x2f6f9fff)
  removeChild(loop.root, accent)
  markDirty()
  loop.frame()
  await waitForPresentation()
  record("moved-removed")

  fixture.emitResize(352, 224)
  await waitForPresentation()
  record("resized")

  // Suspending leaves the alternate screen (and therefore placeholder grid)
  // behind. Resume must force a repaint even when the pixels are unchanged.
  loop.suspend()
  loop.resume()
  await waitForPresentation()
  record("resumed")

  loop.destroy()
  process.stderr.write(`__VEXART_TMUX_PRESENTATION_REPORT__${JSON.stringify({ tmux, reports, lifecycle: fixture.lifecycle() })}\n`)
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
