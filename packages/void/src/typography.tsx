/**
 * Typography — shadcn-compatible text presets.
 *
 * H1, H2, H3, H4, P, Lead, Large, Small, Muted
 */

import { colors, font, weight } from "./tokens"

export interface TypographyProps {
  children?: any
  color?: string | number
}

export function H1(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font["4xl"]}
      fontWeight={weight.bold}
    >
      {props.children}
    </text>
  )
}

export function H2(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font["3xl"]}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

export function H3(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font.xl}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

export function H4(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font.lg}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

export function P(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font.base}
    >
      {props.children}
    </text>
  )
}

export function Lead(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.mutedForeground}
      fontSize={font.xl}
    >
      {props.children}
    </text>
  )
}

export function Large(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font.lg}
      fontWeight={weight.semibold}
    >
      {props.children}
    </text>
  )
}

export function Small(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.foreground}
      fontSize={font.sm}
      fontWeight={weight.medium}
    >
      {props.children}
    </text>
  )
}

export function Muted(props: TypographyProps) {
  return (
    <text
      color={props.color ?? colors.mutedForeground}
      fontSize={font.sm}
    >
      {props.children}
    </text>
  )
}
