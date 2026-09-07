/**
 * Button — shadcn-compatible button with variants and sizes.
 *
 * Variants: default, secondary, outline, ghost, destructive, link
 * Sizes: xs, sm, default, lg
 *
 * Interaction: hoverStyle/activeStyle/focusStyle handled by the engine.
 * The consumer wraps with <box focusable onPress={...}> for keyboard + mouse.
 *
 * Theme reactivity: themeColors getters MUST be read inside JSX props
 * (not in intermediate objects) so SolidJS wraps them in tracked effects.
 */

import type { PressEvent } from "@vexart/engine"
import type { JSX } from "solid-js"
import { Button as HeadlessButton } from "@vexart/headless"
import { radius, space, font, weight, shadows, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export const BUTTON_VARIANT = { DEFAULT: "default", SECONDARY: "secondary", OUTLINE: "outline", GHOST: "ghost", DESTRUCTIVE: "destructive", LINK: "link" } as const
export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT]
/** @public */
export const BUTTON_SIZE = { XS: "xs", SM: "sm", DEFAULT: "default", LG: "lg", ICON: "icon", ICON_SM: "icon-sm", ICON_LG: "icon-lg" } as const
export type ButtonSize = (typeof BUTTON_SIZE)[keyof typeof BUTTON_SIZE]

/** @public */
export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  onPress?: (event?: PressEvent) => void
  focusId?: string
  children?: JSX.Element
}

// ── Size styles (static — no theme dependency) ──

const sizeStyles: Record<ButtonSize, {
  height: number
  width?: number
  paddingX: number
  paddingY: number
  fontSize: number
  gap: number
  cornerRadius: number
}> = {
  xs:       { height: 24, paddingX: space[2],  paddingY: 0,        fontSize: font.xs,   gap: space[1],   cornerRadius: radius.md },
  sm:       { height: 32, paddingX: space[3],  paddingY: 0,        fontSize: font.sm,   gap: space[1.5], cornerRadius: radius.md },
  default:  { height: 36, paddingX: space[4],  paddingY: space[2], fontSize: font.sm,   gap: space[2],   cornerRadius: radius.md },
  lg:       { height: 40, paddingX: space[6],  paddingY: 0,        fontSize: font.base, gap: space[2],   cornerRadius: radius.md },
  "icon":    { height: 36, width: 36, paddingX: 0, paddingY: 0,    fontSize: font.sm,   gap: 0,          cornerRadius: radius.md },
  "icon-sm": { height: 32, width: 32, paddingX: 0, paddingY: 0,    fontSize: font.sm,   gap: 0,          cornerRadius: radius.md },
  "icon-lg": { height: 40, width: 40, paddingX: 0, paddingY: 0,    fontSize: font.base, gap: 0,          cornerRadius: radius.md },
}

// ── Variant color getters ──
// Each value is a getter function so themeColors signals are read
// inside SolidJS effects (inside JSX props), not eagerly in body.

type VariantColors = {
  bg: () => string | number
  fg: () => string | number
  border: () => string | number | undefined
  borderWidth: number | undefined
  shadow: import("@vexart/engine").TGEProps["shadow"]
  hoverBg: () => string | number
  activeBg: () => string | number
  focusBorder: () => string | number
}

// The primary foreground is intentionally dark in the dark theme. Reusing the
// shared accent token here makes the default hover state dark-on-dark, so keep
// these states on the theme's high-contrast foreground scale instead.
const primaryHover = () => themeColors.foreground
const primaryActive = () => themeColors.mutedForeground

const variantGetters: Record<ButtonVariant, VariantColors> = {
  default: {
    bg:          () => themeColors.primary,
    fg:          () => themeColors.primaryForeground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      shadows.xs,
    hoverBg:     primaryHover,
    activeBg:    primaryActive,
    focusBorder: () => themeColors.ring,
  },
  secondary: {
    bg:          () => themeColors.secondary,
    fg:          () => themeColors.secondaryForeground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      undefined,
    hoverBg:     () => themeColors.accent,
    activeBg:    () => themeColors.accent,
    focusBorder: () => themeColors.ring,
  },
  outline: {
    bg:          () => themeColors.transparent,
    fg:          () => themeColors.foreground,
    border:      () => themeColors.input,
    borderWidth: 1,
    shadow:      shadows.xs,
    hoverBg:     () => themeColors.accent,
    activeBg:    () => themeColors.accent,
    focusBorder: () => themeColors.ring,
  },
  ghost: {
    bg:          () => themeColors.transparent,
    fg:          () => themeColors.foreground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      undefined,
    hoverBg:     () => themeColors.accent,
    activeBg:    () => themeColors.accent,
    focusBorder: () => themeColors.ring,
  },
  destructive: {
    bg:          () => themeColors.destructive,
    fg:          () => themeColors.destructiveForeground,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      shadows.xs,
    // TODO: add semantic destructive hover token.
    hoverBg:     () => "#c72222ff",
    // TODO: add semantic destructive active token.
    activeBg:    () => "#b01e1eff",
    focusBorder: () => themeColors.destructive,
  },
  link: {
    bg:          () => themeColors.transparent,
    fg:          () => themeColors.primary,
    border:      () => undefined,
    borderWidth: undefined,
    shadow:      undefined,
    hoverBg:     () => themeColors.transparent,
    activeBg:    () => themeColors.transparent,
    focusBorder: () => themeColors.ring,
  },
}

/** @public */
export function Button(props: ButtonProps) {
  const v = props.variant ?? "default"
  const s = props.size ?? "default"
  const vg = variantGetters[v]
  const ss = sizeStyles[s]
  const isLink = v === "link"

  return (
    <HeadlessButton
      onPress={props.onPress}
      disabled={props.disabled}
      focusId={props.focusId}
      renderButton={(ctx) => (
        <box
          {...ctx.buttonProps}
          direction="row"
          // Intrinsic buttons already center their label through symmetric
          // horizontal padding. Flexily's center justification can retain the
          // offered parent width while an auto-sized button is measured, which
          // paints the label outside the button. Fixed icon buttons still need
          // true centering.
          alignX={ss.width === undefined ? "left" : "center"}
          alignY="center"
          gap={ss.gap}
          height={ss.height}
          width={ss.width}
          paddingLeft={ss.paddingX}
          paddingRight={ss.paddingX}
          paddingTop={ss.paddingY}
          paddingBottom={ss.paddingY}
          backgroundColor={ctx.pressed ? vg.activeBg() : vg.bg()}
          cornerRadius={ss.cornerRadius}
          borderColor={ctx.focused ? vg.focusBorder() : vg.border()}
          borderWidth={ctx.focused ? 2 : vg.borderWidth}
          shadow={vg.shadow}
          glow={ctx.focused && !isLink ? glows.ring : undefined}
          opacity={props.disabled ? 0.5 : 1}
          hoverStyle={{ backgroundColor: vg.hoverBg() }}
          activeStyle={{ backgroundColor: vg.activeBg() }}
          focusStyle={{
            borderColor: vg.focusBorder(),
            borderWidth: 2,
            glow: isLink ? undefined : glows.ring,
          }}
        >
          <text
            color={vg.fg()}
            fontSize={ss.fontSize}
            fontWeight={isLink ? weight.normal : weight.medium}
          >
            {props.children}
          </text>
        </box>
      )}
    />
  )
}
