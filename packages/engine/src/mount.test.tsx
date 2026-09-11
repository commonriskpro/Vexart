import { describe, expect, test } from "bun:test"
import { onCleanup } from "solid-js"
import { mount } from "./mount"
import { onPostScroll } from "./reconciler/pointer"
import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "./ffi/node"
import { getRendererBackend, setRendererBackend, type RendererBackend } from "./ffi/renderer-backend"
import type { Terminal } from "./terminal/index"

function box(props: TGEProps, kids: TGENode[] = []) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  kids.forEach((kid) => insertChild(node, kid))
  return node
}

function text(value: string, props: TGEProps = {}) {
  const node = createTextNode(value)
  node.props = props
  return node
}

function createMockTerminal(width: number, height: number): { terminal: Terminal; emit: (data: string) => void } {
  const noop = () => {}
  const cellWidth = 8
  const cellHeight = 16
  const size = {
    cols: Math.ceil(width / cellWidth),
    rows: Math.ceil(height / cellHeight),
    pixelWidth: width,
    pixelHeight: height,
    cellWidth,
    cellHeight,
  }

  let onDataHandler: ((data: Buffer) => void) | null = null

  return {
    terminal: {
      kind: "kitty",
      caps: {
        kind: "kitty",
        kittyGraphics: true,
        kittyPlaceholder: false,
        kittyKeyboard: false,
        sixel: false,
        truecolor: true,
        mouse: true,
        focus: false,
        bracketedPaste: false,
        syncOutput: false,
        tmux: false,
        parentKind: null,
        transmissionMode: "direct",
      },
      size,
      write: noop,
      rawWrite: noop,
      writeBytes: noop,
      beginSync: noop,
      endSync: noop,
      onResize: () => noop,
      onData: (handler) => {
        onDataHandler = handler
        return () => {
          if (onDataHandler === handler) onDataHandler = null
        }
      },
      bgColor: null,
      fgColor: null,
      isDark: true,
      setTitle: noop,
      writeClipboard: noop,
      suspend: noop,
      resume: noop,
      destroy: noop,
    },
    emit(data: string) {
      onDataHandler?.(Buffer.from(data))
    },
  }
}

const noopBackend: RendererBackend = {
  name: "noop-test",
  paint() {
    return { output: "skip-present" }
  },
  endFrame() {
    return { output: "none", strategy: null }
  },
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe("mount scroll subscriptions", () => {
  test("components can subscribe to onPostScroll during mount render", async () => {
    const prevBackend = getRendererBackend()
    setRendererBackend(noopBackend)

    const { terminal, emit } = createMockTerminal(240, 120)
    let scrollHits = 0

    const handle = mount(() => {
      const unsub = onPostScroll(() => {
        scrollHits += 1
      })
      onCleanup(() => unsub())

      return box({ width: 120, height: 60, scrollY: true }, [
        box({ width: 120, height: 300, backgroundColor: 0x1a1a2eff }, [
          text("content", { color: 0xffffffff }),
        ]),
      ])
    }, terminal)

    try {
      await sleep(20)
      scrollHits = 0

      emit("\x1b[<65;2;2M")
      await sleep(20)

      expect(scrollHits).toBeGreaterThan(0)
    } finally {
      handle.destroy()
      setRendererBackend(prevBackend)
    }
  })
})

describe("mount mouse coordinates (Defect 15)", () => {
  test("clicking a 1-row element at row 0 triggers onPress and onMouseDown centered at cellHeight * 0.5", async () => {
    const prevBackend = getRendererBackend()
    setRendererBackend(noopBackend)

    const cellWidth = 8
    const cellHeight = 16
    const cols = 10
    const rows = 5
    const width = cols * cellWidth
    const height = rows * cellHeight

    const { terminal, emit } = createMockTerminal(width, height)
    let pressedCount = 0
    let mouseDownCount = 0
    let receivedNodeY = -1

    const handle = mount(() => {
      return box({ width, height, direction: "column" }, [
        box({
          width,
          height: cellHeight,
          onPress: () => {
            pressedCount += 1
          },
          onMouseDown: (e) => {
            mouseDownCount += 1
            receivedNodeY = e.nodeY
          },
        }),
      ])
    }, terminal)

    try {
      await sleep(20)

      // Emit SGR mouse press at row 0: col 1, row 1 (1-based SGR coordinates)
      emit("\x1b[<0;1;1M")
      await sleep(20)

      expect(mouseDownCount).toBe(1)
      expect(receivedNodeY).toBe(cellHeight * 0.5)

      // Emit SGR mouse release at row 0: col 1, row 1
      emit("\x1b[<0;1;1m")
      await sleep(20)

      expect(pressedCount).toBe(1)
    } finally {
      handle.destroy()
      setRendererBackend(prevBackend)
    }
  })

  test("clicking an element at the bottom row triggers interaction with centered nodeY", async () => {
    const prevBackend = getRendererBackend()
    setRendererBackend(noopBackend)

    const cellWidth = 8
    const cellHeight = 16
    const cols = 10
    const rows = 5
    const width = cols * cellWidth
    const height = rows * cellHeight

    const { terminal, emit } = createMockTerminal(width, height)
    let bottomPressedCount = 0
    let bottomMouseDownCount = 0
    let bottomNodeY = -1

    const handle = mount(() => {
      return box({ width, height, direction: "column" }, [
        box({ width, height: (rows - 1) * cellHeight }),
        box({
          width,
          height: cellHeight,
          onPress: () => {
            bottomPressedCount += 1
          },
          onMouseDown: (e) => {
            bottomMouseDownCount += 1
            bottomNodeY = e.nodeY
          },
        }),
      ])
    }, terminal)

    try {
      await sleep(20)

      // Emit SGR mouse press at bottom row: col 1, row rows (1-based SGR coordinates)
      emit(`\x1b[<0;1;${rows}M`)
      await sleep(20)

      expect(bottomMouseDownCount).toBe(1)
      expect(bottomNodeY).toBe(cellHeight * 0.5)

      // Emit SGR mouse release at bottom row: col 1, row rows
      emit(`\x1b[<0;1;${rows}m`)
      await sleep(20)

      expect(bottomPressedCount).toBe(1)
    } finally {
      handle.destroy()
      setRendererBackend(prevBackend)
    }
  })
})
