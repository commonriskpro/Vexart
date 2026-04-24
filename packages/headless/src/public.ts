/**
 * @vexart/headless public API — explicit named exports.
 * NO `export *` — every export is intentional.
 */

// ── Inputs ────────────────────────────────────────────────────────────────────

export { Button } from "./inputs/button"
export type { ButtonRenderContext, ButtonProps } from "./inputs/button"

export { Checkbox } from "./inputs/checkbox"
export type { CheckboxRenderContext, CheckboxProps } from "./inputs/checkbox"

export { Combobox } from "./inputs/combobox"
export type {
  ComboboxOption,
  ComboboxInputContext,
  ComboboxOptionContext,
  ComboboxProps,
} from "./inputs/combobox"

export { Input } from "./inputs/input"
export type { InputRenderContext, InputProps } from "./inputs/input"

export { RadioGroup } from "./inputs/radio-group"
export type { RadioOption, RadioOptionContext, RadioGroupProps } from "./inputs/radio-group"

export { Select, SelectTrigger, SelectContent, SelectItem } from "./inputs/select"
export type {
  SelectOption,
  SelectTriggerContext,
  SelectOptionContext,
  SelectProps,
  SelectTriggerProps,
  SelectContentProps,
  SelectItemProps,
} from "./inputs/select"

export { Slider } from "./inputs/slider"
export type { SliderTrackProps, SliderRenderContext, SliderProps } from "./inputs/slider"

export { Switch } from "./inputs/switch"
export type { SwitchRenderContext, SwitchProps } from "./inputs/switch"

export { Textarea } from "./inputs/textarea"
export type {
  TextareaTheme,
  KeyBinding,
  VisualCursor,
  TextareaHandle,
  TextareaProps,
} from "./inputs/textarea"

// ── Display ───────────────────────────────────────────────────────────────────

export { Code } from "./display/code"
export type { CodeTheme, CodeProps } from "./display/code"

export { Markdown } from "./display/markdown"
export type { MarkdownTheme, MarkdownProps } from "./display/markdown"

export { ProgressBar } from "./display/progress-bar"
export type { ProgressBarRenderContext, ProgressBarProps } from "./display/progress-bar"

// ── Containers ────────────────────────────────────────────────────────────────

export { OverlayRoot } from "./containers/overlay-root"
export type { OverlayRootProps } from "./containers/overlay-root"

export { Portal } from "./containers/portal"
export type { PortalProps } from "./containers/portal"

export { ScrollView } from "./containers/scroll-view"
export type { ScrollViewProps } from "./containers/scroll-view"

export { Tabs } from "./containers/tabs"
export type { TabItem, TabRenderContext, TabsProps } from "./containers/tabs"

// ── Collections ───────────────────────────────────────────────────────────────

export { List } from "./collections/list"
export type { ListItemContext, ListProps } from "./collections/list"

export { Table } from "./collections/table"
export type { TableColumn, TableCellContext, TableProps } from "./collections/table"

export { VirtualList } from "./collections/virtual-list"
export type { VirtualListItemContext, VirtualListProps } from "./collections/virtual-list"

// ── Overlays ──────────────────────────────────────────────────────────────────

export { Dialog, DialogOverlay, DialogContent, DialogClose } from "./overlays/dialog"
export type {
  DialogProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogCloseProps,
} from "./overlays/dialog"

export { createToaster } from "./overlays/toast"
export type {
  ToastVariant,
  ToastPosition,
  ToastData,
  ToastInput,
  ToasterOptions,
  ToasterHandle,
} from "./overlays/toast"

export { Tooltip, Popover } from "./overlays/tooltip"
export type {
  TooltipProps,
  PopoverTriggerContext,
  PopoverProps,
} from "./overlays/tooltip"

// ── Navigation ────────────────────────────────────────────────────────────────

export { Diff } from "./navigation/diff"
export type { DiffTheme, DiffProps } from "./navigation/diff"

export { Router, Route, useRouterContext, NavigationStack, useStack } from "./navigation/router"
export type { RouterProps, RouteComponentProps, NavigationStackProps } from "./navigation/router"

// ── Re-exported engine contracts referenced by headless public types ─────────

export { ExtmarkManager } from "@vexart/engine"
export type {
  CreateExtmarkOptions,
  Extmark,
  NavigationStackHandle,
  NavigationEntry,
  NodeMouseEvent,
  Modifiers,
  RouteProps,
  RouterContextValue,
  ScreenEntry,
  ScreenProps,
  ScrollHandle,
  SimpleThemeRules,
  StyleDefinition,
  SyntaxStyle,
  ThemeTokenStyle,
  KeyEvent,
} from "@vexart/engine"

// ── Forms ─────────────────────────────────────────────────────────────────────

export { createForm } from "./forms/form"
export type {
  FieldValidator,
  AsyncFieldValidator,
  FormOptions,
  FieldState,
  FormHandle,
} from "./forms/form"

export type { KeyBindingAction } from "./inputs/textarea"
