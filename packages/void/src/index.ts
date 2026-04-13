/**
 * tge/void — shadcn-inspired design system for TGE.
 *
 * Provides semantic tokens, primitive components with variants,
 * and typography presets for building premium terminal UIs.
 */

// ── Tokens ──
export { theme, colors, radius, space, font, weight, shadows } from "./tokens"
export type { VoidTheme } from "./tokens"

// ── Theming ──
export { createTheme, darkTheme, lightTheme, setTheme, getTheme, themeColors, ThemeProvider, useTheme } from "./theme"
export type { ThemeDefinition, ColorTokens } from "./theme"

// ── Components ──
export { Button } from "./button"
export type { ButtonProps } from "./button"

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card"
export type { CardProps, CardHeaderProps, CardTitleProps, CardDescriptionProps, CardContentProps, CardFooterProps } from "./card"

export { Badge } from "./badge"
export type { BadgeProps } from "./badge"

export { Separator } from "./separator"
export type { SeparatorProps } from "./separator"

export { Avatar } from "./avatar"
export type { AvatarProps } from "./avatar"

export { Skeleton } from "./skeleton"
export type { SkeletonProps } from "./skeleton"

// ── Typography ──
export { H1, H2, H3, H4, P, Lead, Large, Small, Muted } from "./typography"
export type { TypographyProps } from "./typography"

// ── Dialog ──
export { VoidDialog } from "./dialog"
export type { VoidDialogProps } from "./dialog"

// ── Select ──
export { VoidSelect } from "./select"
export type { VoidSelectProps } from "./select"

// ── Switch ──
export { VoidSwitch } from "./switch"
export type { VoidSwitchProps } from "./switch"

// ── RadioGroup ──
export { VoidRadioGroup } from "./radio-group"
export type { VoidRadioGroupProps } from "./radio-group"

// ── Toast ──
export { createVoidToaster } from "./toast"
export type { VoidToasterOptions } from "./toast"

// ── Table ──
export { VoidTable } from "./table"
export type { VoidTableProps } from "./table"

// ── Slider ──
export { VoidSlider } from "./slider"
export type { VoidSliderProps } from "./slider"

// ── Combobox ──
export { VoidCombobox } from "./combobox"
export type { VoidComboboxProps } from "./combobox"

// ── Tooltip ──
export { VoidTooltip } from "./tooltip"
export type { VoidTooltipProps } from "./tooltip"

// ── Popover ──
export { VoidPopover } from "./popover"
export type { VoidPopoverProps } from "./popover"
