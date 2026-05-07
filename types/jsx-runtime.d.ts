/**
 * Vexart JSX runtime type declarations.
 * AUTO-GENERATED — do not edit manually.
 *
 * When tsconfig has jsxImportSource: "vexart", TypeScript resolves
 * JSX types from vexart/jsx-runtime.
 */

import type { TGEProps, NodeMouseEvent, NodeHandle } from "./engine"

type Children = JSX.Element | JSX.Element[] | string | number | boolean | null | undefined
type RefCallback = (handle: NodeHandle) => void
type ColorValue = string | number
type ShadowDef = { x: number; y: number; blur: number; color: ColorValue }
type CornerRadii = { tl: number; tr: number; br: number; bl: number }

type BoxIntrinsicProps = TGEProps & {
  ref?: RefCallback
  layer?: boolean
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  shadow?: ShadowDef | ShadowDef[]
  glow?: { radius: number; color: ColorValue; intensity?: number }
  onMouseDown?: (evt: NodeMouseEvent) => void
  onMouseUp?: (evt: NodeMouseEvent) => void
  onMouseOver?: (evt: NodeMouseEvent) => void
  onMouseOut?: (evt: NodeMouseEvent) => void
  onMouseMove?: (evt: NodeMouseEvent) => void
  focusStyle?: {
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    cornerRadius?: number
    shadow?: ShadowDef | ShadowDef[]
    glow?: { radius: number; color: ColorValue; intensity?: number }
    gradient?: { type: "linear"; from: ColorValue; to: ColorValue; angle?: number } | { type: "radial"; from: ColorValue; to: ColorValue }
    backdropBlur?: number
    opacity?: number
  }
  opacity?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
  children?: Children
}

type TextIntrinsicProps = {
  ref?: RefCallback
  color?: ColorValue
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

type ImgIntrinsicProps = {
  src: string
  objectFit?: "contain" | "cover" | "fill" | "none"
  width?: number | string
  height?: number | string
  cornerRadius?: number
  cornerRadii?: CornerRadii
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  flexGrow?: number
  flexShrink?: number
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  zIndex?: number
  layer?: boolean
  opacity?: number
}

type CanvasIntrinsicProps = TGEProps & {
  ref?: RefCallback
  onDraw?: TGEProps["onDraw"]
  drawCacheKey?: string | number
  viewport?: TGEProps["viewport"]
  children?: Children
}

export namespace JSX {
  type Element = any
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements {
    box: BoxIntrinsicProps
    text: TextIntrinsicProps
    image: ImgIntrinsicProps
    img: ImgIntrinsicProps
    canvas: CanvasIntrinsicProps
  }
}

export function jsx(type: any, props: any): any
export function jsxs(type: any, props: any): any
export function jsxDEV(type: any, props: any): any

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      box: BoxIntrinsicProps
      text: TextIntrinsicProps
      image: ImgIntrinsicProps
      img: ImgIntrinsicProps
      canvas: CanvasIntrinsicProps
    }
  }
}
