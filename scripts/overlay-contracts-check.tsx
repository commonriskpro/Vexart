/**
 * Focused production overlay regressions.
 *
 * Run with:
 *   bun --conditions=browser --preload ./solid-plugin.ts scripts/overlay-contracts-check.tsx
 *
 * This intentionally uses the universal SolidJS JSX runtime and the real
 * render loop. It does not install a React-compatible JSX shim.
 */

import assert from "node:assert/strict"
import { createSignal, type JSX } from "solid-js"
import {
  createRenderLoop,
  dispatchInput,
  resetFocus,
  setRendererBackend,
  solidRender,
  type RendererBackend,
  type TGENode,
  type Terminal,
} from "@vexart/engine"
import { Dialog } from "../packages/headless/src/overlays/dialog"
import { Popover, Tooltip } from "../packages/headless/src/overlays/tooltip"
import { VoidDropdownMenu } from "../packages/styled/src/components/dropdown-menu"

const noop = () => {}
const terminal: Terminal = {
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
    cols: 40,
    rows: 20,
    pixelWidth: 320,
    pixelHeight: 320,
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

const backend: RendererBackend = {
  name: "overlay-contracts-check",
  paint() { return { output: "skip-present" } },
  endFrame() { return { output: "none", strategy: null } },
}

const key = (name: string, char = "") => ({
  type: "key" as const,
  key: name,
  char,
  mods: { shift: false, alt: false, ctrl: false, meta: false },
})

function nodes(root: TGENode): TGENode[] {
  return [root, ...root.children.flatMap((child) => nodes(child))]
}

function findNode(root: TGENode, predicate: (node: TGENode) => boolean): TGENode {
  const found = nodes(root).find(predicate)
  assert.ok(found, "expected node was not rendered")
  return found
}

function renderScene(component: () => JSX.Element) {
  resetFocus()
  setRendererBackend(backend)
  const loop = createRenderLoop(terminal, {
    experimental: { nativePresentation: false, nativeLayerRegistry: false },
  })
  const dispose = solidRender(
    () => component() as unknown as TGENode,
    loop.root,
  )
  loop.frame()
  return { loop, dispose }
}

function closeScene(loop: ReturnType<typeof createRenderLoop>, dispose: () => void) {
  dispose()
  loop.destroy()
  resetFocus()
}

function dialogLayoutAndOutsideClick() {
  const [open, setOpen] = createSignal(true)
  const { loop, dispose } = renderScene(() => open()
    ? (
      <Dialog onClose={() => setOpen(false)}>
        <Dialog.Overlay />
        <Dialog.Content width={120}>
          <box height={20}><text>Content</text></box>
        </Dialog.Content>
      </Dialog>
    )
    : null)

  const overlay = findNode(loop.root, (node) => node.props.floating === "parent" && node.props.width === "100%")
  const content = findNode(loop.root, (node) => node.props.width === 120)
  assert.equal(overlay.layout.y, 0)
  assert.equal(overlay.layout.height, 320)
  assert.equal(content.layout.y, 150)

  loop.feedPointer(10, 10, true)
  loop.frame()
  loop.feedPointer(10, 10, false)
  loop.frame()
  assert.equal(open(), false, "clicking the dialog backdrop closes it")
  closeScene(loop, dispose)
}

function dialogEscapeAndTopModal() {
  const [firstOpen, setFirstOpen] = createSignal(true)
  const [secondOpen, setSecondOpen] = createSignal(true)
  const { loop, dispose } = renderScene(() => (
    <>
      {firstOpen() ? <Dialog onClose={() => setFirstOpen(false)}><Dialog.Content width={80}><text>First</text></Dialog.Content></Dialog> : null}
      {secondOpen() ? <Dialog onClose={() => setSecondOpen(false)}><Dialog.Content width={80}><text>Second</text></Dialog.Content></Dialog> : null}
    </>
  ))

  dispatchInput(key("escape"))
  loop.frame()
  assert.equal(secondOpen(), false, "Escape closes only the topmost dialog")
  assert.equal(firstOpen(), true)
  dispatchInput(key("escape"))
  loop.frame()
  assert.equal(firstOpen(), false)
  closeScene(loop, dispose)
}

function tooltipHoverAndPosition() {
  const placements = [
    { name: "top" as const, x: 20, y: -24 },
    { name: "bottom" as const, x: 20, y: 24 },
    { name: "left" as const, x: -44, y: 0 },
    { name: "right" as const, x: 84, y: 0 },
  ]

  for (const direction of ["column", "row"] as const) {
    for (const placement of placements) {
      const { loop, dispose } = renderScene(() => (
        <box direction={direction}>
          <Tooltip
            content="Hello"
            placement={placement.name}
            renderTooltip={(content) => <box width={40} height={20}><text>{content}</text></box>}
          >
            <box width={80} height={20}><text>Trigger</text></box>
          </Tooltip>
        </box>
      ))

      loop.feedPointer(10, 10, false)
      loop.frame()
      const tooltip = findNode(loop.root, (node) => node.props.floating === "parent" && node.props.zIndex === 9999)
      assert.equal(tooltip.layout.width, 40, `${direction} ${placement.name} tooltip width`)
      assert.equal(tooltip.layout.height, 20, `${direction} ${placement.name} tooltip height`)
      assert.equal(tooltip.layout.x, placement.x, `${direction} ${placement.name} tooltip x`)
      assert.equal(tooltip.layout.y, placement.y, `${direction} ${placement.name} tooltip y`)
      closeScene(loop, dispose)
    }
  }
}

function popoverAnchorsToTrigger() {
  const { loop, dispose } = renderScene(() => (
    <Popover
      open
      onOpenChange={() => {}}
      renderTrigger={() => <box width={80} height={20}><text>Trigger</text></box>}
      renderContent={() => <box width={100} height={30}><text>Popover</text></box>}
    />
  ))

  const popover = findNode(loop.root, (node) => node.props.floating === "parent" && node.props.zIndex === 9998)
  assert.equal(popover.layout.width, 100)
  assert.equal(popover.layout.height, 30)
  assert.equal(popover.layout.x, 0)
  assert.equal(popover.layout.y, 24)
  closeScene(loop, dispose)
}

function dropdownRendersAllItems() {
  const [open, setOpen] = createSignal(false)
  const { loop, dispose } = renderScene(() => (
    <VoidDropdownMenu open={open()} onOpenChange={setOpen}>
      <VoidDropdownMenu.Trigger><box width={80} height={20}><text>Actions</text></box></VoidDropdownMenu.Trigger>
      <VoidDropdownMenu.Content width={180}>
        <VoidDropdownMenu.Label>Project</VoidDropdownMenu.Label>
        <VoidDropdownMenu.Separator />
        <VoidDropdownMenu.Item>Open dashboard</VoidDropdownMenu.Item>
        <VoidDropdownMenu.Item>Copy link</VoidDropdownMenu.Item>
        <VoidDropdownMenu.Item variant="destructive">Archive</VoidDropdownMenu.Item>
      </VoidDropdownMenu.Content>
    </VoidDropdownMenu>
  ))

  assert.equal(open(), false)
  loop.feedPointer(10, 10, true)
  loop.frame()
  loop.feedPointer(10, 10, false)
  loop.frame()
  loop.frame()
  assert.equal(open(), true, "trigger opens the dropdown")
  const panel = findNode(loop.root, (node) => node.props.floating === "parent" && node.props.zIndex === 9999)
  const items = nodes(panel).filter((node) => node.props.focusable === true)
  assert.equal(panel.layout.width, 180)
  assert.ok(panel.layout.height >= 100)
  assert.equal(items.length, 3)
  assert.ok(items[0].layout.y < items[2].layout.y)

  dispatchInput(key("escape"))
  loop.frame()
  assert.equal(open(), false, "Escape closes the dropdown")

  loop.feedPointer(10, 10, true)
  loop.frame()
  loop.feedPointer(10, 10, false)
  loop.frame()
  loop.frame()
  assert.equal(open(), true)

  const reopenedPanel = findNode(loop.root, (node) => node.props.floating === "parent" && node.props.zIndex === 9999)
  const firstItem = nodes(reopenedPanel).find((node) => node.props.focusable === true)
  assert.ok(firstItem)
  loop.feedPointer(firstItem.layout.x + 4, firstItem.layout.y + 4, true)
  loop.frame()
  loop.feedPointer(firstItem.layout.x + 4, firstItem.layout.y + 4, false)
  loop.frame()
  assert.equal(open(), false, "selecting an item closes the dropdown")
  closeScene(loop, dispose)
}

dialogLayoutAndOutsideClick()
dialogEscapeAndTopModal()
tooltipHoverAndPosition()
popoverAnchorsToTrigger()
dropdownRendersAllItems()
console.log("overlay contract groups passed: dialog-layout, dialog-escape-top-modal, tooltip-8-placement-cases, popover-anchor, dropdown-items-escape-select")
