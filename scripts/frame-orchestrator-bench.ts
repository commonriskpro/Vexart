import { createNode, insertChild } from "../packages/engine/src/ffi/node"
import { resetVexartFfiCallCounts, getVexartFfiCallCount, getVexartFfiCallCountsBySymbol } from "../packages/engine/src/ffi/vexart-bridge"
import { createRenderLoop } from "../packages/engine/src/loop/loop"
import { markDirty } from "../packages/engine/src/reconciler/dirty"

function createMockTerminal(width: number, height: number, transmissionMode: "direct" | "file" | "shm" = "direct") {
  const cellWidth = 8
  const cellHeight = 16
  return {
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
      transmissionMode,
    },
    size: {
      cols: Math.ceil(width / cellWidth),
      rows: Math.ceil(height / cellHeight),
      pixelWidth: width,
      pixelHeight: height,
      cellWidth,
      cellHeight,
    },
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

function measureCounts(transmissionMode: "direct" | "file" | "shm") {
  const term = createMockTerminal(200, 120, transmissionMode)
  const loop = createRenderLoop(term, {
    experimental: {
      forceLayerRepaint: true,
      nativePresentation: transmissionMode === "shm",
      nativeLayerRegistry: transmissionMode === "shm",
    },
  })
  const box = createNode("box")
  box.props.width = 100
  box.props.height = 40
  box.props.backgroundColor = 0xff00ffff
  insertChild(loop.root, box)
  markDirty()
  loop.frame()

  resetVexartFfiCallCounts()
  loop.frame()
  const noOp = {
    count: getVexartFfiCallCount(),
    bySymbol: Object.fromEntries(getVexartFfiCallCountsBySymbol()),
  }

  resetVexartFfiCallCounts()
  box.props.backgroundColor = 0x00ff00ff
  markDirty()
  loop.frame()
  const dirty = {
    count: getVexartFfiCallCount(),
    bySymbol: Object.fromEntries(getVexartFfiCallCountsBySymbol()),
  }

  loop.destroy()
  return { noOp, dirty }
}

const direct = measureCounts("direct")
const shm = measureCounts("shm")

const report = {
  direct,
  shm,
  targets: {
    noOpMaxFfiCalls: 2,
    dirtyMaxFfiCalls: 6,
  },
}

console.log(JSON.stringify(report, null, 2))

if (direct.noOp.count > 2 || direct.dirty.count > 6 || shm.noOp.count > 2 || shm.dirty.count > 6) {
  console.error("❌ frame orchestrator benchmark target failed")
  process.exit(1)
}

console.log("✅ frame orchestrator benchmark targets met")
