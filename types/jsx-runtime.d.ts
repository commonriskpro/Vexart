/**
 * TGE JSX runtime type declarations.
 *
 * When tsconfig has jsxImportSource: "tge", TypeScript resolves
 * JSX types from tge/jsx-runtime. This file declares the JSX
 * namespace with TGE's intrinsic elements.
 */

import type { RGBA, SyntaxStyle, ExtmarkManager, KeyEvent, ScrollHandle } from "./tge"

type Children = any
type ColorValue = string | number | RGBA
type ShadowDef = { x: number; y: number; blur: number; color: number }
/** Shadow accepts a single shadow object or an array for multi-shadow. */
type ShadowProp = ShadowDef | ShadowDef[]

interface BoxProps {
  ref?: (handle: any) => void
  // Identity
  id?: string
  // Layout
  direction?: "row" | "column"
  flexDirection?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end"
  alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end"
  // Sizing
  width?: number | string
  height?: number | string
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  flexGrow?: number
  flexShrink?: number
  // Margins (opentui compat — implemented as wrapper padding in migration)
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  // Visual
  backgroundColor?: ColorValue
  cornerRadius?: number
  borderColor?: ColorValue
  borderWidth?: number
  borderLeft?: number
  borderRight?: number
  borderTop?: number
  borderBottom?: number
  borderBetweenChildren?: number
  border?: string[]
  customBorderChars?: Record<string, string>
  // Compositing
  layer?: boolean
  visible?: boolean
  // Scroll
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  // Floating / absolute positioning
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  position?: "absolute" | "relative"
  zIndex?: number
  top?: number
  left?: number
  right?: number
  bottom?: number
  floatAttach?: { element?: number; parent?: number }
  pointerPassthrough?: boolean
  interactionMode?: "none" | "drag"
  // Effects
  shadow?: ShadowProp
  glow?: { radius: number; color: string | number; intensity?: number }
  gradient?: { type: "linear"; from: number; to: number; angle?: number } | { type: "radial"; from: number; to: number }
  backdropBlur?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
  opacity?: number
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
  /** Self-filter applied to this element's own paint output. */
  filter?: {
    blur?: number
    brightness?: number
    contrast?: number
    saturate?: number
    grayscale?: number
    invert?: number
    sepia?: number
    hueRotate?: number
  }
  /** Hint that a property will change soon — pre-promotes node to GPU compositing layer. */
  willChange?: string | string[]
  /**
   * Containment boundary hint.
   * - 'none': no containment (default).
   * - 'layout': size changes inside do not re-lay out siblings.
   * - 'paint': content clipped to bounds.
   * - 'strict': layout + paint combined.
   */
  contain?: "none" | "layout" | "paint" | "strict"
  /** Default true for browser-like viewport clipping of floating layers. */
  viewportClip?: boolean
  /** 2D affine + pseudo-perspective transform. */
  transform?: {
    translateX?: number
    translateY?: number
    rotate?: number
    scale?: number
    scaleX?: number
    scaleY?: number
    skewX?: number
    skewY?: number
    perspective?: number
    rotateX?: number
    rotateY?: number
  }
  /** Transform origin point. Default: "center". */
  transformOrigin?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | { x: number; y: number }
  // Interactive states — merged over base visual props when active
  hoverStyle?: {
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    cornerRadius?: number
    shadow?: ShadowProp
    glow?: { radius: number; color: string | number; intensity?: number }
    gradient?: { type: "linear"; from: number; to: number; angle?: number } | { type: "radial"; from: number; to: number }
    backdropBlur?: number
    opacity?: number
  }
  activeStyle?: {
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    cornerRadius?: number
    shadow?: ShadowProp
    glow?: { radius: number; color: string | number; intensity?: number }
    gradient?: { type: "linear"; from: number; to: number; angle?: number } | { type: "radial"; from: number; to: number }
    backdropBlur?: number
    opacity?: number
  }
  focusStyle?: {
    backgroundColor?: ColorValue
    borderColor?: ColorValue
    borderWidth?: number
    cornerRadius?: number
    shadow?: ShadowProp
    glow?: { radius: number; color: string | number; intensity?: number }
    gradient?: { type: "linear"; from: number; to: number; angle?: number } | { type: "radial"; from: number; to: number }
    backdropBlur?: number
    opacity?: number
  }
  // Interaction
  focusable?: boolean
  onPress?: (event?: import("@tge/renderer").PressEvent) => void
  onKeyDown?: (event: any) => void
  // Mouse events
  onMouseDown?: (evt: any) => void
  onMouseUp?: (evt: any) => void
  onMouseOver?: () => void
  onMouseOut?: () => void
  onMouseMove?: () => void
  // Misc opentui compat
  title?: string
  titleAlignment?: string
  flexWrap?: string
  renderBefore?: () => void
  // Content
  children?: Children
}

interface TextProps {
  ref?: (handle: any) => void
  color?: ColorValue
  fg?: ColorValue
  bg?: ColorValue
  backgroundColor?: ColorValue
  fontSize?: number
  fontId?: number
  lineHeight?: number
  wordBreak?: "normal" | "keep-all"
  whiteSpace?: "normal" | "pre-wrap"
  wrapMode?: "word" | "char" | "none"
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  // Layout props on text (opentui compat)
  flexShrink?: number
  flexGrow?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  width?: number | string
  // Mouse events
  onMouseDown?: (evt: any) => void
  onMouseUp?: (evt: any) => void
  // Attributes (opentui compat — accepted but visual effect depends on font)
  attributes?: number
  children?: Children
}

interface TextareaProps {
  ref?: (handle: any) => void
  value?: string
  placeholder?: string
  placeholderColor?: ColorValue
  textColor?: ColorValue
  focusedTextColor?: ColorValue
  cursorColor?: ColorValue
  focusedBackgroundColor?: ColorValue
  focused?: boolean
  disabled?: boolean
  focusId?: string
  width?: number
  height?: number
  minHeight?: number
  maxHeight?: number
  color?: ColorValue
  syntaxStyle?: SyntaxStyle
  language?: string
  keyBindings?: any[]
  onContentChange?: (value: string) => void
  onChange?: (value: string) => void
  onKeyDown?: (event: KeyEvent) => void
  onSubmit?: (value: string) => void
  onPaste?: (text: string) => void
  onCursorChange?: (row: number, col: number) => void
  onMouseDown?: (event: any) => void
  children?: Children
}

interface InputProps {
  ref?: (handle: any) => void
  value?: string
  placeholder?: string
  placeholderColor?: ColorValue
  focusedBackgroundColor?: ColorValue
  cursorColor?: ColorValue
  focusedTextColor?: ColorValue
  onInput?: (value: string) => void
  onChange?: (value: string) => void
  children?: Children
}

interface ScrollboxProps {
  ref?: (handle: ScrollHandle) => void
  flexGrow?: number
  flexShrink?: number
  maxHeight?: number
  minHeight?: number
  height?: number | string
  width?: number | string
  padding?: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  direction?: "row" | "column"
  backgroundColor?: ColorValue
  cornerRadius?: number
  borderColor?: ColorValue
  borderWidth?: number
  stickyScroll?: boolean
  stickyStart?: "top" | "bottom"
  scrollY?: boolean
  scrollX?: boolean
  scrollSpeed?: number
  showScrollbar?: boolean
  viewportOptions?: any
  verticalScrollbarOptions?: any
  scrollbarOptions?: any
  scrollAcceleration?: any
  children?: Children
}

interface CodeProps {
  content: string
  filetype?: string
  language?: string
  syntaxStyle?: SyntaxStyle
  streaming?: boolean
  conceal?: boolean
  drawUnstyledText?: boolean
  fg?: ColorValue
  width?: number | string
  height?: number | string
  lineNumbers?: boolean
  backgroundColor?: ColorValue
  cornerRadius?: number
  padding?: number
  children?: Children
}

interface MarkdownProps {
  content: string
  syntaxStyle?: SyntaxStyle
  streaming?: boolean
  conceal?: boolean
  fg?: ColorValue
  bg?: ColorValue
  color?: ColorValue
  backgroundColor?: ColorValue
  width?: number | string
  children?: Children
}

interface LinkProps {
  href?: string
  color?: ColorValue
  fg?: ColorValue
  backgroundColor?: ColorValue
  children?: Children
}

interface DiffProps {
  diff: string
  view?: "unified" | "split"
  filetype?: string
  syntaxStyle?: SyntaxStyle
  showLineNumbers?: boolean
  width?: number | string
  height?: number | string
  wrapMode?: string
  fg?: ColorValue
  color?: ColorValue
  addedBg?: ColorValue
  removedBg?: ColorValue
  contextBg?: ColorValue
  addedSignColor?: ColorValue
  removedSignColor?: ColorValue
  lineNumberFg?: ColorValue
  lineNumberBg?: ColorValue
  lineNumberColor?: ColorValue
  addedLineNumberBg?: ColorValue
  removedLineNumberBg?: ColorValue
  hunkHeaderColor?: ColorValue
  streaming?: boolean
  children?: Children
}

interface SpinnerProps {
  color?: ColorValue | ((...args: any[]) => ColorValue)
  frames?: string[]
  interval?: number
  children?: Children
}

interface LineNumberProps {
  color?: ColorValue
  fg?: ColorValue
  minWidth?: number
  paddingRight?: number
  children?: Children
}

interface CanvasProps {
  /** Imperative draw callback — called each frame with a CanvasContext. */
  onDraw?: (ctx: import("@tge/renderer").CanvasContext) => void
  /** Viewport transform for pan/zoom. */
  viewport?: { x: number; y: number; zoom: number }
  /** Width — number (fixed px), "grow", "fit", "100%". */
  width?: number | string
  /** Height — number (fixed px), "grow", "fit", "100%". */
  height?: number | string
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  flexGrow?: number
  layer?: boolean
  // Mouse events
  onMouseDown?: (evt: any) => void
  onMouseUp?: (evt: any) => void
  onMouseMove?: (evt: any) => void
  onMouseOver?: (evt: any) => void
  onMouseOut?: (evt: any) => void
  ref?: (handle: any) => void
}

interface ImgProps {
  /** Image source — file path (absolute or relative to cwd). */
  src: string
  /** How the image fits within its layout box. Default: "contain". */
  objectFit?: "contain" | "cover" | "fill" | "none"
  /** Width — number (fixed px), "grow", "fit". If omitted, uses image intrinsic width. */
  width?: number | string
  /** Height — number (fixed px), "grow", "fit". If omitted, uses image intrinsic height. */
  height?: number | string
  /** Corner radius — rounds the image corners via SDF mask. */
  cornerRadius?: number
  /** Per-corner radius. */
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
  // Layout compat — img participates in flex layout like any box
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  flexGrow?: number
  flexShrink?: number
  // Floating
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  zIndex?: number
  // Compositing
  layer?: boolean
  opacity?: number
}

interface SpanProps {
  style?: {
    fg?: ColorValue
    bg?: ColorValue
    bold?: boolean
    italic?: boolean
    underline?: boolean
  }
  children?: Children
}

export namespace JSX {
  type Element = any
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements {
    box: BoxProps
    text: TextProps
    surface: CanvasProps
    img: ImgProps
    textarea: TextareaProps
    input: InputProps
    scrollbox: ScrollboxProps
    code: CodeProps
    markdown: MarkdownProps
    diff: DiffProps
    spinner: SpinnerProps
    line_number: LineNumberProps
    link: LinkProps
    span: SpanProps
    b: TextProps
    i: TextProps
  }
}

export function jsx(type: any, props: any): any
export function jsxs(type: any, props: any): any
export function jsxDEV(type: any, props: any): any

// ── SolidJS JSX augmentation ──
// Adds TGE-specific intrinsic elements to SolidJS's JSX namespace.
// This ensures <surface> works in any .tsx file without per-file declarations.
declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      surface: {
        onDraw?: (ctx: import("@tge/renderer").CanvasContext) => void
        viewport?: { x: number; y: number; zoom: number }
        width?: number | string
        height?: number | string
        minWidth?: number
        maxWidth?: number
        minHeight?: number
        maxHeight?: number
        flexGrow?: number
        layer?: boolean
        interactionMode?: "none" | "drag"
        onMouseDown?: (evt: any) => void
        onMouseUp?: (evt: any) => void
        onMouseMove?: (evt: any) => void
        onMouseOver?: (evt: any) => void
        onMouseOut?: (evt: any) => void
        ref?: (handle: any) => void
      }
    }
  }
}
