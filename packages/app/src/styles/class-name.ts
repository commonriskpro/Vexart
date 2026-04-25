import type { InteractiveStyleProps } from "@vexart/engine"
import { colors, font, radius, shadows, space, weight } from "@vexart/styled"

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

type MutableStyleProps = VexartStyleProps & {
  hoverStyle?: InteractiveStyleProps
  activeStyle?: InteractiveStyleProps
  focusStyle?: InteractiveStyleProps
}

type StyleTarget = "base" | "hover" | "active" | "focus"

const COLOR_ALIASES: Record<string, string | number> = {
  background: colors.background,
  foreground: colors.foreground,
  card: colors.card,
  "card-foreground": colors.cardForeground,
  popover: colors.popover,
  "popover-foreground": colors.popoverForeground,
  primary: colors.primary,
  "primary-foreground": colors.primaryForeground,
  secondary: colors.secondary,
  "secondary-foreground": colors.secondaryForeground,
  muted: colors.muted,
  "muted-foreground": colors.mutedForeground,
  accent: colors.accent,
  "accent-foreground": colors.accentForeground,
  destructive: colors.destructive,
  "destructive-foreground": colors.destructiveForeground,
  border: colors.border,
  input: colors.input,
  ring: colors.ring,
  transparent: colors.transparent,
  black: "#000000",
  white: "#ffffff",
}

const FONT_ALIASES: Record<string, number> = {
  xs: font.xs,
  sm: font.sm,
  base: font.base,
  lg: font.lg,
  xl: font.xl,
  "2xl": font["2xl"],
  "3xl": font["3xl"],
  "4xl": font["4xl"],
}

const RADIUS_ALIASES: Record<string, number> = {
  none: 0,
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  xl: radius.xl,
  "2xl": radius.xxl,
  full: radius.full,
}

const WEIGHT_ALIASES: Record<string, number> = {
  normal: weight.normal,
  medium: weight.medium,
  semibold: weight.semibold,
  bold: weight.bold,
}

function spacingValue(value: string) {
  if (value === "0") return 0
  if (value === "px") return space.px
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
    const resolved = RADIUS_ALIASES[value]
    if (resolved !== undefined) { applyToTarget(props, target, { cornerRadius: resolved }); return null }
  }
  if (token.startsWith("bg-")) {
    const color = COLOR_ALIASES[token.slice(3)]
    if (color !== undefined) { applyToTarget(props, target, { backgroundColor: color }); return null }
  }
  if (token.startsWith("border-")) {
    const value = token.slice(7)
    const color = COLOR_ALIASES[value]
    const width = spacingValue(value)
    if (color !== undefined) { applyToTarget(props, target, { borderColor: color }); return null }
    if (width !== undefined) { applyToTarget(props, target, { borderWidth: width }); return null }
  }
  if (token.startsWith("text-")) {
    const value = token.slice(5)
    const size = FONT_ALIASES[value]
    const color = COLOR_ALIASES[value]
    if (size !== undefined) { props.fontSize = size; return null }
    if (color !== undefined) { props.color = color; return null }
  }
  if (token.startsWith("font-")) {
    const value = WEIGHT_ALIASES[token.slice(5)]
    if (value !== undefined) { props.fontWeight = value; return null }
  }
  if (token.startsWith("opacity-")) {
    const value = Number(token.slice(8))
    if (Number.isFinite(value)) { applyToTarget(props, target, { opacity: Math.max(0, Math.min(1, value / 100)) }); return null }
  }
  if (token.startsWith("shadow")) {
    const value = token === "shadow" ? "md" : token.slice(7)
    if (value === "none") { props.shadow = undefined; return null }
    const resolved = shadows[value as keyof typeof shadows]
    if (resolved) { props.shadow = resolved; return null }
  }

  return {
    className: token,
    reason: "Unsupported Vexart class",
    suggestion: "Use explicit Vexart props or add this class to @vexart/app styles support.",
  }
}

/** @public */
export function resolveClassName(className: string | undefined | null, options: ClassNameResolveOptions = {}): ClassNameResolveResult {
  const props: MutableStyleProps = {}
  const diagnostics: ClassNameDiagnostic[] = []
  if (!className) return { props, diagnostics }

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

  return { props, diagnostics }
}

/** @public */
export function mergeClassNameProps<T extends Record<string, unknown>>(props: T, className?: string | null): T & VexartStyleProps {
  const resolved = resolveClassName(className).props
  return { ...resolved, ...props }
}
