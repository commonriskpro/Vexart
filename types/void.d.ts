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

// ── Theming ──

export interface ThemeDefinition {
  background?: string
  foreground?: string
  card?: string
  cardForeground?: string
  popover?: string
  popoverForeground?: string
  primary?: string
  primaryForeground?: string
  secondary?: string
  secondaryForeground?: string
  muted?: string
  mutedForeground?: string
  accent?: string
  accentForeground?: string
  destructive?: string
  destructiveForeground?: string
  border?: string
  input?: string
  ring?: string
}

export interface ColorTokens {
  background: { valueOf(): number; toString(): string }
  foreground: { valueOf(): number; toString(): string }
  card: { valueOf(): number; toString(): string }
  cardForeground: { valueOf(): number; toString(): string }
  popover: { valueOf(): number; toString(): string }
  popoverForeground: { valueOf(): number; toString(): string }
  primary: { valueOf(): number; toString(): string }
  primaryForeground: { valueOf(): number; toString(): string }
  secondary: { valueOf(): number; toString(): string }
  secondaryForeground: { valueOf(): number; toString(): string }
  muted: { valueOf(): number; toString(): string }
  mutedForeground: { valueOf(): number; toString(): string }
  accent: { valueOf(): number; toString(): string }
  accentForeground: { valueOf(): number; toString(): string }
  destructive: { valueOf(): number; toString(): string }
  destructiveForeground: { valueOf(): number; toString(): string }
  border: { valueOf(): number; toString(): string }
  input: { valueOf(): number; toString(): string }
  ring: { valueOf(): number; toString(): string }
}

export declare function createTheme(overrides: ThemeDefinition): Required<ThemeDefinition>
export declare const darkTheme: Required<ThemeDefinition>
export declare const lightTheme: Required<ThemeDefinition>
export declare function setTheme(theme: Required<ThemeDefinition>): void
export declare function getTheme(): Required<ThemeDefinition>
export declare const themeColors: ColorTokens
export declare function ThemeProvider(props: { theme?: Required<ThemeDefinition>; children?: JSX.Element }): JSX.Element
export declare function useTheme(): { colors: ColorTokens; setTheme: (theme: Required<ThemeDefinition>) => void }

// ── Dialog ──

export interface VoidDialogProps {
  onClose?: () => void
  width?: number
  maxWidth?: number
  children?: JSX.Element
}

export declare function VoidDialog(props: VoidDialogProps): JSX.Element
export declare namespace VoidDialog {
  function Title(props: { children?: JSX.Element }): JSX.Element
  function Description(props: { children?: JSX.Element }): JSX.Element
  function Footer(props: { children?: JSX.Element }): JSX.Element
}

// ── Select ──

export interface VoidSelectProps {
  value?: string
  onChange?: (value: string) => void
  options?: Array<{ value: string; label: string; disabled?: boolean }>
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
  children?: JSX.Element
}

export declare function VoidSelect(props: VoidSelectProps): JSX.Element
export declare namespace VoidSelect {
  function Trigger(props: { children?: JSX.Element }): JSX.Element
  function Content(props: { children?: JSX.Element }): JSX.Element
  function Item(props: { value: string; disabled?: boolean; children?: JSX.Element }): JSX.Element
}

// ── Switch ──

export interface VoidSwitchProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  focusId?: string
}

export declare function VoidSwitch(props: VoidSwitchProps): JSX.Element

// ── RadioGroup ──

export interface VoidRadioGroupProps {
  value?: string
  onChange?: (value: string) => void
  options: Array<{ value: string; label: string; disabled?: boolean }>
  disabled?: boolean
  focusId?: string
  direction?: "column" | "row"
}

export declare function VoidRadioGroup(props: VoidRadioGroupProps): JSX.Element

// ── Toast ──

export interface VoidToasterOptions {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center"
  maxVisible?: number
  defaultDuration?: number
}

export declare function createVoidToaster(options?: VoidToasterOptions): {
  toast: (input: string | { message: string; variant?: string; duration?: number; description?: string }) => number
  dismiss: (id: number) => void
  dismissAll: () => void
  Toaster: () => JSX.Element
}

// ── Table ──

export interface VoidTableProps {
  columns: Array<{ key: string; header: string; width?: number | "grow"; align?: "left" | "center" | "right" }>
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean
  striped?: boolean
  disabled?: boolean
  focusId?: string
  renderCell?: (value: any, column: any, rowIndex: number) => JSX.Element
}

export declare function VoidTable(props: VoidTableProps): JSX.Element
