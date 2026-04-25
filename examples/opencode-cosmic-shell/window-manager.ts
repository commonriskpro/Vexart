import { createMemo, createSignal } from "solid-js"

export const OPENCODE_WINDOW_KIND = {
  BACKGROUND: "background",
  RAIL: "rail",
  EDITOR: "editor",
  NOVA: "nova",
  DOCK: "dock",
  OVERLAY: "overlay",
} as const

export const OPENCODE_WINDOW_ID = {
  BACKGROUND: "background",
  RAIL: "rail",
  EDITOR: "editor",
  NOVA: "nova",
  DOCK: "dock",
  OVERLAY: "overlay",
} as const

export const OPENCODE_SURFACE_LAYER = {
  BACKGROUND: "background",
  SHELL: "shell",
  WINDOW: "window",
  PANEL: "panel",
  DOCK: "dock",
  OVERLAY: "overlay",
  SYSTEM: "system",
} as const

export type OpenCodeWindowKind = (typeof OPENCODE_WINDOW_KIND)[keyof typeof OPENCODE_WINDOW_KIND]
export type OpenCodeWindowId = (typeof OPENCODE_WINDOW_ID)[keyof typeof OPENCODE_WINDOW_ID]
export type OpenCodeSurfaceLayer = (typeof OPENCODE_SURFACE_LAYER)[keyof typeof OPENCODE_SURFACE_LAYER]

export interface OpenCodeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OpenCodeWindowInput {
  id: OpenCodeWindowId
  kind: OpenCodeWindowKind
  layer: OpenCodeSurfaceLayer
  rect: OpenCodeRect
  visible?: boolean
  focusable?: boolean
  stackIndex?: number
}

export interface OpenCodeWindowSnapshot extends OpenCodeWindowInput {
  visible: boolean
  focusable: boolean
  stackIndex: number
  zIndex: number
  active: boolean
}

export interface OpenCodeWindowManager {
  windows: () => readonly OpenCodeWindowSnapshot[]
  visibleWindows: () => readonly OpenCodeWindowSnapshot[]
  window: (id: OpenCodeWindowId) => OpenCodeWindowSnapshot | null
  visibleWindow: (id: OpenCodeWindowId) => OpenCodeWindowSnapshot | null
  activeId: () => string | null
  focus: (id: OpenCodeWindowId) => void
  raise: (id: OpenCodeWindowId) => void
}

const LAYER_ORDER: Record<OpenCodeSurfaceLayer, number> = {
  [OPENCODE_SURFACE_LAYER.BACKGROUND]: 0,
  [OPENCODE_SURFACE_LAYER.SHELL]: 1,
  [OPENCODE_SURFACE_LAYER.WINDOW]: 2,
  [OPENCODE_SURFACE_LAYER.PANEL]: 3,
  [OPENCODE_SURFACE_LAYER.OVERLAY]: 4,
  [OPENCODE_SURFACE_LAYER.DOCK]: 5,
  [OPENCODE_SURFACE_LAYER.SYSTEM]: 6,
}

const LAYER_STRIDE = 1_000

function layerZ(layer: OpenCodeSurfaceLayer) {
  return LAYER_ORDER[layer] * LAYER_STRIDE
}

function normalize(input: OpenCodeWindowInput, activeId: string | null): OpenCodeWindowSnapshot {
  const visible = input.visible ?? true
  const focusable = input.focusable ?? input.layer !== OPENCODE_SURFACE_LAYER.BACKGROUND
  const stackIndex = input.stackIndex ?? 0
  return {
    ...input,
    visible,
    focusable,
    stackIndex,
    zIndex: layerZ(input.layer) + stackIndex,
    active: activeId === input.id,
  }
}

export function createOpenCodeWindowManager(inputSource: OpenCodeWindowInput[] | (() => OpenCodeWindowInput[]), initialActiveId: OpenCodeWindowId = OPENCODE_WINDOW_ID.EDITOR): OpenCodeWindowManager {
  const readInputs = () => typeof inputSource === "function" ? inputSource() : inputSource
  const [activeId, setActiveId] = createSignal<string | null>(initialActiveId)
  const [stack, setStack] = createSignal<Record<string, number>>(
    Object.fromEntries(readInputs().map((input, index) => [input.id, input.stackIndex ?? index])),
  )

  const windows = createMemo(() => readInputs()
    .map((input) => normalize({ ...input, stackIndex: stack()[input.id] ?? input.stackIndex ?? 0 }, activeId()))
    .sort((a, b) => a.zIndex - b.zIndex))

  const visibleWindows = createMemo(() => windows().filter((window) => window.visible))

  function raise(id: string) {
    const current = stack()
    const max = Math.max(0, ...Object.values(current))
    setStack({ ...current, [id]: max + 1 })
  }

  function focus(id: string) {
    const target = windows().find((window) => window.id === id)
    if (!target || !target.focusable || !target.visible) return
    setActiveId(id)
    raise(id)
  }

  return {
    windows,
    visibleWindows,
    window: (id) => windows().find((window) => window.id === id) ?? null,
    visibleWindow: (id) => visibleWindows().find((window) => window.id === id) ?? null,
    activeId,
    focus,
    raise,
  }
}

export function createOpenCodeShellWindows(input: { width: number; height: number; railVisible: boolean; novaVisible: boolean; overlayVisible: boolean }): OpenCodeWindowInput[] {
  const margin = 36
  const top = 82
  const bottom = 84
  const gap = 16
  const dockHeight = 64
  const railWidth = input.railVisible ? 286 : 0
  const novaWidth = input.novaVisible ? 438 : 0
  const mainHeight = Math.max(520, input.height - 118)
  const editorX = margin + (input.railVisible ? railWidth + gap : 0)
  const editorRight = input.width - margin - (input.novaVisible ? novaWidth + gap : 0)
  const editorWidth = Math.max(320, editorRight - editorX)

  return [
    { id: OPENCODE_WINDOW_ID.BACKGROUND, kind: OPENCODE_WINDOW_KIND.BACKGROUND, layer: OPENCODE_SURFACE_LAYER.BACKGROUND, rect: { x: 0, y: 0, width: input.width, height: input.height }, focusable: false, stackIndex: 0 },
    { id: OPENCODE_WINDOW_ID.RAIL, kind: OPENCODE_WINDOW_KIND.RAIL, layer: OPENCODE_SURFACE_LAYER.SHELL, rect: { x: margin, y: top, width: railWidth, height: mainHeight }, visible: input.railVisible, focusable: true, stackIndex: 0 },
    { id: OPENCODE_WINDOW_ID.EDITOR, kind: OPENCODE_WINDOW_KIND.EDITOR, layer: OPENCODE_SURFACE_LAYER.WINDOW, rect: { x: editorX, y: top, width: editorWidth, height: mainHeight }, focusable: true, stackIndex: 1 },
    { id: OPENCODE_WINDOW_ID.NOVA, kind: OPENCODE_WINDOW_KIND.NOVA, layer: OPENCODE_SURFACE_LAYER.PANEL, rect: { x: input.width - margin - novaWidth, y: top, width: novaWidth, height: mainHeight }, visible: input.novaVisible, focusable: true, stackIndex: 2 },
    { id: OPENCODE_WINDOW_ID.OVERLAY, kind: OPENCODE_WINDOW_KIND.OVERLAY, layer: OPENCODE_SURFACE_LAYER.OVERLAY, rect: { x: editorX + 36, y: top + 24, width: 380, height: 320 }, visible: input.overlayVisible, focusable: true, stackIndex: 0 },
    { id: OPENCODE_WINDOW_ID.DOCK, kind: OPENCODE_WINDOW_KIND.DOCK, layer: OPENCODE_SURFACE_LAYER.DOCK, rect: { x: margin, y: Math.max(16, input.height - 96), width: Math.max(360, input.width - margin * 2), height: dockHeight }, focusable: true, stackIndex: 0 },
  ]
}
