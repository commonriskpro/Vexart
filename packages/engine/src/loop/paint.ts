/**
 * paint.ts — Layer paint orchestration (layer prep + paint dispatch + cleanup).
 *
 * Extracted from loop.ts as part of Phase 3 Slice 2.3.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §paint
 *
 * Exports:
 *   - PreparedLayerSlot — per-slot metadata built during layer prep
 *   - PaintFrameState   — state bag threaded into paintFrame
 *   - paintFrame()      — orchestrates layer prep, paint dispatch, and cleanup
 */

import { CMD } from "../ffi/render-graph"
import type { RenderCommand } from "../ffi/render-graph"
import type { Layer } from "../ffi/layers"
import {
  intersectRect,
  rectArea,
  sumOverlapArea,
  type DamageRect,
} from "../ffi/damage"
import {
  getRendererBackend,
  type RendererBackend,
  type RendererBackendFrameContext,
  type RendererBackendLayerContext,
} from "../ffi/renderer-backend"
import { buildRenderGraphFrame } from "../ffi/render-graph"
import { summarizeRendererResourceStats } from "../ffi/resource-stats"
import { getLatestInteractionTrace } from "./input"
import { shouldFreezeInteractionLayer } from "../reconciler/interaction"
import { multiply, translate, transformPoint } from "../ffi/matrix"
import { debugUpdateStats } from "./debug"
import { resolveNodeByPath } from "./assign-layers"
import type { LayerSlot, LayerPlan, PaintResult } from "./types"
import type { TGENode } from "../ffi/node"
import type { GpuFrameComposer } from "../output/gpu-frame-composer"

// ── PreparedLayerSlot ─────────────────────────────────────────────────────

/** Per-slot metadata computed during the layer prep pass. */
export type PreparedLayerSlot = {
  slot: LayerSlot
  layer: Layer
  debugName: string
  bounds: DamageRect
  dirtyRect: DamageRect | null
  clippedDamage: DamageRect | null
  isBackground: boolean
  subtreeTransform: {
    p0: { x: number; y: number }
    p1: { x: number; y: number }
    p2: { x: number; y: number }
    p3: { x: number; y: number }
  } | null
  allowRegionalRepaint: boolean
  useRegionalRepaint: boolean
  freezeWhileInteracting: boolean
}

// ── PaintFrameState ───────────────────────────────────────────────────────

/**
 * Dependencies injected into paintFrame.
 * All mutable state lives in the coordinator (loop.ts); paintFrame reads and
 * writes through this bag but does not own any persistent state.
 */
export type PaintFrameState = {
  // Viewport
  viewportWidth: number
  viewportHeight: number

  // Terminal capabilities
  transmissionMode: "direct" | "file" | "shm"

  // Frame compositing flags
  useLayerCompositing: boolean
  forceLayerRepaint: boolean
  expFrameBudgetMs: number

  // Debug flags
  debugCadence: boolean
  debugDragRepro: boolean

  // Layer store — injected methods (coordinator owns the store)
  getOrCreateLayer: (key: string, z: number) => Layer
  getPreviousLayerRect: (layer: Layer) => DamageRect | null
  updateLayerGeometry: (layer: Layer, x: number, y: number, w: number, h: number, opts: { moveOnly: boolean }) => void
  markLayerDamaged: (layer: Layer, rect: DamageRect) => void
  markLayerClean: (layer: Layer) => void
  imageIdForLayer: (layer: Layer) => number
  removeLayer: (layer: Layer) => void
  layerCount: () => number

  // Layer cache — coordinator-owned map
  layerCache: Map<string, Layer>
  activeSlotKeys: Set<string>

  // Frame dirty rects accumulator (cleared and rebuilt each frame)
  frameDirtyRects: DamageRect[]

  // Root node — needed to resolve boundary paths
  root: TGENode

  // Render graph queues — for buildRenderGraphFrame
  renderGraphQueues: ReturnType<typeof import("../ffi/render-graph").createRenderGraphQueues>
  textMetaMap: Map<string, import("../ffi/render-graph").TextMeta>

  // GPU layer composer (Kitty output)
  layerComposer: GpuFrameComposer | null

  // Renderer backend (injected override or global)
  backendOverride?: RendererBackend

  // Interaction latency tracking (coordinator-owned scalars)
  lastPresentedInteractionSeq: { value: number }
  lastPresentedInteractionLatencyMs: { value: number }
  lastPresentedInteractionType: { value: string | null }

  // Debug log helpers
  log: (msg: string) => void
  renderDebug: (msg: string) => void
  dragReproDebug: (msg: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────

function commandIntersectsRect(cmd: RenderCommand, rect: { x: number; y: number; width: number; height: number }): boolean {
  const left = cmd.x
  const top = cmd.y
  const right = cmd.x + cmd.width
  const bottom = cmd.y + cmd.height
  return left < rect.x + rect.width && right > rect.x && top < rect.y + rect.height && bottom > rect.y
}

function canUseRegionalRepaint(boundaryNode: TGENode | null, hasScissor: boolean, isBg: boolean): boolean {
  if (hasScissor) return false
  if (isBg) return true
  if (!boundaryNode || boundaryNode.kind === "text") return true
  if (boundaryNode.props.viewportClip === false) return false
  if (hasTransformInSubtree(boundaryNode)) return false
  return true
}

function hasTransformInSubtree(node: TGENode): boolean {
  if (node.kind === "text") return false
  if (node.props.transform) return true
  return node.children.some((child) => hasTransformInSubtree(child))
}

function computeSubtreeTransformQuad(node: TGENode) {
  if (!node._transform) return null
  const layout = node.layout
  const chain: TGENode[] = []
  let current: TGENode | null = node
  while (current) {
    if (current._transform) chain.push(current)
    current = current.parent
  }
  chain.reverse()

  const transformAbsolutePoint = (x: number, y: number) => {
    let point = { x, y }
    for (const target of chain) {
      const l = target.layout
      const absolute = multiply(multiply(translate(l.x, l.y), target._transform!), translate(-l.x, -l.y))
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

// ── paintFrame ────────────────────────────────────────────────────────────

/**
 * Paint a full frame through the layer compositing pipeline.
 *
 * Steps:
 *   1. Layer prep — for each slot: compute bounds, damage, freeze/clip decisions
 *   2. Aggregate frame dirty rects and build RendererBackendFrameContext
 *   3. Per-slot: reuse stable layers or repaint + composite via Kitty
 *   4. Clean up orphan layers from previous frame
 *   5. Handle final-frame-raw backend strategy (full composite)
 *
 * @param plan     - LayerPlan from assignLayersSpatial
 * @param commands - Flat RenderCommand[] from Clay layout
 * @param cellW    - Cell width in pixels (from terminal)
 * @param cellH    - Cell height in pixels (from terminal)
 * @param state    - All coordinator-owned dependencies
 * @returns PaintResult with repainted keys and dirty flag
 */
export function paintFrame(
  plan: LayerPlan,
  commands: RenderCommand[],
  cellW: number,
  cellH: number,
  state: PaintFrameState,
): PaintResult & {
  repaintedThisFrame: number
  ioMs: number
  rendererOutput: string | null
  moveOnlyCount: number
  moveFallbackCount: number
  stableReuseCount: number
  commandCount: number
  frameCtx: RendererBackendFrameContext
  frameResult: ReturnType<NonNullable<RendererBackend["endFrame"]>> | undefined
} {
  const {
    viewportWidth,
    viewportHeight,
    useLayerCompositing,
    forceLayerRepaint,
    expFrameBudgetMs,
    debugCadence,
    debugDragRepro,
    getOrCreateLayer,
    getPreviousLayerRect,
    updateLayerGeometry,
    markLayerDamaged,
    markLayerClean,
    imageIdForLayer,
    removeLayer,
    layerCount,
    layerCache,
    activeSlotKeys,
    frameDirtyRects,
    root,
    renderGraphQueues,
    textMetaMap,
    layerComposer,
    lastPresentedInteractionSeq,
    lastPresentedInteractionLatencyMs,
    lastPresentedInteractionType,
    log,
    renderDebug,
    dragReproDebug,
  } = state

  const allSlots: LayerSlot[] = [plan.bgSlot, ...plan.contentSlots]
  const slotBoundaryByKey = plan.slotBoundaryByKey

  const frameStart = expFrameBudgetMs > 0 ? performance.now() : 0
  let frameBudgetExceeded = false
  const layerOrder: Layer[] = []
  const preparedSlots: PreparedLayerSlot[] = []
  let ioMs = 0

  // ── Step 1: Layer prep ──
  for (const slot of allSlots) {
    if (slot.cmdIndices.length === 0) continue

    if (expFrameBudgetMs > 0 && !frameBudgetExceeded && slot.z >= 0) {
      const elapsed = performance.now() - frameStart
      if (elapsed > expFrameBudgetMs) {
        log(`  [FRAME BUDGET] ${elapsed.toFixed(1)}ms > ${expFrameBudgetMs}ms — deferring remaining layers`)
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
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let hasScissor = false
    let scissorX = 0
    let scissorY = 0
    let scissorR = 0
    let scissorB = 0

    for (const idx of slot.cmdIndices) {
      const cmd = commands[idx]
      if (!cmd) continue
      if (cmd.type === CMD.SCISSOR_START) {
        scissorX = cmd.x
        scissorY = cmd.y
        scissorR = cmd.x + cmd.width
        scissorB = cmd.y + cmd.height
        minX = scissorX
        minY = scissorY
        maxX = scissorR
        maxY = scissorB
        hasScissor = true
        break
      }
    }

    if (hasScissor) {
      for (const idx of slot.cmdIndices) {
        const cmd = commands[idx]
        if (!cmd) continue
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
      }
    } else {
      for (const idx of slot.cmdIndices) {
        const cmd = commands[idx]
        if (!cmd) continue
        minX = Math.min(minX, cmd.x)
        minY = Math.min(minY, cmd.y)
        maxX = Math.max(maxX, cmd.x + cmd.width)
        maxY = Math.max(maxY, cmd.y + cmd.height)
      }
    }

    const isBg = slot.z < 0
    let lx = isBg ? 0 : Math.floor(minX)
    let ly = isBg ? 0 : Math.floor(minY)
    let lw = isBg ? (Math.round(commands[0].width) || viewportWidth) : (Math.ceil(maxX) - lx)
    let lh = isBg ? (Math.round(commands[0].height) || viewportHeight) : (Math.ceil(maxY) - ly)

    const boundary = slotBoundaryByKey.get(slot.key)
    const boundaryNode = boundary ? resolveNodeByPath(root, boundary.path) : null
    const freezeWhileInteracting = useLayerCompositing && shouldFreezeInteractionLayer(boundaryNode)
    const debugName = boundaryNode?.props.debugName ?? slot.key
    const shouldViewportClip = freezeWhileInteracting ? false : (boundaryNode?.props.viewportClip ?? true)
    const allowRegionalRepaint = canUseRegionalRepaint(boundaryNode, hasScissor, isBg)

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
      renderDebug(`[clip:before] slot=${slot.key} z=${slot.z} x=${lx} y=${ly} w=${lw} h=${lh} pw=${viewportWidth} ph=${viewportHeight}`)
      const clipLeft = Math.max(0, lx)
      const clipTop = Math.max(0, ly)
      const clipRight = Math.min(viewportWidth, lx + lw)
      const clipBottom = Math.min(viewportHeight, ly + lh)

      if (clipLeft >= clipRight || clipTop >= clipBottom) {
        renderDebug(`[clip:skip] slot=${slot.key} z=${slot.z} x=${lx} y=${ly} w=${lw} h=${lh}`)
        if (slot.z >= 0) layerComposer!.removeLayer(imageIdForLayer(layer))
        layer.dirty = false
        continue
      }

      lx = clipLeft
      ly = clipTop
      lw = clipRight - clipLeft
      lh = clipBottom - clipTop
      renderDebug(`[clip:after] slot=${slot.key} z=${slot.z} x=${lx} y=${ly} w=${lw} h=${lh}`)
    }

    updateLayerGeometry(layer, lx, ly, lw, lh, { moveOnly: false })
    if (debugDragRepro && boundaryNode?.props.debugName === "drag-target") {
      const prev = previousRect
        ? `prev=(${previousRect.x},${previousRect.y},${previousRect.width}x${previousRect.height})`
        : "prev=none"
      const damage = layer.damageRect
        ? `damage=(${layer.damageRect.x},${layer.damageRect.y},${layer.damageRect.width}x${layer.damageRect.height})`
        : "damage=none"
      dragReproDebug(`[prepare] slot=${slot.key} bounds=(${lx},${ly},${lw}x${lh}) layer=(${layer.x},${layer.y},${layer.width}x${layer.height}) ${prev} dirty=${layer.dirty ? 1 : 0} ${damage} freeze=${freezeWhileInteracting ? 1 : 0}`)
    }
    if (previousRect && layer.damageRect) {
      for (const lower of layerOrder) {
        markLayerDamaged(lower, layer.damageRect)
      }
    }
    layerOrder.push(layer)

    const bounds = { x: lx, y: ly, width: lw, height: lh }
    const clippedDamage = layer.damageRect ? intersectRect(layer.damageRect, bounds) : null
    const layerArea = lw * lh
    const damageArea = rectArea(clippedDamage)
    const useRegionalRepaint = !!(
      allowRegionalRepaint
      && clippedDamage
      && damageArea > 0
      && damageArea < layerArea * 0.4
    )
    if (layer.damageRect) {
      const damageMsg = clippedDamage
        ? `damage=${clippedDamage.width}x${clippedDamage.height}@(${clippedDamage.x},${clippedDamage.y}) area=${damageArea}/${layerArea}`
        : `damage=none area=0/${layerArea}`
      log(`  [${slot.key}|${debugName}] DAMAGE allow=${allowRegionalRepaint} ${damageMsg}`)
    }
    preparedSlots.push({
      slot,
      layer,
      debugName,
      bounds,
      dirtyRect: layer.damageRect,
      clippedDamage,
      isBackground: isBg,
      subtreeTransform: boundary?.hasSubtreeTransform && boundaryNode ? computeSubtreeTransformQuad(boundaryNode) : null,
      allowRegionalRepaint,
      useRegionalRepaint,
      freezeWhileInteracting,
    })
  }

  // ── Step 2: Aggregate dirty rects + build frame context ──
  frameDirtyRects.length = 0
  let dirtyLayerCountForFrame = 0
  let dirtyPixelArea = 0
  for (const prepared of preparedSlots) {
    const dirtyRect = forceLayerRepaint
      ? prepared.bounds
      : (prepared.useRegionalRepaint && prepared.clippedDamage ? prepared.clippedDamage : prepared.layer.damageRect)
    const area = rectArea(dirtyRect)
    if (area <= 0 || !dirtyRect) continue
    frameDirtyRects.push(dirtyRect)
    dirtyLayerCountForFrame += 1
    dirtyPixelArea += area
  }
  const totalPixelArea = Math.max(1, viewportWidth * viewportHeight)
  const overlapPixelArea = sumOverlapArea(frameDirtyRects)
  const fullRepaint = forceLayerRepaint || dirtyPixelArea >= totalPixelArea * 0.85 || dirtyLayerCountForFrame >= preparedSlots.length
  const estimatedLayeredBytes = dirtyPixelArea * 4
    + dirtyLayerCountForFrame * (state.transmissionMode === "direct" ? 2048 : 512)
  const estimatedFinalBytes = viewportWidth * viewportHeight * 4

  const backend = state.backendOverride ?? (getRendererBackend() ?? (() => { throw new Error("no backend") })())
  const frameCtx: RendererBackendFrameContext = {
    viewportWidth,
    viewportHeight,
    dirtyLayerCount: dirtyLayerCountForFrame,
    layerCount: preparedSlots.length,
    dirtyPixelArea,
    totalPixelArea,
    overlapPixelArea,
    overlapRatio: totalPixelArea > 0 ? overlapPixelArea / totalPixelArea : 0,
    fullRepaint,
    useLayerCompositing,
    hasSubtreeTransforms: preparedSlots.some((prepared) => !!prepared.subtreeTransform),
    hasActiveInteraction: preparedSlots.some((prepared) => prepared.freezeWhileInteracting),
    transmissionMode: state.transmissionMode,
    estimatedLayeredBytes,
    estimatedFinalBytes,
  }
  const framePlan = backend.beginFrame?.(frameCtx)
  let rendererOutput: string | null = useLayerCompositing ? "buffer" : "buffer"
  let moveOnlyCount = 0
  let moveFallbackCount = 0
  let stableReuseCount = 0
  let repaintedThisFrame = 0

  // ── Step 3: Per-slot paint ──
  for (const prepared of preparedSlots) {
    const slot = prepared.slot
    const layer = prepared.layer
    const lx = prepared.bounds.x
    const ly = prepared.bounds.y
    const lw = prepared.bounds.width
    const lh = prepared.bounds.height
    const clippedDamage = prepared.clippedDamage
    const useRegionalRepaint = prepared.useRegionalRepaint
    const freezeWhileInteracting = prepared.freezeWhileInteracting

    if (lw > 0 && lh > 0) {
      const layerCtx: RendererBackendLayerContext = {
        key: slot.key,
        z: layer.z,
        backing: layer.backing,
        subtreeTransform: prepared.subtreeTransform,
        isBackground: prepared.isBackground,
        bounds: prepared.bounds,
        dirtyRect: prepared.layer.damageRect,
        repaintRect: useRegionalRepaint ? clippedDamage : prepared.layer.damageRect,
        allowRegionalRepaint: prepared.allowRegionalRepaint,
        retainedDuringInteraction: freezeWhileInteracting,
      }

      const canReuseStableLayer = !freezeWhileInteracting && !forceLayerRepaint && !useRegionalRepaint && !layer.dirty && !prepared.layer.damageRect
      if (freezeWhileInteracting && !canReuseStableLayer) {
        const damage = prepared.layer.damageRect
          ? `${prepared.layer.damageRect.width}x${prepared.layer.damageRect.height}@(${prepared.layer.damageRect.x},${prepared.layer.damageRect.y})`
          : "none"
        log(`  [${slot.key}|${prepared.debugName}] DRAG-BLOCK reuse=${canReuseStableLayer ? 1 : 0} strategy=${framePlan?.strategy ?? "none"} force=${forceLayerRepaint ? 1 : 0} regional=${useRegionalRepaint ? 1 : 0} dirty=${layer.dirty ? 1 : 0} damage=${damage} prev=(${layer.prevX},${layer.prevY},${layer.prevW}x${layer.prevH}) next=(${layer.x},${layer.y},${layer.width}x${layer.height}) z=${layer.prevZ}->${layer.z}`)
      }

      if (canReuseStableLayer) {
        const geometryChanged = layer.x !== layer.prevX || layer.y !== layer.prevY || layer.z !== layer.prevZ
        const renderZ = layer.z
        const needsPlacementRefresh = false
        if (freezeWhileInteracting) {
          log(`  [${slot.key}|${prepared.debugName}] DRAG-CHECK geometry=${geometryChanged ? 1 : 0} strategy=${framePlan?.strategy ?? "none"} placement=${needsPlacementRefresh ? 1 : 0} prev=(${layer.prevX},${layer.prevY}) next=(${layer.x},${layer.y}) z=${layer.prevZ}->${layer.z}`)
        }
        if (needsPlacementRefresh) {
          const moved = layerComposer?.placeLayer(imageIdForLayer(layer), lx, ly, renderZ, cellW, cellH) === true
          if (moved) {
            rendererOutput = "layered-raw"
            moveOnlyCount++
            log(`  [${slot.key}|${prepared.debugName}] MOVE-ONLY ${lw}x${lh} at (${lx},${ly}) z=${renderZ} interaction=drag`)
            markLayerClean(layer)
            continue
          }
        }
        if (needsPlacementRefresh) {
          moveFallbackCount++
          log(`  [${slot.key}|${prepared.debugName}] MOVE-FALLBACK repaint establish layered placement`)
        } else {
          const reused = backend.reuseLayer?.({
            frame: frameCtx,
            layer: layerCtx,
          }) === true
          if (reused) {
            stableReuseCount++
            if (framePlan?.strategy === "final-frame-raw") rendererOutput = "final-frame-raw"
            else if (framePlan?.strategy === "layered-raw") rendererOutput = "layered-raw"
            log(`  [${slot.key}|${prepared.debugName}] REUSE (stable layer)`)
            markLayerClean(layer)
            continue
          }
        }
      }

      const layerCommands: RenderCommand[] = []
      for (const idx of slot.cmdIndices) {
        const cmd = commands[idx]
        if (!cmd) continue
        if (useRegionalRepaint && clippedDamage && !commandIntersectsRect(cmd, clippedDamage)) continue
        layerCommands.push(cmd)
      }

      // Build render graph and invoke backend
      // All commands carry nodeId (set by layout-adapter.endLayout()).
      const graph = buildRenderGraphFrame(layerCommands, renderGraphQueues, textMetaMap)
      const paintResult = backend.paint({
        targetWidth: lw,
        targetHeight: lh,
        backing: layerCtx.backing ?? null,
        target: { width: lw, height: lh },
        commands: layerCommands,
        graph,
        offsetX: lx,
        offsetY: ly,
        frame: frameCtx,
        layer: layerCtx,
      })

      const backendSkipPresent = paintResult?.output === "skip-present"
      const backendKittyPayload = paintResult?.output === "kitty-payload"
      if (backendSkipPresent) rendererOutput = paintResult?.strategy ?? framePlan?.strategy ?? "skip-present"
      if (backendKittyPayload) rendererOutput = "layered-raw"

      if (backendSkipPresent) {
        repaintedThisFrame++
        markLayerClean(layer)
        continue
      }

      if (backendKittyPayload && paintResult?.kittyPayload) {
        repaintedThisFrame++
        const renderZ = layer.z
        const imageId = imageIdForLayer(layer)
        if (debugDragRepro && prepared.debugName === "drag-target") {
          dragReproDebug(`[present] slot=${slot.key} changed=1 z=${renderZ} pos=(${lx},${ly}) size=${lw}x${lh} raw=1`)
        }
        if (useRegionalRepaint && clippedDamage) {
          log(`  [${slot.key}] REPAINT-REGION ${clippedDamage.width}x${clippedDamage.height} at (${clippedDamage.x},${clippedDamage.y}) within ${lw}x${lh} z=${renderZ}`)
        } else {
          log(`  [${slot.key}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${renderZ} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${slot.cmdIndices.length}`)
        }
        const ioStart = debugCadence ? performance.now() : 0
        layerComposer!.renderLayerRaw(paintResult.kittyPayload.data, paintResult.kittyPayload.width, paintResult.kittyPayload.height, imageId, lx, ly, renderZ, cellW, cellH)
        if (debugCadence) ioMs += performance.now() - ioStart
        markLayerClean(layer)
        continue
      }

      throw new Error(`GPU-only renderer backend did not return a layer payload for ${slot.key}`)
    }
  }

  // ── Step 4: Clean up orphan layers ──
  activeSlotKeys.clear()
  for (const prepared of preparedSlots) activeSlotKeys.add(prepared.slot.key)
  for (const [key, layer] of layerCache) {
    if (!activeSlotKeys.has(key)) {
      const ioStart = debugCadence ? performance.now() : 0
      layerComposer!.removeLayer(imageIdForLayer(layer))
      if (debugCadence) ioMs += performance.now() - ioStart
      removeLayer(layer)
      layerCache.delete(key)
    }
  }

  // ── Step 5: Final-frame-raw strategy ──
  const frameResult = backend.endFrame?.(frameCtx)
  if (frameResult?.output === "final-frame-raw" && frameResult.finalFrame) {
    rendererOutput = "final-frame-raw"
    const ioStart = debugCadence ? performance.now() : 0
    layerComposer!.renderFinalFrameRaw(
      frameResult.finalFrame.data,
      frameResult.finalFrame.width,
      frameResult.finalFrame.height,
      0,
      cellW,
      cellH,
    )
    if (debugCadence) ioMs += performance.now() - ioStart
  }

  // ── Step 6: Interaction latency tracking + debug stats ──
  const interaction = getLatestInteractionTrace()
  if (interaction.seq > lastPresentedInteractionSeq.value && repaintedThisFrame > 0) {
    lastPresentedInteractionSeq.value = interaction.seq
    lastPresentedInteractionLatencyMs.value = Math.max(0, performance.now() - interaction.at)
    lastPresentedInteractionType.value = interaction.kind
  }

  const resourceSummary = summarizeRendererResourceStats()
  debugUpdateStats({
    commandCount: commands.length,
    dirtyBeforeCount: 0, // coordinator passes this separately
    layerCount: layerCount(),
    moveOnlyCount,
    moveFallbackCount,
    stableReuseCount,
    nodeCount: 0, // coordinator passes this separately
    repaintedCount: repaintedThisFrame,
    rendererStrategy: frameResult?.strategy ?? framePlan?.strategy ?? null,
    rendererOutput,
    transmissionMode: frameCtx.transmissionMode,
    estimatedLayeredBytes: frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: frameCtx.estimatedFinalBytes,
    interactionLatencyMs: lastPresentedInteractionLatencyMs.value,
    interactionType: lastPresentedInteractionType.value,
    presentedInteractionSeq: lastPresentedInteractionSeq.value,
    resourceBytes: resourceSummary.totalBytes,
    gpuResourceBytes: resourceSummary.gpuBytes,
    resourceEntries: resourceSummary.cacheEntries,
  })

  return {
    repaintedKeys: preparedSlots.filter(p => p.layer.dirty === false && activeSlotKeys.has(p.slot.key)).map(p => p.slot.key),
    anyDirty: repaintedThisFrame > 0,
    repaintedThisFrame,
    ioMs,
    rendererOutput,
    moveOnlyCount,
    moveFallbackCount,
    stableReuseCount,
    commandCount: commands.length,
    frameCtx,
    frameResult,
  }
}
