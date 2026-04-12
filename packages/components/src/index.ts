/**
 * @tge/components — Built-in JSX components.
 *
 * Layout:
 * - <Box> — container with flex layout, bg, border, shadow
 * - <Text> — text with color and font settings
 * - <ScrollView> — scrollable container with clipping
 *
 * Interactive:
 * - <Button> — push button with focus, variants, disabled
 * - <Checkbox> — toggleable checkbox with label
 * - <Tabs> — tab switcher with panel content
 * - <List> — selectable list with up/down navigation
 *
 * Visual:
 * - <ProgressBar> — horizontal fill indicator
 */

export { Box } from "./box"
export { Text } from "./text"
export { ScrollView } from "./scroll-view"
export { Button } from "./button"
export { ProgressBar } from "./progress-bar"
export { Checkbox } from "./checkbox"
export { Tabs } from "./tabs"
export { List } from "./list"
export { Input } from "./input"
export { Textarea } from "./textarea"
export { RichText, Span } from "./rich-text"
export { Portal } from "./portal"
export { Code } from "./code"
export { Markdown } from "./markdown"
export { WrapRow } from "./wrap-row"
export { Diff } from "./diff"
export { Dialog } from "./dialog"
export { Select } from "./select"
export { Switch } from "./switch"
export { RadioGroup } from "./radio-group"
export { createToaster } from "./toast"
export { Table } from "./table"
export { Router, Route, NavigationStack, useRouterContext, useStack } from "./router"
export type { BoxProps, ShadowConfig, GlowConfig } from "./box"
export type { TextProps } from "./text"
export type { ScrollViewProps } from "./scroll-view"
// Re-export ScrollHandle from renderer for convenience
export type { ScrollHandle } from "@tge/renderer/scroll"
export type { ButtonProps, ButtonRenderContext } from "./button"
export type { SwitchRenderContext } from "./switch"
export type { RadioOptionContext } from "./radio-group"
export type { SelectTriggerContext, SelectOptionContext } from "./select"
export type { TableCellContext } from "./table"
export type { ProgressBarProps } from "./progress-bar"
export type { CheckboxProps } from "./checkbox"
export type { TabsProps, TabItem } from "./tabs"
export type { ListProps } from "./list"
export type { InputProps } from "./input"
export type { TextareaProps, TextareaHandle, TextareaTheme, VisualCursor, KeyBinding } from "./textarea"
export type { RichTextProps, SpanProps } from "./rich-text"
export type { PortalProps } from "./portal"
export type { CodeProps, CodeTheme } from "./code"
export type { MarkdownProps, MarkdownTheme } from "./markdown"
export type { WrapRowProps } from "./wrap-row"
export type { DiffProps, DiffTheme } from "./diff"
export type { DialogProps, DialogOverlayProps, DialogContentProps, DialogCloseProps } from "./dialog"
export type { SelectProps, SelectOption, SelectTriggerProps, SelectContentProps, SelectItemProps } from "./select"
export type { SwitchProps } from "./switch"
export type { RadioGroupProps, RadioOption } from "./radio-group"
export type { ToastVariant, ToastPosition, ToastData, ToastInput, ToasterOptions, ToasterHandle } from "./toast"
export type { TableProps, TableColumn } from "./table"
export type { RouterProps, RouteComponentProps, NavigationStackProps } from "./router"
