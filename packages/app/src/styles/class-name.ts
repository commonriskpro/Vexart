import { type InteractiveStyleProps } from "@vexart/engine"
import { setClassNameResolver, getThemeEpoch } from "@vexart/engine/internal"
import { getThemeTokenResolver, type ThemeTokenResolver } from "./theme-resolver"

/** @public */
export const CLASS_NAME_UNKNOWN_BEHAVIOR = {
  IGNORE: "ignore",
  WARN: "warn",
  ERROR: "error",
} as const

/** @public */
export type ClassNameUnknownBehavior = (typeof CLASS_NAME_UNKNOWN_BEHAVIOR)[keyof typeof CLASS_NAME_UNKNOWN_BEHAVIOR]

/** @public */
export type VexartStyleProps = Partial<import("@vexart/engine").TGEProps>

/** @public */
export type ClassNameDiagnostic = {
  className: string
  reason: string
  suggestion?: string
}

/** @public */
export type ClassNameResolveOptions = {
  unknownClass?: ClassNameUnknownBehavior
  onDiagnostic?: (diagnostic: ClassNameDiagnostic) => void
}

/** @public */
export type ClassNameResolveResult = {
  props: VexartStyleProps
  diagnostics: ClassNameDiagnostic[]
}

// ── Cache ───────────────────────────────────────────────────────────────────

/** @internal */
export const MAX_CLASS_NAME_CACHE_SIZE = 2048

const cache = new Map<string, ClassNameResolveResult>()
let lastThemeVersion = -1
let lastResolver: ThemeTokenResolver | null = null

/**
 * Clear the className resolution cache.
 * Call after `setTheme()` if your app switches themes at runtime.
 * For apps that never switch themes (the common case), this is not needed.
 * @public
 */
export function clearClassNameCache() {
  cache.clear()
}

/**
 * Returns current number of entries in className LRU cache.
 * @internal
 */
export function getClassNameCacheSize(): number {
  return cache.size
}

// ── Style Registry (createStyles) ───────────────────────────────────────────

let styleId = 0
const styleRegistry = new Map<string, VexartStyleProps>()

/**
 * Create named style definitions that resolve via className.
 *
 * Values are captured eagerly at call time. For reactive theme colors,
 * prefer utility classes (`bg-card`) or inline props.
 *
 * @example
 * ```ts
 * const s = createStyles({
 *   card: { padding: 24, backgroundColor: "#171717", cornerRadius: 14 },
 *   title: { fontSize: 20, fontWeight: 700, color: "#fafafa" },
 * })
 *
 * <box className={s.card}>
 *   <text className={s.title}>Hello</text>
 * </box>
 *
 * // Composable with utility classes:
 * <box className={`${s.card} hover:bg-accent`}>
 * ```
 * @public
 */
export function createStyles<T extends Record<string, VexartStyleProps>>(
  definitions: T,
): { [K in keyof T]: string } {
  const result = {} as { [K in keyof T]: string }
  for (const key in definitions) {
    const id = `_vs_${key}_${++styleId}`
    styleRegistry.set(id, definitions[key])
    result[key] = id
  }
  return result
}

// ── Internal ────────────────────────────────────────────────────────────────

type MutableStyleProps = VexartStyleProps & {
  hoverStyle?: InteractiveStyleProps
  activeStyle?: InteractiveStyleProps
  focusStyle?: InteractiveStyleProps
}

type StyleTarget = "base" | "hover" | "active" | "focus"

const DEFAULT_FONT_SIZES: Record<string, number> = {
  xs: 10,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
}

const DEFAULT_FONT_WEIGHTS: Record<string, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
}

const DEFAULT_RADII: Record<string, number> = {
  none: 0,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  "2xl": 18,
  full: 9999,
}

const DEFAULT_SPACE_PX = 1

function getColorAlias(name: string): string | number | undefined {
  const resolver = getThemeTokenResolver()
  if (resolver?.getColor) {
    const resolved = resolver.getColor(name)
    if (resolved !== undefined) return resolved
  }
  switch (name) {
    case "black": return "#000000"
    case "white": return "#ffffff"
    case "transparent": return "#00000000"
    default: return undefined
  }
}

function getFontSize(key: string): number | undefined {
  const resolver = getThemeTokenResolver()
  return resolver?.fontSizes?.[key] ?? DEFAULT_FONT_SIZES[key]
}

function getFontWeight(key: string): number | undefined {
  const resolver = getThemeTokenResolver()
  return resolver?.fontWeights?.[key] ?? DEFAULT_FONT_WEIGHTS[key]
}

function getRadius(key: string): number | undefined {
  const resolver = getThemeTokenResolver()
  return resolver?.radii?.[key] ?? DEFAULT_RADII[key]
}

const BACKDROP_BLUR_MAP: Record<string, number> = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 40,
  "3xl": 64,
}

const BORDER_WIDTH_MAP: Record<string, number> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "4": 4,
  "8": 8,
}

function spacingValue(value: string) {
  if (value === "0") return 0
  if (value === "px") {
    const resolver = getThemeTokenResolver()
    return resolver?.spacePx ?? DEFAULT_SPACE_PX
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.round(parsed * 4)
}

function percentValue(value: string) {
  if (value === "full") return "100%"
  if (value === "fit") return "fit"
  if (value === "grow") return "grow"
  return spacingValue(value)
}

function applyToTarget(props: MutableStyleProps, target: StyleTarget, patch: InteractiveStyleProps) {
  if (target === "base") {
    Object.assign(props, patch)
    return
  }
  const key = target === "hover" ? "hoverStyle" : target === "active" ? "activeStyle" : "focusStyle"
  props[key] = { ...props[key], ...patch }
}

function parseToken(raw: string): { target: StyleTarget; token: string } {
  if (raw.startsWith("hover:")) return { target: "hover", token: raw.slice(6) }
  if (raw.startsWith("active:")) return { target: "active", token: raw.slice(7) }
  if (raw.startsWith("focus:")) return { target: "focus", token: raw.slice(6) }
  return { target: "base", token: raw }
}

function resolveToken(props: MutableStyleProps, target: StyleTarget, token: string): ClassNameDiagnostic | null {
  if (token === "flex" || token === "flex-col") { props.direction = "column"; return null }
  if (token === "flex-row") { props.direction = "row"; return null }
  if (token === "items-start") { props.alignY = "top"; return null }
  if (token === "items-center") { props.alignY = "center"; return null }
  if (token === "items-end") { props.alignY = "bottom"; return null }
  if (token === "justify-start") { props.alignX = "left"; return null }
  if (token === "justify-center") { props.alignX = "center"; return null }
  if (token === "justify-end") { props.alignX = "right"; return null }
  if (token === "justify-between") { props.alignX = "space-between"; return null }
  if (token === "border") { applyToTarget(props, target, { borderWidth: 1 }); return null }

  if (token.startsWith("p-")) { props.padding = spacingValue(token.slice(2)); return null }
  if (token.startsWith("px-")) { props.paddingX = spacingValue(token.slice(3)); return null }
  if (token.startsWith("py-")) { props.paddingY = spacingValue(token.slice(3)); return null }
  if (token.startsWith("pt-")) { props.paddingTop = spacingValue(token.slice(3)); return null }
  if (token.startsWith("pr-")) { props.paddingRight = spacingValue(token.slice(3)); return null }
  if (token.startsWith("pb-")) { props.paddingBottom = spacingValue(token.slice(3)); return null }
  if (token.startsWith("pl-")) { props.paddingLeft = spacingValue(token.slice(3)); return null }
  if (token.startsWith("m-")) { props.margin = spacingValue(token.slice(2)); return null }
  if (token.startsWith("mx-")) { props.marginX = spacingValue(token.slice(3)); return null }
  if (token.startsWith("my-")) { props.marginY = spacingValue(token.slice(3)); return null }
  if (token.startsWith("mt-")) { props.marginTop = spacingValue(token.slice(3)); return null }
  if (token.startsWith("mr-")) { props.marginRight = spacingValue(token.slice(3)); return null }
  if (token.startsWith("mb-")) { props.marginBottom = spacingValue(token.slice(3)); return null }
  if (token.startsWith("ml-")) { props.marginLeft = spacingValue(token.slice(3)); return null }
  if (token.startsWith("gap-")) { props.gap = spacingValue(token.slice(4)); return null }
  if (token.startsWith("w-")) { props.width = percentValue(token.slice(2)); return null }
  if (token.startsWith("h-")) { props.height = percentValue(token.slice(2)); return null }
  if (token.startsWith("min-w-")) { props.minWidth = spacingValue(token.slice(6)); return null }
  if (token.startsWith("max-w-")) { props.maxWidth = spacingValue(token.slice(6)); return null }
  if (token.startsWith("min-h-")) { props.minHeight = spacingValue(token.slice(6)); return null }
  if (token.startsWith("max-h-")) { props.maxHeight = spacingValue(token.slice(6)); return null }

  if (token.startsWith("rounded")) {
    const value = token === "rounded" ? "md" : token.slice(8)
    const resolved = getRadius(value)
    if (resolved !== undefined) { applyToTarget(props, target, { cornerRadius: resolved }); return null }
  }
  if (token.startsWith("bg-")) {
    const color = getColorAlias(token.slice(3))
    if (color !== undefined) { applyToTarget(props, target, { backgroundColor: color }); return null }
  }
  if (token.startsWith("border-")) {
    const value = token.slice(7)
    const color = getColorAlias(value)
    const width = BORDER_WIDTH_MAP[value]
    if (color !== undefined) { applyToTarget(props, target, { borderColor: color }); return null }
    if (width !== undefined) { applyToTarget(props, target, { borderWidth: width }); return null }
  }
  if (token.startsWith("text-")) {
    const value = token.slice(5)
    const size = getFontSize(value)
    const color = getColorAlias(value)
    if (size !== undefined) { props.fontSize = size; return null }
    if (color !== undefined) { props.color = color; return null }
  }
  if (token.startsWith("font-")) {
    const value = getFontWeight(token.slice(5))
    if (value !== undefined) { props.fontWeight = value; return null }
  }
  if (token.startsWith("opacity-")) {
    const value = Number(token.slice(8))
    if (Number.isFinite(value)) { applyToTarget(props, target, { opacity: Math.max(0, Math.min(1, value / 100)) }); return null }
  }
  if (token.startsWith("shadow")) {
    const value = token === "shadow" ? "md" : token.slice(7)
    if (value === "none") { props.shadow = undefined; return null }
    const resolver = getThemeTokenResolver()
    const resolved = resolver?.shadows?.[value]
    if (resolved) { props.shadow = resolved as VexartStyleProps["shadow"]; return null }
  }

  // ── Glow (Vexart-specific) ──
  if (token.startsWith("glow-")) {
    const value = token.slice(5)
    if (value === "none") { props.glow = undefined; return null }
    const resolver = getThemeTokenResolver()
    const resolved = resolver?.glows?.[value]
    if (resolved) { applyToTarget(props, target, { glow: resolved } as InteractiveStyleProps); return null }
  }

  // ── Backdrop filters (Tailwind v4 naming) ──
  if (token.startsWith("backdrop-blur")) {
    if (token === "backdrop-blur") { applyToTarget(props, target, { backdropBlur: 8 } as InteractiveStyleProps); return null }
    const suffix = token.slice(14) // "backdrop-blur-" = 14 chars
    const mapped = BACKDROP_BLUR_MAP[suffix]
    if (mapped !== undefined) { applyToTarget(props, target, { backdropBlur: mapped } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-brightness-")) {
    const value = Number(token.slice(20))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropBrightness: value } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-contrast-")) {
    const value = Number(token.slice(18))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropContrast: value } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-saturate-")) {
    const value = Number(token.slice(18))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropSaturate: value } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-grayscale")) {
    const value = token === "backdrop-grayscale" ? 100 : Number(token.slice(19))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropGrayscale: value } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-invert")) {
    const value = token === "backdrop-invert" ? 100 : Number(token.slice(16))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropInvert: value } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-sepia")) {
    const value = token === "backdrop-sepia" ? 100 : Number(token.slice(15))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropSepia: value } as InteractiveStyleProps); return null }
  }
  if (token.startsWith("backdrop-hue-rotate-")) {
    const value = Number(token.slice(20))
    if (Number.isFinite(value)) { applyToTarget(props, target, { backdropHueRotate: value } as InteractiveStyleProps); return null }
  }

  // ── Flex grow/shrink ──
  if (token === "grow") { props.flexGrow = 1; return null }
  if (token === "grow-0") { props.flexGrow = 0; return null }
  if (token === "shrink") { props.flexShrink = 1; return null }
  if (token === "shrink-0") { props.flexShrink = 0; return null }

  // ── Z-index ──
  if (token.startsWith("z-")) {
    const value = Number(token.slice(2))
    if (Number.isFinite(value)) { props.zIndex = value; return null }
  }

  // ── Scroll / overflow ──
  if (token === "overflow-x-scroll") { props.scrollX = true; return null }
  if (token === "overflow-y-scroll") { props.scrollY = true; return null }
  if (token === "overflow-scroll") { props.scrollX = true; props.scrollY = true; return null }

  // ── Layer ──
  if (token === "layer") { props.layer = true; return null }

  // ── Style registry (createStyles) ──
  const registered = styleRegistry.get(token)
  if (registered) { Object.assign(props, registered); return null }

  return {
    className: token,
    reason: "Unsupported Vexart class",
    suggestion: "Use explicit Vexart props or add this class to @vexart/app styles support.",
  }
}

/** @public */
export function resolveClassName(className: string | undefined | null, options: ClassNameResolveOptions = {}): ClassNameResolveResult {
  const resolver = getThemeTokenResolver()
  const version = resolver?.getThemeVersion?.() ?? getThemeEpoch()
  if (version !== lastThemeVersion || resolver !== lastResolver) {
    cache.clear()
    lastThemeVersion = version
    lastResolver = resolver
  }

  if (!className) return { props: {}, diagnostics: [] }

  // Cache lookup — skip when custom options are used (diagnostics callbacks)
  const useCache = !options.onDiagnostic && !options.unknownClass
  if (useCache) {
    const cached = cache.get(className)
    if (cached) {
      cache.delete(className)
      cache.set(className, cached)
      return cached
    }
  }

  const props: MutableStyleProps = {}
  const diagnostics: ClassNameDiagnostic[] = []

  for (const raw of className.split(/\s+/).filter(Boolean)) {
    const parsed = parseToken(raw)
    const diagnostic = resolveToken(props, parsed.target, parsed.token)
    if (!diagnostic) continue
    diagnostics.push({ ...diagnostic, className: raw })
    options.onDiagnostic?.({ ...diagnostic, className: raw })
    if (options.unknownClass === CLASS_NAME_UNKNOWN_BEHAVIOR.ERROR) {
      throw new Error(`Unsupported Vexart class: ${raw}`)
    }
    if (options.unknownClass === CLASS_NAME_UNKNOWN_BEHAVIOR.WARN) {
      console.warn(`Unsupported Vexart class: ${raw}`)
    }
  }

  const result: ClassNameResolveResult = { props, diagnostics }
  if (useCache) {
    if (cache.size >= MAX_CLASS_NAME_CACHE_SIZE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(className, result)
  }
  return result
}

/** @public */
export function mergeClassNameProps<T extends Record<string, unknown>>(props: T, className?: string | null): T & VexartStyleProps {
  const resolved = resolveClassName(className).props
  return { ...resolved, ...props }
}

// Register global class name resolver in @vexart/engine
setClassNameResolver((cls) => resolveClassName(cls).props)
