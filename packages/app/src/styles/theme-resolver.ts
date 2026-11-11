/**
 * Theme token resolver interface and global registry for @vexart/app.
 *
 * Allows styled packages (such as @vexart/styled) to inject semantic tokens,
 * typography scales, radii, shadows, and runtime theme versions into the
 * className compiler without coupling the framework directly to a specific design system.
 */

/** @public */
export interface ThemeTokenResolver {
  getColor?: (name: string) => string | number | undefined
  fontSizes?: Record<string, number>
  fontWeights?: Record<string, number>
  radii?: Record<string, number>
  shadows?: Record<string, unknown>
  glows?: Record<string, unknown>
  spacePx?: number
  getThemeVersion?: () => number
}

let currentResolver: ThemeTokenResolver | null = null

/**
 * Register the global theme token resolver for className resolution.
 * @public
 */
export function setThemeTokenResolver(resolver: ThemeTokenResolver | null): void {
  currentResolver = resolver
}

/**
 * Retrieve the currently registered theme token resolver, or null if none.
 * @public
 */
export function getThemeTokenResolver(): ThemeTokenResolver | null {
  return currentResolver
}

const TAILWIND_PALETTE: Record<string, Record<string, string>> = {
  zinc: {
    "50": "#fafafa", "100": "#f4f4f5", "200": "#e4e4e7", "300": "#d4d4d8", "400": "#a1a1aa",
    "500": "#71717a", "600": "#52525b", "700": "#3f3f46", "800": "#27272a", "900": "#18181b", "950": "#09090b",
  },
  slate: {
    "50": "#f8fafc", "100": "#f1f5f9", "200": "#e2e8f0", "300": "#cbd5e1", "400": "#94a3b8",
    "500": "#64748b", "600": "#475569", "700": "#334155", "800": "#1e293b", "900": "#0f172a", "950": "#020617",
  },
  neutral: {
    "50": "#fafafa", "100": "#f5f5f5", "200": "#e5e5e5", "300": "#d4d4d4", "400": "#a3a3a3",
    "500": "#737373", "600": "#525252", "700": "#404040", "800": "#262626", "900": "#171717", "950": "#0a0a0a",
  },
  red: {
    "50": "#fef2f2", "100": "#fee2e2", "200": "#fecaca", "300": "#fca5a5", "400": "#f87171",
    "500": "#ef4444", "600": "#dc2626", "700": "#b91c1c", "800": "#991b1b", "900": "#7f1d1d", "950": "#450a0a",
  },
  amber: {
    "50": "#fffbeb", "100": "#fef3c7", "200": "#fde68a", "300": "#fcd34d", "400": "#fbbf24",
    "500": "#f59e0b", "600": "#d97706", "700": "#b45309", "800": "#92400e", "900": "#78350f", "950": "#451a03",
  },
  emerald: {
    "50": "#ecfdf5", "100": "#d1fae5", "200": "#a7f3d0", "300": "#6ee7b7", "400": "#34d399",
    "500": "#10b981", "600": "#059669", "700": "#047857", "800": "#065f46", "900": "#064e3b", "950": "#022c22",
  },
  blue: {
    "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe", "300": "#93c5fd", "400": "#60a5fa",
    "500": "#3b82f6", "600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af", "900": "#1e3a8a", "950": "#172554",
  },
  violet: {
    "50": "#f5f3ff", "100": "#ede9fe", "200": "#ddd6fe", "300": "#c4b5fd", "400": "#a78bfa",
    "500": "#8b5cf6", "600": "#7c3aed", "700": "#6d28d9", "800": "#5b21b6", "900": "#4c1d95", "950": "#2e1065",
  },
}

/** Resolve a compact Tailwind palette token like `zinc-900` or `emerald-500`. */
export function resolvePaletteColor(name: string): string | undefined {
  const dash = name.lastIndexOf("-")
  if (dash <= 0) return undefined
  const family = name.slice(0, dash)
  const shade = name.slice(dash + 1)
  return TAILWIND_PALETTE[family]?.[shade]
}
