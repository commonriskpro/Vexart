import type { WindowBounds } from "./types"

export function resolveDesktopBounds(
  workspace?: WindowBounds,
  width?: number | string,
  height?: number | string,
): WindowBounds | undefined {
  if (workspace) {
    return {
      x: workspace.x,
      y: workspace.y,
      width: workspace.width,
      height: workspace.height,
    }
  }

  if (typeof width === "number" && typeof height === "number") {
    return {
      x: 0,
      y: 0,
      width,
      height,
    }
  }

  return undefined
}

export function resolveDesktopWorkspace(bounds?: WindowBounds, taskbarHeight?: number): WindowBounds | undefined {
  if (!bounds) return undefined
  const reserved = Math.max(0, taskbarHeight ?? 0)
  const height = Math.max(0, bounds.height - reserved)

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height,
  }
}

export function resolveTaskbarBounds(bounds?: WindowBounds, taskbarHeight?: number): WindowBounds | undefined {
  if (!bounds) return undefined
  const height = Math.max(0, taskbarHeight ?? 0)
  if (height === 0) return undefined

  return {
    x: bounds.x,
    y: bounds.y + Math.max(0, bounds.height - height),
    width: bounds.width,
    height,
  }
}
