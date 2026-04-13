/**
 * Card — shadcn-compatible card composition.
 *
 * Composition:
 *   Card
 *   ├── CardHeader
 *   │   ├── CardTitle
 *   │   └── CardDescription
 *   ├── CardContent
 *   └── CardFooter
 */

import { radius, space, font, weight, shadows } from "./tokens"
import { themeColors } from "./theme"

// ── Card ──

export interface CardProps {
  children?: any
  size?: "default" | "sm"
}

export function Card(props: CardProps) {
  const sm = props.size === "sm"
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
      {props.children}
    </box>
  )
}

// ── CardHeader ──

export interface CardHeaderProps {
  children?: any
}

export function CardHeader(props: CardHeaderProps) {
  return (
    <box
      direction="column"
      gap={space[1.5]}
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {props.children}
    </box>
  )
}

// ── CardTitle ──

export interface CardTitleProps {
  children?: any
}

export function CardTitle(props: CardTitleProps) {
  return (
    <text
      color={themeColors.cardForeground}
      fontSize={font.base}
      fontWeight={weight.semibold}
      lineHeight={1}
    >
      {props.children}
    </text>
  )
}

// ── CardDescription ──

export interface CardDescriptionProps {
  children?: any
}

export function CardDescription(props: CardDescriptionProps) {
  return (
    <text
      color={themeColors.mutedForeground}
      fontSize={font.sm}
    >
      {props.children}
    </text>
  )
}

// ── CardContent ──

export interface CardContentProps {
  children?: any
}

export function CardContent(props: CardContentProps) {
  return (
    <box
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {props.children}
    </box>
  )
}

// ── CardFooter ──

export interface CardFooterProps {
  children?: any
}

export function CardFooter(props: CardFooterProps) {
  return (
    <box
      direction="row"
      alignY="center"
      gap={space[2]}
      paddingLeft={space[6]}
      paddingRight={space[6]}
    >
      {props.children}
    </box>
  )
}

// ── CardAction ──
// Positioned top-right, for buttons or icon actions on the card header.

export interface CardActionProps {
  children?: any
}

export function CardAction(props: CardActionProps) {
  return (
    <box alignX="right" alignY="top">
      {props.children}
    </box>
  )
}
