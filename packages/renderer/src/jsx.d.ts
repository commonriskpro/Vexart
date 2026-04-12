/**
 * JSX type declarations for TGE — SolidJS module augmentation.
 *
 * This file augments solid-js's JSX namespace with TGE's intrinsic elements.
 * The canonical prop types live in types/jsx-runtime.d.ts.
 *
 * We import them here to avoid duplicate/conflicting declarations.
 */

// The actual IntrinsicElements are declared in types/jsx-runtime.d.ts
// which is resolved via jsxImportSource or direct reference.
// This file ensures SolidJS's module augmentation picks up our elements.

import type { TGEProps } from "./node"
import type { NodeHandle } from "./handle"

// Re-declare using the SAME types as jsx-runtime.d.ts to avoid intersection conflicts.
// Shadow accepts single object OR array.

type Children = JSX.Element | JSX.Element[] | string | number | boolean | null | undefined
type RefCallback = (handle: NodeHandle) => void
type ColorValue = string | number
type ShadowDef = { x: number; y: number; blur: number; color: number }

type BoxIntrinsicProps = TGEProps & {
  ref?: RefCallback
  layer?: boolean
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  shadow?: ShadowDef | ShadowDef[]
  glow?: { radius: number; color: ColorValue; intensity?: number }
  // Mouse events (focusable, onPress, onKeyDown inherited from TGEProps)
  onMouseDown?: (evt: any) => void
  onMouseUp?: (evt: any) => void
  onMouseOver?: () => void
  onMouseOut?: () => void
  onMouseMove?: () => void
  focusStyle?: {
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    cornerRadius?: number
    shadow?: ShadowDef | ShadowDef[]
    glow?: { radius: number; color: ColorValue; intensity?: number }
    gradient?: { type: "linear"; from: number; to: number; angle?: number } | { type: "radial"; from: number; to: number }
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

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      box: BoxIntrinsicProps
      text: TextIntrinsicProps
      img: ImgIntrinsicProps
    }
  }
}

export {}
