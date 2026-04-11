/**
 * Box — primary layout container for TGE.
 *
 * Renders a `<box>` intrinsic element with layout, background, border, and shadow.
 * This is a thin wrapper that provides typed props and sensible defaults.
 *
 * Usage:
 *   <Box padding={16} backgroundColor="#16213e" cornerRadius={12}>
 *     <Text color="#e0e0e0">Hello</Text>
 *   </Box>
 */

import type { Shadow } from "@tge/tokens"
import type { JSX } from "solid-js"

export type BoxProps = {
  // Layout
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"

  // Sizing
  width?: number | string
  height?: number | string

  // Visual
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number

  // Shadow (future — paint-bridge will handle)
  shadow?: Shadow

  // Compositing — promotes this Box to its own rendering layer.
  // Only dirty layers retransmit — unchanged layers stay in GPU VRAM.
  layer?: boolean

  // Children
  children?: JSX.Element
}

export function Box(props: BoxProps) {
  return (
    <box
      direction={props.direction}
      padding={props.padding}
      paddingX={props.paddingX}
      paddingY={props.paddingY}
      gap={props.gap}
      alignX={props.alignX}
      alignY={props.alignY}
      width={props.width}
      height={props.height}
      backgroundColor={props.backgroundColor}
      cornerRadius={props.cornerRadius}
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      layer={props.layer}
    >
      {props.children}
    </box>
  )
}
