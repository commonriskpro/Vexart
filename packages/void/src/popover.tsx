/**
 * Popover — styled popover panel using Void design tokens.
 *
 * Built on top of the headless @tge/components Popover.
 * Renders a floating panel anchored to a trigger element.
 *
 * Usage:
 *   const [open, setOpen] = createSignal(false)
 *
 *   <VoidPopover
 *     open={open()}
 *     onOpenChange={setOpen}
 *     trigger={<Button>Options</Button>}
 *   >
 *     <box direction="column" gap={4}>
 *       <text color={themeColors.foreground}>Option 1</text>
 *       <text color={themeColors.foreground}>Option 2</text>
 *     </box>
 *   </VoidPopover>
 */

import { Popover } from "@tge/components"
import { radius, space, shadows } from "./tokens"
import { themeColors } from "./theme"
import type { JSX } from "solid-js"

export type VoidPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: JSX.Element
  children: JSX.Element
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
  width?: number | string
}

export function VoidPopover(props: VoidPopoverProps) {
  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      placement={props.placement}
      offset={props.offset}
      renderTrigger={() => <>{props.trigger}</>}
      renderContent={() => (
        <box
          direction="column"
          width={props.width}
          backgroundColor={themeColors.popover}
          cornerRadius={radius.lg}
          borderColor={themeColors.border}
          borderWidth={1}
          padding={space[3]}
          shadow={shadows.lg}
        >
          {props.children}
        </box>
      )}
    />
  )
}
