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

import type { JSX } from "solid-js"

export type ShadowConfig = {
  x: number      // Horizontal offset (px)
  y: number      // Vertical offset (px)
  blur: number   // Blur radius (px)
  color: number  // Shadow color (packed RGBA u32)
}

export type GlowConfig = {
  radius: number     // Glow spread radius (px)
  color: number      // Glow color (packed RGBA u32)
  intensity?: number // 0-100, default 80
}

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

  // Effects — applied in the pixel paint stage, outside Clay.
  // Shadow: soft drop shadow beneath the box.
  shadow?: ShadowConfig
  // Glow: radial halo around the box.
  glow?: GlowConfig

  // Compositing — promotes this Box to its own rendering layer.
  // Only dirty layers retransmit — unchanged layers stay in GPU VRAM.
  layer?: boolean

  // Scrolling — enables scroll clipping on this axis.
  // Content that overflows is clipped and scrollable via mouse wheel.
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number  // Lines per scroll tick. Omit for natural speed.

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
      shadow={props.shadow}
      glow={props.glow}
      layer={props.layer}
      scrollX={props.scrollX}
      scrollY={props.scrollY}
      scrollSpeed={props.scrollSpeed}
    >
      {props.children}
    </box>
  )
}
