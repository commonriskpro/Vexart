/**
 * Box — primary layout container for Vexart.
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
import { splitProps } from "solid-js"
import type { TGEProps } from "@vexart/engine"

/** @public */
export type ShadowConfig = {
  x: number              // Horizontal offset (px)
  y: number              // Vertical offset (px)
  blur: number           // Blur radius (px)
  color: string | number // Shadow color (hex string or packed RGBA u32)
}

/** @public */
export type GlowConfig = {
  radius: number           // Glow spread radius (px)
  color: string | number   // Glow color (hex string or packed RGBA u32)
  intensity?: number       // 0-100, default 80
}

/** @public */
export type BoxProps = TGEProps & { children?: JSX.Element }

/** @public */
export function Box(props: BoxProps) {
  // splitProps preserves Solid's reactivity proxy (unlike destructuring) and
  // separates children from the rest so <box> receives them as JSX children
  // instead of as a prop in the spread — preventing circular node insertion
  // that causes walkTree stack overflow when <Show> recreates subtrees.
  const [local, rest] = splitProps(props, ["children"])
  return <box {...rest}>{local.children}</box>
}
