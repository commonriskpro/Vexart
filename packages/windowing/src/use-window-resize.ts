import { markDirty, useDrag, useInteractionLayer, type DragProps, type NodeHandle } from "@tge/renderer-solid"
import type { Accessor } from "solid-js"
import { useWindowDescriptor, useWindowManagerContext } from "./context"
import {
  WINDOW_STATUS,
  type WindowBounds,
  type WindowConstraints,
} from "./types"

export const WINDOW_RESIZE_EDGE = {
  NORTH: "north",
  SOUTH: "south",
  EAST: "east",
  WEST: "west",
  NORTH_EAST: "north-east",
  NORTH_WEST: "north-west",
  SOUTH_EAST: "south-east",
  SOUTH_WEST: "south-west",
} as const

export type WindowResizeEdge = (typeof WINDOW_RESIZE_EDGE)[keyof typeof WINDOW_RESIZE_EDGE]

export interface WindowResizeAnchor {
  pointerX: number
  pointerY: number
  bounds: WindowBounds
}

export interface WindowResizeHandleProps extends DragProps {}

export interface WindowResizeFrameProps {
  ref: (handle: NodeHandle) => void
}

export interface WindowResizeHandleLayout {
  edge: WindowResizeEdge
  x: number
  y: number
  width: number
  height: number
}

export interface UseWindowResizeOptions {
  disabled?: () => boolean
}

export interface UseWindowResizeResult {
  resizing: Accessor<boolean>
  frameProps: WindowResizeFrameProps
  getHandleProps: (edge: WindowResizeEdge) => WindowResizeHandleProps
}

function clampDimension(value: number, min?: number, max?: number) {
  const minValue = Math.max(1, min ?? 1)
  if (value < minValue) return minValue
  if (max !== undefined && value > max) return max
  return value
}

function clampBoundsToWorkspace(bounds: WindowBounds, workspace?: WindowBounds): WindowBounds {
  if (!workspace) return bounds

  const width = Math.min(bounds.width, workspace.width)
  const height = Math.min(bounds.height, workspace.height)
  const maxX = workspace.x + Math.max(0, workspace.width - width)
  const maxY = workspace.y + Math.max(0, workspace.height - height)

  return {
    x: Math.min(Math.max(bounds.x, workspace.x), maxX),
    y: Math.min(Math.max(bounds.y, workspace.y), maxY),
    width,
    height,
  }
}

export function resolveWindowResizeBounds(
  pointer: { x: number; y: number },
  edge: WindowResizeEdge,
  anchor: WindowResizeAnchor,
  constraints?: WindowConstraints,
  workspace?: WindowBounds,
): WindowBounds {
  const dx = Math.round(pointer.x - anchor.pointerX)
  const dy = Math.round(pointer.y - anchor.pointerY)
  const initial = anchor.bounds
  const initialRight = initial.x + initial.width
  const initialBottom = initial.y + initial.height

  let nextLeft = initial.x
  let nextTop = initial.y
  let nextRight = initialRight
  let nextBottom = initialBottom

  if (edge === WINDOW_RESIZE_EDGE.WEST || edge === WINDOW_RESIZE_EDGE.NORTH_WEST || edge === WINDOW_RESIZE_EDGE.SOUTH_WEST) {
    nextLeft += dx
  }
  if (edge === WINDOW_RESIZE_EDGE.EAST || edge === WINDOW_RESIZE_EDGE.NORTH_EAST || edge === WINDOW_RESIZE_EDGE.SOUTH_EAST) {
    nextRight += dx
  }
  if (edge === WINDOW_RESIZE_EDGE.NORTH || edge === WINDOW_RESIZE_EDGE.NORTH_EAST || edge === WINDOW_RESIZE_EDGE.NORTH_WEST) {
    nextTop += dy
  }
  if (edge === WINDOW_RESIZE_EDGE.SOUTH || edge === WINDOW_RESIZE_EDGE.SOUTH_EAST || edge === WINDOW_RESIZE_EDGE.SOUTH_WEST) {
    nextBottom += dy
  }

  if (workspace) {
    nextLeft = Math.max(nextLeft, workspace.x)
    nextTop = Math.max(nextTop, workspace.y)
    nextRight = Math.min(nextRight, workspace.x + workspace.width)
    nextBottom = Math.min(nextBottom, workspace.y + workspace.height)
  }

  let nextWidth = nextRight - nextLeft
  let nextHeight = nextBottom - nextTop

  nextWidth = clampDimension(nextWidth, constraints?.minWidth, constraints?.maxWidth)
  nextHeight = clampDimension(nextHeight, constraints?.minHeight, constraints?.maxHeight)

  if (edge === WINDOW_RESIZE_EDGE.WEST || edge === WINDOW_RESIZE_EDGE.NORTH_WEST || edge === WINDOW_RESIZE_EDGE.SOUTH_WEST) {
    nextLeft = nextRight - nextWidth
  } else {
    nextRight = nextLeft + nextWidth
  }

  if (edge === WINDOW_RESIZE_EDGE.NORTH || edge === WINDOW_RESIZE_EDGE.NORTH_EAST || edge === WINDOW_RESIZE_EDGE.NORTH_WEST) {
    nextTop = nextBottom - nextHeight
  } else {
    nextBottom = nextTop + nextHeight
  }

  return clampBoundsToWorkspace({
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  }, workspace)
}

export function createWindowResizeHandleLayouts(bounds: WindowBounds, thickness = 6, cornerSize = 12): WindowResizeHandleLayout[] {
  const innerWidth = Math.max(0, bounds.width - cornerSize * 2)
  const innerHeight = Math.max(0, bounds.height - cornerSize * 2)

  return [
    { edge: WINDOW_RESIZE_EDGE.NORTH, x: cornerSize, y: 0, width: innerWidth, height: thickness },
    { edge: WINDOW_RESIZE_EDGE.SOUTH, x: cornerSize, y: Math.max(0, bounds.height - thickness), width: innerWidth, height: thickness },
    { edge: WINDOW_RESIZE_EDGE.EAST, x: Math.max(0, bounds.width - thickness), y: cornerSize, width: thickness, height: innerHeight },
    { edge: WINDOW_RESIZE_EDGE.WEST, x: 0, y: cornerSize, width: thickness, height: innerHeight },
    { edge: WINDOW_RESIZE_EDGE.NORTH_EAST, x: Math.max(0, bounds.width - cornerSize), y: 0, width: cornerSize, height: cornerSize },
    { edge: WINDOW_RESIZE_EDGE.NORTH_WEST, x: 0, y: 0, width: cornerSize, height: cornerSize },
    { edge: WINDOW_RESIZE_EDGE.SOUTH_EAST, x: Math.max(0, bounds.width - cornerSize), y: Math.max(0, bounds.height - cornerSize), width: cornerSize, height: cornerSize },
    { edge: WINDOW_RESIZE_EDGE.SOUTH_WEST, x: 0, y: Math.max(0, bounds.height - cornerSize), width: cornerSize, height: cornerSize },
  ]
}

export function useWindowResize(windowId: string, options?: UseWindowResizeOptions): UseWindowResizeResult {
  const context = useWindowManagerContext()
  const window = useWindowDescriptor(windowId)
  const interactionLayer = useInteractionLayer()
  let anchor: WindowResizeAnchor | null = null

  const disabled = () => {
    if (options?.disabled?.()) return true
    const currentWindow = window()
    if (!currentWindow) return true
    if (!currentWindow.capabilities.resizable) return true
    if (currentWindow.status === WINDOW_STATUS.MINIMIZED) return true
    if (currentWindow.status === WINDOW_STATUS.MAXIMIZED) return true
    return false
  }

  function createEdgeDrag(edge: WindowResizeEdge) {
    return useDrag({
      interaction: "none",
      disabled,
      onDragStart: (event) => {
        const currentWindow = window()
        if (!currentWindow) return false
        anchor = {
          pointerX: event.x,
          pointerY: event.y,
          bounds: currentWindow.bounds,
        }
        interactionLayer.begin("drag")
        context.focusWindow(windowId)
      },
      onDrag: (event) => {
        const currentWindow = window()
        if (!currentWindow || !anchor) return
        const nextBounds = resolveWindowResizeBounds(
          { x: event.x, y: event.y },
          edge,
          anchor,
          currentWindow.constraints,
          context.workspace(),
        )
        context.resizeWindow(windowId, nextBounds)
        markDirty()
      },
      onDragEnd: () => {
        interactionLayer.end("drag")
        markDirty()
      },
    })
  }

  const handleStates = {
    [WINDOW_RESIZE_EDGE.NORTH]: createEdgeDrag(WINDOW_RESIZE_EDGE.NORTH),
    [WINDOW_RESIZE_EDGE.SOUTH]: createEdgeDrag(WINDOW_RESIZE_EDGE.SOUTH),
    [WINDOW_RESIZE_EDGE.EAST]: createEdgeDrag(WINDOW_RESIZE_EDGE.EAST),
    [WINDOW_RESIZE_EDGE.WEST]: createEdgeDrag(WINDOW_RESIZE_EDGE.WEST),
    [WINDOW_RESIZE_EDGE.NORTH_EAST]: createEdgeDrag(WINDOW_RESIZE_EDGE.NORTH_EAST),
    [WINDOW_RESIZE_EDGE.NORTH_WEST]: createEdgeDrag(WINDOW_RESIZE_EDGE.NORTH_WEST),
    [WINDOW_RESIZE_EDGE.SOUTH_EAST]: createEdgeDrag(WINDOW_RESIZE_EDGE.SOUTH_EAST),
    [WINDOW_RESIZE_EDGE.SOUTH_WEST]: createEdgeDrag(WINDOW_RESIZE_EDGE.SOUTH_WEST),
  }

  const resizing = () => Object.values(handleStates).some((state) => state.dragging())

  return {
    resizing,
    frameProps: {
      ref: interactionLayer.ref,
    },
    getHandleProps: (edge: WindowResizeEdge) => handleStates[edge].dragProps,
  }
}
