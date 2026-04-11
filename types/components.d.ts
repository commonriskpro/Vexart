/**
 * TGE Components — type declarations.
 */

import type { JSX } from "solid-js"
import type {
  ScrollHandle,
  NodeHandle,
  KeyEvent,
  SyntaxStyle,
  ExtmarkManager,
  ColorValue,
  RGBA,
} from "./tge"

// ── Box ──

export interface ShadowConfig {
  x: number; y: number; blur: number; color: number
}

export interface GlowConfig {
  radius: number; color: number; intensity?: number
}

export interface BoxProps {
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"
  width?: number | string
  height?: number | string
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number
  shadow?: ShadowConfig
  glow?: GlowConfig
  children?: JSX.Element
}

export function Box(props: BoxProps): JSX.Element

// ── Text ──

export interface TextProps {
  color?: string | number
  fontSize?: number
  fontId?: number
  children?: JSX.Element
}

export function Text(props: TextProps): JSX.Element

// ── ScrollView ──

export interface ScrollViewProps {
  ref?: (handle: ScrollHandle) => void
  width?: number | string
  height?: number | string
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  showScrollbar?: boolean
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"
  children?: JSX.Element
}

export function ScrollView(props: ScrollViewProps): JSX.Element
export type { ScrollHandle }

// ── Button ──

export type ButtonVariant = "primary" | "secondary" | "danger"

export interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  width?: number
  focusId?: string
}

export function Button(props: ButtonProps): JSX.Element

// ── ProgressBar ──

export interface ProgressBarProps {
  value: number
  max?: number
  width?: number
  height?: number
  color?: number
  backgroundColor?: number
}

export function ProgressBar(props: ProgressBarProps): JSX.Element

// ── Checkbox ──

export interface CheckboxProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  focusId?: string
}

export function Checkbox(props: CheckboxProps): JSX.Element

// ── Tabs ──

export interface TabItem {
  label: string
  content: () => JSX.Element
}

export interface TabsProps {
  items: TabItem[]
  activeIndex?: number
  onChange?: (index: number) => void
  focusId?: string
}

export function Tabs(props: TabsProps): JSX.Element

// ── List ──

export interface ListProps {
  items: string[]
  selectedIndex?: number
  onChange?: (index: number) => void
  focusId?: string
  width?: number
  height?: number
}

export function List(props: ListProps): JSX.Element

// ── Input ──

export interface InputProps {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  width?: number
  color?: number
  disabled?: boolean
  focusId?: string
}

export function Input(props: InputProps): JSX.Element

// ── Textarea ──

export interface VisualCursor {
  readonly offset: number
  readonly row: number
  readonly col: number
}

export interface KeyBinding {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  action: string
}

export interface TextareaHandle {
  readonly plainText: string
  readonly cursorOffset: number
  readonly cursorRow: number
  readonly cursorCol: number
  readonly visualCursor: VisualCursor
  setText: (text: string) => void
  insertText: (text: string) => void
  clear: () => void
  getTextRange: (start: number, end: number) => string
  gotoBufferEnd: () => void
  gotoLineEnd: () => void
  focus: () => void
  blur: () => void
  cursorColor: number
  readonly extmarks: ExtmarkManager
}

export interface TextareaProps {
  ref?: (handle: TextareaHandle) => void
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  onCursorChange?: (row: number, col: number) => void
  onKeyDown?: (event: KeyEvent) => void
  onPaste?: (text: string) => void
  placeholder?: string
  width?: number
  height?: number
  color?: number
  disabled?: boolean
  focusId?: string
  keyBindings?: KeyBinding[]
  syntaxStyle?: SyntaxStyle
  language?: string
}

export function Textarea(props: TextareaProps): JSX.Element

// ── RichText / Span ──

export interface SpanProps {
  color?: string | number
  fontSize?: number
  fontId?: number
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  children?: JSX.Element
}

export function Span(props: SpanProps): JSX.Element

export interface RichTextProps {
  maxWidth?: number
  lineHeight?: number
  color?: string | number
  fontSize?: number
  children?: JSX.Element
}

export function RichText(props: RichTextProps): JSX.Element

// ── Portal ──

export interface PortalProps {
  children?: JSX.Element
}

export function Portal(props: PortalProps): JSX.Element

// ── Code ──

export interface CodeProps {
  content: string
  language: string
  syntaxStyle: SyntaxStyle
  width?: number | string
  height?: number | string
  backgroundColor?: string | number
  cornerRadius?: number
  padding?: number
  lineNumbers?: boolean
  streaming?: boolean
}

export function Code(props: CodeProps): JSX.Element

// ── Markdown ──

export interface MarkdownProps {
  content: string
  syntaxStyle: SyntaxStyle
  color?: number
  width?: number | string
  streaming?: boolean
}

export function Markdown(props: MarkdownProps): JSX.Element

// ── WrapRow ──

export interface WrapRowProps {
  width: number
  itemWidth: number
  gap?: number
  rowGap?: number
  children?: JSX.Element
}

export function WrapRow(props: WrapRowProps): JSX.Element

// ── Diff ──

export interface DiffProps {
  diff: string
  syntaxStyle?: SyntaxStyle
  filetype?: string
  showLineNumbers?: boolean
  width?: number | string
  addedBg?: number
  removedBg?: number
  contextBg?: number
  addedSignColor?: number
  removedSignColor?: number
  lineNumberFg?: number
  streaming?: boolean
}

export function Diff(props: DiffProps): JSX.Element
