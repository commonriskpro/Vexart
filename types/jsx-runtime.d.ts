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
  // Layout
  direction?: "row" | "column"
  /** Alias for direction (opentui compat) */
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
  /** Alias for alignX (opentui compat) */
  justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end"
  /** Alias for alignY (opentui compat) */
  alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end"
  // Sizing
  width?: number | string
  height?: number | string
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  /** Alias for width="grow" behavior (opentui compat). Accepts any value — presence enables grow. */
  flexGrow?: number
  /** Alias for shrink behavior (opentui compat). Accepts any value. */
  flexShrink?: number
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
  // Compositing
  layer?: boolean
  // Scroll
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  scrollId?: string
  // Floating
  floating?: "parent" | "root" | { attachTo: string }
  floatOffset?: { x: number; y: number }
  zIndex?: number
  floatAttach?: { element?: number; parent?: number }
  pointerPassthrough?: boolean
  // Effects
  shadow?: { x: number; y: number; blur: number; color: number }
  glow?: { radius: number; color: number; intensity?: number }
  // Content
  children?: Children
}

interface TextProps {
  ref?: (handle: any) => void
  color?: ColorValue
  /** Alias for color (opentui compat) */
  fg?: ColorValue
  /** Background color */
  bg?: ColorValue
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

interface TextareaProps {
  ref?: (handle: any) => void
  value?: string
  placeholder?: string
  placeholderColor?: ColorValue
  textColor?: ColorValue
  focusedTextColor?: ColorValue
  cursorColor?: ColorValue
  focusedBackgroundColor?: ColorValue
  minHeight?: number
  maxHeight?: number
  syntaxStyle?: SyntaxStyle
  keyBindings?: any[]
  onContentChange?: (value: string) => void
  onChange?: (value: string) => void
  onKeyDown?: (event: KeyEvent) => void
  onSubmit?: (value: string) => void
  onPaste?: (text: string) => void
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
  maxHeight?: number
  height?: number | string
  width?: number | string
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
  wrapMode?: string
  fg?: ColorValue
  addedBg?: ColorValue
  removedBg?: ColorValue
  contextBg?: ColorValue
  addedSignColor?: ColorValue
  removedSignColor?: ColorValue
  lineNumberFg?: ColorValue
  lineNumberBg?: ColorValue
  addedLineNumberBg?: ColorValue
  removedLineNumberBg?: ColorValue
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
