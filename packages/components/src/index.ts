/**
 * @tge/components — Built-in JSX components.
 *
 * Typed wrapper components for TGE rendering:
 * - <Box> — container with flex layout, bg, border, shadow
 * - <Text> — text with color and font settings
 * - <ScrollView> — scrollable container with clipping
 *
 * These are thin wrappers over the intrinsic <box> and <text> elements,
 * providing typed props interfaces and sensible defaults.
 */

export { Box } from "./box"
export { Text } from "./text"
export { ScrollView } from "./scroll-view"
export type { BoxProps } from "./box"
export type { TextProps } from "./text"
export type { ScrollViewProps } from "./scroll-view"
