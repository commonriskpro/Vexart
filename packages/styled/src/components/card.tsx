/**
 * VoidCard — styled card composition using Void design tokens.
 *
 * @public
 */

import { radius, space, font, weight, shadows } from "../tokens/tokens"
import { children as resolveChildren } from "solid-js"
import type { JSX } from "solid-js"
import { themeColors } from "../theme/theme"

// ── VoidCard ──

/** @public */
export interface VoidCardProps {
  children?: JSX.Element
  size?: "default" | "sm"
  className?: string
}

/** @public */
export function VoidCard(props: VoidCardProps) {
  const sm = props.size === "sm"
  const content = resolveChildren(() => props.children)
  return (
    <box
      className={props.className}
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

// ── VoidCardHeader ──

/** @public */
export interface VoidCardHeaderProps {
  children?: JSX.Element
  className?: string
}

/** @public */
export function VoidCardHeader(props: VoidCardHeaderProps) {
  const content = resolveChildren(() => props.children)
  return (
    <box
      className={props.className}
      direction="column"
      gap={space[1.5]}
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {content}
    </box>
  )
}

// ── VoidCardTitle ──

/** @public */
export interface VoidCardTitleProps {
  children?: JSX.Element
  className?: string
}

/** @public */
export function VoidCardTitle(props: VoidCardTitleProps) {
  const content = resolveChildren(() => props.children)
  return (
    <text
      className={props.className}
      color={themeColors.cardForeground}
      fontSize={font.base}
      fontWeight={weight.semibold}
      lineHeight={1}
    >
      {content}
    </text>
  )
}

// ── VoidCardDescription ──

/** @public */
export interface VoidCardDescriptionProps {
  children?: JSX.Element
  className?: string
}

/** @public */
export function VoidCardDescription(props: VoidCardDescriptionProps) {
  const content = resolveChildren(() => props.children)
  return (
    <text
      className={props.className}
      color={themeColors.mutedForeground}
      fontSize={font.sm}
    >
      {content}
    </text>
  )
}

// ── VoidCardContent ──

/** @public */
export interface VoidCardContentProps {
  children?: JSX.Element
  className?: string
}

/** @public */
export function VoidCardContent(props: VoidCardContentProps) {
  const content = resolveChildren(() => props.children)
  return (
    <box
      className={props.className}
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {content}
    </box>
  )
}

// ── VoidCardFooter ──

/** @public */
export interface VoidCardFooterProps {
  children?: JSX.Element
  className?: string
}

/** @public */
export function VoidCardFooter(props: VoidCardFooterProps) {
  const content = resolveChildren(() => props.children)
  return (
    <box
      className={props.className}
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

// ── VoidCardAction ──
// Positioned top-right, for buttons or icon actions on the card header.

/** @public */
export interface VoidCardActionProps {
  children?: JSX.Element
  className?: string
}

/** @public */
export function VoidCardAction(props: VoidCardActionProps) {
  const content = resolveChildren(() => props.children)
  return (
    <box className={props.className} alignX="right" alignY="top">
      {content}
    </box>
  )
}
