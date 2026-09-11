/**
 * Focused styled-overlay interaction fixture.
 *
 * This is intentionally a small interaction journey rather than a static
 * component gallery: each styled overlay family is opened/closed through the
 * real render-loop helpers, and the final frame keeps the selected state,
 * popover, tooltip, and toast visible for pixel-level assertions.
 */

import assert from "node:assert/strict"
import { createSignal } from "solid-js"
import {
  VoidButton,
  VoidDialog,
  VoidDropdownMenu,
  VoidPopover,
  VoidTooltip,
  createVoidToaster,
  themeColors,
} from "@vexart/styled"
import { focusedId, getFocusedEntry, setFocus } from "@vexart/engine"
import {
  renderToBufferAfterInteractions,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 640
export const height = 360

const BACKGROUND = [10, 10, 10, 255]
const CARD = [23, 23, 23, 255]
const PANEL_COLOR = 0x121212ff
const MUTED_COLOR = 0x262626ff
const SUCCESS = [22, 101, 52, 255]
const SUCCESS_COLOR = 0x166534ff
const POPOVER_CONTENT = [14, 116, 144, 255]
const POPOVER_CONTENT_COLOR = 0x0e7490ff

type Layout = { x: number; y: number; width: number; height: number }

type OverlayProbe = {
  dropdownOpen: () => boolean
  dropdownTrigger?: Layout
  selected: () => string
  popoverOpen: () => boolean
  dialogOpen: () => boolean
  dialogClosed: () => boolean
  toaster: ReturnType<typeof createVoidToaster>
  popoverTrigger?: Layout
  tooltipTrigger?: Layout
}

export type StyledOverlaySceneOptions = {
  disableDropdown?: boolean
  disablePopover?: boolean
  disableTooltip?: boolean
  disableDialog?: boolean
  disableToast?: boolean
}

type AppProps = {
  onReady?: (probe: OverlayProbe) => void
  options?: StyledOverlaySceneOptions
}

function PopoverTrigger(props: { onActivate: () => void; onLayout: (layout: Layout) => void }) {
  return (
    <box
      ref={(handle) => { props.onLayout(handle.layout) }}
      width={128}
      height={32}
      backgroundColor={themeColors.secondary}
      cornerRadius={8}
      focusable
      onPress={(event) => {
        event?.stopPropagation()
        props.onActivate()
      }}
      alignX="center"
      alignY="center"
    >
      <text color={themeColors.secondaryForeground} fontSize={12}>Open popover</text>
    </box>
  )
}

function App(props: AppProps = {}) {
  const options = props.options ?? {}
  const [dropdownOpen, setDropdownOpen] = createSignal(false)
  const [selected, setSelected] = createSignal("None")
  const [popoverOpen, setPopoverOpen] = createSignal(false)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [dialogClosed, setDialogClosed] = createSignal(false)
  const [popoverTrigger, setPopoverTrigger] = createSignal<Layout | undefined>()
  const [tooltipTrigger, setTooltipTrigger] = createSignal<Layout | undefined>()
  const [dropdownTrigger, setDropdownTrigger] = createSignal<Layout | undefined>()
  const toaster = createVoidToaster({ position: "bottom-right", defaultDuration: 0 })

  props.onReady?.({
    dropdownOpen,
    get dropdownTrigger() { return dropdownTrigger() },
    selected,
    popoverOpen,
    dialogOpen,
    dialogClosed,
    toaster,
    get popoverTrigger() { return popoverTrigger() },
    get tooltipTrigger() { return tooltipTrigger() },
  })

  return (
    <box
      width={width}
      height={height}
      backgroundColor={themeColors.background}
      padding={24}
      direction="column"
      gap={16}
    >
      <box height={28} direction="column" gap={4}>
        <text color={themeColors.foreground} fontSize={20}>Styled overlays</text>
        <text color={themeColors.mutedForeground} fontSize={11}>Real open, select, hover, Escape, and toast transitions</text>
      </box>

      <box direction="row" gap={20} height={220}>
        <box
          width={200}
          height={220}
          backgroundColor={PANEL_COLOR}
          borderColor={themeColors.border}
          borderWidth={1}
          cornerRadius={10}
          padding={16}
          direction="column"
          gap={10}
        >
          <text color={themeColors.cardForeground} fontSize={14}>Menu and modal</text>
          <box height={60}>
            {!options.disableDropdown ? <VoidDropdownMenu open={dropdownOpen()} onOpenChange={setDropdownOpen}>
              <VoidDropdownMenu.Trigger>
                <box ref={(handle) => { setDropdownTrigger(handle.layout) }} width={160} height={32} backgroundColor={themeColors.secondary} cornerRadius={8} alignX="center" alignY="center">
                  <text color={themeColors.secondaryForeground} fontSize={12}>Actions</text>
                </box>
              </VoidDropdownMenu.Trigger>
              <VoidDropdownMenu.Content width={180}>
                <VoidDropdownMenu.Label>Workspace</VoidDropdownMenu.Label>
                <VoidDropdownMenu.Separator />
                <VoidDropdownMenu.Item onSelect={() => setSelected("Dashboard")}>Open dashboard</VoidDropdownMenu.Item>
                <VoidDropdownMenu.Item onSelect={() => setSelected("Settings")}>Settings</VoidDropdownMenu.Item>
              </VoidDropdownMenu.Content>
            </VoidDropdownMenu> : null}
          </box>
          {!options.disableDialog ? <VoidButton focusId="styled-dialog-trigger" variant="outline" onPress={() => setDialogOpen(true)}>Open dialog</VoidButton> : null}
          <box width={160} height={24} backgroundColor={selected() === "None" ? MUTED_COLOR : SUCCESS_COLOR} cornerRadius={6} alignX="center" alignY="center">
            <text color={themeColors.foreground} fontSize={11}>{selected() === "None" ? "No menu selection" : `Selected: ${selected()}`}</text>
          </box>
        </box>

        <box
          width={372}
          height={220}
          backgroundColor={PANEL_COLOR}
          borderColor={themeColors.border}
          borderWidth={1}
          cornerRadius={10}
          padding={16}
          direction="column"
          gap={12}
        >
          <text color={themeColors.cardForeground} fontSize={14}>Anchored overlays</text>
          <box direction="row" gap={16} height={32}>
            {!options.disablePopover ? <VoidPopover
              open={popoverOpen()}
              onOpenChange={setPopoverOpen}
              placement="bottom"
              offset={8}
              width={190}
              trigger={<PopoverTrigger onActivate={() => setPopoverOpen(!popoverOpen())} onLayout={setPopoverTrigger} />}
            >
              <box direction="column" gap={8}>
                <text color={themeColors.popoverForeground} fontSize={12}>Popover content</text>
                <box width={140} height={24} backgroundColor={POPOVER_CONTENT_COLOR} cornerRadius={5} />
              </box>
            </VoidPopover> : <box width={128} height={32} />}
            <VoidTooltip disabled={options.disableTooltip} content="Tooltip content" placement="bottom" offset={8} showDelay={0}>
              <box
                ref={(handle) => { setTooltipTrigger(handle.layout) }}
                width={128}
                height={32}
                backgroundColor={themeColors.secondary}
                cornerRadius={8}
                alignX="center"
                alignY="center"
              >
                <text color={themeColors.secondaryForeground} fontSize={12}>Hover tooltip</text>
              </box>
            </VoidTooltip>
          </box>
          <box height={54} />
          <box width={332} height={76} backgroundColor={MUTED_COLOR} cornerRadius={8} padding={12} direction="column" gap={6}>
            <text color={themeColors.mutedForeground} fontSize={11}>Final state</text>
            <box width={308} height={24} backgroundColor={dialogClosed() ? SUCCESS_COLOR : MUTED_COLOR} cornerRadius={6} alignX="center" alignY="center">
              <text color={themeColors.foreground} fontSize={11}>{dialogClosed() ? "Dialog closed · focus restored" : "Dialog not closed"}</text>
            </box>
          </box>
        </box>
      </box>

      {!options.disableDialog && dialogOpen() ? (
        <VoidDialog onClose={() => { setDialogOpen(false); setDialogClosed(true) }} width={300}>
          <VoidDialog.Title>Confirm action</VoidDialog.Title>
          <VoidDialog.Description>Escape closes this styled dialog and restores the trigger focus.</VoidDialog.Description>
          <VoidDialog.Footer>
            <VoidButton variant="ghost" onPress={() => { setDialogOpen(false); setDialogClosed(true) }}>Close</VoidButton>
            <VoidButton variant="default">Confirm</VoidButton>
          </VoidDialog.Footer>
        </VoidDialog>
      ) : null}

      {!options.disableToast ? toaster.Toaster() : null}
    </box>
  )
}

export function Scene(options: StyledOverlaySceneOptions = {}) {
  return <App options={options} />
}

export function render(options?: RenderToBufferOptions) {
  return renderVariant({}, options)
}

/** Test-only variants prove that each styled overlay oracle is non-vacuous. */
export function renderVariant(sceneOptions: StyledOverlaySceneOptions, options?: RenderToBufferOptions) {
  let probe: OverlayProbe | undefined
  return renderToBufferAfterInteractions(
    () => <App options={sceneOptions} onReady={(value) => { probe = value }} />,
    width,
    height,
    async ({ clickAt, pointerMove, keyPress, frame }) => {
      if (!probe) throw new Error("styled overlay probe was not mounted")

      if (!sceneOptions.disableDropdown) {
        // Open and select a real styled dropdown item through the mounted
        // focus/input path. Walk focus to the actual row layout so this keeps
        // selecting the item after the content is anchored below its trigger.
        const dropdown = probe.dropdownTrigger
        if (!dropdown) throw new Error("styled dropdown trigger layout was not captured")
        await clickAt(dropdown.x + 24, dropdown.y + 16)
        assert.equal(probe.dropdownOpen(), true, "styled dropdown did not open")
        const focusDropdownRow = async (last: boolean) => {
          for (let attempt = 0; attempt < 8; attempt++) {
            const node = getFocusedEntry()?.node
            const rows = node?.parent?.children
              .filter((child) => child.props.focusable && child.props.onPress)
              .sort((left, right) => left.layout.y - right.layout.y)
            const target = rows && rows.length >= 2 ? (last ? rows[rows.length - 1] : rows[0]) : undefined
            if (target && node === target) return target
            await keyPress("tab")
          }
          throw new Error("styled dropdown row did not receive keyboard focus")
        }
        const firstRow = await focusDropdownRow(false)
        await clickAt(firstRow.layout.x + firstRow.layout.width / 2, firstRow.layout.y + firstRow.layout.height / 2)
        await frame()
        assert.equal(probe.selected(), "Dashboard", "styled dropdown item did not select")
        assert.equal(probe.dropdownOpen(), false, "styled dropdown did not close after select")

        // Re-open and activate the second Item with keyboard input. Walk until
        // two distinct menu rows have been focused so this remains valid when
        // another styled control precedes the menu in the focus registry.
        await clickAt(dropdown.x + 24, dropdown.y + 16)
        assert.equal(probe.dropdownOpen(), true, "styled dropdown did not reopen")
        await focusDropdownRow(true)
        await keyPress("enter")
        assert.equal(probe.selected(), "Settings", "styled dropdown keyboard Item did not select")
        assert.equal(probe.dropdownOpen(), false, "styled dropdown did not close after keyboard select")
      }

      // Open the controlled styled popover through its trigger, then leave it
      // open so the final frame proves anchored content survived the journey.
      if (!sceneOptions.disablePopover) {
        const popover = probe.popoverTrigger
        if (!popover) throw new Error("styled popover trigger layout was not captured")
        await clickAt(popover.x + 24, popover.y + 16)
        assert.equal(probe.popoverOpen(), true, "styled popover did not open")
      }

      // Hover is a real mouse transition; keep the pointer on the trigger so
      // the styled tooltip remains visible in the final frame.
      const tooltip = probe.tooltipTrigger
      if (!tooltip) throw new Error("styled tooltip trigger layout was not captured")
      await pointerMove(tooltip.x + 24, tooltip.y + 16)

      // Open the styled dialog with a real keyboard activation and close it
      // with Escape. The final signal proves the component unmounted and the
      // engine focus returned to its trigger.
      if (!sceneOptions.disableDialog) {
        setFocus("styled-dialog-trigger")
        await keyPress("enter")
        await frame()
        assert.equal(probe.dialogOpen(), true, "styled dialog did not open")
        await keyPress("escape")
        await frame()
        assert.equal(probe.dialogOpen(), false, "styled dialog did not close on Escape")
        assert.equal(probe.dialogClosed(), true, "styled dialog close transition was not observed")
        assert.equal(focusedId(), "styled-dialog-trigger", "styled dialog did not restore trigger focus")
        // The public Button intentionally holds its pressed visual for 100ms
        // after keyboard activation. Let that state settle before the final
        // readback so direct and SHM routes capture the same resting frame.
        await new Promise<void>((resolve) => setTimeout(resolve, 120))
        await frame()
      }

      if (!sceneOptions.disableToast) probe.toaster.toast({ message: "Saved", variant: "success", duration: 0 })
      await frame()
    },
    2,
    options,
  )
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

function countColor(
  frame: RenderToBufferResult,
  color: readonly number[],
  left: number,
  top: number,
  right: number,
  bottom: number,
  tolerance = 2,
) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sample = pixel(frame, x, y)
      if (
        Math.abs(sample[0] - color[0]) <= tolerance &&
        Math.abs(sample[1] - color[1]) <= tolerance &&
        Math.abs(sample[2] - color[2]) <= tolerance &&
        Math.abs(sample[3] - color[3]) <= tolerance
      ) {
        count++
      }
    }
  }
  return count
}

export function verify(frame: RenderToBufferResult) {
  verifyVariant(frame, {})
}

export function verifyVariant(frame: RenderToBufferResult, options: StyledOverlaySceneOptions) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)
  assert.deepEqual(pixel(frame, 4, 4), new Uint8Array(BACKGROUND), "background changed outside the layout")

  // The selected menu state remains visible after open → select → close.
  if (!options.disableDropdown) {
    assert.ok(countColor(frame, SUCCESS, 40, 175, 210, 215) > 1_000, "styled dropdown selection surface is missing")
  }

  // The popover keeps its anchored child surface in the final frame.
  if (!options.disablePopover) {
    assert.ok(countColor(frame, POPOVER_CONTENT, 240, 120, 460, 230) > 2_000, "styled popover content is missing or misplaced")
  }

  // Tooltip has its own right-hand surface outside the popover's bounds.
  if (!options.disableTooltip) {
    assert.ok(countColor(frame, CARD, 450, 145, 620, 205) > 500, "styled tooltip surface is missing")
  }

  // The success status is the post-Escape dialog state and proves the modal
  // overlay no longer covers the application surface.
  if (!options.disableDialog) {
    assert.ok(countColor(frame, SUCCESS, 280, 200, 570, 290) > 3_000, "dialog focus-restoration state is missing")
  }

  // Styled toasts are bottom-right aligned; check both the card surface and
  // the bottom-left edge remains the app background.
  if (!options.disableToast) {
    assert.ok(countColor(frame, CARD, 380, 280, 625, 350) > 2_000, "styled toast card is missing from bottom-right")
  }
  assert.deepEqual(pixel(frame, 20, 340), new Uint8Array(BACKGROUND), "toast/card overflow reached bottom-left edge")
}
