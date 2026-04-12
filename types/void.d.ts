/**
 * tge/void — shadcn-inspired design system for TGE.
 * Type declarations.
 */

import type { JSX } from "solid-js"

// ── Tokens ──

export declare const colors: {
  readonly background: number
  readonly foreground: number
  readonly card: number
  readonly cardForeground: number
  readonly popover: number
  readonly popoverForeground: number
  readonly primary: number
  readonly primaryForeground: number
  readonly secondary: number
  readonly secondaryForeground: number
  readonly muted: number
  readonly mutedForeground: number
  readonly accent: number
  readonly accentForeground: number
  readonly destructive: number
  readonly destructiveForeground: number
  readonly border: number
  readonly input: number
  readonly ring: number
  readonly transparent: number
}

export declare const radius: {
  readonly sm: number
  readonly md: number
  readonly lg: number
  readonly xl: number
  readonly xxl: number
  readonly full: number
}

export declare const space: {
  readonly px: number
  readonly 0.5: number
  readonly 1: number
  readonly 1.5: number
  readonly 2: number
  readonly 2.5: number
  readonly 3: number
  readonly 3.5: number
  readonly 4: number
  readonly 5: number
  readonly 6: number
  readonly 7: number
  readonly 8: number
  readonly 9: number
  readonly 10: number
}

export declare const font: {
  readonly xs: number
  readonly sm: number
  readonly base: number
  readonly lg: number
  readonly xl: number
  readonly "2xl": number
  readonly "3xl": number
  readonly "4xl": number
}

export declare const weight: {
  readonly normal: number
  readonly medium: number
  readonly semibold: number
  readonly bold: number
}

export declare const shadows: {
  readonly sm: Array<{ x: number; y: number; blur: number; color: number }>
  readonly md: Array<{ x: number; y: number; blur: number; color: number }>
  readonly lg: Array<{ x: number; y: number; blur: number; color: number }>
  readonly xl: Array<{ x: number; y: number; blur: number; color: number }>
}

export interface VoidTheme {
  colors: typeof colors
  radius: typeof radius
  space: typeof space
  font: typeof font
  weight: typeof weight
  shadows: typeof shadows
}

export declare const theme: VoidTheme

// ── Button ──

export interface ButtonProps {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "xs" | "sm" | "default" | "lg"
  children?: JSX.Element
}

export declare function Button(props: ButtonProps): JSX.Element

// ── Card ──

export interface CardProps {
  size?: "default" | "sm"
  children?: JSX.Element
}

export interface CardHeaderProps { children?: JSX.Element }
export interface CardTitleProps { children?: JSX.Element }
export interface CardDescriptionProps { children?: JSX.Element }
export interface CardContentProps { children?: JSX.Element }
export interface CardFooterProps { children?: JSX.Element }

export declare function Card(props: CardProps): JSX.Element
export declare function CardHeader(props: CardHeaderProps): JSX.Element
export declare function CardTitle(props: CardTitleProps): JSX.Element
export declare function CardDescription(props: CardDescriptionProps): JSX.Element
export declare function CardContent(props: CardContentProps): JSX.Element
export declare function CardFooter(props: CardFooterProps): JSX.Element

// ── Badge ──

export interface BadgeProps {
  variant?: "default" | "secondary" | "outline" | "destructive"
  children?: JSX.Element
}

export declare function Badge(props: BadgeProps): JSX.Element

// ── Separator ──

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical"
}

export declare function Separator(props: SeparatorProps): JSX.Element

// ── Avatar ──

export interface AvatarProps {
  name: string
  size?: "sm" | "default" | "lg"
  color?: number
}

export declare function Avatar(props: AvatarProps): JSX.Element

// ── Skeleton ──

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  cornerRadius?: number
}

export declare function Skeleton(props: SkeletonProps): JSX.Element

// ── Typography ──

export interface TypographyProps {
  children?: JSX.Element
  color?: number
}

export declare function H1(props: TypographyProps): JSX.Element
export declare function H2(props: TypographyProps): JSX.Element
export declare function H3(props: TypographyProps): JSX.Element
export declare function H4(props: TypographyProps): JSX.Element
export declare function P(props: TypographyProps): JSX.Element
export declare function Lead(props: TypographyProps): JSX.Element
export declare function Large(props: TypographyProps): JSX.Element
export declare function Small(props: TypographyProps): JSX.Element
export declare function Muted(props: TypographyProps): JSX.Element
