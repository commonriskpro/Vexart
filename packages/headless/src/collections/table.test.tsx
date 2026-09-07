import { beforeEach, afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { createComponent, createElement, createTextNode, dispatchInput, getRendererBackend, insertNode, mount, resetFocus, setProp, setRendererBackend, type RendererBackend, type TGENode, type Terminal } from "@vexart/engine"
import type { TabItem, TabRenderContext } from "../containers/tabs"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")

// Bun's test runner does not load the repository JSX plugin automatically.
// Register it before dynamically importing the Solid universal component.
if (browserRuntime) await import("../../../../solid-plugin")
const { Table } = await import("./table")
const { Tabs } = await import("../containers/tabs")
const { VoidTable } = await import("@vexart/styled")

type NodeComponent = (props: unknown) => TGENode
const TableNode = Table as unknown as NodeComponent
const TabsNode = Tabs as unknown as NodeComponent
const VoidTableNode = VoidTable as unknown as NodeComponent

const noopBackend: RendererBackend = {
  name: "table-test",
  paint() {
    return { output: "skip-present" }
  },
  endFrame() {
    return { output: "none", strategy: null }
  },
}

function createTestTerminal(): Terminal {
  const noop = () => {}
  const size = {
    cols: 80,
    rows: 24,
    pixelWidth: 640,
    pixelHeight: 384,
    cellWidth: 8,
    cellHeight: 16,
  }

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
    size,
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

function Scene(props: { selected: number; onSelected: (index: number) => void }) {
  // Keep another focus entry before the table so the test exercises the same
  // focus transition that the showcase uses when Tab reaches the table.
  const root = createElement("box")
  const before = createElement("box")
  setProp(before, "focusable", true)
  insertNode(root, before)
  const table = createComponent(TableNode, {
    focusId: "table-test",
    columns: [{ key: "name", header: "Name", width: 120 }],
    data: [{ name: "first" }, { name: "second" }, { name: "third" }],
    selectedRow: props.selected,
    onSelectedRowChange: props.onSelected,
    renderHeader: (column: { header: string }) => createTextNode(column.header),
    renderCell: (value: unknown) => createTextNode(String(value)),
  })
  insertNode(root, table)
  return root
}

function TabScene() {
  const [activeTab, setActiveTab] = createSignal(0)
  const root = createElement("box")
  const before = createElement("box")
  setProp(before, "focusable", true)
  insertNode(root, before)
  const tab = createComponent(TabsNode, {
    activeTab: activeTab(),
    onTabChange: setActiveTab,
    tabs: [
      { label: "Inputs", content: () => createElement("box") },
      { label: "Display", content: () => createElement("box") },
      {
        label: "Collections",
        content: () => createComponent(VoidTableNode, {
          columns: [
            { key: "name", header: "Name", width: 120 },
          ],
          data: [
            { name: "first" },
            { name: "second" },
            { name: "third" },
          ],
          selectedRow: 0,
          renderHeader: (column: { header: string }) => createTextNode(column.header),
          renderCell: (value: unknown) => createTextNode(String(value)),
        }),
      },
    ],
    renderTab: (_tab: TabItem, ctx: TabRenderContext) => {
      const node = createElement("box")
      setProp(node, "focusable", true)
      setProp(node, "onPress", ctx.tabProps.onPress)
      return node
    },
  })
  insertNode(root, tab)
  return root
}

const suite = browserRuntime ? describe : describe.skip

suite("Table keyboard focus", () => {
  const previousBackend = getRendererBackend()

  beforeEach(() => {
    resetFocus()
    setRendererBackend(noopBackend)
  })

  afterEach(() => {
    resetFocus()
    setRendererBackend(previousBackend)
  })

  test("focus transition and arrow navigation keep the table mounted", async () => {
    const terminal = createTestTerminal()
    const [selected, setSelected] = createSignal(0)
    const handle = mount(() => Scene({ selected: selected(), onSelected: setSelected }), terminal)

    try {
      dispatchInput({ type: "key", key: "tab", char: "\t", mods: { shift: false, alt: false, ctrl: false, meta: false } })
      dispatchInput({ type: "key", key: "down", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } })

      expect(selected()).toBe(1)
    } finally {
      handle.destroy()
    }
  })

  test("table remains mounted when reached through a tab panel", async () => {
    const terminal = createTestTerminal()
    const handle = mount(TabScene, terminal)

    try {
      dispatchInput({ type: "key", key: "right", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } })
      dispatchInput({ type: "key", key: "right", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } })

      for (let i = 0; i < 4; i++) {
        dispatchInput({ type: "key", key: "tab", char: "\t", mods: { shift: false, alt: false, ctrl: false, meta: false } })
      }

      expect(() => {
        dispatchInput({ type: "key", key: "down", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } })
      }).not.toThrow()
    } finally {
      handle.destroy()
    }
  })
})
