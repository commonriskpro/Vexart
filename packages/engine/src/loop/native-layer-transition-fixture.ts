import { createNode, insertChild } from "../ffi/node"
import type { Terminal } from "../terminal/index"
import type { TerminalSize } from "../terminal/size"
import { setProp } from "../reconciler/reconciler"
import { markDirty } from "../reconciler/dirty"
import { createRenderLoop } from "./loop"

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

function createFixtureTerminal(width: number, height: number): Terminal {
  return {
    kind: "kitty",
    caps: {
      kind: "kitty",
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
      transmissionMode: "direct",
    },
    size: size(width, height),
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize() { return () => {} },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  }
}

async function main() {
  // Keep the repro in one mounted tree while exercising the real native
  // Kitty protocol across strategy transitions.
  const inverse = process.env.VEXART_NATIVE_LAYER_INVERSE === "1"
  process.env.VEXART_GPU_FORCE_LAYER_STRATEGY = inverse ? "final-frame" : "layered-dirty"
  const loop = createRenderLoop(createFixtureTerminal(320, 200), {
    experimental: { forceLayerRepaint: true, nativePresentation: true, nativeLayerRegistry: true },
  })
  const spacer = createNode("box")
  const target = createNode("box")
  insertChild(loop.root, spacer)
  insertChild(loop.root, target)
  setProp(loop.root, "direction", "row")
  // Deliberately place the layer between cells. A per-layer Kitty placement
  // would be cell-snapped while the complete frame preserves this pixel
  // offset, making duplicate presentation visible.
  setProp(loop.root, "paddingLeft", 21)
  setProp(loop.root, "paddingTop", 37)
  setProp(spacer, "width", 20)
  setProp(spacer, "height", 40)
  setProp(spacer, "backgroundColor", 0x222222ff)
  setProp(target, "layer", true)
  setProp(target, "width", 40)
  setProp(target, "height", 40)
  setProp(target, "backgroundColor", 0xff0000ff)

  markDirty()
  loop.start()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const moveOnly = process.env.VEXART_NATIVE_LAYER_MOVE_ONLY === "1"
  if (inverse) {
    process.env.VEXART_GPU_FORCE_LAYER_STRATEGY = "layered-dirty"
    setProp(target, "backgroundColor", 0x00ff00ff)
    markDirty()
    loop.frame()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    process.env.VEXART_GPU_FORCE_LAYER_STRATEGY = "final-frame"
    setProp(target, "backgroundColor", 0x0000ffff)
  } else if (!moveOnly) {
    delete process.env.VEXART_GPU_FORCE_LAYER_STRATEGY
    setProp(target, "backgroundColor", 0x00ff00ff)
  } else {
    setProp(spacer, "width", 60)
  }
  markDirty()
  loop.frame()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))

  loop.destroy()
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
