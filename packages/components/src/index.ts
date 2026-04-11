/**
 * @tge/components — Built-in JSX components.
 *
 * Typed wrapper components for TGE rendering:
 * - <Box> — container with flex layout, bg, border, shadow
 * - <Text> — text with color and font settings
 *
 * These are thin wrappers over the intrinsic <box> and <text> elements,
 * providing typed props interfaces and sensible defaults.
 */

export { Box } from "./box"
export { Text } from "./text"
export type { BoxProps } from "./box"
export type { TextProps } from "./text"
