import { children as resolveChildren, splitProps } from "solid-js"
import type { JSX } from "solid-js"
import type { InteractiveStyleProps, TGEProps } from "@vexart/engine"
import { resolveClassName } from "../styles/class-name"

/** @public */
export type ClassNameProps = {
  className?: string
  children?: JSX.Element
}

/** @public */
export type AppBoxProps = import("@vexart/engine").TGEProps & ClassNameProps
/** @public */
export type AppTextProps = import("@vexart/engine").TGEProps & ClassNameProps

function mergeInteractiveStyle(
  resolved: InteractiveStyleProps | undefined,
  explicit: InteractiveStyleProps | undefined,
): InteractiveStyleProps | undefined {
  if (!resolved && !explicit) return undefined
  if (!resolved) return explicit
  if (!explicit) return resolved
  return { ...resolved, ...explicit }
}

function preserveRemovedProps(next: Record<string, unknown>, previous: Set<string>) {
  for (const key of previous) {
    if (!(key in next)) next[key] = undefined
  }
  for (const key of Object.keys(next)) previous.add(key)
  return next
}

function resolvePrimitiveProps(
  className: string | undefined,
  style: Partial<TGEProps> | undefined,
  rest: Record<string, unknown>,
  hoverStyle: InteractiveStyleProps | undefined,
  activeStyle: InteractiveStyleProps | undefined,
  focusStyle: InteractiveStyleProps | undefined,
  previous: Set<string>,
) {
  const resolved = resolveClassName(className).props
  return preserveRemovedProps({
    ...resolved,
    ...(style ?? {}),
    ...rest,
    hoverStyle: mergeInteractiveStyle(
      mergeInteractiveStyle(resolved.hoverStyle as InteractiveStyleProps, style?.hoverStyle as InteractiveStyleProps),
      hoverStyle,
    ),
    activeStyle: mergeInteractiveStyle(
      mergeInteractiveStyle(resolved.activeStyle as InteractiveStyleProps, style?.activeStyle as InteractiveStyleProps),
      activeStyle,
    ),
    focusStyle: mergeInteractiveStyle(
      mergeInteractiveStyle(resolved.focusStyle as InteractiveStyleProps, style?.focusStyle as InteractiveStyleProps),
      focusStyle,
    ),
  }, previous)
}

/** @public */
export function Box(props: AppBoxProps) {
  // Keep every prop read inside this accessor. Object-spreading a Solid props
  // proxy in the component body eagerly snapshots signal-backed visuals.
  const [local, rest] = splitProps(props, ["className", "children", "style", "hoverStyle", "activeStyle", "focusStyle"])
  const content = resolveChildren(() => local.children)
  const previous = new Set<string>()
  const visual = () => resolvePrimitiveProps(local.className, local.style, rest as Record<string, unknown>, local.hoverStyle, local.activeStyle, local.focusStyle, previous)
  return <box {...visual()}>{content}</box>
}

/** @public */
export function Text(props: AppTextProps) {
  const [local, rest] = splitProps(props, ["className", "children", "style", "hoverStyle", "activeStyle", "focusStyle"])
  const content = resolveChildren(() => local.children)
  const previous = new Set<string>()
  const visual = () => resolvePrimitiveProps(local.className, local.style, rest as Record<string, unknown>, local.hoverStyle, local.activeStyle, local.focusStyle, previous)
  return <text {...visual()}>{content}</text>
}
