import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import type { ListItemContext } from "./list"
import {
  createComponent,
  createElement,
  dispatchInput,
  getRendererBackend,
  insertNode,
  resetFocus,
  setProp,
  setRendererBackend,
  type RendererBackend,
  type TGENode,
} from "@vexart/engine/internal"
import { mount, type Terminal } from "@vexart/engine"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")

if (browserRuntime) await import("../../../../solid-plugin")
const { List } = await import("./list")

type NodeComponent = (props: unknown) => TGENode
const ListNode = List as unknown as NodeComponent

const noopBackend: RendererBackend = {
  name: "list-test",
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
      mousePixel: false,
      mousePixelOrigin: 1,
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

const suite = browserRuntime ? describe : describe.skip

suite("List keyboard focus", () => {
  const previousBackend = getRendererBackend()

  beforeEach(() => {
    resetFocus()
    setRendererBackend(noopBackend)
  })

  afterEach(() => {
    resetFocus()
    setRendererBackend(previousBackend)
  })

  test("keeps rows stable while focus enters and selection moves", () => {
    const [selected, setSelected] = createSignal(0)
    const root = createElement("box")
    const before = createElement("box")
    setProp(before, "focusable", true)
    insertNode(root, before)

    const list = createComponent(ListNode, {
      items: ["first", "second", "third"],
      selectedIndex: selected(),
      onSelectedChange: setSelected,
      renderItem(item: string, _ctx: ListItemContext) {
        const node = createElement("box")
        setProp(node, "onPress", () => item)
        return node
      },
    })
    insertNode(root, list)
    const handle = mount(() => root, createTestTerminal())

    try {
      dispatchInput({ type: "key", key: "tab", char: "\t", mods: { shift: false, alt: false, ctrl: false, meta: false } })
      expect(() => {
        dispatchInput({ type: "key", key: "down", char: "", mods: { shift: false, alt: false, ctrl: false, meta: false } })
      }).not.toThrow()
      expect(selected()).toBe(1)
    } finally {
      handle.destroy()
    }
  })

  test("dynamic index and selection update when items list shifts", () => {
    const [items, setItems] = createSignal(["item-b", "item-c"])
    const [selected, setSelected] = createSignal(0)
    const contexts: ListItemContext[] = []
    let lastSelected = -1

    const root = createElement("box")
    const list = createComponent(ListNode, {
      get items() { return items() },
      get selectedIndex() { return selected() },
      onSelectedChange(idx: number) { lastSelected = idx },
      renderItem(_item: string, ctx: ListItemContext) {
        contexts.push(ctx)
        const node = createElement("box")
        setProp(node, "onPress", ctx.itemProps.onPress)
        return node
      },
    })
    insertNode(root, list)
    const handle = mount(() => root, createTestTerminal())

    try {
      // Initially: item-b is index 0, selected
      expect(contexts[0].index).toBe(0)
      expect(contexts[0].selected).toBe(true)

      // Prepend "item-a" -> "item-b" shifts from index 0 to index 1
      setItems(["item-a", "item-b", "item-c"])
      // contexts[0] represents "item-b" which was preserved by <For>
      expect(contexts[0].index).toBe(1)
      // If selected is still 0 ("item-a"), "item-b" is no longer selected
      expect(contexts[0].selected).toBe(false)

      // Pressing on "item-b" should report index 1, not stale index 0
      contexts[0].itemProps.onPress()
      expect(lastSelected).toBe(1)
    } finally {
      handle.destroy()
    }
  })
})
