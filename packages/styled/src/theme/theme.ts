/**
 * Runtime theming with SolidJS reactivity.
 *
 * Architecture:
 *   - Each color token is backed by a SolidJS signal
 *   - `themeColors` is an object with getters that read those signals
 *   - When components read `themeColors.background` inside JSX, SolidJS
 *     subscribes to the signal — only those components re-render on theme change
 *   - `setTheme()` updates all signals → subscribed components re-render
 *
 * The getter pattern is invisible to consumers:
 *   <box backgroundColor={themeColors.background} />
 *   // Looks like a string prop. SolidJS tracks it reactively.
 *
 * Usage:
 *   const dark = createTheme({ colors: { background: "#0a0a0a" } })
 *   const light = createTheme({ colors: { background: "#ffffff" } })
 *
 *   setTheme(light)  // → all subscribed components update
 */

import { createSignal, batch } from "solid-js"
import { bumpThemeEpoch } from "@vexart/engine/internal"
import { colors as defaultColors, radius, space, font, weight, shadows, glows } from "../tokens/tokens"

// ── Types ──

/** Color token map — keys match the default void tokens, values are hex strings. */
/** @public */
export type ColorTokens = { [K in keyof typeof defaultColors]: string }
/** @public */
export type ThemeDefinition = {
  colors: Partial<ColorTokens>
}

// ── Theme Creation ──

/**
 * Create a theme definition from partial overrides.
 * Overrides are merged with the default void tokens.
 */
/** @public */
export function createTheme(overrides?: ThemeDefinition): Required<ThemeDefinition> {
  return {
    colors: { ...defaultColors, ...overrides?.colors },
  }
}

/** The default dark theme (same as current void tokens). */
/** @public */
export const darkTheme = createTheme()

/** A light theme preset. */
/** @public */
export const lightTheme = createTheme({
  colors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#f5f5f5",
    cardForeground: "#0a0a0a",
    popover: "#f5f5f5",
    popoverForeground: "#0a0a0a",
    primary: "#171717",
    primaryForeground: "#fafafa",
    secondary: "#f0f0f0",
    secondaryForeground: "#171717",
    muted: "#f0f0f0",
    mutedForeground: "#737373",
    accent: "#f0f0f0",
    accentForeground: "#171717",
    destructive: "#dc2626",
    destructiveForeground: "#fafafa",
    border: "#00000020",
    input: "#00000026",
    ring: "#0a0a0a",
    ringSubtle: "#0a0a0a80",
    transparent: "#00000000",
  },
})

// ── Reactive Theme State ──

const [activeTheme, setActiveThemeSig] = createSignal<Required<ThemeDefinition>>(darkTheme)
const [themeVersion, setThemeVersion] = createSignal(0)

/**
 * Reactive theme version signal. Increments whenever `setTheme()` is called.
 * @public
 */
export const getThemeVersion = themeVersion

// Create a signal for each color token
const colorSignals: Record<string, [() => string, (v: string) => void]> = {}

for (const key of Object.keys(defaultColors) as (keyof ColorTokens)[]) {
  colorSignals[key] = createSignal(defaultColors[key])
}

/**
 * Reactive color tokens via getters.
 *
 * Each property is a getter that reads a SolidJS signal.
 * When used inside JSX, SolidJS tracks the dependency automatically:
 *
 *   <box backgroundColor={themeColors.background} />
 *   // SolidJS subscribes to the background signal.
 *   // When setTheme() changes it, only this box re-renders.
 *
 * The getter pattern is transparent — themeColors.background
 * looks and behaves like a string. No valueOf(), no function calls.
 */
/** @public */
export const themeColors: ColorTokens = Object.defineProperties(
  {} as ColorTokens,
  Object.fromEntries(
    (Object.keys(defaultColors) as (keyof ColorTokens)[]).map((key) => [
      key,
      {
        get() { return colorSignals[key][0]() },
        enumerable: true,
      },
    ])
  )
)

/**
 * Switch the active theme at runtime.
 * Updates all reactive color signals — only subscribed components re-render.
 */
/** @public */
export function setTheme(theme: Required<ThemeDefinition>) {
  batch(() => {
    bumpThemeEpoch()
    setActiveThemeSig(theme)
    for (const key of Object.keys(defaultColors) as (keyof ColorTokens)[]) {
      const value = theme.colors[key] ?? defaultColors[key]
      colorSignals[key][1](value)
    }
    setThemeVersion((v) => v + 1)
  })
}

/**
 * Get the current active theme definition (non-reactive snapshot).
 */
/** @public */
export function getTheme(): Required<ThemeDefinition> {
  return activeTheme()
}

/**
 * Void Design System token resolver implementation for @vexart/app.
 * Maps themeColors, font, radius, shadows, glows, weight, space.px, and getThemeVersion.
 * @public
 */
export const voidThemeTokenResolver = {
  getColor(name: string): string | number | undefined {
    switch (name) {
      case "background": return themeColors.background
      case "foreground": return themeColors.foreground
      case "card": return themeColors.card
      case "card-foreground": return themeColors.cardForeground
      case "popover": return themeColors.popover
      case "popover-foreground": return themeColors.popoverForeground
      case "primary": return themeColors.primary
      case "primary-foreground": return themeColors.primaryForeground
      case "secondary": return themeColors.secondary
      case "secondary-foreground": return themeColors.secondaryForeground
      case "muted": return themeColors.muted
      case "muted-foreground": return themeColors.mutedForeground
      case "accent": return themeColors.accent
      case "accent-foreground": return themeColors.accentForeground
      case "destructive": return themeColors.destructive
      case "destructive-foreground": return themeColors.destructiveForeground
      case "border": return themeColors.border
      case "input": return themeColors.input
      case "ring": return themeColors.ring
      case "transparent": return themeColors.transparent
      case "black": return "#000000"
      case "white": return "#ffffff"
      default: return undefined
    }
  },
  fontSizes: {
    xs: font.xs,
    sm: font.sm,
    base: font.base,
    lg: font.lg,
    xl: font.xl,
    "2xl": font["2xl"],
    "3xl": font["3xl"],
    "4xl": font["4xl"],
  },
  fontWeights: {
    normal: weight.normal,
    medium: weight.medium,
    semibold: weight.semibold,
    bold: weight.bold,
  },
  radii: {
    none: 0,
    sm: radius.sm,
    md: radius.md,
    lg: radius.lg,
    xl: radius.xl,
    "2xl": radius.xxl,
    full: radius.full,
  },
  shadows,
  glows,
  spacePx: space.px,
  getThemeVersion,
}
