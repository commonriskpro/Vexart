/**
 * Void Design Tokens — shadcn-compatible semantic token system for Vexart.
 *
 * Tokens follow the shadcn convention: surface + foreground pairs.
 * Colors are hex strings ("#rrggbb" or "#rrggbbaa") per Decision 2.
 * Vexart's parseColor handles strings natively — no conversion needed.
 *
 * Based on shadcn/ui neutral dark theme (oklch → hex).
 * Recalibrated for OLED terminal rendering where contrast is critical.
 */

// ── Color helpers ──

/** Parse hex string to u32 RGBA (for shadow color values that need u32). */
function hexToU32(h: string): number {
  const raw = h.startsWith("#") ? h.slice(1) : h
  if (raw.length === 6) return (parseInt(raw, 16) << 8 | 0xff) >>> 0
  if (raw.length === 8) return parseInt(raw, 16) >>> 0
  return 0
}

function alphaHex(hex: string, a: number): string {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex
  const base = raw.length === 8 ? raw.slice(0, 6) : raw
  const alpha = Math.round(a * 255).toString(16).padStart(2, "0")
  return `#${base}${alpha}`
}

// ── Semantic Color Tokens ──
// All colors are hex strings — Decision 2: "Colors accept strings."

/** @public */
export const colors = {
  // App background + default text
  background:           "#0a0a0a",        // near-OLED black
  foreground:           "#fafafa",

  // Elevated surfaces (cards, panels)
  card:                 "#171717",         // subtle lift from background
  cardForeground:       "#fafafa",

  // Floating surfaces (popovers, dropdowns, dialogs)
  popover:              "#171717",
  popoverForeground:    "#fafafa",

  // High-emphasis actions + brand
  primary:              "#e5e5e5",
  primaryForeground:    "#171717",

  // Lower-emphasis actions
  secondary:            "#262626",
  secondaryForeground:  "#fafafa",

  // Subtle surfaces + low-emphasis text
  muted:                "#262626",
  mutedForeground:      "#a3a3a3",

  // Hover/focus/active surfaces
  accent:               "#262626",
  accentForeground:     "#fafafa",

  // Destructive actions + errors
  destructive:          "#dc2626",
  destructiveForeground: "#fafafa",

  // Borders + separators — white with alpha for OLED
  border:               "#ffffff25",       // ~14.5% white
  // Form control borders — more visible than layout borders
  input:                "#ffffff40",       // ~25% white — clearly visible on inputs

  // Focus rings
  ring:                 "#737373",
  // Subtle ring for focus-visible glow effect (50% opacity equivalent)
  ringSubtle:           "#73737380",

  // Transparent
  transparent:          "#00000000",
} as const

// ── Radius Scale ──
// Based on shadcn's --radius: 0.625rem (10px) with derived scale

const BASE_RADIUS = 10

/** @public */
export const radius = {
  sm:   Math.round(BASE_RADIUS * 0.6),  // 6
  md:   Math.round(BASE_RADIUS * 0.8),  // 8
  lg:   BASE_RADIUS,                     // 10
  xl:   Math.round(BASE_RADIUS * 1.4),  // 14
  xxl:  Math.round(BASE_RADIUS * 1.8),  // 18
  full: 9999,                            // pill
} as const

// ── Spacing Scale ──

/** @public */
export const space = {
  px:  1,
  0.5: 2,
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  3.5: 14,
  4:   16,
  5:   20,
  6:   24,
  7:   28,
  8:   32,
  9:   36,
  10:  40,
} as const

// ── Font Scale ──

/** @public */
export const font = {
  xs:      10,
  sm:      12,
  base:    14,
  lg:      16,
  xl:      20,
  "2xl":   24,
  "3xl":   30,
  "4xl":   36,
} as const

// ── Font Weight ──

/** @public */
export const weight = {
  normal:   400,
  medium:   500,
  semibold: 600,
  bold:     700,
} as const

// ── Shadow presets — more visible on dark backgrounds ──
// Shadow colors remain u32 because the shadow prop expects packed RGBA numbers.

/** @public */
export type Shadow = { x: number; y: number; blur: number; color: number }

/** @public */
export const shadows: Record<"xs" | "sm" | "md" | "lg" | "xl", Shadow[]> = {
  xs:  [
    { x: 0, y: 1, blur: 2, color: hexToU32(alphaHex("#000000", 0.3)) },
  ],
  sm:  [
    { x: 0, y: 1, blur: 3, color: hexToU32(alphaHex("#000000", 0.4)) },
    { x: 0, y: 1, blur: 2, color: hexToU32(alphaHex("#000000", 0.3)) },
  ],
  md:  [
    { x: 0, y: 4, blur: 6, color: hexToU32(alphaHex("#000000", 0.4)) },
    { x: 0, y: 2, blur: 4, color: hexToU32(alphaHex("#000000", 0.3)) },
  ],
  lg:  [
    { x: 0, y: 10, blur: 15, color: hexToU32(alphaHex("#000000", 0.3)) },
    { x: 0, y: 4, blur: 6,  color: hexToU32(alphaHex("#000000", 0.2)) },
  ],
  xl:  [
    { x: 0, y: 20, blur: 25, color: hexToU32(alphaHex("#000000", 0.3)) },
    { x: 0, y: 8, blur: 10,  color: hexToU32(alphaHex("#000000", 0.2)) },
  ],
}

// ── Glow presets — for focus rings on interactive elements ──
// Used as `glow` prop on focused boxes to simulate focus-visible:ring.

/** @public */
export type Glow = { radius: number; color: number; intensity?: number }

/** @public */
export const glows: Record<"ring" | "destructive" | "success", Glow> = {
  ring:        { radius: 6, color: hexToU32(alphaHex("#737373", 0.5)), intensity: 40 },
  destructive: { radius: 6, color: hexToU32(alphaHex("#dc2626", 0.5)), intensity: 40 },
  success:     { radius: 6, color: hexToU32(alphaHex("#22c55e", 0.5)), intensity: 40 },
}

// ── Composite theme export ──

/** @public */
export const theme = {
  colors,
  radius,
  space,
  font,
  weight,
  shadows,
  glows,
} as const

/** @public */
export type VoidTheme = typeof theme
