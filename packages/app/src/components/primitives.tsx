import type { JSX } from "solid-js"

/** @public */
export type ClassNameProps = {
  className?: string
  children?: JSX.Element
}

/** @public */
export type AppBoxProps = import("@vexart/engine").TGEProps & ClassNameProps
/** @public */
export type AppTextProps = import("@vexart/engine").TGEProps & ClassNameProps

/** @public */
export function Box(props: AppBoxProps) {
  return <box {...props} />
}

/** @public */
export function Text(props: AppTextProps) {
  return <text {...props} />
}
