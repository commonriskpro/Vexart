/**
 * JSX type declarations for TGE.
 *
 * Defines the intrinsic elements that JSX can use directly:
 *   <box> — container with layout, background, border, shadow
 *   <text> — text node with color and font settings
 *
 * These map to TGENode creation in the reconciler.
 */

import type { TGEProps } from "./node"

type Children = JSX.Element | JSX.Element[] | string | number | boolean | null | undefined

type BoxProps = TGEProps & {
  layer?: boolean
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  shadow?: { x: number; y: number; blur: number; color: number }
  glow?: { radius: number; color: number; intensity?: number }
  children?: Children
}

type TextProps = {
  color?: string | number
  fontSize?: number
  fontId?: number
  lineHeight?: number
  wordBreak?: "normal" | "keep-all"
  whiteSpace?: "normal" | "pre-wrap"
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  children?: Children
}

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      box: BoxProps
      text: TextProps
    }
  }
}

export {}
