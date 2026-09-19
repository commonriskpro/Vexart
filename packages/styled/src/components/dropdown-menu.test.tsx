import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import {
  createNode,
  dispatchInput,
  resetFocus,
  solidRender,
  type TGENode,
} from "@vexart/engine/internal"
import { VoidDropdownMenu } from "./dropdown-menu"
import { themeColors } from "../theme/theme"
import { radius, space } from "../tokens/tokens"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

beforeEach(() => resetFocus())
afterEach(() => resetFocus())

suite("styled VoidDropdownMenu", () => {
  test("exposes Void compound components", () => {
    expect(VoidDropdownMenu).toBeFunction()
    expect(VoidDropdownMenu.Trigger).toBeFunction()
    expect(VoidDropdownMenu.Content).toBeFunction()
    expect(VoidDropdownMenu.Item).toBeFunction()
    expect(VoidDropdownMenu.Separator).toBeFunction()
    expect(VoidDropdownMenu.Label).toBeFunction()
  })

  test("renders styled content with theme tokens when open", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)
    let selected = false

    const dispose = renderScene(root, () => (
      <VoidDropdownMenu open={open()} onOpenChange={setOpen}>
        <VoidDropdownMenu.Trigger>
          <text>Menu</text>
        </VoidDropdownMenu.Trigger>
        <VoidDropdownMenu.Content>
          <VoidDropdownMenu.Label>Section</VoidDropdownMenu.Label>
          <VoidDropdownMenu.Item onSelect={() => { selected = true }}>Profile</VoidDropdownMenu.Item>
          <VoidDropdownMenu.Separator />
          <VoidDropdownMenu.Item variant="destructive">Delete</VoidDropdownMenu.Item>
        </VoidDropdownMenu.Content>
      </VoidDropdownMenu>
    ))

    try {
      const menuRoot = root.children[0]
      expect(menuRoot).toBeDefined()
      // Open state: trigger, outside plane, and content panel
      expect(menuRoot.children.length).toBe(3)

      const outsidePlane = menuRoot.children[1]
      expect(outsidePlane.props.floating).toBe("root")

      const content = menuRoot.children[2]
      expect(content.props.backgroundColor).toBeDefined()
      expect(content.props.cornerRadius).toBe(radius.md)
      expect(content.props.borderColor).toBeDefined()
      expect(content.props.borderWidth).toBe(1)
      expect(content.props.padding).toBe(space[0.5])

      // Default item styling
      const defaultItem = content.children[1]
      expect(defaultItem.props.cornerRadius).toBe(radius.sm)
      const defaultText = defaultItem.children[0]
      expect(defaultText.props.color).toBeDefined()

      // Destructive item styling
      const destructiveItem = content.children[3]
      const destructiveText = destructiveItem.children[0]
      expect(destructiveText.props.color).toBeDefined()
      expect(destructiveText.props.color).not.toBe(defaultText.props.color)

      // Clicking default item executes onSelect and closes menu
      ;(defaultItem.props.onPress as () => void)()
      expect(selected).toBe(true)
      expect(open()).toBe(false)
    } finally {
      dispose()
    }
  })

  test("outside click and escape close the styled dropdown", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)

    const dispose = renderScene(root, () => (
      <VoidDropdownMenu open={open()} onOpenChange={setOpen}>
        <VoidDropdownMenu.Trigger>
          <text>Trigger</text>
        </VoidDropdownMenu.Trigger>
        <VoidDropdownMenu.Content>
          <VoidDropdownMenu.Item>Item</VoidDropdownMenu.Item>
        </VoidDropdownMenu.Content>
      </VoidDropdownMenu>
    ))

    try {
      const menuRoot = root.children[0]
      const outsidePlane = menuRoot.children[1]
      ;(outsidePlane.props.onPress as () => void)()
      expect(open()).toBe(false)

      setOpen(true)
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
})
