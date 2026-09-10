import type { JSX } from "solid-js"
import {
  Box,
  Show,
  Text,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  useFocus,
} from "vexart"

import type { Ps5ScreenProps, SettingsState } from "./types"
import { resolve } from "node:path"
import { ps5Colors, ps5Motion, ps5Visual } from "./tokens"

export { ps5Colors, ps5Motion, ps5Visual }

export type Ps5Viewport = {
  width: () => number
  height: () => number
  scale: () => number
}

const viewportContext = createContext<Ps5Viewport>()

export type Ps5Settings = Pick<SettingsState, "highContrast" | "textScale" | "brightness">
const defaultSettings: Ps5Settings = { highContrast: false, textScale: "default", brightness: 100 }
const settingsContext = createContext<Ps5Settings | (() => Ps5Settings)>(defaultSettings)
type Ps5BackHandler = () => boolean
type Ps5BackRegistrar = (handler: Ps5BackHandler) => () => void
const backContext = createContext<Ps5BackRegistrar>()

/** Share user-facing accessibility settings without coupling screens to the store. */
export function Ps5SettingsProvider(props: {
  settings: Ps5Settings | (() => Ps5Settings)
  children: JSX.Element
}) {
  return <settingsContext.Provider value={props.settings}>{props.children}</settingsContext.Provider>
}

export function usePs5Settings(): () => Ps5Settings {
  const settings = useContext(settingsContext)
  return typeof settings === "function" ? settings : () => settings
}

/**
 * Register the active screen's local Escape/back behavior. Returning true
 * consumes the key; returning false lets the app host pop navigation.
 */
export function usePs5Back(handler: Ps5BackHandler) {
  const register = useContext(backContext)
  if (!register) throw new Error("[ps5] usePs5Back() must be used inside Ps5BackProvider")
  const cleanup = register(handler)
  onCleanup(cleanup)
}

export function Ps5BackProvider(props: { register: Ps5BackRegistrar; children: JSX.Element }) {
  return <backContext.Provider value={props.register}>{props.children}</backContext.Provider>
}

export function ps5TextScale(settings: Ps5Settings, value: number) {
  const factor = settings.textScale === "small" ? 0.9 : settings.textScale === "large" ? 1.15 : 1
  const minimum = settings.textScale === "small" ? 10 : settings.textScale === "large" ? 12 : 11
  return Math.max(minimum, Math.round(value * factor))
}

/**
 * Provide one responsive viewport for every PS5 screen and overlay.
 * Consumers use the accessors rather than reading terminal state directly.
 */
export function Ps5ViewportProvider(props: {
  width: number | (() => number)
  height: number | (() => number)
  children: JSX.Element
}) {
  const width = typeof props.width === "function" ? props.width : createSignal(props.width)[0]
  const height = typeof props.height === "function" ? props.height : createSignal(props.height)[0]
  const scale = () => Math.min(width() / ps5Visual.canvas.width, height() / ps5Visual.canvas.height)
  const value = { width, height, scale }
  return <viewportContext.Provider value={value}>{props.children}</viewportContext.Provider>
}

export type Ps5InputLayer = "base" | "overlay"
const inputLayerContext = createContext<Ps5InputLayer | (() => Ps5InputLayer)>("base")

export function Ps5InputLayerProvider(props: {
  activeLayer: Ps5InputLayer | (() => Ps5InputLayer)
  children: JSX.Element
}) {
  return <inputLayerContext.Provider value={props.activeLayer}>{props.children}</inputLayerContext.Provider>
}

export function usePs5Viewport(): Ps5Viewport {
  const viewport = useContext(viewportContext)
  if (!viewport) throw new Error("[ps5] usePs5Viewport() must be used inside Ps5ViewportProvider")
  return viewport
}

export function ps5Scale(viewport: Ps5Viewport, value: number) {
  return Math.max(1, Math.round(value * viewport.scale()))
}

export type Ps5PanelProps = {
  width?: number | string
  height?: number | string
  children?: JSX.Element
  padding?: number
  gap?: number
  direction?: "row" | "column"
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  cornerRadius?: number
  floating?: "parent" | "root"
  zIndex?: number
  opacity?: number
}

export function Ps5Panel(props: Ps5PanelProps) {
  const settings = usePs5Settings()
  return (
    <Box
      width={props.width}
      height={props.height}
      padding={props.padding}
      gap={props.gap}
      direction={props.direction}
      alignX={props.alignX}
      alignY={props.alignY}
      backgroundColor={props.backgroundColor ?? ps5Colors.panelSoft}
      borderColor={props.borderColor ?? (settings().highContrast ? ps5Colors.text : ps5Colors.divider)}
      borderWidth={props.borderWidth ?? 1}
      cornerRadius={props.cornerRadius ?? 16}
      floating={props.floating}
      zIndex={props.zIndex}
      opacity={props.opacity}
    >
      {props.children}
    </Box>
  )
}

export type Ps5ButtonProps = {
  /** Stable id used by focus restoration and screen automation. */
  id: string
  label?: string
  children?: JSX.Element
  onPress: () => void
  onKeyDown?: (event: { key: string; char: string; mods: { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean } }) => void
  disabled?: boolean
  width?: number | string
  height?: number | string
  padding?: number
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  cornerRadius?: number
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  childrenColor?: string
  /** Physical terminal font size for the default label. */
  fontSize?: number
  layer?: Ps5InputLayer
  /** Disable the shared white focus border when a caller renders its own focus treatment. */
  focusRing?: boolean
  /** Disable the shared focus halo when a caller renders its own focus treatment. */
  focusGlow?: boolean
  /** Optional screen contract for callers that keep button actions local to a store. */
  screen?: Pick<Ps5ScreenProps, "state" | "actions">
}

/**
 * A single focus registration is shared by keyboard and pointer input.
 * The visual node is intentionally not `focusable`: otherwise the engine would
 * register a second, generated node-focus-* entry and break stable restoration.
 */
export function Ps5Button(props: Ps5ButtonProps) {
  const settings = usePs5Settings()
  const activeLayer = useContext(inputLayerContext)
  const currentLayer = () => typeof activeLayer === "function" ? activeLayer() : activeLayer
  const inputEnabled = () => !props.disabled && (props.layer ?? "base") === currentLayer()
  const activate = () => {
    if (!inputEnabled()) return
    props.screen?.actions.setFocus(props.id)
    props.onPress()
  }
  const focus = useFocus({ id: props.id, onPress: activate, onKeyDown: (event) => {
    if (inputEnabled()) props.onKeyDown?.(event)
  } })
  createEffect(() => {
    if (props.screen?.state().focusedId === props.id) focus.focus()
  })
  const press = () => {
    if (!inputEnabled()) return
    focus.focus()
    activate()
  }
  const focused = () => focus.focused()
  return (
    <Box
      width={props.width}
      height={props.height}
      padding={props.padding}
      alignX={props.alignX ?? "center"}
      alignY={props.alignY ?? "center"}
      backgroundColor={props.disabled ? "#23272c" : (props.backgroundColor ?? (settings().highContrast ? "#0c1016" : "#2b3038"))}
      borderColor={focused() && props.focusRing !== false ? ps5Colors.focus : (props.borderColor ?? (settings().highContrast ? ps5Colors.text : ps5Colors.divider))}
      borderWidth={props.borderWidth ?? 1}
      cornerRadius={props.cornerRadius ?? 12}
      opacity={props.disabled ? 0.5 : 1}
      glow={focused() && props.focusGlow !== false ? { radius: 8, color: ps5Colors.focusGlow, intensity: 0.6 } : undefined}
      onPress={press}
      activeStyle={{ opacity: props.disabled ? 0.5 : 0.82 }}
      debugName={`ps5-button:${props.id}`}
    >
      {props.children ?? <Ps5Text color={props.childrenColor ?? ps5Colors.text} fontSize={props.fontSize ?? 14}>{props.label}</Ps5Text>}
    </Box>
  )
}

export type Ps5TextProps = {
  children?: JSX.Element
  width?: number | string
  height?: number | string
  color?: string
  fontSize?: number
  fontWeight?: number
  alignX?: "left" | "right" | "center" | "space-between"
  alignY?: "top" | "bottom" | "center" | "space-between"
  opacity?: number
  floating?: "parent" | "root"
  floatOffset?: { x: number; y: number }
}

/** Text alias for screens that need the shared text-size/high-contrast policy. */
export function Ps5Text(props: Ps5TextProps) {
  const settings = usePs5Settings()
  return (
    <Text
      width={props.width}
      height={props.height}
      color={settings().highContrast && props.color === ps5Colors.mutedText ? ps5Colors.text : (props.color ?? ps5Colors.text)}
      fontSize={ps5TextScale(settings(), props.fontSize ?? 16)}
      fontWeight={props.fontWeight}
      alignX={props.alignX}
      alignY={props.alignY}
      opacity={props.opacity}
      floating={props.floating}
      floatOffset={props.floatOffset}
    >{props.children}</Text>
  )
}

export type Ps5IconName =
  | "bell" | "books" | "game-controller" | "gear" | "house"
  | "magnifying-glass" | "microphone" | "music-note" | "power"
  | "speaker-high" | "squares-four" | "trophy" | "users-three"
  // Filled mock glyphs are local copies of upstream icon-library assets. They
  // are opt-in so regular screens keep their existing line-icon treatment.
  | "folders"
  | "game-controller-fill" | "gear-fill" | "trophy-platinum" | "trophy-gold"
  | "trophy-silver" | "trophy-bronze" | "store-bag-reference"
  | "library-grid-controller-reference"

const mockIconFiles: Partial<Record<Ps5IconName, string>> = {
  folders: "folders-fill.svg",
  "game-controller-fill": "game-controller-fill.svg",
  "gear-fill": "gear-fill.svg",
  "trophy-platinum": "trophy-platinum.svg",
  "trophy-gold": "trophy-gold.svg",
  "trophy-silver": "trophy-silver.svg",
  "trophy-bronze": "trophy-bronze.svg",
  "store-bag-reference": "store-bag-reference.png",
  "library-grid-controller-reference": "library-grid-controller-reference.png",
}

export function Ps5Icon(props: { name: Ps5IconName; size?: number; width?: number; height?: number; opacity?: number }) {
  const size = props.size ?? 28
  const path = resolve(import.meta.dir, "../assets/icons", mockIconFiles[props.name] ? "mock" : "", mockIconFiles[props.name] ?? `${props.name}.svg`)
  return <img src={path} width={props.width ?? size} height={props.height ?? size} opacity={props.opacity ?? 1} />
}

export function Ps5Avatar(props: { src?: string; name: string; accent?: string; size?: number; status?: boolean }) {
  const size = props.size ?? 90
  const initial = props.name.trim().slice(0, 1).toUpperCase() || "?"
  const isImage = !!props.src && /(?:[./]|https?:)/.test(props.src)
  const statusSize = Math.max(6, Math.round(size * 0.22))
  return (
    <Box width={size} height={size} cornerRadius={size / 2} backgroundColor={props.accent ?? "#303640"} alignX="center" alignY="center">
      {isImage ? <img src={props.src!} width={size} height={size} objectFit="cover" cornerRadius={size / 2} /> : <Text color={ps5Colors.text} fontSize={Math.max(14, Math.round(size * 0.38))}>{initial}</Text>}
      <Show when={props.status}>
        <Box
          width={statusSize}
          height={statusSize}
          floating="parent"
          floatOffset={{ x: size - statusSize, y: size - statusSize }}
          backgroundColor={ps5Colors.success}
          borderColor="#091017"
          borderWidth={Math.max(1, Math.round(size * 0.035))}
          cornerRadius={statusSize / 2}
        />
      </Show>
    </Box>
  )
}
