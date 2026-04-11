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
export type { BoxProps, ShadowConfig, GlowConfig } from "./box"
export type { TextProps } from "./text"
export type { ScrollViewProps } from "./scroll-view"
// Re-export ScrollHandle from renderer for convenience
export type { ScrollHandle } from "@tge/renderer/scroll"
export type { ButtonProps, ButtonVariant } from "./button"
export type { ProgressBarProps } from "./progress-bar"
export type { CheckboxProps } from "./checkbox"
export type { TabsProps, TabItem } from "./tabs"
export type { ListProps } from "./list"
export type { InputProps } from "./input"
export type { TextareaProps, TextareaHandle } from "./textarea"
export type { RichTextProps, SpanProps } from "./rich-text"
export type { PortalProps } from "./portal"
export type { CodeProps } from "./code"
