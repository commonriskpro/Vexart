/**
 * paint-layer.ts — Layer preparation, scissor clamping, bounds, and lifecycle management.
 *
 * Extracted from paint.ts as part of loop decomposition.
 * Handles:
 *   - PreparedLayerSlot model
 *   - Slot command and op bounds calculation with scissor clamping
 *   - Layer prep pass (geometry, clipping, translation, damage)
 *   - Orphan layer cleanup
 *   - Layer stability counters
 */

import { CMD } from "../ffi/render-graph"
import type { RenderCommand } from "../ffi/render-graph"
import type { Layer } from "../ffi/layers"
import {
  intersectRect,
  rectArea,
  type DamageRect,
  type TransformQuad,
} from "../ffi/damage"
import { shouldFreezeInteractionLayer } from "../reconciler/interaction"
import type { LayerBoundary, LayerSlot } from "./types"
import type { TGENode } from "../ffi/node"
import type { LayerOpBucket } from "./pipeline-types"
import {
  canUseRegionalRepaint,
  clippedTranslationQuad,
  computeSubtreeTransformQuad,
  expandCommandBoundsForEffects,
  hasCaptureExpansion,
  isAxisTranslationQuad,
  selectLayerDirtyRect,
} from "./paint-regional"
import type { PaintFrameState } from "./paint"

/** Per-slot metadata computed during the layer prep pass. */
export type PreparedLayerSlot = {
  slot: LayerSlot
  layer: Layer
  debugName: string
  bounds: DamageRect
  dirtyRect: DamageRect | null
  clippedDamage: DamageRect | null
  isBackground: boolean
  subtreeTransform: TransformQuad | null
  /** Source-space origin for a viewport-bounded translated layer. */
  paintOffsetX?: number
  paintOffsetY?: number
  allowRegionalRepaint: boolean
  useRegionalRepaint: boolean
  freezeWhileInteracting: boolean
}

export const EMPTY_COMMANDS: RenderCommand[] = []

export function collectLayerCommands(commands: RenderCommand[], cmdIndices: number[]) {
  const layerCommands: RenderCommand[] = []
  for (const idx of cmdIndices) {
    const cmd = commands[idx]
    if (!cmd) continue
    layerCommands.push(cmd)
  }
  return layerCommands
}

export function findBucketForSlot(bucketByKey: Map<string, LayerOpBucket> | null, slotKey: string): LayerOpBucket | undefined {
  if (!bucketByKey) return undefined
  return bucketByKey.get(slotKey)
    ?? (slotKey === "bg" ? bucketByKey.get("root") : (slotKey === "root" ? bucketByKey.get("bg") : undefined))
}

export function applyPendingNodeDamage(
  layer: Layer,
  slot: LayerSlot,
  commands: RenderCommand[],
  pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }>,
  markLayerDamaged: (layer: Layer, rect: DamageRect) => void,
  bucket?: LayerOpBucket,
) {
  if (pendingNodeDamageRects.length === 0) return
  const nodeIds = new Set<number>()
  if (bucket) {
    for (const op of bucket.ops) {
      if (op.nodeId !== undefined) nodeIds.add(op.nodeId)
    }
  } else {
    for (const idx of slot.cmdIndices) {
      const nodeId = commands[idx]?.nodeId
      if (nodeId !== undefined) nodeIds.add(nodeId)
    }
  }
  if (nodeIds.size === 0) return
  for (const pending of pendingNodeDamageRects) {
    if (nodeIds.has(pending.nodeId)) markLayerDamaged(layer, pending.rect)
  }
}

export function cleanupOrphanLayers(
  preparedSlots: PreparedLayerSlot[],
  layerCache: Map<string, Layer>,
  activeSlotKeys: Set<string>,
  transmissionMode: "direct" | "shm",
  imageIdForLayer: (layer: Layer) => number,
  removeLayer: (layer: Layer) => void,
  debugCadence: boolean,
  suppressNativeLayerDeletes: boolean,
) {
  let ioMs = 0
  activeSlotKeys.clear()
  for (const prepared of preparedSlots) activeSlotKeys.add(prepared.slot.key)
  for (const [key, layer] of layerCache) {
    if (activeSlotKeys.has(key)) continue
    removeLayer(layer)
    layerCache.delete(key)

    let parentSlot: PreparedLayerSlot | undefined
    if (layer.width > 0 && layer.height > 0) {
      const layerBounds: DamageRect = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
      for (const prepared of preparedSlots) {
        if (prepared.isBackground || prepared.slot.key === "root") continue
        if (intersectRect(prepared.bounds, layerBounds)) {
          parentSlot = prepared
          break
        }
      }
    }
    if (!parentSlot) {
      parentSlot = preparedSlots.find(p => p.slot.key === "root" || p.isBackground)
    }
    if (parentSlot) {
      parentSlot.layer.dirty = true
      parentSlot.layer.damageRect = { ...parentSlot.bounds }
      parentSlot.dirtyRect = { ...parentSlot.bounds }
    }
  }
  return ioMs
}

export function updateLayerStabilityCounters(
  preparedSlots: PreparedLayerSlot[],
  slotBoundaryByKey: Map<string, LayerBoundary>,
  nodeRefById: Map<number, TGENode>,
) {
  for (const prepared of preparedSlots) {
    if (prepared.isBackground) {
      const dirty = prepared.dirtyRect
      for (const [, node] of nodeRefById) {
        if (node.destroyed || node.kind === "text" || node.kind === "root") continue
        if (node._layerKey === undefined || node._scrollContainerId !== 0 || (node._layerKey && node._layerKey !== "bg" && node._layerKey !== "root")) continue
        const nodeDirty = dirty !== null && (
          !node.layout ||
          (node.layout.width > 0 && node.layout.height > 0 && intersectRect(node.layout, dirty) !== null)
        )
        if (nodeDirty) {
          node._unstableFrameCount++
          node._stableFrameCount = 0
        } else {
          node._stableFrameCount++
          node._unstableFrameCount = 0
        }
      }
      continue
    }
    const boundary = slotBoundaryByKey.get(prepared.slot.key)
    if (!boundary) continue
    const node = nodeRefById.get(boundary.nodeId)
    if (!node) continue
    if (prepared.dirtyRect) {
      node._unstableFrameCount++
      node._stableFrameCount = 0
    } else {
      node._stableFrameCount++
      node._unstableFrameCount = 0
    }
  }
}

export function computeSlotBounds(
  slot: LayerSlot,
  bucket: LayerOpBucket | undefined,
  commands: RenderCommand[],
  nodeRefById: Map<number, TGENode>,
  boundary: LayerBoundary | undefined,
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  hasScissor: boolean
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let hasScissor = false

  if (boundary?.isScroll) {
    hasScissor = true
    const boundaryNode = nodeRefById.get(boundary.nodeId)
    if (boundaryNode) {
      minX = boundaryNode.layout.x
      minY = boundaryNode.layout.y
      maxX = boundaryNode.layout.x + boundaryNode.layout.width
      maxY = boundaryNode.layout.y + boundaryNode.layout.height
    }
  }

  if (bucket) {
    for (const op of bucket.ops) {
      if (op.clipBounds) {
        hasScissor = true
      }
      if (!boundary?.isScroll) {
      let opMinX = op.x
      let opMinY = op.y
      let opMaxX = op.x + op.width
      let opMaxY = op.y + op.height
      if (op.nodeId !== undefined && (!boundary?.hasSubtreeTransform || op.nodeId === boundary?.nodeId)) {
        const node = nodeRefById.get(op.nodeId)
        if (node) {
          const expanded = expandCommandBoundsForEffects(op, node)
          opMinX = expanded.minX
          opMinY = expanded.minY
          opMaxX = expanded.maxX
          opMaxY = expanded.maxY
        }
      }
      minX = Math.min(minX, opMinX)
      minY = Math.min(minY, opMinY)
      maxX = Math.max(maxX, opMaxX)
      maxY = Math.max(maxY, opMaxY)
      }
    }
  } else {
    let scissorX = 0
    let scissorY = 0
    let scissorR = 0
    let scissorB = 0
    const pendingBounds: RenderCommand[] = []

    for (const idx of slot.cmdIndices) {
      const cmd = commands[idx]
      if (!cmd) continue
      if (cmd.type === CMD.SCISSOR_START && !hasScissor) {
        scissorX = cmd.x
        scissorY = cmd.y
        scissorR = cmd.x + cmd.width
        scissorB = cmd.y + cmd.height
        minX = scissorX
        minY = scissorY
        maxX = scissorR
        maxY = scissorB
        hasScissor = true
        for (const pending of pendingBounds) {
          const cx = Math.round(pending.x)
          const cy = Math.round(pending.y)
          const cr = Math.round(pending.x + pending.width)
          const cb = Math.round(pending.y + pending.height)
          const overlapX = Math.abs(cx - scissorX) < 4 || Math.abs(cr - scissorR) < 4
          const overlapY = Math.abs(cy - scissorY) < 4 || Math.abs(cb - scissorB) < 4
          if (!overlapX || !overlapY) continue
          minX = Math.min(minX, cx)
          minY = Math.min(minY, cy)
          maxX = Math.max(maxX, cr)
          maxY = Math.max(maxY, cb)
        }
        continue
      }
      if (hasScissor) {
        if (cmd.type !== CMD.RECTANGLE && cmd.type !== CMD.BORDER) continue
        const cx = Math.round(cmd.x)
        const cy = Math.round(cmd.y)
        const cr = Math.round(cmd.x + cmd.width)
        const cb = Math.round(cmd.y + cmd.height)
        const overlapX = Math.abs(cx - scissorX) < 4 || Math.abs(cr - scissorR) < 4
        const overlapY = Math.abs(cy - scissorY) < 4 || Math.abs(cb - scissorB) < 4
        if (!overlapX || !overlapY) continue
        minX = Math.min(minX, cx)
        minY = Math.min(minY, cy)
        maxX = Math.max(maxX, cr)
        maxY = Math.max(maxY, cb)
      } else {
        let cmdMinX = cmd.x
        let cmdMinY = cmd.y
        let cmdMaxX = cmd.x + cmd.width
        let cmdMaxY = cmd.y + cmd.height
        if (cmd.nodeId !== undefined && (!boundary?.hasSubtreeTransform || cmd.nodeId === boundary?.nodeId)) {
          const node = nodeRefById.get(cmd.nodeId)
          if (node) {
            const expanded = expandCommandBoundsForEffects(cmd, node)
            cmdMinX = expanded.minX
            cmdMinY = expanded.minY
            cmdMaxX = expanded.maxX
            cmdMaxY = expanded.maxY
          }
        }
        minX = Math.min(minX, cmdMinX)
        minY = Math.min(minY, cmdMinY)
        maxX = Math.max(maxX, cmdMaxX)
        maxY = Math.max(maxY, cmdMaxY)
        if (cmd.type === CMD.RECTANGLE || cmd.type === CMD.BORDER) pendingBounds.push(cmd)
      }
    }
  }

  return { minX, minY, maxX, maxY, hasScissor }
}

export type LayerPrepResult = {
  preparedSlots: PreparedLayerSlot[]
  layerOrder: Layer[]
  frameBudgetExceeded: boolean
}

export function prepareLayerSlots(params: {
  allSlots: LayerSlot[]
  bucketByKey: Map<string, LayerOpBucket> | null
  slotBoundaryByKey: Map<string, LayerBoundary>
  commands: RenderCommand[]
  state: PaintFrameState
  frameStart: number
}): LayerPrepResult {
  const {
    allSlots,
    bucketByKey,
    slotBoundaryByKey,
    commands,
    state,
    frameStart,
  } = params
  const {
    viewportWidth,
    viewportHeight,
    useLayerCompositing,
    forceLayerRepaint,
    expFrameBudgetMs,
    layerStore: {
      getOrCreateLayer,
      getPreviousLayerRect,
      updateLayerGeometry,
      markLayerDamaged,
    },
    layerCache,
    pendingNodeDamageRects,
  } = state

  let frameBudgetExceeded = false
  const layerOrder: Layer[] = []
  const preparedSlots: PreparedLayerSlot[] = []

  for (const slot of allSlots) {
    const bucket = findBucketForSlot(bucketByKey, slot.key)
    if (bucket ? bucket.ops.length === 0 : slot.cmdIndices.length === 0) continue

    if (expFrameBudgetMs > 0 && !frameBudgetExceeded && slot.z >= 0) {
      const elapsed = performance.now() - frameStart
      if (elapsed > expFrameBudgetMs) {
        frameBudgetExceeded = true
      }
    }
    if (frameBudgetExceeded && slot.z >= 0) {
      const deferLayer = layerCache.get(slot.key)
      if (deferLayer) deferLayer.dirty = true
      continue
    }

    const layer = getOrCreateLayer(slot.key, slot.z)
    const previousRect = getPreviousLayerRect(layer)
    const boundary = slotBoundaryByKey.get(slot.key)
    const boundaryNode = boundary ? state.nodeRefById.get(boundary.nodeId) ?? null : null

    const { minX, minY, maxX, maxY, hasScissor } = computeSlotBounds(
      slot,
      bucket,
      commands,
      state.nodeRefById,
      boundary,
    )

    const isBg = slot.z < 0 || slot.key === "bg" || slot.key === "root"
    let lx = isBg ? 0 : Math.floor(minX)
    let ly = isBg ? 0 : Math.floor(minY)
    let lw = isBg ? viewportWidth : (Math.ceil(maxX) - lx)
    let lh = isBg ? viewportHeight : (Math.ceil(maxY) - ly)

    if (boundary?.isScroll && boundaryNode) {
      lx = Math.floor(boundaryNode.layout.x)
      ly = Math.floor(boundaryNode.layout.y)
      lw = Math.ceil(boundaryNode.layout.width)
      lh = Math.ceil(boundaryNode.layout.height)
    }

    const freezeWhileInteracting = useLayerCompositing && shouldFreezeInteractionLayer(boundaryNode)
    const debugName = boundaryNode?.props.debugName ?? slot.key
    const shouldViewportClip = freezeWhileInteracting ? false : (boundaryNode?.props.viewportClip ?? true)
    const allowRegionalRepaint = canUseRegionalRepaint(boundaryNode, hasScissor, isBg)
    const rawSubtreeTransform = boundary?.hasSubtreeTransform && boundaryNode
      ? computeSubtreeTransformQuad(boundaryNode)
      : null
    const boundedTranslation = !!(
      rawSubtreeTransform
      && boundaryNode
      && isAxisTranslationQuad(boundaryNode, rawSubtreeTransform)
      && !hasCaptureExpansion(boundaryNode)
      && !freezeWhileInteracting
    )

    // A translated layer is clipped in output space, but its source target
    // must start at the corresponding untransformed coordinate. Otherwise a
    // wide row is first squeezed to the viewport-sized target and then
    // translated, shifting the horizontal crop (for example, -5px shows the
    // first source pixels instead of the entering slice). Keep the target
    // viewport-bounded and carry the source offset below. Subtrees with
    // capture-expanding effects stay on the historical full-capture path.
    if (boundedTranslation && rawSubtreeTransform) {
      const dx = rawSubtreeTransform.p0.x - boundaryNode!.layout.x
      const dy = rawSubtreeTransform.p0.y - boundaryNode!.layout.y
      const contentRight = lx + lw + dx
      const contentBottom = ly + lh + dy
      lx = Math.floor(lx + dx)
      ly = Math.floor(ly + dy)
      lw = Math.ceil(contentRight) - lx
      lh = Math.ceil(contentBottom) - ly
    }

    if (freezeWhileInteracting && boundaryNode && boundaryNode.kind !== "text" && boundaryNode.props.floating) {
      const layoutX = Math.round(boundaryNode.layout.x)
      const layoutY = Math.round(boundaryNode.layout.y)
      const layoutW = Math.round(boundaryNode.layout.width)
      const layoutH = Math.round(boundaryNode.layout.height)
      if (layoutW > 0 && layoutH > 0) {
        lx = layoutX
        ly = layoutY
        lw = layoutW
        lh = layoutH
      }
    }

    if (shouldViewportClip) {
      const clipLeft = Math.max(0, lx)
      const clipTop = Math.max(0, ly)
      const clipRight = Math.min(viewportWidth, lx + lw)
      const clipBottom = Math.min(viewportHeight, ly + lh)

      if (clipLeft >= clipRight || clipTop >= clipBottom) {
        layer.dirty = false
        continue
      }

      lx = clipLeft
      ly = clipTop
      lw = clipRight - clipLeft
      lh = clipBottom - clipTop
    }

    updateLayerGeometry(layer, lx, ly, lw, lh, { moveOnly: false })
    applyPendingNodeDamage(layer, slot, commands, pendingNodeDamageRects, markLayerDamaged, bucket)
    const geometryChanged = !!previousRect && (
      previousRect.x !== layer.x
      || previousRect.y !== layer.y
      || previousRect.width !== layer.width
      || previousRect.height !== layer.height
    )
    if (geometryChanged && layer.damageRect) {
      for (const lower of layerOrder) {
        markLayerDamaged(lower, layer.damageRect)
      }
    }
    layerOrder.push(layer)

    let paintOffsetX = lx
    let paintOffsetY = ly
    let subtreeTransform = rawSubtreeTransform
    if (boundedTranslation && rawSubtreeTransform && boundaryNode) {
      // p0 is the transformed position of the layer's untransformed origin.
      // This maps the clipped output rectangle back to the source rectangle
      // while retaining integer target dimensions for the native limit.
      paintOffsetX = boundaryNode.layout.x + lx - rawSubtreeTransform.p0.x
      paintOffsetY = boundaryNode.layout.y + ly - rawSubtreeTransform.p0.y
      subtreeTransform = clippedTranslationQuad(lx, ly, lw, lh)
    }
    const bounds = { x: lx, y: ly, width: lw, height: lh }
    const dirtyRect = selectLayerDirtyRect(layer.dirty, layer.damageRect, bounds)
    const clippedDamage = dirtyRect ? intersectRect(dirtyRect, bounds) : null
    const layerArea = lw * lh
    const damageArea = rectArea(clippedDamage)
    const useRegionalRepaint = !!(
      !forceLayerRepaint
      && allowRegionalRepaint
      && layer.damageRect
      && clippedDamage
      && damageArea > 0
      && damageArea < layerArea * 0.5
    )
    preparedSlots.push({
      slot,
      layer,
      debugName,
      bounds,
      dirtyRect,
      clippedDamage,
      isBackground: isBg,
      subtreeTransform,
      paintOffsetX,
      paintOffsetY,
      allowRegionalRepaint,
      useRegionalRepaint,
      freezeWhileInteracting,
    })
  }

  return { preparedSlots, layerOrder, frameBudgetExceeded }
}
