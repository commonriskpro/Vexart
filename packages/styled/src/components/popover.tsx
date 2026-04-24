/**
 * Popover — styled popover panel using Void design tokens.
 *
 * @public
 */

import { Popover } from "@vexart/headless"
import { radius, space, shadows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import type { JSX } from "solid-js"

/** @public */
export type VoidPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: JSX.Element
  children: JSX.Element
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
  width?: number | string
}

/** @public */
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
