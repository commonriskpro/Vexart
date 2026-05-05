/**
 * Vexart JSX runtime type declarations.
 * AUTO-GENERATED — do not edit manually.
 * Source: packages/engine/src/reconciler/jsx.d.ts
 *
 * When tsconfig has jsxImportSource: "vexart", TypeScript resolves
 * JSX types from vexart/jsx-runtime.
 */

import type { CanvasContext, PressEvent, NodeMouseEvent, NodeHandle } from "./engine"

type Children = any
type ColorValue = string | number

/**
 * JSX type declarations for Vexart — SolidJS module augmentation.
 *
 * This file augments solid-js's JSX namespace with Vexart's intrinsic elements.
 * The canonical prop types live in types/jsx-runtime.d.ts.
 *
 * We import them here to avoid duplicate/conflicting declarations.
 */

// The actual IntrinsicElements are declared in types/jsx-runtime.d.ts
// which is resolved via jsxImportSource or direct reference.
// This file ensures SolidJS's module augmentation picks up our elements.




// Re-declare using the SAME types as jsx-runtime.d.ts to avoid intersection conflicts.
// Shadow accepts single object OR array.

type Children = JSX.Element | JSX.Element[] | string | number | boolean | null | undefined
type RefCallback = (handle: NodeHandle) => void
type ColorValue = string | number
type ShadowDef = { x: number; y: number; blur: number; color: ColorValue }

type BoxIntrinsicProps = TGEProps & {
  ref?: RefCallback
  layer?: boolean
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  shadow?: ShadowDef | ShadowDef[]
  glow?: { radius: number; color: ColorValue; intensity?: number }
  // Mouse events (focusable, onPress, onKeyDown inherited from VexartProps)
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
  // Effects
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
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
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
