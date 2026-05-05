/**
 * Vexart Headless Components — type declarations.
 * Matches @vexart/headless public API surface.
 */

import type { JSX } from "solid-js"
import type {
  ScrollHandle,
  NodeHandle,
  KeyEvent,
  SyntaxStyle,
  ExtmarkManager,
  NodeMouseEvent,
  PressEvent,
  ColorValue,
} from "./engine"

// ── Button ──
// Note: The styled Button in void.d.ts wins in the unified barrel.
// The headless Button is available via "vexart/engine" or direct headless import.
// We export the render context type here since it's not colliding.

export type ButtonRenderContext = {
  focused: boolean
  pressed: boolean
  disabled: boolean
  buttonProps: {
    focusable: true
    onPress: () => void
  }
}

// Headless ButtonProps — not exported from barrel (styled ButtonProps wins).
// Available via "vexart/engine" for advanced use.
export type HeadlessButtonProps = {
  onPress?: () => void
  disabled?: boolean
  focusId?: string
  renderButton: (ctx: ButtonRenderContext) => JSX.Element
}

// ── Checkbox ──

export type CheckboxRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
  toggleProps: {
    focusable: true
    onPress: () => void
  }
}

export type CheckboxProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  focusId?: string
  renderCheckbox: (ctx: CheckboxRenderContext) => JSX.Element
}

export function Checkbox(props: CheckboxProps): JSX.Element

// ── Combobox ──

export type ComboboxOption = {
  value: string
  label: string
  disabled?: boolean
}

export type ComboboxInputContext = {
  inputValue: string
  placeholder: string
  open: boolean
  focused: boolean
  disabled: boolean
  selectedLabel: string | undefined
}

export type ComboboxOptionContext = {
  highlighted: boolean
  selected: boolean
  disabled: boolean
}

export type ComboboxProps = {
  value?: string
  onChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  filter?: (option: ComboboxOption, query: string) => boolean
  renderInput: (ctx: ComboboxInputContext) => JSX.Element
  renderOption: (option: ComboboxOption, ctx: ComboboxOptionContext) => JSX.Element
  renderContent?: (children: JSX.Element) => JSX.Element
  renderEmpty?: () => JSX.Element
}

export function Combobox(props: ComboboxProps): JSX.Element

// ── Input ──

export type InputRenderContext = {
  value: string
  displayText: string
  showPlaceholder: boolean
  cursor: number
  blink: boolean
  focused: boolean
  disabled: boolean
  selection: [number, number] | null
  inputProps: {
    focusable: true
    onPress: () => void
  }
}

export type InputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  renderInput: (ctx: InputRenderContext) => JSX.Element
}

export function Input(props: InputProps): JSX.Element

// ── RadioGroup ──

export type RadioOption = {
  value: string
  label: string
  disabled?: boolean
}

export type RadioOptionContext = {
  selected: boolean
  focused: boolean
  disabled: boolean
  index: number
  optionProps: {
    onPress: () => void
  }
}

export type RadioGroupProps = {
  value?: string
  onChange?: (value: string) => void
  options: RadioOption[]
  disabled?: boolean
  focusId?: string
  renderOption: (option: RadioOption, ctx: RadioOptionContext) => JSX.Element
  renderGroup?: (children: JSX.Element) => JSX.Element
}

export function RadioGroup(props: RadioGroupProps): JSX.Element

// ── Select ──

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectTriggerContext = {
  selectedLabel: string | undefined
  placeholder: string
  open: boolean
  focused: boolean
  disabled: boolean
}

export type SelectOptionContext = {
  highlighted: boolean
  selected: boolean
  disabled: boolean
}

export type SelectProps = {
  value?: string
  onChange?: (value: string) => void
  options?: SelectOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  renderTrigger?: (ctx: SelectTriggerContext) => JSX.Element
  renderOption?: (option: SelectOption, ctx: SelectOptionContext) => JSX.Element
  renderContent?: (children: JSX.Element) => JSX.Element
  children?: JSX.Element
}

export type SelectTriggerProps = { children?: JSX.Element }
export type SelectContentProps = { children?: JSX.Element }
export type SelectItemProps = { value: string; disabled?: boolean; children?: JSX.Element }

export declare const Select: ((props: SelectProps) => JSX.Element) & {
  Trigger: (props: SelectTriggerProps) => JSX.Element
  Content: (props: SelectContentProps) => JSX.Element
  Item: (props: SelectItemProps) => JSX.Element
}

export declare function SelectTrigger(props: SelectTriggerProps): JSX.Element
export declare function SelectContent(props: SelectContentProps): JSX.Element
export declare function SelectItem(props: SelectItemProps): JSX.Element

// ── Slider ──

export type SliderTrackProps = {
  ref: (handle: any) => void
  onMouseDown: (evt: NodeMouseEvent) => void
  onMouseMove: (evt: NodeMouseEvent) => void
  onMouseUp: (evt: NodeMouseEvent) => void
  focusable: true
}

export type SliderRenderContext = {
  value: number
  min: number
  max: number
  percentage: number
  focused: boolean
  disabled: boolean
  dragging: boolean
  trackProps: SliderTrackProps
}

export type SliderProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  largeStep?: number
  disabled?: boolean
  focusId?: string
  renderSlider: (ctx: SliderRenderContext) => JSX.Element
}

export function Slider(props: SliderProps): JSX.Element

// ── Switch ──

export type SwitchRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
  toggleProps: {
    focusable: true
    onPress: () => void
  }
}

export type SwitchProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  focusId?: string
  renderSwitch: (ctx: SwitchRenderContext) => JSX.Element
}

/** Exported as `ToggleSwitch` from the unified barrel (Switch name reserved for SolidJS control flow). */
export function ToggleSwitch(props: SwitchProps): JSX.Element

// ── Textarea ──

export type TextareaTheme = {
  accent: string | number
  fg: string | number
  muted: string | number
  bg: string | number
  disabledBg: string | number
  border: string | number
  radius: number
  padding: number
}

export type KeyBindingAction =
  | "cursor-left" | "cursor-right" | "cursor-up" | "cursor-down"
  | "line-start" | "line-end" | "buffer-start" | "buffer-end"
  | "page-up" | "page-down" | "delete-back" | "delete-forward"
  | "select-all" | "newline" | "submit"

export type KeyBinding = {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  action: KeyBindingAction
}

export type VisualCursor = {
  readonly offset: number
  readonly row: number
  readonly col: number
}

export type TextareaHandle = {
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
  cursorColor: string | number
  readonly extmarks: ExtmarkManager
}

export type TextareaProps = {
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
  theme?: Partial<TextareaTheme>
}

export function Textarea(props: TextareaProps): JSX.Element

// ── Code ──

export type CodeTheme = {
  bg: string | number
  lineNumberFg: string | number
  radius: number
  padding: number
}

export type CodeProps = {
  content: string
  language: string
  syntaxStyle: SyntaxStyle
  width?: number | string
  height?: number | string
  theme?: Partial<CodeTheme>
  lineNumbers?: boolean
  streaming?: boolean
}

export function Code(props: CodeProps): JSX.Element

// ── Markdown ──

export type MarkdownTheme = {
  fg: string | number
  muted: string | number
  heading: string | number
  link: string | number
  bold: string | number
  italic: string | number
  codeFg: string | number
  codeBg: string | number
  codeBlockBg: string | number
  blockquoteBorder: string | number
  listBullet: string | number
  tableBg: string | number
  tableHeader: string | number
  hrColor: string | number
  del: string | number
}

export type MarkdownProps = {
  content: string
  syntaxStyle: SyntaxStyle
  color?: number
  width?: number | string
  streaming?: boolean
  theme?: Partial<MarkdownTheme>
}

export function Markdown(props: MarkdownProps): JSX.Element

// ── ProgressBar ──

export type ProgressBarRenderContext = {
  ratio: number
  fillWidth: number
  width: number
  height: number
  value: number
  max: number
}

export type ProgressBarProps = {
  value: number
  max?: number
  width?: number
  height?: number
  renderBar: (ctx: ProgressBarRenderContext) => JSX.Element
}

export function ProgressBar(props: ProgressBarProps): JSX.Element

// ── Diff ──

export type DiffTheme = {
  fg: string | number
  muted: string | number
  bg: string | number
  radius: number
  addedBg: string | number
  removedBg: string | number
  contextBg: string | number
  addedSign: string | number
  removedSign: string | number
  lineNumberFg: string | number
  lineNumberBg: string | number
  headerBg: string | number
  headerFg: string | number
  linePadding: number
}

export type DiffProps = {
  diff: string
  showLineNumbers?: boolean
  width?: number | string
  theme?: Partial<DiffTheme>
}

export function Diff(props: DiffProps): JSX.Element

// ── RichText / Span ──

export type SpanProps = {
  color?: string | number
  fontSize?: number
  fontId?: number
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  children?: JSX.Element
}

export function Span(props: SpanProps): JSX.Element

export type RichTextProps = {
  maxWidth?: number
  lineHeight?: number
  color?: string | number
  fontSize?: number
  children?: JSX.Element
}

export function RichText(props: RichTextProps): JSX.Element

// ── WrapRow ──

export type WrapRowProps = {
  width: number
  itemWidth: number
  gap?: number
  rowGap?: number
  children?: JSX.Element
}

export function WrapRow(props: WrapRowProps): JSX.Element

// ── OverlayRoot ──

export type OverlayRootProps = {
  children?: JSX.Element
  zIndex?: number
}

export function OverlayRoot(props: OverlayRootProps): JSX.Element

// ── Portal ──

export type PortalProps = {
  children?: JSX.Element
}

export function Portal(props: PortalProps): JSX.Element

// ── ScrollView ──

export type ScrollViewProps = {
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

// ── Tabs ──

export type TabItem = {
  label: string
  content: () => JSX.Element
}

export type TabRenderContext = {
  active: boolean
  focused: boolean
  index: number
  tabProps: {
    onPress: () => void
  }
}

export type TabsProps = {
  activeTab: number
  onTabChange?: (index: number) => void
  tabs: TabItem[]
  focusId?: string
  renderTab: (tab: TabItem, ctx: TabRenderContext) => JSX.Element
  renderTabBar?: (children: JSX.Element) => JSX.Element
  renderPanel?: (content: JSX.Element) => JSX.Element
  renderContainer?: (tabBar: JSX.Element, panel: JSX.Element) => JSX.Element
}

export function Tabs(props: TabsProps): JSX.Element

// ── List ──

export type ListItemContext = {
  selected: boolean
  focused: boolean
  index: number
  itemProps: {
    onPress: () => void
  }
}

export type ListProps = {
  items: string[]
  selectedIndex: number
  onSelectedChange?: (index: number) => void
  onSelect?: (index: number) => void
  disabled?: boolean
  focusId?: string
  renderItem: (item: string, ctx: ListItemContext) => JSX.Element
  renderList?: (children: JSX.Element) => JSX.Element
}

export function List(props: ListProps): JSX.Element

// ── Table ──

export type TableColumn = {
  key: string
  header: string
  width?: number | "grow"
  align?: "left" | "center" | "right"
}

export type TableCellContext = {
  selected: boolean
  focused: boolean
  rowIndex: number
  rowProps: {
    onPress: () => void
  }
}

export type TableProps = {
  columns: TableColumn[]
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean
  disabled?: boolean
  focusId?: string
  renderHeader?: (column: TableColumn) => JSX.Element
  renderCell: (value: any, column: TableColumn, rowIndex: number, ctx: TableCellContext) => JSX.Element
  renderRow?: (children: JSX.Element, rowIndex: number, ctx: TableCellContext) => JSX.Element
  renderTable?: (children: JSX.Element) => JSX.Element
}

export function Table(props: TableProps): JSX.Element

// ── VirtualList ──

export type VirtualListItemContext = {
  selected: boolean
  highlighted: boolean
  hovered: boolean
  index: number
}

export type VirtualListProps<T> = {
  items: T[]
  itemHeight: number
  height: number
  width?: number | string
  overscan?: number
  renderItem: (item: T, index: number, ctx: VirtualListItemContext) => JSX.Element
  selectedIndex?: number
  onSelect?: (index: number) => void
  keyboard?: boolean
  focusId?: string
}

export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element

// ── Dialog ──

export type DialogProps = {
  children?: any
  onClose?: () => void
}

export type DialogOverlayProps = {
  backgroundColor?: string | number
  backdropBlur?: number
  onClick?: () => void
  children?: any
}

export type DialogContentProps = {
  children?: any
  width?: number | string
  maxWidth?: number
  padding?: number
  cornerRadius?: number
  backgroundColor?: string | number
}

export type DialogCloseProps = {
  children?: any
}

export declare const Dialog: ((props: DialogProps) => JSX.Element) & {
  Overlay: (props: DialogOverlayProps) => JSX.Element
  Content: (props: DialogContentProps) => JSX.Element
  Close: (props: DialogCloseProps) => JSX.Element
}

export declare function DialogOverlay(props: DialogOverlayProps): JSX.Element
export declare function DialogContent(props: DialogContentProps): JSX.Element
export declare function DialogClose(props: DialogCloseProps): JSX.Element

// ── Toast ──

export type ToastVariant = "default" | "success" | "error" | "warning" | "info"
export type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center"

export type ToastData = {
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

export type ToasterOptions = {
  position?: ToastPosition
  maxVisible?: number
  defaultDuration?: number
  gap?: number
  padding?: number
  renderToast: (toast: ToastData, dismiss: () => void) => JSX.Element
}

export type ToasterHandle = {
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
  dismissAll: () => void
  Toaster: () => JSX.Element
}

export function createToaster(options: ToasterOptions): ToasterHandle

// ── Tooltip / Popover ──

export type TooltipProps = {
  content: string
  renderTooltip: (content: string) => JSX.Element
  children: JSX.Element
  showDelay?: number
  hideDelay?: number
  disabled?: boolean
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
}

export function Tooltip(props: TooltipProps): JSX.Element

export type PopoverTriggerContext = {
  open: boolean
  toggle: () => void
}

export type PopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  renderTrigger: (ctx: PopoverTriggerContext) => JSX.Element
  renderContent: () => JSX.Element
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number
}

export function Popover(props: PopoverProps): JSX.Element

// ── Form Validation ──

export type FieldValidator<T> = (value: T, allValues: Record<string, any>) => string | undefined | null
export type AsyncFieldValidator<T> = (value: T, allValues: Record<string, any>) => Promise<string | undefined | null>

export type FormOptions<T extends Record<string, any>> = {
  initialValues: T
  validate?: { [K in keyof T]?: FieldValidator<T[K]> }
  validateAsync?: { [K in keyof T]?: AsyncFieldValidator<T[K]> }
  validateForm?: (values: T) => Record<string, string> | undefined | null
  onSubmit: (values: T) => void | Promise<void>
  validateOnChange?: boolean
}

export type FieldState = {
  error: () => string | undefined
  touched: () => boolean
  dirty: () => boolean
}

export type FormHandle<T extends Record<string, any>> = {
  values: { [K in keyof T]: () => T[K] }
  errors: { [K in keyof T]: () => string | undefined }
  touched: { [K in keyof T]: () => boolean }
  dirty: { [K in keyof T]: () => boolean }
  setValue: <K extends keyof T>(field: K, value: T[K]) => void
  setError: <K extends keyof T>(field: K, error: string | undefined) => void
  setTouched: <K extends keyof T>(field: K) => void
  isValid: () => boolean
  submitting: () => boolean
  submit: () => void
  reset: () => void
  getValues: () => T
}

export function createForm<T extends Record<string, any>>(options: FormOptions<T>): FormHandle<T>
