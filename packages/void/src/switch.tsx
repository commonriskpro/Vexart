/**
 * Switch — styled toggle switch using Void design tokens.
 *
 * Built on top of the headless @tge/components Switch.
 * Provides ALL visual rendering via renderSwitch.
 *
 * Usage:
 *   <VoidSwitch checked={darkMode()} onChange={setDarkMode} label="Dark mode" />
 */

import { Switch } from "@tge/components"
import type { SwitchRenderContext } from "@tge/components"
import { radius, space, font, weight } from "./tokens"
import { themeColors } from "./theme"

const TRACK_WIDTH = 36
const TRACK_HEIGHT = 20
const THUMB_SIZE = 14
const THUMB_OFFSET = 3
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET * 2

export type VoidSwitchProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  focusId?: string
}

export function VoidSwitch(props: VoidSwitchProps) {
  return (
    <Switch
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
      focusId={props.focusId}
      renderSwitch={(ctx: SwitchRenderContext) => {
        const trackColor = ctx.disabled
          ? themeColors.muted
          : ctx.checked
            ? themeColors.primary
            : themeColors.secondary

        const thumbLeft = ctx.checked
          ? THUMB_OFFSET + THUMB_TRAVEL
          : THUMB_OFFSET

        return (
          <box direction="row" gap={space[2]} alignY="center">
            <box
              width={TRACK_WIDTH}
              height={TRACK_HEIGHT}
              backgroundColor={trackColor}
              cornerRadius={TRACK_HEIGHT / 2}
              borderColor={ctx.focused ? themeColors.ring : themeColors.border}
              borderWidth={ctx.focused ? 2 : 1}
            >
              <box
                width={THUMB_SIZE}
                height={THUMB_SIZE}
                backgroundColor={themeColors.foreground}
                cornerRadius={THUMB_SIZE / 2}
                paddingLeft={thumbLeft}
                paddingTop={THUMB_OFFSET}
              />
            </box>
            {props.label ? (
              <text
                color={ctx.disabled ? themeColors.mutedForeground : themeColors.foreground}
                fontSize={font.sm}
              >
                {props.label}
              </text>
            ) : null}
          </box>
        )
      }}
    />
  )
}
