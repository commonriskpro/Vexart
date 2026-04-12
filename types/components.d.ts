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
  radius: number; color: string | number; intensity?: number
}

export type GradientConfig =
  | { type: "linear"; from: number; to: number; angle?: number }
  | { type: "radial"; from: number; to: number }

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
  shadow?: ShadowConfig | ShadowConfig[]
  glow?: GlowConfig
  gradient?: GradientConfig
  backdropBlur?: number
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
  hoverStyle?: Partial<Pick<BoxProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "shadow" | "glow" | "gradient" | "backdropBlur">>
  activeStyle?: Partial<Pick<BoxProps, "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "shadow" | "glow" | "gradient" | "backdropBlur">>
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
  backgroundColor?: ColorValue
  cornerRadius?: number
  borderColor?: ColorValue
  borderWidth?: number
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
  flexGrow?: number
  flexShrink?: number
  minHeight?: number
  maxHeight?: number
  stickyScroll?: boolean
  stickyStart?: "top" | "bottom"
  viewportOptions?: { paddingRight?: number }
  verticalScrollbarOptions?: {
    paddingLeft?: number
    visible?: boolean
    trackOptions?: { backgroundColor?: ColorValue; foregroundColor?: ColorValue }
  }
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
  ref?: (handle: any) => void
  value?: string
  onChange?: (value: string) => void
  onInput?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  width?: number
  color?: ColorValue
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
  color?: ColorValue
  focusedBackgroundColor?: ColorValue
  focusedTextColor?: ColorValue
  placeholderColor?: ColorValue
  cursorColor?: ColorValue
  textColor?: ColorValue
  disabled?: boolean
  focused?: boolean
  focusId?: string
  keyBindings?: KeyBinding[]
  syntaxStyle?: SyntaxStyle
  language?: string
  onContentChange?: (value: string) => void
  onMouseDown?: (event: any) => void
  minHeight?: number
  maxHeight?: number
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
  language?: string
  filetype?: string
  syntaxStyle?: SyntaxStyle
  width?: number | string
  height?: number | string
  backgroundColor?: ColorValue
  color?: ColorValue
  fg?: ColorValue
  cornerRadius?: number
  padding?: number
  lineNumbers?: boolean
  streaming?: boolean
  conceal?: boolean
  drawUnstyledText?: boolean
}

export function Code(props: CodeProps): JSX.Element

// ── Markdown ──

export interface MarkdownProps {
  content: string
  syntaxStyle?: SyntaxStyle
  color?: ColorValue
  fg?: ColorValue
  backgroundColor?: ColorValue
  width?: number | string
  streaming?: boolean
  conceal?: boolean
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
  height?: number | string
  view?: "unified" | "split"
  wrapMode?: string
  color?: ColorValue
  fg?: ColorValue
  addedBg?: ColorValue
  removedBg?: ColorValue
  contextBg?: ColorValue
  addedSignColor?: ColorValue
  removedSignColor?: ColorValue
  lineNumberFg?: ColorValue
  lineNumberColor?: ColorValue
  lineNumberBg?: ColorValue
  addedLineNumberBg?: ColorValue
  removedLineNumberBg?: ColorValue
  hunkHeaderColor?: ColorValue
  streaming?: boolean
}

export function Diff(props: DiffProps): JSX.Element

// ── Dialog ──

export interface DialogProps {
  children?: JSX.Element
}

export interface DialogOverlayProps {
  backgroundColor?: string | number
  backdropBlur?: number
  children?: JSX.Element
}

export interface DialogContentProps {
  children?: JSX.Element
  width?: number | string
  maxWidth?: number
  padding?: number
  cornerRadius?: number
  backgroundColor?: string | number
}

export interface DialogCloseProps {
  children?: JSX.Element
}

export declare function Dialog(props: DialogProps): JSX.Element
export declare namespace Dialog {
  function Overlay(props: DialogOverlayProps): JSX.Element
  function Content(props: DialogContentProps): JSX.Element
  function Close(props: DialogCloseProps): JSX.Element
}

// ── Select ──

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value?: string
  onChange?: (value: string) => void
  options?: SelectOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  color?: number
  children?: JSX.Element
}

export interface SelectTriggerProps {
  children?: JSX.Element
}

export interface SelectContentProps {
  children?: JSX.Element
}

export interface SelectItemProps {
  value: string
  disabled?: boolean
  children?: JSX.Element
}

export declare function Select(props: SelectProps): JSX.Element
export declare namespace Select {
  function Trigger(props: SelectTriggerProps): JSX.Element
  function Content(props: SelectContentProps): JSX.Element
  function Item(props: SelectItemProps): JSX.Element
}

// ── Switch ──

export interface SwitchProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  color?: number
  disabled?: boolean
  focusId?: string
}

export declare function Switch(props: SwitchProps): JSX.Element

// ── RadioGroup ──

export interface RadioOption {
  value: string
  label: string
  disabled?: boolean
}

export interface RadioGroupProps {
  value?: string
  onChange?: (value: string) => void
  options: RadioOption[]
  color?: number
  disabled?: boolean
  focusId?: string
  direction?: "column" | "row"
}

export declare function RadioGroup(props: RadioGroupProps): JSX.Element

// ── Toast ──

export type ToastVariant = "default" | "success" | "error" | "warning" | "info"
export type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center"

export interface ToastData {
  id: number
  message: string
  variant: ToastVariant
  duration: number
  description?: string
}

export type ToastInput = string | {
  message: string
  variant?: ToastVariant
  duration?: number
  description?: string
}

export interface ToasterOptions {
  position?: ToastPosition
  maxVisible?: number
  defaultDuration?: number
  gap?: number
  renderToast?: (toast: ToastData, dismiss: () => void) => JSX.Element
}

export interface ToasterHandle {
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
  dismissAll: () => void
  Toaster: () => JSX.Element
}

export declare function createToaster(options?: ToasterOptions): ToasterHandle

// ── Table ──

export interface TableColumn {
  key: string
  header: string
  width?: number | "grow"
  align?: "left" | "center" | "right"
}

export interface TableProps {
  columns: TableColumn[]
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean
  striped?: boolean
  color?: number
  disabled?: boolean
  focusId?: string
  renderCell?: (value: any, column: TableColumn, rowIndex: number) => JSX.Element
}

export declare function Table(props: TableProps): JSX.Element

// ── Router ──

export interface RouterProps {
  initial?: string
  children?: JSX.Element
}

export interface RouteComponentProps {
  path: string
  component: (props: { params?: Record<string, any> }) => JSX.Element
}

export declare function Router(props: RouterProps): JSX.Element
export declare function Route(props: RouteComponentProps): JSX.Element

export interface NavigationStackProps {
  initial?: (props: { params?: Record<string, any>; goBack: () => void }) => JSX.Element
  children?: JSX.Element
}

export declare function NavigationStack(props: NavigationStackProps): JSX.Element

export declare function useRouterContext(): {
  current: () => string
  navigate: (path: string, params?: Record<string, any>) => void
  goBack: () => boolean
  params: () => Record<string, any> | undefined
  history: () => Array<{ path: string; params?: Record<string, any> }>
}

export declare function useStack(): {
  push: (component: (props: any) => JSX.Element, params?: Record<string, any>) => void
  pop: () => boolean
  goBack: () => boolean
  replace: (component: (props: any) => JSX.Element, params?: Record<string, any>) => void
  reset: (component: (props: any) => JSX.Element, params?: Record<string, any>) => void
  depth: () => number
  current: () => { key: string; component: (props: any) => JSX.Element; params?: Record<string, any> } | undefined
  stack: () => Array<{ key: string; component: (props: any) => JSX.Element; params?: Record<string, any> }>
}
