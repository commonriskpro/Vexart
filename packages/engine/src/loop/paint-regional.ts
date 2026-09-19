/**
 * paint-regional.ts — Regional layer repainting and dirty region intersection.
 *
 * Extracted from paint.ts as part of loop decomposition.
 * Handles:
 *   - Dirty and repaint rect selection
 *   - Regional repaint eligibility checks
 *   - Transform and translation quad calculations
 *   - Effect bounds expansion (shadows, glows)
 *   - Backend profiling aggregation
 */

import type { DamageRect, TransformQuad } from "../ffi/damage"
import type { RenderCommand, RenderGraphOp } from "../ffi/render-graph"
import type { RendererBackend } from "../ffi/renderer-backend"
import { multiply, translate, transformPoint } from "../ffi/matrix"
import { resolveProps, type TGENode } from "../ffi/node"
import type { FrameProfile } from "./types"
import type { PreparedLayerSlot } from "./paint-layer"

export type PaintProfiler = Pick<FrameProfile,
  | "paintNativeSnapshotMs" | "paintLayerPrepMs" | "paintFrameContextMs"
  | "paintBackendBeginMs" | "paintReuseMs" | "paintRenderGraphMs"
  | "paintBackendPaintMs" | "paintBackendCompositeMs" | "paintBackendReadbackMs"
  | "paintBackendNativeEmitMs" | "paintBackendNativeReadbackMs"
  | "paintBackendNativeCompressMs" | "paintBackendNativeShmPrepareMs"
  | "paintBackendNativeWriteMs" | "paintBackendNativeRawBytes"
  | "paintBackendNativePayloadBytes" | "paintBackendUniformMs"
  | "paintLayerCleanupMs" | "paintBackendEndMs" | "paintPresentationMs"
  | "paintInteractionStatsMs"
>

export function selectLayerRepaintRect(
  effectiveUseRegionalRepaint: boolean,
  clippedDamage: { x: number; y: number; width: number; height: number } | null,
) {
  return effectiveUseRegionalRepaint ? clippedDamage : null
}

export function selectLayerDirtyRect(
  layerDirty: boolean,
  damageRect: DamageRect | null,
  bounds: DamageRect,
): DamageRect | null {
  if (damageRect) return damageRect
  return layerDirty ? bounds : null
}

export function hasDirtySubtreeTransforms(preparedSlots: PreparedLayerSlot[], forceLayerRepaint: boolean): boolean {
  return preparedSlots.some((prepared) => {
    if (!prepared.subtreeTransform) return false
    if (forceLayerRepaint) return true
    return !!prepared.dirtyRect
  })
}

export function canUseRegionalRepaint(boundaryNode: TGENode | null, hasScissor: boolean, isBg: boolean): boolean {
  if (hasScissor) return false
  // The background slot is a monolithic layer containing all non-layered UI.
  // Regional repaint is unsafe here because a small dirty rect (for example a
  // focused titlebar) can still require re-presenting other overlapping window
  // content after z-order/focus changes. Until background commands are clipped
  // to the repaint rect or app windows become separate layer boundaries, repaint
  // and present the full bg layer for correctness.
  if (isBg) return false
  if (!boundaryNode || boundaryNode.kind === "text") return true
  if (boundaryNode.props.viewportClip === false) return false
  if (hasTransformInSubtree(boundaryNode)) return false
  return true
}

export function hasTransformInSubtree(node: TGENode): boolean {
  if (node.kind === "text") return false
  if (node.props.transform) return true
  return node.children.some((child) => hasTransformInSubtree(child))
}

export function applyBackendProfile(profile: PaintProfiler | undefined, backend: RendererBackend): void {
  if (!profile) return
  const backendProfile = backend.drainProfile?.()
  if (!backendProfile) return
  profile.paintBackendCompositeMs += backendProfile.compositeMs
  profile.paintBackendReadbackMs += backendProfile.readbackMs
  profile.paintBackendNativeEmitMs += backendProfile.nativeEmitMs
  profile.paintBackendNativeReadbackMs += backendProfile.nativeReadbackMs
  profile.paintBackendNativeCompressMs += backendProfile.nativeCompressMs
  profile.paintBackendNativeShmPrepareMs += backendProfile.nativeShmPrepareMs
  profile.paintBackendNativeWriteMs += backendProfile.nativeWriteMs
  profile.paintBackendNativeRawBytes += backendProfile.nativeRawBytes
  profile.paintBackendNativePayloadBytes += backendProfile.nativePayloadBytes
  profile.paintBackendUniformMs += backendProfile.uniformUpdateMs
}

export function computeSubtreeTransformQuad(node: TGENode): TransformQuad | null {
  if (!node._transforms?.local) return null
  const layout = node.layout
  const chain: TGENode[] = []
  let current: TGENode | null = node
  while (current) {
    if (current._transforms?.local) chain.push(current)
    current = current.parent
  }
  const transformAbsolutePoint = (x: number, y: number) => {
    let point = { x, y }
    for (const target of chain) {
      const l = target.layout
      const absolute = multiply(multiply(translate(l.x, l.y), target._transforms!.local!), translate(-l.x, -l.y))
      point = transformPoint(absolute, point.x, point.y)
    }
    return point
  }

  const x = layout.x
  const y = layout.y
  const w = layout.width
  const h = layout.height
  return {
    p0: transformAbsolutePoint(x, y),
    p1: transformAbsolutePoint(x + w, y),
    p2: transformAbsolutePoint(x, y + h),
    p3: transformAbsolutePoint(x + w, y + h),
  }
}

export function isAxisTranslationQuad(node: TGENode, quad: TransformQuad): boolean {
  const epsilon = 1e-6
  return Math.abs(quad.p1.x - quad.p0.x - node.layout.width) < epsilon
    && Math.abs(quad.p1.y - quad.p0.y) < epsilon
    && Math.abs(quad.p2.x - quad.p0.x) < epsilon
    && Math.abs(quad.p2.y - quad.p0.y - node.layout.height) < epsilon
}

export function clippedTranslationQuad(left: number, top: number, width: number, height: number): TransformQuad {
  return {
    p0: { x: left, y: top },
    p1: { x: left + width, y: top },
    p2: { x: left, y: top + height },
    p3: { x: left + width, y: top + height },
  }
}

export function hasCaptureExpansion(node: TGENode, includeTransform = false): boolean {
  const props = resolveProps(node)
  if (props.shadow !== undefined || props.glow !== undefined || props.filter !== undefined) return true
  if (props.backdropBlur !== undefined || props.backdropBrightness !== undefined || props.backdropContrast !== undefined || props.backdropSaturate !== undefined || props.backdropGrayscale !== undefined || props.backdropInvert !== undefined || props.backdropSepia !== undefined || props.backdropHueRotate !== undefined) return true
  if (includeTransform && props.transform !== undefined) return true
  return node.children.some((child) => hasCaptureExpansion(child, true))
}

export function expandCommandBoundsForEffects(
  cmd: RenderCommand | RenderGraphOp,
  node: TGENode,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = cmd.x
  let minY = cmd.y
  let maxX = cmd.x + cmd.width
  let maxY = cmd.y + cmd.height
  const props = resolveProps(node)

  if (props.shadow) {
    const shadows = Array.isArray(props.shadow) ? props.shadow : [props.shadow]
    for (const s of shadows) {
      if (!s || typeof s !== "object") continue
      const sx = typeof (s as any).x === "number" ? (s as any).x : (typeof (s as any).offsetX === "number" ? (s as any).offsetX : 0)
      const sy = typeof (s as any).y === "number" ? (s as any).y : (typeof (s as any).offsetY === "number" ? (s as any).offsetY : 0)
      const blur = Math.max(0, typeof (s as any).blur === "number" ? (s as any).blur : 0)
      const pad = Math.ceil(blur) * 2
      minX = Math.min(minX, cmd.x + sx - pad)
      minY = Math.min(minY, cmd.y + sy - pad)
      maxX = Math.max(maxX, cmd.x + cmd.width + sx + pad)
      maxY = Math.max(maxY, cmd.y + cmd.height + sy + pad)
    }
  }

  if (props.glow && typeof props.glow === "object") {
    const glow = props.glow as { radius?: number }
    const pad = Math.ceil((glow.radius ?? 0) * 2)
    minX = Math.min(minX, cmd.x - pad)
    minY = Math.min(minY, cmd.y - pad)
    maxX = Math.max(maxX, cmd.x + cmd.width + pad)
    maxY = Math.max(maxY, cmd.y + cmd.height + pad)
  }

  return { minX, minY, maxX, maxY }
}
