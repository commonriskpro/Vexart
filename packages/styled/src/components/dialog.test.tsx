import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { createNode, parseColor, resetFocus, solidRender, type TGENode } from "@vexart/engine/internal"
import { VoidDialog, VoidDialogTitle, VoidDialogDescription, VoidDialogFooter } from "./dialog"
import { VoidPopover } from "./popover"
import { VoidDropdownMenu } from "./dropdown-menu"
import { borders, glows, gradients, radius, shadows } from "../tokens/tokens"
import "@vexart/app"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

beforeEach(() => resetFocus())
afterEach(() => resetFocus())

suite("Void 2.0 Glassmorphism & Overlays", () => {
  test("VoidDialog applies glassmorphism, specular border, and ambient glow", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidDialog>
        <VoidDialogTitle>Title</VoidDialogTitle>
        <VoidDialogDescription>Description</VoidDialogDescription>
        <VoidDialogFooter>Footer</VoidDialogFooter>
      </VoidDialog>
    ))

    try {
      const portal = root.children[0]
      const centerBox = portal.children[0]
      expect(centerBox.children.length).toBe(2)

      const overlay = centerBox.children[0]
      expect(overlay.props.backgroundColor).toBe(parseColor("#000000b8"))
      expect(overlay.props.backdropBlur).toBe(12)

      const contentContainer = centerBox.children[1]
      const content = contentContainer.children[0]

      expect(content.props.backdropBlur).toBeUndefined()
      expect(content.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.glass.from),
        to: parseColor(gradients.glass.to),
      })
      expect(content.props.borderColor).toBe(parseColor(borders.glassRim))
      expect(content.props.borderWidth).toBe(1)
      expect(content.props.cornerRadius).toBe(radius.xl)
      expect(content.props.shadow).toEqual(shadows.xl)
      expect(content.props.glow).toEqual(glows.ambient)
    } finally {
      dispose()
    }
  })

  test("VoidPopover applies glassmorphism and specular border", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)
    const dispose = renderScene(root, () => (
      <VoidPopover
        open={open()}
        onOpenChange={setOpen}
        trigger={<text>Trigger</text>}
      >
        <text>Popover Body</text>
      </VoidPopover>
    ))

    try {
      const container = root.children[0]
      const floatingBox = container.children[2]
      const content = floatingBox.children[0]

      expect(content.props.backdropBlur).toBeUndefined()
      expect(content.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.glass.from),
        to: parseColor(gradients.glass.to),
      })
      expect(content.props.borderColor).toBe(parseColor(borders.glassRim))
      expect(content.props.borderWidth).toBe(1)
      expect(content.props.cornerRadius).toBe(radius.lg)
      expect(content.props.shadow).toEqual(shadows.lg)
    } finally {
      dispose()
    }
  })

  test("VoidDropdownMenu applies glassmorphism and specular border to content panel", () => {
    const root = createNode("root")
    const [open, setOpen] = createSignal(true)
    const dispose = renderScene(root, () => (
      <VoidDropdownMenu open={open()} onOpenChange={setOpen}>
        <VoidDropdownMenu.Trigger>
          <text>Menu</text>
        </VoidDropdownMenu.Trigger>
        <VoidDropdownMenu.Content>
          <VoidDropdownMenu.Item>Option 1</VoidDropdownMenu.Item>
        </VoidDropdownMenu.Content>
      </VoidDropdownMenu>
    ))

    try {
      const menuRoot = root.children[0]
      const content = menuRoot.children[2]

      expect(content.props.backdropBlur).toBeUndefined()
      expect(content.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.glass.from),
        to: parseColor(gradients.glass.to),
      })
      expect(content.props.borderColor).toBe(parseColor(borders.glassRim))
      expect(content.props.borderWidth).toBe(1)
      expect(content.props.cornerRadius).toBe(radius.lg)
      expect(content.props.shadow).toEqual(shadows.lg)
    } finally {
      dispose()
    }
  })
})
