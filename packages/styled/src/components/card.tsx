/**
 * Card — styled card composition using Void design tokens.
 *
 * @public
 */

import { radius, space, font, weight, shadows } from "../tokens/tokens"
import { untrack } from "solid-js"
import type { JSX } from "solid-js"
import { themeColors } from "../theme/theme"

// ── Card ──

/** @public */
export interface CardProps {
  children?: JSX.Element
  size?: "default" | "sm"
}

/** @public */
export function Card(props: CardProps) {
  const sm = props.size === "sm"
  const content = untrack(() => props.children)
  return (
    <box
      direction="column"
      gap={sm ? space[4] : space[6]}
      backgroundColor={themeColors.card}
      cornerRadius={radius.xl}
      borderWidth={1}
      borderColor={themeColors.border}
      paddingTop={sm ? space[4] : space[6]}
      paddingBottom={sm ? space[4] : space[6]}
      shadow={shadows.md}
    >
      {content}
    </box>
  )
}

// ── CardHeader ──

/** @public */
export interface CardHeaderProps {
  children?: JSX.Element
}

/** @public */
export function CardHeader(props: CardHeaderProps) {
  const content = untrack(() => props.children)
  return (
    <box
      direction="column"
      gap={space[1.5]}
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {content}
    </box>
  )
}

// ── CardTitle ──

/** @public */
export interface CardTitleProps {
  children?: JSX.Element
}

/** @public */
export function CardTitle(props: CardTitleProps) {
  const content = untrack(() => props.children)
  return (
    <text
      color={themeColors.cardForeground}
      fontSize={font.base}
      fontWeight={weight.semibold}
      lineHeight={1}
    >
      {content}
    </text>
  )
}

// ── CardDescription ──

/** @public */
export interface CardDescriptionProps {
  children?: JSX.Element
}

/** @public */
export function CardDescription(props: CardDescriptionProps) {
  const content = untrack(() => props.children)
  return (
    <text
      color={themeColors.mutedForeground}
      fontSize={font.sm}
    >
      {content}
    </text>
  )
}

// ── CardContent ──

/** @public */
export interface CardContentProps {
  children?: JSX.Element
}

/** @public */
export function CardContent(props: CardContentProps) {
  const content = untrack(() => props.children)
  return (
    <box
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {content}
    </box>
  )
}

// ── CardFooter ──

/** @public */
export interface CardFooterProps {
  children?: JSX.Element
}

/** @public */
export function CardFooter(props: CardFooterProps) {
  const content = untrack(() => props.children)
  return (
    <box
      direction="row"
      alignY="center"
      gap={space[2]}
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {content}
    </box>
  )
}

// ── CardAction ──
// Positioned top-right, for buttons or icon actions on the card header.

/** @public */
export interface CardActionProps {
  children?: JSX.Element
}

/** @public */
export function CardAction(props: CardActionProps) {
  const content = untrack(() => props.children)
  return (
    <box alignX="right" alignY="top">
      {content}
    </box>
  )
}
