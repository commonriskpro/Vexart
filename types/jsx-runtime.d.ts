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
  // Effects
  shadow?: { x: number; y: number; blur: number; color: number }
  glow?: { radius: number; color: number; intensity?: number }
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
  stickyStart?: boolean
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
  color?: ColorValue | (() => ColorValue)
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
    textarea: TextareaProps
    input: InputProps
    scrollbox: ScrollboxProps
    code: CodeProps
    markdown: MarkdownProps
    diff: DiffProps
    spinner: SpinnerProps
    line_number: LineNumberProps
    span: SpanProps
    b: TextProps
    i: TextProps
  }
}

export function jsx(type: any, props: any): any
export function jsxs(type: any, props: any): any
export function jsxDEV(type: any, props: any): any
