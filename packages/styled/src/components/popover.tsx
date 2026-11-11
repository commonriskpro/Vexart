/**
 * Popover — styled popover panel using Void design tokens.
 *
 * @public
 */

import { Popover } from "@vexart/headless"
import { radius, space, shadows, gradients, borders } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import type { JSX } from "solid-js"
import type { SizingUnit } from "@vexart/engine"

/** @public */
export type VoidPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: JSX.Element
  children: JSX.Element
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
  width?: SizingUnit
  className?: string
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
          classOverride
          className={props.className}
          direction="column"
          width={props.width}
          gradient={gradients.glass}
          backgroundColor={themeColors.popover}
          cornerRadius={radius.lg}
          borderColor={borders.glassRim}
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
