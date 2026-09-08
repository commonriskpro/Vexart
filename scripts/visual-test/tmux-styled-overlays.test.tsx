import { expect, test } from "bun:test"
import {
  render,
  renderVariant,
  verify,
  verifyVariant,
  type StyledOverlaySceneOptions,
} from "./tmux-scenes/styled-overlays-interaction"

// Keep this test offscreen: the tmux parity runner exercises the same scene
// through direct and SHM presentation, while this check supplies the focused
// interaction and pixel oracle.
test("styled overlays complete the real interaction journey offscreen", async () => {
  verify(await render())
})

test("styled overlay oracle rejects each omitted surface", async () => {
  const variants: Array<{ options: StyledOverlaySceneOptions; message: string }> = [
    { options: { disableDropdown: true }, message: "styled dropdown selection surface is missing" },
    { options: { disablePopover: true }, message: "styled popover content is missing or misplaced" },
    { options: { disableTooltip: true }, message: "styled tooltip surface is missing" },
    { options: { disableDialog: true }, message: "dialog focus-restoration state is missing" },
    { options: { disableToast: true }, message: "styled toast card is missing from bottom-right" },
  ]

  for (const variant of variants) {
    const frame = await renderVariant(variant.options)
    verifyVariant(frame, variant.options)
    expect(() => verify(frame), JSON.stringify(variant.options)).toThrow(variant.message)
  }
})
