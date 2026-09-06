import { splitProps, untrack } from "solid-js"
import type { JSX } from "solid-js"
import type { InteractiveStyleProps } from "@vexart/engine"
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

/** @public */
export function Box(props: AppBoxProps) {
  // splitProps preserves SolidJS reactivity — no destructuring
  const [local, rest] = splitProps(props, ["className", "children"])
  const resolved = resolveClassName(local.className).props
  // Deep-merge interactive styles instead of overwriting
  const merged = {
    ...resolved,
    ...rest,
    hoverStyle: mergeInteractiveStyle(resolved.hoverStyle as InteractiveStyleProps, rest.hoverStyle),
    activeStyle: mergeInteractiveStyle(resolved.activeStyle as InteractiveStyleProps, rest.activeStyle),
    focusStyle: mergeInteractiveStyle(resolved.focusStyle as InteractiveStyleProps, rest.focusStyle),
  }
  const content = untrack(() => local.children)
  return <box {...merged}>{content}</box>
}

/** @public */
export function Text(props: AppTextProps) {
  const [local, rest] = splitProps(props, ["className", "children"])
  const resolved = resolveClassName(local.className).props
  const merged = { ...resolved, ...rest }
  const content = untrack(() => local.children)
  return <text {...merged}>{content}</text>
}
