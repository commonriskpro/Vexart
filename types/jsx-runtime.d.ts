/**
 * TGE JSX runtime type declarations.
 *
 * When tsconfig has jsxImportSource: "tge", TypeScript resolves
 * JSX types from tge/jsx-runtime. This file declares the JSX
 * namespace with TGE's intrinsic elements (<box>, <text>).
 */

type Children = any

interface BoxProps {
  ref?: (handle: any) => void
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
  shadow?: { x: number; y: number; blur: number; color: number }
  glow?: { radius: number; color: number; intensity?: number }
  children?: Children
}

interface TextProps {
  ref?: (handle: any) => void
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

export namespace JSX {
  type Element = any
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements {
    box: BoxProps
    text: TextProps
  }
}

export function jsx(type: any, props: any): any
export function jsxs(type: any, props: any): any
export function jsxDEV(type: any, props: any): any
