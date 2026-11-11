import { type InteractiveStyleProps } from "@vexart/engine"
import { setClassNameResolver, getThemeEpoch } from "@vexart/engine/internal"
import { getThemeTokenResolver, resolvePaletteColor, type ThemeTokenResolver } from "./theme-resolver"

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

const DEFAULT_LINE_HEIGHTS: Record<string, number> = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
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

const TRANSITION_DURATIONS = new Set([75, 100, 150, 200, 300, 500, 700, 1000])
const DEFAULT_TRANSITION_MS = 150

const DEFAULT_SPACE_PX = 1

function parseHexOrNumberColor(color: string | number): [number, number, number, number] | undefined {
  if (typeof color === "number") {
    const u = color >>> 0
    return [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff]
  }
  const hex = color.startsWith("#") ? color.slice(1) : color
  if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
    return [parseInt(hex[0], 16) * 17, parseInt(hex[1], 16) * 17, parseInt(hex[2], 16) * 17, 255]
  }
  if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
    return [parseInt(hex[0], 16) * 17, parseInt(hex[1], 16) * 17, parseInt(hex[2], 16) * 17, parseInt(hex[3], 16) * 17]
  }
  if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255]
  }
  if (hex.length === 8 && /^[0-9a-fA-F]{8}$/.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16)]
  }
  return undefined
}

function hexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
}

function applyColorOpacity(color: string | number, opacityPct: number): string | undefined {
  const rgba = parseHexOrNumberColor(color)
  if (!rgba) return undefined
  const clamped = Math.max(0, Math.min(100, opacityPct))
  const alpha = Math.round(rgba[3] * (clamped / 100))
  return `#${hexByte(rgba[0])}${hexByte(rgba[1])}${hexByte(rgba[2])}${hexByte(alpha)}`
}

function parseBracket(raw: string): string | undefined {
  if (raw.startsWith("[") && raw.endsWith("]") && raw.length > 2) return raw.slice(1, -1)
  return undefined
}

function parseBracketNumber(raw: string): number | undefined {
  const inner = parseBracket(raw)
  if (inner === undefined) return undefined
  const trimmed = inner.endsWith("px") ? inner.slice(0, -2) : inner
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return undefined
  return Number(trimmed)
}

function parseBracketSizing(raw: string): VexartStyleProps["width"] {
  const inner = parseBracket(raw)
  if (inner === undefined) return undefined
  if (/^\d+(?:\.\d+)?%$/.test(inner)) return inner as `${number}%`
  return parseBracketNumber(raw)
}

function parseBracketColor(raw: string): string | undefined {
  const inner = parseBracket(raw)
  if (inner === undefined) return undefined
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(inner)) return inner
  return undefined
}

function parseBracketLineHeight(raw: string): number | undefined {
  const inner = parseBracket(raw)
  if (inner === undefined) return undefined
  const rawNum = inner.endsWith("px") ? inner.slice(0, -2) : inner
  if (!/^\d+(?:\.\d+)?$/.test(rawNum)) return undefined
  const value = Number(rawNum)
  return value > 0 ? value : undefined
}

function resolveBaseColor(name: string): string | number | undefined {
  const bracket = parseBracketColor(name)
  if (bracket !== undefined) return bracket
  const resolver = getThemeTokenResolver()
  if (resolver?.getColor) {
    const resolved = resolver.getColor(name)
    if (resolved !== undefined) return resolved
  }
  switch (name) {
    case "black": return "#000000"
    case "white": return "#ffffff"
    case "transparent": return "#00000000"
    default: return resolvePaletteColor(name)
  }
}

function getColorAlias(name: string): string | number | undefined {
  const slash = name.indexOf("/")
  if (slash === -1) return resolveBaseColor(name)
  const baseName = name.slice(0, slash)
  const opacityRaw = name.slice(slash + 1)
  if (opacityRaw.length === 0) return undefined
  const opacity = Number(opacityRaw)
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) return undefined
  const base = resolveBaseColor(baseName)
  if (base === undefined) return undefined
  return applyColorOpacity(base, opacity)
}

function resolveSpacingOrBracket(value: string): number | undefined {
  return spacingValue(value) ?? parseBracketNumber(value)
}

function resolveSizeOrBracket(value: string): VexartStyleProps["width"] {
  return percentValue(value) ?? parseBracketSizing(value)
}

const ROUNDED_DIR_RE = /^rounded-(tl|tr|bl|br|t|b|l|r)(?:-(.+))?$/

function applyCornerRadiusSide(props: MutableStyleProps, dir: string, radius: number): void {
  const fallback = props.cornerRadius ?? 0
  const radii = props.cornerRadii
    ? { ...props.cornerRadii }
    : { tl: fallback, tr: fallback, br: fallback, bl: fallback }
  switch (dir) {
    case "t": radii.tl = radius; radii.tr = radius; break
    case "b": radii.bl = radius; radii.br = radius; break
    case "l": radii.tl = radius; radii.bl = radius; break
    case "r": radii.tr = radius; radii.br = radius; break
    case "tl": radii.tl = radius; break
    case "tr": radii.tr = radius; break
    case "bl": radii.bl = radius; break
    case "br": radii.br = radius; break
  }
  props.cornerRadii = radii
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

function resolveToken(
  props: MutableStyleProps,
  target: StyleTarget,
  token: string,
  transitionState: { hasDuration: boolean },
): ClassNameDiagnostic | null {
  if (token === "flex" || token === "flex-col") { props.direction = "column"; return null }
  if (token === "flex-row") { props.direction = "row"; return null }
  if (token === "flex-1") { props.flexGrow = 1; props.flexShrink = 1; props.flexBasis = 0; return null }
  if (token === "flex-auto") { props.flexGrow = 1; props.flexShrink = 1; return null }
  if (token === "flex-initial") { props.flexGrow = 0; props.flexShrink = 1; return null }
  if (token === "flex-none") { props.flexGrow = 0; props.flexShrink = 0; return null }
  if (token === "grid") { props.layout = "grid"; return null }
  if (token.startsWith("grid-cols-")) {
    const count = Number(token.slice(10))
    if (Number.isInteger(count) && count >= 1 && count <= 12) {
      props.gridTemplateColumns = Array.from({ length: count }, () => ({ fr: 1 }))
      return null
    }
  }
  if (token.startsWith("col-span-")) {
    const span = Number(token.slice(9))
    if (Number.isInteger(span) && span >= 1 && span <= 12) {
      props.gridColumn = { end: { span } }
      return null
    }
  }
  if (token === "items-start") { props.alignY = "top"; return null }
  if (token === "items-center") { props.alignY = "center"; return null }
  if (token === "items-end") { props.alignY = "bottom"; return null }
  if (token === "items-stretch") { props.alignY = "stretch"; return null }
  if (token === "justify-start") { props.alignX = "left"; return null }
  if (token === "justify-center") { props.alignX = "center"; return null }
  if (token === "justify-end") { props.alignX = "right"; return null }
  if (token === "justify-between") { props.alignX = "space-between"; return null }
  if (token === "justify-around") { props.alignX = "space-around"; return null }
  if (token === "justify-evenly") { props.alignX = "space-evenly"; return null }
  if (token === "border") { applyToTarget(props, target, { borderWidth: 1 }); return null }
  if (token === "border-t") { props.borderTop = 1; return null }
  if (token === "border-b") { props.borderBottom = 1; return null }
  if (token === "border-l") { props.borderLeft = 1; return null }
  if (token === "border-r") { props.borderRight = 1; return null }
  if (token.startsWith("border-t-")) {
    const raw = token.slice(9)
    const w = BORDER_WIDTH_MAP[raw] ?? parseBracketNumber(raw)
    if (w !== undefined) { props.borderTop = w; return null }
  }
  if (token.startsWith("border-b-")) {
    const raw = token.slice(9)
    const w = BORDER_WIDTH_MAP[raw] ?? parseBracketNumber(raw)
    if (w !== undefined) { props.borderBottom = w; return null }
  }
  if (token.startsWith("border-l-")) {
    const raw = token.slice(9)
    const w = BORDER_WIDTH_MAP[raw] ?? parseBracketNumber(raw)
    if (w !== undefined) { props.borderLeft = w; return null }
  }
  if (token.startsWith("border-r-")) {
    const raw = token.slice(9)
    const w = BORDER_WIDTH_MAP[raw] ?? parseBracketNumber(raw)
    if (w !== undefined) { props.borderRight = w; return null }
  }

  if (token.startsWith("p-")) { const v = resolveSpacingOrBracket(token.slice(2)); if (v !== undefined) { props.padding = v; return null } }
  if (token.startsWith("px-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.paddingX = v; return null } }
  if (token.startsWith("py-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.paddingY = v; return null } }
  if (token.startsWith("pt-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.paddingTop = v; return null } }
  if (token.startsWith("pr-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.paddingRight = v; return null } }
  if (token.startsWith("pb-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.paddingBottom = v; return null } }
  if (token.startsWith("pl-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.paddingLeft = v; return null } }
  if (token.startsWith("m-")) { const v = resolveSpacingOrBracket(token.slice(2)); if (v !== undefined) { props.margin = v; return null } }
  if (token.startsWith("mx-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.marginX = v; return null } }
  if (token.startsWith("my-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.marginY = v; return null } }
  if (token.startsWith("mt-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.marginTop = v; return null } }
  if (token.startsWith("mr-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.marginRight = v; return null } }
  if (token.startsWith("mb-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.marginBottom = v; return null } }
  if (token.startsWith("ml-")) { const v = resolveSpacingOrBracket(token.slice(3)); if (v !== undefined) { props.marginLeft = v; return null } }
  if (token.startsWith("gap-x-")) { const v = resolveSpacingOrBracket(token.slice(6)); if (v !== undefined) { props.columnGap = v; return null } }
  if (token.startsWith("gap-y-")) { const v = resolveSpacingOrBracket(token.slice(6)); if (v !== undefined) { props.rowGap = v; return null } }
  if (token.startsWith("gap-")) { const v = resolveSpacingOrBracket(token.slice(4)); if (v !== undefined) { props.gap = v; return null } }
  if (token.startsWith("w-")) { const v = resolveSizeOrBracket(token.slice(2)); if (v !== undefined) { props.width = v; return null } }
  if (token.startsWith("h-")) { const v = resolveSizeOrBracket(token.slice(2)); if (v !== undefined) { props.height = v; return null } }
  if (token.startsWith("min-w-")) { const v = resolveSpacingOrBracket(token.slice(6)); if (v !== undefined) { props.minWidth = v; return null } }
  if (token.startsWith("max-w-")) { const v = resolveSpacingOrBracket(token.slice(6)); if (v !== undefined) { props.maxWidth = v; return null } }
  if (token.startsWith("min-h-")) { const v = resolveSpacingOrBracket(token.slice(6)); if (v !== undefined) { props.minHeight = v; return null } }
  if (token.startsWith("max-h-")) { const v = resolveSpacingOrBracket(token.slice(6)); if (v !== undefined) { props.maxHeight = v; return null } }

  const roundedDir = ROUNDED_DIR_RE.exec(token)
  if (roundedDir) {
    const dir = roundedDir[1]
    const suffix = roundedDir[2] ?? "md"
    const resolved = getRadius(suffix) ?? parseBracketNumber(suffix)
    if (resolved !== undefined) { applyCornerRadiusSide(props, dir, resolved); return null }
  }
  if (token.startsWith("rounded")) {
    const value = token === "rounded" ? "md" : token.slice(8)
    const resolved = getRadius(value) ?? parseBracketNumber(value)
    if (resolved !== undefined) {
      if (target === "base") delete props.cornerRadii
      applyToTarget(props, target, { cornerRadius: resolved })
      return null
    }
  }
  if (token.startsWith("bg-")) {
    const color = getColorAlias(token.slice(3))
    if (color !== undefined) { applyToTarget(props, target, { backgroundColor: color }); return null }
  }
  if (token.startsWith("border-")) {
    const value = token.slice(7)
    const color = getColorAlias(value)
    const width = BORDER_WIDTH_MAP[value] ?? parseBracketNumber(value)
    if (color !== undefined) { applyToTarget(props, target, { borderColor: color }); return null }
    if (width !== undefined) { applyToTarget(props, target, { borderWidth: width }); return null }
  }
  if (token === "text-left") { props.alignX = "left"; return null }
  if (token === "text-center") { props.alignX = "center"; return null }
  if (token === "text-right") { props.alignX = "right"; return null }
  if (token.startsWith("text-")) {
    const value = token.slice(5)
    const size = getFontSize(value) ?? parseBracketNumber(value)
    const color = getColorAlias(value)
    if (size !== undefined) { props.fontSize = size; return null }
    if (color !== undefined) { props.color = color; return null }
  }
  if (token.startsWith("font-")) {
    const value = getFontWeight(token.slice(5))
    if (value !== undefined) { props.fontWeight = value; return null }
  }
  if (token.startsWith("leading-")) {
    const value = token.slice(8)
    const named = DEFAULT_LINE_HEIGHTS[value]
    if (named !== undefined) { props.lineHeight = named; return null }
    if (/^\d+$/.test(value)) {
      const n = Number(value)
      if (n >= 3 && n <= 10) { props.lineHeight = n * 4; return null }
    }
    const bracket = parseBracketLineHeight(value)
    if (bracket !== undefined) { props.lineHeight = bracket; return null }
  }
  if (token === "truncate") { props.whiteSpace = "nowrap"; props.wordBreak = "keep-all"; return null }
  if (token === "italic") { props.fontStyle = "italic"; return null }
  if (token === "not-italic") { props.fontStyle = "normal"; return null }
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

  // ── Transitions ──
  if (target === "base") {
    if (token === "transition-none") {
      props.transition = 0
      transitionState.hasDuration = false
      return null
    }
    if (
      token === "transition"
      || token === "transition-all"
      || token === "transition-colors"
      || token === "transition-opacity"
      || token === "transition-transform"
    ) {
      if (!transitionState.hasDuration) props.transition = DEFAULT_TRANSITION_MS
      return null
    }
    if (token.startsWith("duration-")) {
      const ms = Number(token.slice(9))
      if (TRANSITION_DURATIONS.has(ms)) {
        props.transition = ms
        transitionState.hasDuration = true
        return null
      }
    }
  }

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
  const transitionState = { hasDuration: false }

  for (const raw of className.split(/\s+/).filter(Boolean)) {
    const parsed = parseToken(raw)
    const diagnostic = resolveToken(props, parsed.target, parsed.token, transitionState)
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
