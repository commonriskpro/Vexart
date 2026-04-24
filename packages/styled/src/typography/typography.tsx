/**
 * Typography — shadcn-compatible text presets.
 *
 * H1, H2, H3, H4, P, Lead, Large, Small, Muted
 */

import { font, weight } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export interface TypographyProps {
  children?: any
  color?: string | number
}

/** @public */
export function H1(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font["4xl"]}
      fontWeight={weight.bold}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function H2(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font["3xl"]}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function H3(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font.xl}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function H4(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font.lg}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function P(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font.base}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function Lead(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.mutedForeground}
      fontSize={font.xl}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function Large(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font.lg}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function Small(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.foreground}
      fontSize={font.sm}
      fontWeight={weight.medium}
    >
      {props.children}
    </text>
  )
}

/** @public */
export function Muted(props: TypographyProps) {
  return (
    <text
      color={props.color ?? themeColors.mutedForeground}
      fontSize={font.sm}
    >
      {props.children}
    </text>
  )
}
