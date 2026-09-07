import { createNode, insertChild } from "../ffi/node"
import type { Terminal } from "../terminal/index"
import type { TerminalSize } from "../terminal/size"
import { setProp } from "../reconciler/reconciler"
import { markDirty } from "../reconciler/dirty"
import { createRenderLoop } from "./loop"

const cellWidth = 8
const cellHeight = 16

type FixtureTerminal = {
  term: Terminal
  emitResize: (width: number, height: number) => void
}

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

function createFixtureTerminal(width: number, height: number): FixtureTerminal {
  const resizeHandlers: Array<(next: TerminalSize) => void> = []
  const term = {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct" as const,
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
    suspend() {},
    resume() {},
    destroy() {},
  } satisfies Terminal

  return {
    term,
    emitResize(nextWidth, nextHeight) {
      const next = size(nextWidth, nextHeight)
      for (const handler of resizeHandlers) handler(next)
    },
  }
}

async function main() {
  const fixture = createFixtureTerminal(200, 120)
  const loop = createRenderLoop(fixture.term, { experimental: { forceLayerRepaint: true } })
  const box = createNode("box")
  insertChild(loop.root, box)
  setProp(box, "width", 100)
  setProp(box, "height", 40)
  setProp(box, "backgroundColor", 0x336699ff)

  const roots: Array<{ label: string; width: number; height: number }> = []
  const recordRoot = (label: string) => {
    roots.push({
      label,
      width: loop.root.props.width as number,
      height: loop.root.props.height as number,
    })
  }

  markDirty()
  loop.start()
  recordRoot("initial")

  fixture.emitResize(320, 180)
  recordRoot("grow")

  setProp(box, "backgroundColor", 0x669933ff)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  recordRoot("grow-update")

  fixture.emitResize(120, 80)
  recordRoot("shrink")

  setProp(box, "backgroundColor", 0x993366ff)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  recordRoot("shrink-update")

  loop.destroy()
  process.stderr.write(`__VEXART_RESIZE_REPORT__${JSON.stringify({ roots })}\n`)
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
