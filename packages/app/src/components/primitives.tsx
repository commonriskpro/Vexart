import type { JSX } from "solid-js"
import type { TGEProps } from "@vexart/engine"
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

function propsWithClassName<T extends TGEProps>(props: T & ClassNameProps): TGEProps {
  const resolved = resolveClassName(props.className).props
  const { className: _className, children: _children, ...rest } = props
  return { ...resolved, ...rest }
}

/** @public */
export function Box(props: AppBoxProps) {
  return <box {...propsWithClassName(props)}>{props.children}</box>
}

/** @public */
export function Text(props: AppTextProps) {
  return <text {...propsWithClassName(props)}>{props.children}</text>
}
