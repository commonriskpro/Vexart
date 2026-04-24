/**
 * Tooltip — styled tooltip using Void design tokens.
 *
 * @public
 */

import { Tooltip } from "@vexart/headless"
import { radius, space, font, shadows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import type { JSX } from "solid-js"

/** @public */
export type VoidTooltipProps = {
  content: string
  children: JSX.Element
  showDelay?: number
  hideDelay?: number
  disabled?: boolean
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
}

/** @public */
export function VoidTooltip(props: VoidTooltipProps) {
  return (
    <Tooltip
      content={props.content}
      showDelay={props.showDelay ?? 500}
      hideDelay={props.hideDelay}
      disabled={props.disabled}
      placement={props.placement}
      offset={props.offset}
      renderTooltip={(content) => (
        <box
          backgroundColor={themeColors.popover}
          cornerRadius={radius.md}
          padding={space[1.5]}
          paddingX={space[2]}
          borderColor={themeColors.border}
          borderWidth={1}
          shadow={shadows.sm}
        >
          <text
            color={themeColors.popoverForeground}
            fontSize={font.xs}
          >
            {content}
          </text>
        </box>
      )}
    >
      {props.children}
    </Tooltip>
  )
}
