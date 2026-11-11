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
  background:           "#09090b",
  foreground:           "#fafafa",

  // Elevated surfaces (cards, panels)
  card:                 "#121216",
  cardForeground:       "#fafafa",

  // Floating surfaces (popovers, dropdowns, dialogs)
  popover:              "#16161cd9",
  popoverForeground:    "#fafafa",

  // High-emphasis actions + brand
  primary:              "#f4f4f5",
  primaryHover:         "#ffffff",
  primaryForeground:    "#09090b",

  // Lower-emphasis actions
  secondary:            "#1f1f26",
  secondaryForeground:  "#e4e4e7",

  // Subtle surfaces + low-emphasis text
  muted:                "#18181e",
  mutedForeground:      "#a1a1aa",

  // Hover/focus/active surfaces
  accent:               "#272730",
  accentForeground:     "#fafafa",

  // Destructive actions + errors
  destructive:          "#ef4444",
  destructiveForeground: "#fafafa",

  // Borders + separators — white with alpha for OLED
  border:               "#ffffff1f",       // 12% crisp border
  // Form control borders — more visible than layout borders
  input:                "#ffffff29",       // 16% input border

  // Focus rings
  ring:                 "#a1a1aa",
  // Subtle ring for focus-visible glow effect (50% opacity equivalent)
  ringSubtle:           "#a1a1aa66",

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
export const glows: Record<"ring" | "destructive" | "success" | "ambient" | "primary", Glow> = {
  ring:        { radius: 6, color: hexToU32(alphaHex("#737373", 0.5)), intensity: 40 },
  destructive: { radius: 6, color: hexToU32(alphaHex("#dc2626", 0.5)), intensity: 40 },
  success:     { radius: 6, color: hexToU32(alphaHex("#22c55e", 0.5)), intensity: 40 },
  ambient:     { radius: 12, color: hexToU32("#ffffff0d"), intensity: 25 },
  primary:     { radius: 8, color: hexToU32("#ffffff26"), intensity: 35 },
}

// ── Gradients ──

/** @public */
export type Gradient = {
  type: "linear"
  angle: number
  from: string
  to: string
}

/** @public */
export const gradients = {
  card:              { type: "linear" as const, angle: 180, from: "#18181f", to: "#101014" },
  glass:             { type: "linear" as const, angle: 180, from: "#202029e6", to: "#131318d9" },
  primaryButton:     { type: "linear" as const, angle: 180, from: "#ffffff", to: "#e4e4e7" },
  secondaryButton:   { type: "linear" as const, angle: 180, from: "#2a2a35", to: "#1c1c24" },
  destructiveButton: { type: "linear" as const, angle: 180, from: "#f87171", to: "#dc2626" },
  subtle:            { type: "linear" as const, angle: 180, from: "#16161d", to: "#0e0e13" },
} as const

// ── Borders ──

/** @public */
export const borders = {
  rimTop:   "#ffffff2e",
  hairline: "#ffffff14",
  glassRim: "#ffffff29",
} as const

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
  gradients,
  borders,
} as const

/** @public */
export type VoidTheme = typeof theme
