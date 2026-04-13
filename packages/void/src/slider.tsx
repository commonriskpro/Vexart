/**
 * Slider — styled numeric range input using Void design tokens.
 *
 * Built on top of the headless @tge/components Slider.
 * Provides track, fill, and focus ring visuals.
 *
 * Usage:
 *   <VoidSlider value={volume()} onChange={setVolume} min={0} max={100} />
 */

import { Slider } from "@tge/components"
import type { SliderRenderContext } from "@tge/components"
import { radius, space, font } from "./tokens"
import { themeColors } from "./theme"

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
          {/* Track — spread trackProps for mouse click/drag interaction */}
          <box
            {...ctx.trackProps}
            width="grow"
            height={6}
            backgroundColor={ctx.disabled ? themeColors.muted : themeColors.secondary}
            cornerRadius={radius.full}
            borderColor={ctx.focused ? themeColors.ring : themeColors.border}
            borderWidth={ctx.focused ? 1 : 0}
          >
            {/* Fill */}
            <box
              width={`${ctx.percentage}%`}
              height={6}
              backgroundColor={ctx.disabled ? themeColors.mutedForeground : themeColors.primary}
              cornerRadius={radius.full}
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
