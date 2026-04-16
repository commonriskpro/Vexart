import type { PixelBuffer } from "@tge/compat-software"
import type { TGENode } from "./node"
import type { RenderCommand } from "./clay"

export function hasTransformInSubtree(node: TGENode): boolean {
  if (node.kind === "text") return false
  if (node.props.transform) return true
  return node.children.some((child) => hasTransformInSubtree(child))
}

export function canUsePartialUpdates(boundaryNode: TGENode | null): boolean {
  if (!boundaryNode || boundaryNode.kind === "text") return true
  if (boundaryNode.props.floating) return false
  if (boundaryNode.props.viewportClip === false) return false
  if (hasTransformInSubtree(boundaryNode)) return false
  return true
}

export function canUseRegionalRepaint(boundaryNode: TGENode | null, hasScissor: boolean, isBg: boolean): boolean {
  if (hasScissor) return false
  if (isBg) return true
  if (!boundaryNode || boundaryNode.kind === "text") return true
  if (boundaryNode.props.viewportClip === false) return false
  if (hasTransformInSubtree(boundaryNode)) return false
  return true
}

export function commandIntersectsRect(cmd: RenderCommand, rect: { x: number; y: number; width: number; height: number }) {
  const left = cmd.x
  const top = cmd.y
  const right = cmd.x + cmd.width
  const bottom = cmd.y + cmd.height
  return left < rect.x + rect.width && right > rect.x && top < rect.y + rect.height && bottom > rect.y
}

export function clearRectRegion(buf: PixelBuffer, x: number, y: number, width: number, height: number, color = 0x00000000) {
  const a = color & 0xff
  const b = (color >>> 8) & 0xff
  const g = (color >>> 16) & 0xff
  const r = (color >>> 24) & 0xff
  const x0 = Math.max(0, x)
  const y0 = Math.max(0, y)
  const x1 = Math.min(buf.width, x + width)
  const y1 = Math.min(buf.height, y + height)
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * buf.stride
    for (let xx = x0; xx < x1; xx++) {
      const i = row + xx * 4
      buf.data[i] = r
      buf.data[i + 1] = g
      buf.data[i + 2] = b
      buf.data[i + 3] = a
    }
  }
}
