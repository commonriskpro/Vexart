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
