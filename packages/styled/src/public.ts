/**
 * @vexart/styled public API — explicit named exports.
 * NO `export *` — every export is intentional.
 */

// ── Tokens ────────────────────────────────────────────────────────────────────

export {
  colors,
  radius,
  space,
  font,
  weight,
  shadows,
  glows,
  theme,
} from "./tokens/tokens"
export type { VoidTheme } from "./tokens/tokens"

// ── Theme ─────────────────────────────────────────────────────────────────────

export {
  createTheme,
  darkTheme,
  lightTheme,
  themeColors,
  setTheme,
  getTheme,
  ThemeProvider,
  useTheme,
} from "./theme/theme"
export type { ColorTokens, ThemeDefinition } from "./theme/theme"

// ── Typography ────────────────────────────────────────────────────────────────

export { H1, H2, H3, H4, P, Lead, Large, Small, Muted } from "./typography/typography"
export type { TypographyProps } from "./typography/typography"

// ── Components ────────────────────────────────────────────────────────────────

export { Avatar } from "./components/avatar"
export type { AvatarProps } from "./components/avatar"

export { Badge } from "./components/badge"
export type { BadgeProps } from "./components/badge"

export { Button } from "./components/button"
export type { ButtonProps } from "./components/button"

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "./components/card"
export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
  CardActionProps,
} from "./components/card"

export { VoidCheckbox } from "./components/checkbox"
export type { VoidCheckboxProps } from "./components/checkbox"

export { VoidCombobox } from "./components/combobox"
export type { VoidComboboxProps } from "./components/combobox"

export { VoidDialog } from "./components/dialog"
export type {
  VoidDialogProps,
  VoidDialogTitleProps,
  VoidDialogDescriptionProps,
  VoidDialogFooterProps,
} from "./components/dialog"

export { VoidDropdownMenu } from "./components/dropdown-menu"
export type {
  VoidDropdownMenuProps,
  VoidDropdownMenuTriggerProps,
  VoidDropdownMenuContentProps,
  VoidDropdownMenuItemProps,
  VoidDropdownMenuLabelProps,
} from "./components/dropdown-menu"

export { VoidInput } from "./components/input"
export type { VoidInputProps } from "./components/input"

export { VoidPopover } from "./components/popover"
export type { VoidPopoverProps } from "./components/popover"

export { VoidProgress } from "./components/progress"
export type { VoidProgressProps } from "./components/progress"

export { VoidRadioGroup } from "./components/radio-group"
export type { VoidRadioGroupProps } from "./components/radio-group"

export { VoidSelect } from "./components/select"
export type { VoidSelectProps } from "./components/select"

export { Separator } from "./components/separator"
export type { SeparatorProps } from "./components/separator"

export { Skeleton } from "./components/skeleton"
export type { SkeletonProps } from "./components/skeleton"

export { VoidSlider } from "./components/slider"
export type { VoidSliderProps } from "./components/slider"

export { VoidSwitch } from "./components/switch"
export type { VoidSwitchProps } from "./components/switch"

export { VoidTable } from "./components/table"
export type { VoidTableProps } from "./components/table"

export { VoidTabs } from "./components/tabs"
export type { VoidTabsProps } from "./components/tabs"

export { createVoidToaster } from "./components/toast"
export type { VoidToasterOptions } from "./components/toast"

export { VoidTooltip } from "./components/tooltip"
export type { VoidTooltipProps } from "./components/tooltip"
