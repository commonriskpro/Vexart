/**
 * Vexart Void — shadcn-inspired design system.
 * Type declarations matching @vexart/styled public API.
 */

import type { JSX } from "solid-js"
import type { PressEvent } from "./engine"
import type {
  ComboboxOption,
  RadioOption,
  SelectOption,
  TableColumn,
  TabItem,
  ToastInput,
  ToastPosition,
  ToasterHandle,
} from "./components"

// ── Shadow / Glow ──

export type Shadow = { x: number; y: number; blur: number; color: number }
export type Glow = { radius: number; color: number; intensity?: number }

// ── Tokens ──

export declare const colors: {
  readonly background: string
  readonly foreground: string
  readonly card: string
  readonly cardForeground: string
  readonly popover: string
  readonly popoverForeground: string
  readonly primary: string
  readonly primaryForeground: string
  readonly secondary: string
  readonly secondaryForeground: string
  readonly muted: string
  readonly mutedForeground: string
  readonly accent: string
  readonly accentForeground: string
  readonly destructive: string
  readonly destructiveForeground: string
  readonly border: string
  readonly input: string
  readonly ring: string
  readonly ringSubtle: string
  readonly transparent: string
}

export declare const radius: {
  readonly sm: number
  readonly md: number
  readonly lg: number
  readonly xl: number
  readonly xxl: number
  readonly full: 9999
}

export declare const space: {
  readonly px: 1
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
  readonly normal: 400
  readonly medium: 500
  readonly semibold: 600
  readonly bold: 700
}

export declare const shadows: Record<"xs" | "sm" | "md" | "lg" | "xl", Shadow[]>

export declare const glows: Record<"ring" | "destructive" | "success", Glow>

export declare const theme: {
  readonly colors: typeof colors
  readonly radius: typeof radius
  readonly space: typeof space
  readonly font: typeof font
  readonly weight: typeof weight
  readonly shadows: typeof shadows
  readonly glows: typeof glows
}

export type VoidTheme = typeof theme

// ── Theme ──

export type ColorTokens = {
  [K in keyof typeof colors]: string
}

export type ThemeDefinition = {
  colors: Partial<ColorTokens>
}

export declare function createTheme(overrides?: ThemeDefinition): Required<ThemeDefinition>
export declare const darkTheme: Required<ThemeDefinition>
export declare const lightTheme: Required<ThemeDefinition>
export declare function setTheme(theme: Required<ThemeDefinition>): void
export declare function getTheme(): Required<ThemeDefinition>
export declare const themeColors: ColorTokens
export declare function ThemeProvider(props: { theme?: Required<ThemeDefinition>; children?: JSX.Element }): JSX.Element
export declare function useTheme(): { colors: ColorTokens; setTheme: (theme: Required<ThemeDefinition>) => void }

// ── Typography ──

export interface TypographyProps {
  children?: any
  color?: string | number
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

// ── Avatar ──

export type AvatarSize = "sm" | "default" | "lg"

export interface AvatarProps {
  name: string
  size?: AvatarSize
  color?: string | number
}

export declare function Avatar(props: AvatarProps): JSX.Element

// ── Badge ──

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

export interface BadgeProps {
  variant?: BadgeVariant
  children?: any
}

export declare function Badge(props: BadgeProps): JSX.Element

// ── Button ──

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link"
export type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg"

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  onPress?: (event?: PressEvent) => void
  focusId?: string
  children?: any
}

export declare function Button(props: ButtonProps): JSX.Element

// ── Card ──

export interface CardProps { children?: any; size?: "default" | "sm" }
export interface CardHeaderProps { children?: any }
export interface CardTitleProps { children?: any }
export interface CardDescriptionProps { children?: any }
export interface CardContentProps { children?: any }
export interface CardFooterProps { children?: any }
export interface CardActionProps { children?: any }

export declare function Card(props: CardProps): JSX.Element
export declare function CardHeader(props: CardHeaderProps): JSX.Element
export declare function CardTitle(props: CardTitleProps): JSX.Element
export declare function CardDescription(props: CardDescriptionProps): JSX.Element
export declare function CardContent(props: CardContentProps): JSX.Element
export declare function CardFooter(props: CardFooterProps): JSX.Element
export declare function CardAction(props: CardActionProps): JSX.Element

// ── Separator ──

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical"
}

export declare function Separator(props: SeparatorProps): JSX.Element

// ── Skeleton ──

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  cornerRadius?: number
}

export declare function Skeleton(props: SkeletonProps): JSX.Element

// ── VoidCheckbox ──

export type VoidCheckboxProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  focusId?: string
}

export declare function VoidCheckbox(props: VoidCheckboxProps): JSX.Element

// ── VoidCombobox ──

export type VoidComboboxProps = {
  value?: string
  onChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
  filter?: (option: ComboboxOption, query: string) => boolean
}

export declare function VoidCombobox(props: VoidComboboxProps): JSX.Element

// ── VoidDialog ──

export type VoidDialogProps = {
  onClose?: () => void
  width?: number
  maxWidth?: number
  children?: any
}

export type VoidDialogTitleProps = { children?: any }
export type VoidDialogDescriptionProps = { children?: any }
export type VoidDialogFooterProps = { children?: any }

export declare const VoidDialog: ((props: VoidDialogProps) => JSX.Element) & {
  Title: (props: VoidDialogTitleProps) => JSX.Element
  Description: (props: VoidDialogDescriptionProps) => JSX.Element
  Footer: (props: VoidDialogFooterProps) => JSX.Element
}

export declare function VoidDialogTitle(props: VoidDialogTitleProps): JSX.Element
export declare function VoidDialogDescription(props: VoidDialogDescriptionProps): JSX.Element
export declare function VoidDialogFooter(props: VoidDialogFooterProps): JSX.Element

// ── VoidDropdownMenu ──

export type VoidDropdownMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children?: JSX.Element
}

export type VoidDropdownMenuTriggerProps = { children?: JSX.Element }

export type VoidDropdownMenuContentProps = {
  children?: JSX.Element
  width?: number | string
  minWidth?: number
  maxHeight?: number
  sideOffset?: number
}

export type VoidDropdownMenuItemProps = {
  onSelect?: () => void
  variant?: "default" | "destructive"
  disabled?: boolean
  inset?: boolean
  children?: JSX.Element
}

export type VoidDropdownMenuLabelProps = {
  children?: JSX.Element
  inset?: boolean
}

export declare const VoidDropdownMenu: ((props: VoidDropdownMenuProps) => JSX.Element) & {
  Trigger: (props: VoidDropdownMenuTriggerProps) => JSX.Element
  Content: (props: VoidDropdownMenuContentProps) => JSX.Element
  Item: (props: VoidDropdownMenuItemProps) => JSX.Element
  Separator: () => JSX.Element
  Label: (props: VoidDropdownMenuLabelProps) => JSX.Element
}

export declare function VoidDropdownMenuTrigger(props: VoidDropdownMenuTriggerProps): JSX.Element
export declare function VoidDropdownMenuContent(props: VoidDropdownMenuContentProps): JSX.Element
export declare function VoidDropdownMenuItem(props: VoidDropdownMenuItemProps): JSX.Element
export declare function VoidDropdownMenuSeparator(): JSX.Element
export declare function VoidDropdownMenuLabel(props: VoidDropdownMenuLabelProps): JSX.Element

// ── VoidInput ──

export type VoidInputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
}

export declare function VoidInput(props: VoidInputProps): JSX.Element

// ── VoidPopover ──

export type VoidPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: JSX.Element
  children: JSX.Element
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
  width?: number | string
}

export declare function VoidPopover(props: VoidPopoverProps): JSX.Element

// ── VoidProgress ──

export type VoidProgressProps = {
  value: number
  max?: number
  width?: number | string
  height?: number
}

export declare function VoidProgress(props: VoidProgressProps): JSX.Element

// ── VoidRadioGroup ──

export type VoidRadioGroupProps = {
  value?: string
  onChange?: (value: string) => void
  options: RadioOption[]
  disabled?: boolean
  focusId?: string
  direction?: "column" | "row"
}

export declare function VoidRadioGroup(props: VoidRadioGroupProps): JSX.Element

// ── VoidSelect ──

export type VoidSelectProps = {
  value?: string
  onChange?: (value: string) => void
  options?: SelectOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
  children?: any
}

export declare function VoidSelect(props: VoidSelectProps): JSX.Element

// ── VoidSlider ──

export type VoidSliderProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  largeStep?: number
  disabled?: boolean
  focusId?: string
  width?: number | string
  showValue?: boolean
}

export declare function VoidSlider(props: VoidSliderProps): JSX.Element

// ── VoidSwitch ──

export type VoidSwitchProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  focusId?: string
}

export declare function VoidSwitch(props: VoidSwitchProps): JSX.Element

// ── VoidTable ──

export type VoidTableProps = {
  columns: TableColumn[]
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean
  striped?: boolean
  disabled?: boolean
  focusId?: string
}

export declare function VoidTable(props: VoidTableProps): JSX.Element

// ── VoidTabs ──

export type TabsVariant = "default" | "line"

export type VoidTabsProps = {
  activeTab: number
  onTabChange?: (index: number) => void
  tabs: TabItem[]
  variant?: TabsVariant
  focusId?: string
}

export declare function VoidTabs(props: VoidTabsProps): JSX.Element

// ── VoidTooltip ──

export type VoidTooltipProps = {
  content: string
  children: JSX.Element
  showDelay?: number
  hideDelay?: number
  disabled?: boolean
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
}

export declare function VoidTooltip(props: VoidTooltipProps): JSX.Element

// ── Toast ──

export type VoidToasterOptions = {
  position?: ToastPosition
  maxVisible?: number
  defaultDuration?: number
}

export declare function createVoidToaster(options?: VoidToasterOptions): ToasterHandle
