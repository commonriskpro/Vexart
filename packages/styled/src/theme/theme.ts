/**
 * ThemeProvider — runtime theming with SolidJS reactivity.
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

import { createSignal, createContext, useContext } from "solid-js"
import { colors as defaultColors, radius, space, font, weight, shadows } from "../tokens/tokens"

// ── Types ──

/** Color token map — keys match the default void tokens, values are hex strings. */
export type ColorTokens = { [K in keyof typeof defaultColors]: string }
export type ThemeDefinition = {
  colors: Partial<ColorTokens>
}

// ── Theme Creation ──

/**
 * Create a theme definition from partial overrides.
 * Overrides are merged with the default void tokens.
 */
export function createTheme(overrides?: ThemeDefinition): Required<ThemeDefinition> {
  return {
    colors: { ...defaultColors, ...overrides?.colors },
  }
}

/** The default dark theme (same as current void tokens). */
export const darkTheme = createTheme()

/** A light theme preset. */
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
    transparent: "#00000000",
  },
})

// ── Reactive Theme State ──

const [activeTheme, setActiveThemeSig] = createSignal<Required<ThemeDefinition>>(darkTheme)

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
export function setTheme(theme: Required<ThemeDefinition>) {
  setActiveThemeSig(theme)
  for (const key of Object.keys(defaultColors) as (keyof ColorTokens)[]) {
    const value = theme.colors[key] ?? defaultColors[key]
    colorSignals[key][1](value)
  }
}

/**
 * Get the current active theme definition (non-reactive snapshot).
 */
export function getTheme(): Required<ThemeDefinition> {
  return activeTheme()
}

// ── Context-based ThemeProvider (optional, for nested themes) ──

const ThemeContext = createContext<{
  colors: ColorTokens
  setTheme: (theme: Required<ThemeDefinition>) => void
}>({
  colors: themeColors,
  setTheme,
})

/**
 * ThemeProvider component — provides theme context to children.
 * For most apps, the global setTheme() is sufficient.
 * Use ThemeProvider only if you need nested/different themes in subtrees.
 */
export function ThemeProvider(props: {
  theme?: Required<ThemeDefinition>
  children?: any
}) {
  if (props.theme) {
    setTheme(props.theme)
  }

  return ThemeContext.Provider({
    value: {
      colors: themeColors,
      setTheme,
    },
    children: props.children,
  })
}

/**
 * Access the current theme context (reactive).
 */
export function useTheme() {
  return useContext(ThemeContext)
}
