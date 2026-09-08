import assert from "node:assert/strict"
import { createSignal } from "solid-js"
import { createToaster, Popover, Tooltip } from "@vexart/headless"
import type { ToastPosition, ToasterHandle } from "@vexart/headless"
import { renderToBufferAfterInteractions, type RenderToBufferOptions, type RenderToBufferResult } from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 420
export const height = 240

const ROOT = 0x080b16ff
const POPOVER = 0x14b8a6ff
const TOOLTIP = 0xf59e0bff
const TOAST = 0xef4444ff
let activeToaster: ToasterHandle | undefined
let popoverTransitions: boolean[] = []

export type OverlaySceneOptions = {
  disablePopover?: boolean
  disableTooltip?: boolean
  disableToast?: boolean
  /** Test-only position override for exercising each public toast position. */
  toastPosition?: ToastPosition
}

function ToastView() {
  return <box width={160} height={42} backgroundColor={TOAST} cornerRadius={6} />
}

function App(options: OverlaySceneOptions = {}) {
  const [popoverOpen, setPopoverOpen] = createSignal(!options.disablePopover)
  popoverTransitions = []
  const onPopoverChange = (open: boolean) => {
    if (options.disablePopover) return
    popoverTransitions.push(open)
    setPopoverOpen(open)
  }
  const toaster = createToaster({
    position: options.toastPosition ?? "bottom-right",
    padding: 16,
    gap: 6,
    defaultDuration: 0,
    renderToast: () => <ToastView />,
  })
  activeToaster = toaster

  return (
    <box width={width} height={height} backgroundColor={ROOT} direction="column" padding={20} gap={20}>
      <box direction="row" gap={20} height={36}>
        <Popover
          open={popoverOpen()}
          onOpenChange={onPopoverChange}
          placement="bottom"
          offset={6}
          renderTrigger={({ toggle }) => (
            <box width={110} height={32} backgroundColor={0x334155ff} onPress={toggle}>
              <text color={0xffffffff} fontSize={12}>Popover trigger</text>
            </box>
          )}
          renderContent={() => (
            <box width={460} height={56} backgroundColor={POPOVER} cornerRadius={6} />
          )}
        />
        <Tooltip
          content="Tooltip probe"
          disabled={options.disableTooltip}
          placement="bottom"
          offset={6}
          showDelay={0}
          renderTooltip={() => <box width={100} height={28} backgroundColor={TOOLTIP} cornerRadius={6} />}
        >
          <box width={110} height={32} backgroundColor={0x334155ff}>
            <text color={0xffffffff} fontSize={12}>Tooltip trigger</text>
          </box>
        </Tooltip>
      </box>
      {!options.disableToast ? toaster.Toaster() : null}
    </box>
  )
}

export function Scene(options: OverlaySceneOptions = {}) {
  return <App {...options} />
}

export function render(options?: RenderToBufferOptions) {
  return renderVariant({}, options)
}

/** Test-only variant used to prove disabled overlays fail non-vacuously. */
export function renderVariant(sceneOptions: OverlaySceneOptions, options?: RenderToBufferOptions) {
  return renderToBufferAfterInteractions(
    () => <App {...sceneOptions} />,
    width,
    height,
    async ({ pointerMove, clickAt, frame }) => {
      if (!sceneOptions.disablePopover) {
        // Popover starts open; click closes/reopens it to exercise controlled
        // onOpenChange before checking the final visible frame.
        await clickAt(70, 36)
        await clickAt(70, 36)
        assert.deepEqual(popoverTransitions, [false, true], "popover did not close and reopen")
      }
      await pointerMove(190, 36)
      if (!sceneOptions.disableToast) activeToaster?.toast({ message: "Toast probe", duration: 0 })
      await frame()
    },
    2,
    options,
  )
}

/** Test-only toast-position repro; verify() is intentionally bottom-left-specific. */
export function renderWithToastPosition(position: ToastPosition, options?: RenderToBufferOptions) {
  return renderVariant({ toastPosition: position }, options)
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

function countColor(frame: RenderToBufferResult, color: readonly number[], left: number, top: number, right: number, bottom: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sample = pixel(frame, x, y)
      if (sample.every((value, channel) => value === color[channel])) count++
    }
  }
  return count
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)

  // Popover placement is below the left trigger. Its intentionally wide
  // content reaches the viewport edge, exercising root overlay clipping.
  assert.deepEqual(pixel(frame, 40, 80), new Uint8Array([20, 184, 166, 255]))
  assert.deepEqual(pixel(frame, 415, 80), new Uint8Array([20, 184, 166, 255]))
  assert.ok(countColor(frame, [20, 184, 166, 255], 20, 58, 150, 120) > 4_000, "popover content is not visible below its trigger")

  // Tooltip placement is below the second trigger after pointerMove.
  assert.deepEqual(pixel(frame, 190, 80), new Uint8Array([245, 158, 11, 255]))
  assert.ok(countColor(frame, [245, 158, 11, 255], 150, 58, 300, 100) > 1_500, "tooltip content is not visible below its trigger")

  // Toast is bottom-right aligned through the Portal/OverlayRoot plane.
  assert.deepEqual(pixel(frame, 300, 205), new Uint8Array([239, 68, 68, 255]))
  assert.ok(countColor(frame, [239, 68, 68, 255], 244, 170, 404, 224) > 4_000, "toast content is not visible in the bottom-right overlay region")

  // The root edge remains untouched by portal content, proving the overlays
  // stay inside the requested viewport instead of changing root dimensions.
  assert.deepEqual(pixel(frame, 4, 4), new Uint8Array([8, 11, 22, 255]))
}
