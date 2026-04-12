/**
 * ThemeProvider — runtime theming with SolidJS reactivity.
 *
 * Decision 9: Theme tokens are reactive objects with valueOf()/toString().
 * When the theme changes, only components reading those tokens re-render.
 *
 * Architecture:
 *   createTheme(overrides) → creates a theme definition (static data)
 *   ThemeProvider           → Context providing the active theme
 *   useTheme()             → access the current theme (reactive colors, etc.)
 *   setTheme()             → switch to a different theme at runtime
 *
 * Usage:
 *   const dark = createTheme({ colors: { background: "#0a0a0a" } })
 *   const light = createTheme({ colors: { background: "#ffffff", foreground: "#171717" } })
 *
 *   <ThemeProvider theme={dark}>
 *     <App />   // colors.background resolves to "#0a0a0a"
 *   </ThemeProvider>
 *
 *   // Switch at runtime:
 *   setTheme(light)  // → all tokens update reactively
 */

import { createSignal, createContext, useContext } from "solid-js"
import { colors as defaultColors, radius, space, font, weight, shadows } from "./tokens"

// ── Types ──

/** Color token map — keys match the default void tokens, values are hex strings. */
export type ColorTokens = { [K in keyof typeof defaultColors]: string }
export type ThemeDefinition = {
  colors: Partial<ColorTokens>
}

// ── Reactive Color Token ──

/**
 * A reactive color value. Looks like a string but is backed by a SolidJS signal.
 * - valueOf() returns the string value (for parseColor compatibility)
 * - toString() returns the hex string (for display/debugging)
 * - Reading it in a SolidJS computation subscribes to changes
 */
class ReactiveColor {
  private _get: () => string

  constructor(getter: () => string) {
    this._get = getter
  }

  valueOf(): string {
    return this._get()
  }

  toString(): string {
    return this._get()
  }

  // Allow direct use as string in template literals etc.
  [Symbol.toPrimitive](): string {
    return this._get()
  }
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

// Create a reactive signal for each color token
const colorSignals: Record<string, [() => string, (v: string) => void]> = {}
const reactiveColors: Record<string, ReactiveColor> = {}

// Initialize signals for all default color tokens
for (const key of Object.keys(defaultColors) as (keyof ColorTokens)[]) {
  const [get, set] = createSignal(defaultColors[key])
  colorSignals[key] = [get, set]
  reactiveColors[key] = new ReactiveColor(get)
}

/**
 * Reactive color tokens. Each property is a ReactiveColor that updates
 * when setTheme() is called. Use these instead of the static `colors` import
 * when you want runtime theming.
 *
 * ```tsx
 * import { themeColors } from "tge/void"
 * <box backgroundColor={themeColors.background} />
 * // When theme changes, this box automatically updates
 * ```
 */
export const themeColors = reactiveColors as unknown as ColorTokens

/**
 * Switch the active theme at runtime.
 * Updates all reactive color signals — only components reading those tokens re-render.
 */
export function setTheme(theme: Required<ThemeDefinition>) {
  setActiveThemeSig(theme)
  for (const key of Object.keys(defaultColors) as (keyof ColorTokens)[]) {
    const value = theme.colors[key] ?? defaultColors[key]
    const [, set] = colorSignals[key]
    set(value)
  }
}

/**
 * Get the current active theme definition (non-reactive, for reading the config).
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
  // Apply initial theme if provided
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
