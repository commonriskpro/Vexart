import { beforeEach, afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { createComponent, createElement, createTextNode, dispatchInput, getRendererBackend, insertNode, resetFocus, setProp, setRendererBackend, type RendererBackend, type TGENode } from "@vexart/engine/internal"
import { mount, type Terminal } from "@vexart/engine"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")

// Bun's test runner does not load the repository JSX plugin automatically.
// Register it before dynamically importing the Solid universal component.
if (browserRuntime) await import("../../../../solid-plugin")
const { Table } = await import("./table")

type NodeComponent = (props: unknown) => TGENode
const TableNode = Table as unknown as NodeComponent

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
      mousePixel: false,
      mousePixelOrigin: 1,
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
    renderHeader: (column: { header: string }) => {
      const c = createElement("text")
      insertNode(c, createTextNode(column.header))
      return c
    },
    renderCell: (value: unknown) => {
      const c = createElement("text")
      insertNode(c, createTextNode(String(value)))
      return c
    },
  })
  insertNode(root, table)
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

  test("dynamic rowIndex and selection update when table data shifts", () => {
    const terminal = createTestTerminal()
    const itemB = { name: "item-b" }
    const itemC = { name: "item-c" }
    const itemA = { name: "item-a" }
    const [data, setData] = createSignal([itemB, itemC])
    const [selectedRow, setSelectedRow] = createSignal(0)
    const cellContexts: any[] = []
    let lastSelected = -1

    const root = createElement("box")
    const table = createComponent(TableNode, {
      columns: [{ key: "name", header: "Name", width: 120 }],
      get data() { return data() },
      get selectedRow() { return selectedRow() },
      onSelectedRowChange(idx: number) { lastSelected = idx },
      renderCell(value: unknown, _col: unknown, _rowIdx: number, ctx: any) {
        cellContexts.push(ctx)
        const c = createElement("text")
        insertNode(c, createTextNode(String(value)))
        return c
      },
    })
    insertNode(root, table)
    const handle = mount(() => root, terminal)

    try {
      // Initially: item-b is row 0, selected
      expect(cellContexts[0].rowIndex).toBe(0)
      expect(cellContexts[0].selected).toBe(true)

      // Prepend item-a -> item-b shifts to index 1
      setData([itemA, itemB, itemC])
      expect(cellContexts[0].rowIndex).toBe(1)
      expect(cellContexts[0].selected).toBe(false)

      // Pressing on item-b should report index 1, not stale index 0
      cellContexts[0].rowProps.onPress()
      expect(lastSelected).toBe(1)
    } finally {
      handle.destroy()
    }
  })
})
