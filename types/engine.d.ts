/**
 * Vexart — GPU-Accelerated Terminal UI Engine
 * Type declarations for the npm package.
 */

// ── Terminal ──

export interface TerminalSize {
  cols: number
  rows: number
  pixelWidth: number
  pixelHeight: number
  cellWidth: number
  cellHeight: number
}

export interface Capabilities {
  kittyGraphics: boolean
  kittyKeyboard: boolean
  trueColor: boolean
  mouseTracking: boolean
  unicode: boolean
  tmux: boolean
}

export interface Terminal {
  kind: string
  caps: Capabilities
  size: TerminalSize
  write: (data: string | Uint8Array) => void
  rawWrite: (data: string) => void
  setTitle: (title: string) => void
  writeClipboard: (text: string) => void
  onData: (handler: (data: Uint8Array) => void) => () => void
  onResize: (handler: () => void) => () => void
  destroy: () => void
}

export function createTerminal(): Promise<Terminal>

// ── Input types ──

export interface Modifiers {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

export interface KeyEvent {
  type: "key"
  key: string
  char: string
  mods: Modifiers
}

export type MouseAction = "press" | "release" | "move" | "scroll"

export interface TgeMouseEvent {
  type: "mouse"
  action: MouseAction
  button: number
  x: number
  y: number
  mods: Modifiers
}

export interface FocusEvent {
  type: "focus"
  focused: boolean
}

export interface PasteEvent {
  type: "paste"
  text: string
}

export interface ResizeEvent {
  type: "resize"
}

export type InputEvent = KeyEvent | TgeMouseEvent | FocusEvent | PasteEvent | ResizeEvent

export declare const MouseButton: {
  readonly LEFT: 0
  readonly MIDDLE: 1
  readonly RIGHT: 2
  readonly RELEASE: 3
  readonly SCROLL_UP: 64
  readonly SCROLL_DOWN: 65
}

export function decodePasteBytes(bytes: Uint8Array | string): string

// ── Mount ──

export interface MountOptions {
}

export interface MountHandle {
  suspend: () => void
  resume: () => void
  suspended: () => boolean
  destroy: () => void
}

export function mount(component: () => any, terminal: Terminal, opts?: MountOptions): MountHandle

// ── Focus ──

export interface FocusHandle {
  focused: () => boolean
  focus: () => void
  id: string
}

export function useFocus(opts?: { id?: string; onKeyDown?: (event: KeyEvent) => void; onPress?: () => void }): FocusHandle
export function setFocus(id: string): void
export function focusedId(): string | null
export function setFocusedId(id: string | null): void
export function pushFocusScope(): () => void

// ── Input hooks ──

export interface KeyboardState {
  onKeyDown: (handler: (event: KeyEvent) => void) => void
}

export interface MouseState {
  onMouseEvent: (handler: (event: TgeMouseEvent) => void) => void
}

export function useKeyboard(handler: (event: KeyEvent) => void): void
export function useMouse(handler: (event: TgeMouseEvent) => void): void
export function useInput(handler: (event: InputEvent) => void): void
export function onInput(handler: (event: InputEvent) => void): () => void

// ── Selection ──

export interface TextSelection {
  startX: number
  startY: number
  endX: number
  endY: number
}

export function getSelection(): TextSelection | null
export function getSelectedText(): string
export function setSelection(sel: TextSelection): void
export function clearSelection(): void
export function selectionSignal(): TextSelection | null

// ── RGBA ──

export class RGBA {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
  constructor(r: number, g: number, b: number, a?: number)
  static fromInts(r: number, g: number, b: number, a?: number): RGBA
  static fromHex(hex: string): RGBA
  static fromValues(r: number, g: number, b: number, a?: number): RGBA
  toU32(): number
  valueOf(): number
  toString(): string
}

/**
 * Color value type — accepts hex string, packed u32 number, or RGBA instance.
 * RGBA.valueOf() returns number at runtime, but TypeScript needs the union.
 */
export type ColorValue = string | number | RGBA

// ── Dirty flag ──

export function markDirty(): void

// ── NodeHandle ──

export interface NodeHandle {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function createHandle(nodeId: number): NodeHandle

// ── ScrollHandle ──

export interface ScrollHandle {
  readonly scrollX: number
  readonly scrollY: number
  readonly contentWidth: number
  readonly contentHeight: number
  readonly viewportWidth: number
  readonly viewportHeight: number
  /** Alias for scrollY (opentui compat) */
  readonly y: number
  /** Alias for viewportHeight (opentui compat) */
  readonly height: number
  /** Alias for contentHeight (opentui compat) */
  readonly scrollHeight: number
  /** Alias for -scrollY (opentui compat — positive value) */
  readonly scrollTop: number
  scrollTo(y: number): void
  scrollBy(dy: number): void
  scrollIntoView(elementId: string): void
  /** Get child node handles (opentui compat). Returns empty array — Vexart children are in JSX tree. */
  getChildren(): NodeHandle[]
}

export function createScrollHandle(scrollId: string): ScrollHandle
export function resetScrollHandles(): void

// ── Debug ──

export interface DebugStats {
  fps: number
  frameTime: number
  layoutTime: number
  paintTime: number
  nodeCount: number
}

export function toggleDebug(): void
export function setDebug(enabled: boolean): void
export function isDebugEnabled(): boolean
export function debugFrameStart(): void
export function debugUpdateStats(stats: Partial<DebugStats>): void
export function debugState(): DebugStats
export function debugStatsLine(): string

// ── Plugins ──

export type TgePluginApi<Context = {}> = {
  slots: SlotRegistry
  terminal: Terminal
} & Context

export interface TgePlugin<Context = {}> {
  name: string
  setup: (api: TgePluginApi<Context>) => void | (() => void)
}

export declare const SlotMode: {
  readonly SINGLE_WINNER: "single_winner"
  readonly ALL: "all"
}

export interface SlotComponent {
  component: () => any
  priority?: number
}

export interface SlotRegistry<Slots = any> {
  register: (slotName: keyof Slots | string, component: SlotComponent) => void
  get: (slotName: keyof Slots | string) => SlotComponent[]
}

export function createSlotRegistry<Slots = any, Context = any>(): SlotRegistry<Slots>
export function createSlot(name: string, mode?: "single_winner" | "all" | string): { Slot: (props?: { mode?: "single_winner" | "all" | string; name?: string; [key: string]: any }) => any }

// ── Extmarks ──

export interface Extmark {
  id: number
  start: number
  end: number
  fg?: number
  bg?: number
  ghost?: boolean
  data?: Record<string, unknown>
  typeId?: number
}

export interface CreateExtmarkOptions {
  start: number
  end: number
  fg?: number
  bg?: number
  ghost?: boolean
  data?: Record<string, unknown>
  typeId?: number
}

export class ExtmarkManager {
  create(opts: CreateExtmarkOptions): Extmark
  remove(id: number): void
  clear(): void
  getAll(): Extmark[]
  getForLine(lineStart: number, lineEnd: number): Extmark[]
  getAllForTypeId(typeId: number): Extmark[]
  registerType(name: string): number
}

// ── Syntax highlighting ──

export interface ThemeTokenStyle {
  color?: string
  foreground?: ColorValue
  bold?: boolean
  italic?: boolean
}

export type StyleDefinitionEntry = ThemeTokenStyle | {
  scope: string | string[]
  style: { foreground?: ColorValue; bold?: boolean; italic?: boolean }
}

export type StyleDefinition = {
  [capture: string]: ThemeTokenStyle
} | StyleDefinitionEntry[]

export declare const ONE_DARK: StyleDefinition
export declare const KANAGAWA: StyleDefinition

export class SyntaxStyle {
  static fromTheme(theme: StyleDefinition | StyleDefinitionEntry[]): SyntaxStyle
  getDefaultColor(): number
  getStyleId(name: string): number
}

export interface Token {
  text: string
  color: number
}

export interface SimpleHighlight {
  start: number
  end: number
  capture: string
}

export interface FiletypeParserConfig {
  language: string
  wasmPath: string
  queriesPath?: string
  queries?: {
    highlights?: string
    locals?: string | string[]
    injections?: string
  }
}

export class TreeSitterClient {
  highlightOnce(content: string, language: string): Promise<SimpleHighlight[]>
}

export function getTreeSitterClient(): TreeSitterClient
export function addDefaultParsers(parsers: FiletypeParserConfig[]): void
export function highlightsToTokens(content: string, highlights: SimpleHighlight[], style: SyntaxStyle): Token[][]

// ── Text layout ──

export interface FontDescriptor {
  id: number
  name: string
  cellWidth: number
  cellHeight: number
}

export function registerFont(desc: FontDescriptor, atlasData: Uint8Array, widths?: Float32Array): void
export function getFont(id: number): FontDescriptor | undefined
export function clearTextCache(): void
export function clearImageCache(): void

// ── Data fetching hooks ──

export interface QueryResult<T> {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  refetch: () => void
  mutate: (data: T | ((prev: T | undefined) => T)) => void
}

export interface QueryOptions {
  enabled?: boolean
  refetchInterval?: number
  retry?: number
  retryDelay?: number
}

export interface MutationResult<T, V> {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  mutate: (variables: V) => Promise<T | undefined>
  reset: () => void
}

export interface MutationOptions<T, V> {
  onMutate?: (variables: V) => T | undefined
  onSuccess?: (data: T, variables: V) => void
  onError?: (error: Error, variables: V, previousData: T | undefined) => void
  onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void
}

export function useQuery<T>(fetcher: () => Promise<T>, options?: QueryOptions): QueryResult<T>
export function useMutation<T, V = void>(mutator: (variables: V) => Promise<T>, options?: MutationOptions<T, V>): MutationResult<T, V>

// ── Terminal dimensions hook ──

export function useTerminalDimensions(terminal: Terminal): {
  width: () => number
  height: () => number
  cols: () => number
  rows: () => number
  cellWidth: () => number
  cellHeight: () => number
}

// ── Layout constants ──

export declare const SIZING: { readonly FIT: 0; readonly GROW: 1; readonly PERCENT: 2; readonly FIXED: 3 }
export declare const DIRECTION: { readonly LEFT_TO_RIGHT: 0; readonly TOP_TO_BOTTOM: 1 }
export declare const ALIGN_X: { readonly LEFT: 0; readonly RIGHT: 1; readonly CENTER: 2; readonly SPACE_BETWEEN: 3 }
export declare const ALIGN_Y: { readonly TOP: 0; readonly BOTTOM: 1; readonly CENTER: 2; readonly SPACE_BETWEEN: 3 }
export declare const ATTACH_TO: { readonly NONE: 0; readonly PARENT: 1; readonly ELEMENT: 2; readonly ROOT: 3 }
export declare const ATTACH_POINT: {
  readonly LEFT_TOP: 0; readonly LEFT_CENTER: 1; readonly LEFT_BOTTOM: 2
  readonly CENTER_TOP: 3; readonly CENTER_CENTER: 4; readonly CENTER_BOTTOM: 5
  readonly RIGHT_TOP: 6; readonly RIGHT_CENTER: 7; readonly RIGHT_BOTTOM: 8
}
export declare const POINTER_CAPTURE: { readonly CAPTURE: 0; readonly PASSTHROUGH: 1 }

// ── Render loop (advanced) ──

export interface RenderLoopOptions {
}

export interface RenderLoop {
  root: any
  start: () => void
  destroy: () => void
  suspend: () => void
  resume: () => void
  suspended: () => boolean
  feedPointer: (x: number, y: number, pressed: boolean) => void
  feedScroll: (dx: number, dy: number) => void
}

export function createRenderLoop(terminal: Terminal, opts?: RenderLoopOptions): RenderLoop

// ── SolidJS re-exports ──

export function createComponent<T>(comp: (props: T) => any, props: T): any
export function createElement(tag: string): any
export function createTextNode(text: string): any
export function insertNode(parent: any, child: any, anchor?: any): void
export function insert(parent: any, accessor: any, marker?: any): any
export function spread(node: any, accessor: any): void
export function setProp(node: any, name: string, value: any): void
export function mergeProps(...sources: any[]): any
export function effect(fn: () => void): void
export function memo<T>(fn: () => T): () => T
export function use(fn: any, element: any): void

export declare const For: any
export declare const Show: any
export declare const Switch: any
export declare const Match: any
export declare const Index: any
export declare const ErrorBoundary: any

export { render as solidRender } from "solid-js/universal"

// ── Router (Decision 10: Dual Router) ──

export interface NavigationEntry {
  path: string
  params?: Record<string, any>
}

export interface RouteProps {
  params?: Record<string, any>
}

export interface RouterContextValue {
  current: () => string
  navigate: (path: string, params?: Record<string, any>) => void
  goBack: () => boolean
  params: () => Record<string, any> | undefined
  history: () => NavigationEntry[]
}

export interface ScreenProps {
  params?: Record<string, any>
  goBack: () => void
}

export interface ScreenEntry {
  key: string
  component: (props: ScreenProps) => any
  params?: Record<string, any>
}

export interface NavigationStackHandle {
  push: (component: (props: ScreenProps) => any, params?: Record<string, any>) => void
  pop: () => boolean
  goBack: () => boolean
  replace: (component: (props: ScreenProps) => any, params?: Record<string, any>) => void
  reset: (component: (props: ScreenProps) => any, params?: Record<string, any>) => void
  depth: () => number
  current: () => ScreenEntry | undefined
  stack: () => ScreenEntry[]
}

export function createRouter(initialPath: string): RouterContextValue
export function createNavigationStack(initial?: (props: ScreenProps) => any): NavigationStackHandle
export function useRouter(): RouterContextValue
