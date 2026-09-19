import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import {
  createNode,
  dispatchInput,
  resetFocus,
  solidRender,
  type TGENode,
} from "@vexart/engine/internal"
import { DropdownMenu } from "./dropdown-menu"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

beforeEach(() => resetFocus())
afterEach(() => resetFocus())

suite("headless DropdownMenu", () => {
  test("exposes compound components", () => {
    expect(DropdownMenu).toBeFunction()
    expect(DropdownMenu.Trigger).toBeFunction()
    expect(DropdownMenu.Content).toBeFunction()
    expect(DropdownMenu.Item).toBeFunction()
    expect(DropdownMenu.Separator).toBeFunction()
    expect(DropdownMenu.Label).toBeFunction()
  })

  test("controlled open/close: toggles via trigger, outside click closes, item select closes", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(false)
    let selected = false

    const dispose = renderScene(root, () => (
      <DropdownMenu open={open()} onOpenChange={setOpen}>
        <DropdownMenu.Trigger>
          <text>Trigger</text>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Label>Header</DropdownMenu.Label>
          <DropdownMenu.Item onSelect={() => { selected = true }}>Action</DropdownMenu.Item>
          <DropdownMenu.Separator />
        </DropdownMenu.Content>
      </DropdownMenu>
    ))

    try {
      const menuRoot = root.children[0]
      expect(menuRoot).toBeDefined()
      expect(open()).toBe(false)
      // When closed, only trigger is rendered
      expect(menuRoot.children.length).toBe(1)

      // Click trigger to open
      const trigger = menuRoot.children[0]
      ;(trigger.props.onPress as () => void)()
      expect(open()).toBe(true)

      // When open, menuRoot has trigger, outside-plane, and content
      expect(menuRoot.children.length).toBe(3)
      const outsidePlane = menuRoot.children[1]
      expect(outsidePlane.props.floating).toBe("root")
      expect(outsidePlane.props.zIndex).toBe(9997)

      const content = menuRoot.children[2]
      expect(content.props.floating).toBe("parent")
      expect(content.props.zIndex).toBe(9999)

      // Test outside-click closes menu
      ;(outsidePlane.props.onPress as () => void)()
      expect(open()).toBe(false)
      expect(menuRoot.children.length).toBe(1)

      // Re-open via trigger
      ;(trigger.props.onPress as () => void)()
      expect(open()).toBe(true)

      // Click item
      const item = menuRoot.children[2].children[1]
      ;(item.props.onPress as () => void)()
      expect(selected).toBe(true)
      expect(open()).toBe(false)
    } finally {
      dispose()
    }
  })

  test("escape key closes open dropdown menu", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)

    const dispose = renderScene(root, () => (
      <DropdownMenu open={open()} onOpenChange={setOpen}>
        <DropdownMenu.Trigger>
          <text>Trigger</text>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item>Item</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    ))

    try {
      expect(open()).toBe(true)
      dispatchInput({
        type: "key",
        key: "escape",
        char: "",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(open()).toBe(false)
    } finally {
      dispose()
    }
  })

  test("uncontrolled mode with defaultOpen", () => {
    const root = createNode("root")
    let selected = false

    const dispose = renderScene(root, () => (
      <DropdownMenu defaultOpen={false}>
        <DropdownMenu.Trigger>
          <text>Trigger</text>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onSelect={() => { selected = true }}>Click Me</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    ))

    try {
      const menuRoot = root.children[0]
      expect(menuRoot.children.length).toBe(1)

      // Toggle open
      const trigger = menuRoot.children[0]
      ;(trigger.props.onPress as () => void)()
      expect(menuRoot.children.length).toBe(3)

      // Select item -> closes
      const item = menuRoot.children[2].children[0]
      ;(item.props.onPress as () => void)()
      expect(selected).toBe(true)
      expect(menuRoot.children.length).toBe(1)
    } finally {
      dispose()
    }
  })

  test("disabled item does not trigger onSelect or close menu", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)
    let selected = false

    const dispose = renderScene(root, () => (
      <DropdownMenu open={open()} onOpenChange={setOpen}>
        <DropdownMenu.Trigger>
          <text>Trigger</text>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item disabled onSelect={() => { selected = true }}>
            Disabled Item
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    ))

    try {
      const menuRoot = root.children[0]
      const item = menuRoot.children[2].children[0]
      expect(item.props.opacity).toBe(0.5)

      ;(item.props.onPress as () => void)()
      expect(selected).toBe(false)
      expect(open()).toBe(true)
    } finally {
      dispose()
    }
  })
})
