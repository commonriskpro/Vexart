/**
 * TGE JSX runtime type declarations.
 *
 * When tsconfig has jsxImportSource: "tge", TypeScript looks for
 * tge/jsx-runtime to resolve JSX types. This file re-exports
 * SolidJS's JSX namespace with TGE's intrinsic elements.
 */

export * from "solid-js/types/jsx"

type Children = JSX.Element | JSX.Element[] | string | number | boolean | null | undefined

type RefCallback = (handle: import("./tge").NodeHandle) => void

interface ShadowConfig {
  x: number
  y: number
  blur: number
  color: number
}

interface GlowConfig {
  radius: number
  color: number
  intensity?: number
}

interface BoxProps {
  ref?: RefCallback
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"
  width?: number | string
  height?: number | string
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number
  borderLeft?: number
  borderRight?: number
  borderTop?: number
  borderBottom?: number
  borderBetweenChildren?: number
  layer?: boolean
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  zIndex?: number
  floatAttach?: { element?: number; parent?: number }
  pointerPassthrough?: boolean
  shadow?: ShadowConfig
  glow?: GlowConfig
  children?: Children
}

interface TextProps {
  ref?: RefCallback
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
