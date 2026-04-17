/**
 * Slider — styled numeric range input using Void design tokens.
 *
 * Built on top of the headless @tge/components Slider.
 * Provides track, fill, thumb, and focus ring visuals.
 *
 * The thumb is rendered as a small circle at the end of the fill bar.
 *
 * Usage:
 *   <VoidSlider value={volume()} onChange={setVolume} min={0} max={100} />
 */

import { Slider } from "@tge/components"
import type { SliderRenderContext } from "@tge/components"
import { radius, space, font, shadows, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

export type VoidSliderProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  largeStep?: number
  disabled?: boolean
  focusId?: string
  width?: number | string
  showValue?: boolean
}

const THUMB_SIZE = 16
const TRACK_H = 6

export function VoidSlider(props: VoidSliderProps) {
  return (
    <Slider
      value={props.value}
      onChange={props.onChange}
      min={props.min}
      max={props.max}
      step={props.step}
      largeStep={props.largeStep}
      disabled={props.disabled}
      focusId={props.focusId}
      renderSlider={(ctx: SliderRenderContext) => (
        <box direction="row" gap={space[2]} alignY="center" width={props.width}>
          {/* Track — spread trackProps for mouse click/drag */}
          <box
            {...ctx.trackProps}
            width="grow"
            height={TRACK_H}
            backgroundColor={ctx.disabled ? themeColors.muted : themeColors.secondary}
            cornerRadius={radius.full}
            focusStyle={{ glow: glows.ring }}
            direction="row"
            alignY="center"
          >
            {/* Fill bar */}
            <box
              width={`${ctx.percentage}%`}
              height={TRACK_H}
              backgroundColor={ctx.disabled ? themeColors.mutedForeground : themeColors.primary}
              cornerRadius={radius.full}
            />
            {/* Thumb — rendered after fill, visually centered at fill end */}
            <box
              width={THUMB_SIZE}
              height={THUMB_SIZE}
              cornerRadius={radius.full}
              backgroundColor={themeColors.foreground}
              borderColor={ctx.focused ? themeColors.ring : themeColors.primary}
              borderWidth={ctx.focused ? 2 : 1}
              shadow={shadows.sm}
              opacity={ctx.disabled ? 0.5 : 1}
            />
          </box>
          {/* Value label */}
          {(props.showValue ?? true) ? (
            <box width={32} alignX="right">
              <text
                color={ctx.disabled ? themeColors.mutedForeground : themeColors.foreground}
                fontSize={font.xs}
              >
                {String(ctx.value)}
              </text>
            </box>
          ) : null}
        </box>
      )}
    />
  )
}
