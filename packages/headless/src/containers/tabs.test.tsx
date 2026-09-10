import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import type { TabItem, TabRenderContext } from "./tabs"
import {
  createComponent,
  createElement,
  dispatchInput,
  getRendererBackend,
  insertNode,
  mount,
  resetFocus,
  setProp,
  setRendererBackend,
  type RendererBackend,
  type TGENode,
  type Terminal,
} from "@vexart/engine"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")

// Bun's test runner does not load the repository JSX plugin automatically.
if (browserRuntime) await import("../../../../solid-plugin")
const { Tabs } = await import("./tabs")

type NodeComponent = (props: unknown) => TGENode
const TabsNode = Tabs as unknown as NodeComponent

const noopBackend: RendererBackend = {
  name: "tabs-test",
  paint() {
    return { output: "skip-present" }
  },
  endFrame() {
    return { output: "none", strategy: null }
  },
}

function createTestTerminal(): Terminal {
  const noop = () => {}
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
    size: {
      cols: 80,
      rows: 24,
      pixelWidth: 640,
      pixelHeight: 384,
      cellWidth: 8,
      cellHeight: 16,
    },
    write: noop,
    rawWrite: noop,
    writeBytes: noop,
    beginSync: noop,
    endSync: noop,
    onResize: () => noop,
    onData: () => noop,
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: noop,
    writeClipboard: noop,
    suspend: noop,
    resume: noop,
    destroy: noop,
  }
}

function Scene(props: { onActive: (index: number) => void; renderCount: { value: number } }) {
  const [activeTab, setActiveTab] = createSignal(0)
  const root = createElement("box")
  const before = createElement("box")
  setProp(before, "focusable", true)
  insertNode(root, before)

  const tabs = createComponent(TabsNode, {
    activeTab: activeTab(),
    onTabChange(index: number) {
      props.onActive(index)
      setActiveTab(index)
    },
    tabs: [
      { label: "One", content: () => createElement("box") },
      { label: "Two", content: () => createElement("box") },
      { label: "Three", content: () => createElement("box") },
    ],
    renderTab(_tab: TabItem, ctx: TabRenderContext) {
      props.renderCount.value += 1
      const node = createElement("box")
      setProp(node, "focusable", true)
      setProp(node, "onPress", ctx.tabProps.onPress)
      return node
    },
  })
  insertNode(root, tabs)
  return root
}

const key = (key: string, char = "") => ({
  type: "key" as const,
  key,
  char,
  mods: { shift: false, alt: false, ctrl: false, meta: false },
})

const suite = browserRuntime ? describe : describe.skip

suite("Tabs keyboard focus", () => {
  const previousBackend = getRendererBackend()

  beforeEach(() => {
    resetFocus()
    setRendererBackend(noopBackend)
  })

  afterEach(() => {
    resetFocus()
    setRendererBackend(previousBackend)
  })

  test("does not recreate focusable headers during focus dispatch", () => {
    const active: number[] = []
    const renderCount = { value: 0 }
    const handle = mount(() => Scene({ onActive: (index) => active.push(index), renderCount }), createTestTerminal())

    try {
      const initialRenderCount = renderCount.value
      // The synthetic Tabs focus entry is after the preceding focusable node.
      // The focus transition used to recursively rebuild all tab headers here.
      dispatchInput(key("tab", "\t"))
      expect(renderCount.value).toBe(initialRenderCount)

      dispatchInput(key("right"))
      expect(active).toEqual([1])
    } finally {
      handle.destroy()
    }
  })
})
