import { markDirty, useDrag, type DragProps, type NodeHandle, type NodeMouseEvent } from "@tge/renderer-solid"
import type { Accessor } from "solid-js"
import { useWindowDescriptor, useWindowManagerContext } from "./context"
import { WINDOW_STATUS, type WindowBounds, type WindowDescriptor, type WindowPosition, type WindowSize } from "./types"

export interface WindowDragAnchor {
  pointerX: number
  pointerY: number
}

export interface WindowFrameRefProps {
  ref: (handle: NodeHandle) => void
}

export interface WindowDragHandleProps {
  ref?: DragProps["ref"]
  onMouseDown?: DragProps["onMouseDown"]
  onMouseMove?: DragProps["onMouseMove"]
  onMouseUp?: DragProps["onMouseUp"]
}

export interface UseWindowDragOptions {
  disabled?: () => boolean
  shouldStart?: (event: NodeMouseEvent, window: WindowDescriptor) => boolean
  onDebugEvent?: (message: string) => void
}

export interface UseWindowDragResult {
  dragging: Accessor<boolean>
  frameProps: WindowFrameRefProps
  dragHandleProps: WindowDragHandleProps
}

export interface WindowDragRegion {
  topInset: number
  height: number
  leftInset: number
  rightInset: number
}

export function isPointInWindowDragRegion(
  event: Pick<NodeMouseEvent, "nodeX" | "nodeY" | "width">,
  region: WindowDragRegion,
): boolean {
  const minX = region.leftInset
  const maxX = Math.max(minX, event.width - region.rightInset)
  const minY = region.topInset
  const maxY = region.topInset + region.height

  if (event.nodeX < minX) return false
  if (event.nodeX >= maxX) return false
  if (event.nodeY < minY) return false
  if (event.nodeY >= maxY) return false
  return true
}

export function clampWindowPosition(position: WindowPosition, size: WindowSize, workspace?: WindowBounds): WindowPosition {
  if (!workspace) {
    return {
      x: position.x,
      y: position.y,
    }
  }

  const maxX = workspace.x + Math.max(0, workspace.width - size.width)
  const maxY = workspace.y + Math.max(0, workspace.height - size.height)
  const nextX = Math.min(Math.max(position.x, workspace.x), maxX)
  const nextY = Math.min(Math.max(position.y, workspace.y), maxY)

  return {
    x: nextX,
    y: nextY,
  }
}

export function resolveWindowDragPosition(
  pointer: Pick<NodeMouseEvent, "x" | "y">,
  anchor: WindowDragAnchor,
  bounds: WindowBounds,
  workspace?: WindowBounds,
): WindowPosition {
  const nextPosition = {
    x: Math.round(pointer.x - anchor.pointerX),
    y: Math.round(pointer.y - anchor.pointerY),
  }

  return clampWindowPosition(nextPosition, { width: bounds.width, height: bounds.height }, workspace)
}

export function useWindowDrag(windowId: string, options?: UseWindowDragOptions): UseWindowDragResult {
  const context = useWindowManagerContext()
  const window = useWindowDescriptor(windowId)
  let anchor: WindowDragAnchor = { pointerX: 0, pointerY: 0 }
  let focusedDuringDrag = false

  const disabled = () => {
    if (options?.disabled?.()) return true
    const currentWindow = window()
    if (!currentWindow) return true
    if (!currentWindow.capabilities.movable) return true
    if (currentWindow.status === WINDOW_STATUS.MINIMIZED) return true
    if (currentWindow.status === WINDOW_STATUS.MAXIMIZED) return true
    return false
  }

  const drag = useDrag({
    disabled,
    onDragStart: (event) => {
      const currentWindow = window()
      if (!currentWindow) return false
      options?.onDebugEvent?.(`${windowId}: dragStart down abs(${Math.round(event.x)},${Math.round(event.y)}) rel(${Math.round(event.nodeX)},${Math.round(event.nodeY)})`)
      if (options?.shouldStart && !options.shouldStart(event, currentWindow)) return false
      focusedDuringDrag = false
      anchor = {
        pointerX: event.nodeX,
        pointerY: event.nodeY,
      }
      options?.onDebugEvent?.(`${windowId}: anchor (${Math.round(anchor.pointerX)},${Math.round(anchor.pointerY)})`)
    },
    onDrag: (event) => {
      const currentWindow = window()
      if (!currentWindow) return
      options?.onDebugEvent?.(`${windowId}: onDrag abs(${Math.round(event.x)},${Math.round(event.y)}) rel(${Math.round(event.nodeX)},${Math.round(event.nodeY)})`)
      if (!focusedDuringDrag) {
        focusedDuringDrag = true
        options?.onDebugEvent?.(`${windowId}: focusWindow()`)
        context.focusWindow(windowId)
        markDirty()
      }
      const nextPosition = resolveWindowDragPosition(event, anchor, currentWindow.bounds, context.workspace())
      options?.onDebugEvent?.(`${windowId}: moveWindow(${nextPosition.x},${nextPosition.y}) from (${currentWindow.bounds.x},${currentWindow.bounds.y})`)
      context.moveWindow(windowId, nextPosition)
      markDirty()
    },
    onDragEnd: () => {
      options?.onDebugEvent?.(`${windowId}: dragEnd`)
      focusedDuringDrag = false
      markDirty()
    },
  })

  return {
    dragging: drag.dragging,
    frameProps: {
      ref: drag.dragProps.ref,
    },
    dragHandleProps: {
      ref: drag.dragProps.ref,
      onMouseDown: drag.dragProps.onMouseDown,
      onMouseMove: drag.dragProps.onMouseMove,
      onMouseUp: drag.dragProps.onMouseUp,
    },
  }
}
