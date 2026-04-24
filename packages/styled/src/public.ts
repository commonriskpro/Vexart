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
export type { VoidTheme, Shadow, Glow } from "./tokens/tokens"

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
export type { AvatarProps, AvatarSize } from "./components/avatar"

export { Badge } from "./components/badge"
export type { BadgeProps, BadgeVariant } from "./components/badge"

export { Button } from "./components/button"
export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/button"

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
export type { ComboboxOption } from "@vexart/headless"

export { VoidDialog, VoidDialogTitle, VoidDialogDescription, VoidDialogFooter } from "./components/dialog"
export type {
  VoidDialogProps,
  VoidDialogTitleProps,
  VoidDialogDescriptionProps,
  VoidDialogFooterProps,
} from "./components/dialog"

export {
  VoidDropdownMenu,
  VoidDropdownMenuTrigger,
  VoidDropdownMenuContent,
  VoidDropdownMenuItem,
  VoidDropdownMenuSeparator,
  VoidDropdownMenuLabel,
} from "./components/dropdown-menu"
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
export type { RadioOption } from "@vexart/headless"

export { VoidSelect } from "./components/select"
export type { VoidSelectProps } from "./components/select"
export type { SelectOption } from "@vexart/headless"

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
export type { TableColumn } from "@vexart/headless"

export { VoidTabs } from "./components/tabs"
export type { VoidTabsProps, TabsVariant } from "./components/tabs"
export type { TabItem } from "@vexart/headless"

export { createVoidToaster } from "./components/toast"
export type { VoidToasterOptions } from "./components/toast"
export type { ToastInput, ToastPosition, ToasterHandle } from "@vexart/headless"

export { VoidTooltip } from "./components/tooltip"
export type { VoidTooltipProps } from "./components/tooltip"
