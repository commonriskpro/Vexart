/**
 * gpu-op-packer.ts — Converting RenderGraphOp batches into binary geometry streams.
 * Extracted from gpu-renderer-backend.ts.
 */

import { transformPoint } from "./matrix"
import { BACKDROP_FIELDS, getRenderOpClipStack, setRenderOpClipStack } from "./render-graph"
import type { BackdropRenderMetadata, EffectRenderOp, ImagePaintConfig, RenderGraphOp } from "./render-graph"
import { layoutText } from "./text-layout"
import type { TGENode } from "./node"
import {
  type IntBounds,
  type ImageInstance,
  type TransformedImageInstance,
  type ImageGroup,
  type TransformedImageGroup,
  unionBounds,
  clampShapeRadius,
  applyOpacityToColor,
  opBounds,
} from "./gpu-helpers"
import type { RendererBackendPaintContext } from "./renderer-backend"
import {
  packShapeRectInstance,
  packShapeRectCornersInstance,
  packGlowInstance,
  packShadowInstance,
  packLinearGradientInstance,
  packRadialGradientInstance,
  packImageTransformInstance,
} from "./gpu-pack"
import {
  type VexartTargetHandle,
  type VexartImageHandle,
  vexartCompositeTargetCreate,
  vexartCompositeTargetDestroy,
  vexartCompositeTargetBeginLayer,
  vexartCompositeTargetEndLayer,
  vexartCompositeTargetSetScissor,
  vexartCompositeTargetResetScissor,
  vexartCompositeRenderImageLayer,
  vexartCompositeRenderImageTransformLayer,
  copyGpuTargetRegionToImage,
  vexartCompositeImageFilterBackdrop,
  vexartCompositeImageMaskRoundedRect,
  vexartCompositeImageMaskRoundedRectRegion,
  vexartRemoveImage,
  flushVexartBatchToTarget,
  acquireGeometryStream,
  releaseGeometryStream,
} from "./gpu-composite-ops"
import type { GpuTargetManager } from "./gpu-target-manager"
import type { GpuTextEncoder } from "./gpu-text-encoder"

function failGpuOnly(message: string): never {
  throw new Error(`Vexart GPU-only renderer: ${message}`)
}

export interface GpuOpPackerOptions {
  getVexartCtx: () => bigint
  targetManager: GpuTargetManager
  textEncoder: GpuTextEncoder
}

export interface GpuOpPacker {
  renderFrame(
    ctx: RendererBackendPaintContext,
    targetHandle: VexartTargetHandle,
  ): { ok: boolean; rawLayer: null }
  renderOpToImage(
    op: RenderGraphOp,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    ops?: RenderGraphOp[],
  ): VexartImageHandle | null
}

export function createGpuOpPacker(options: GpuOpPackerOptions): GpuOpPacker {
  const { getVexartCtx, targetManager, textEncoder } = options

  let frameGeneration = 0

  function renderOpToImage(
    op: RenderGraphOp,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    ops?: RenderGraphOp[],
  ): VexartImageHandle | null {
    const vctx = getVexartCtx()
    const target = vexartCompositeTargetCreate(vctx, width, height)
    if (!target) return null
    const deferredText = textEncoder.drainPending()
    try {
      const spriteCtx: RendererBackendPaintContext = {
        targetWidth: width,
        targetHeight: height,
        backing: null,
        target: { width, height },
        commands: [],
        graph: { ops: ops ?? [op] },
        offsetX,
        offsetY,
        frame: null,
        layer: null,
      }
      const result = renderFrame(spriteCtx, target)
      if (!result.ok) return null
      const copied = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height })
      if (copied.handle) targetManager.instanceImageHandles.add(copied.handle)
      return copied.handle
    } finally {
      textEncoder.restorePending(deferredText)
      vexartCompositeTargetDestroy(vctx, target)
    }
  }

  const imageGroups = new Map<bigint, ImageGroup>()
  const transformedImageGroups = new Map<bigint, TransformedImageGroup>()
  let transientFullFrameImages: VexartImageHandle[] = []

  const hasSelfFilter = (filter: NonNullable<EffectRenderOp["effect"]["filter"]>) => (
    (filter.blur ?? 0) > 0
    || (filter.brightness !== undefined && filter.brightness !== 100)
    || (filter.contrast !== undefined && filter.contrast !== 100)
    || (filter.saturate !== undefined && filter.saturate !== 100)
    || (filter.grayscale ?? 0) !== 0
    || (filter.invert ?? 0) !== 0
    || (filter.sepia ?? 0) !== 0
    || (filter.hueRotate ?? 0) !== 0
  )

  const getSubtreeCaptureBounds = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
    includeRootTransform = false,
  ) => {
    let left = Math.round(op.x)
    let top = Math.round(op.y)
    let right = left + Math.max(1, Math.round(op.width))
    let bottom = top + Math.max(1, Math.round(op.height))
    const include = (entry: RenderGraphOp, isRoot = false) => {
      const x = Math.round(entry.x)
      const y = Math.round(entry.y)
      const width = Math.max(1, Math.round(entry.width))
      const height = Math.max(1, Math.round(entry.height))
      let entryLeft = x
      let entryTop = y
      let entryRight = x + width
      let entryBottom = y + height
      if (entry.kind === "effect") {
        if (entry.effect.transform && (!isRoot || includeRootTransform)) {
          const points = [
            transformPoint(entry.effect.transform, 0, 0),
            transformPoint(entry.effect.transform, width, 0),
            transformPoint(entry.effect.transform, 0, height),
            transformPoint(entry.effect.transform, width, height),
          ]
          entryLeft = Math.min(entryLeft, ...points.map((point) => x + point.x))
          entryTop = Math.min(entryTop, ...points.map((point) => y + point.y))
          entryRight = Math.max(entryRight, ...points.map((point) => x + point.x))
          entryBottom = Math.max(entryBottom, ...points.map((point) => y + point.y))
        }
        if (entry.effect.glow) {
          const pad = entry.effect.glow.radius * 2
          entryLeft -= pad
          entryTop -= pad
          entryRight += pad
          entryBottom += pad
        }
        if (entry.effect.shadow) {
          const shadows = Array.isArray(entry.effect.shadow) ? entry.effect.shadow : [entry.effect.shadow]
          for (const shadow of shadows) {
            const pad = Math.ceil(Math.max(0, shadow.blur)) * 2
            entryLeft = Math.min(entryLeft, x + Math.min(0, shadow.x) - pad)
            entryTop = Math.min(entryTop, y + Math.min(0, shadow.y) - pad)
            entryRight = Math.max(entryRight, x + width + Math.max(0, shadow.x) + pad)
            entryBottom = Math.max(entryBottom, y + height + Math.max(0, shadow.y) + pad)
          }
        }
        if (entry.effect.filter?.blur) {
          const pad = entry.effect.filter.blur * 2
          entryLeft -= pad
          entryTop -= pad
          entryRight += pad
          entryBottom += pad
        }
      }
      left = Math.min(left, entryLeft)
      top = Math.min(top, entryTop)
      right = Math.max(right, entryRight)
      bottom = Math.max(bottom, entryBottom)
    }
    include(op, true)
    for (const entry of subtreeOps) include(entry)
    return {
      left: Math.floor(left),
      top: Math.floor(top),
      right: Math.ceil(right),
      bottom: Math.ceil(bottom),
    }
  }

  const intersectCaptureBounds = (
    left: { left: number; top: number; right: number; bottom: number },
    right: { left: number; top: number; right: number; bottom: number },
  ) => ({
    left: Math.max(left.left, right.left),
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
  })

  const hasSamplingHalo = (entry: RenderGraphOp) => {
    if (entry.kind !== "effect") return false
    return (entry.effect.filter?.blur ?? 0) > 0
  }

  const isSimpleTranslation = (matrix: Float64Array | undefined) => {
    if (!matrix) return true
    const epsilon = 1e-6
    return Math.abs(matrix[0] - 1) < epsilon
      && Math.abs(matrix[1]) < epsilon
      && Math.abs(matrix[3]) < epsilon
      && Math.abs(matrix[4] - 1) < epsilon
      && Math.abs(matrix[6]) < epsilon
      && Math.abs(matrix[7]) < epsilon
      && Math.abs(matrix[8] - 1) < epsilon
  }

  const boundSubtreeCapture = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    capture: { left: number; top: number; right: number; bottom: number },
    ctx: RendererBackendPaintContext | undefined,
    subtreeOps: RenderGraphOp[],
  ) => {
    if (!ctx) return capture
    if (!isSimpleTranslation(op.effect.transform)) return capture
    if (hasSamplingHalo(op) || subtreeOps.some(hasSamplingHalo)) return capture

    const target = {
      left: ctx.offsetX,
      top: ctx.offsetY,
      right: ctx.offsetX + ctx.target.width,
      bottom: ctx.offsetY + ctx.target.height,
    }
    const requested = op.clipBounds
      ? intersectCaptureBounds(target, {
          left: op.clipBounds.x,
          top: op.clipBounds.y,
          right: op.clipBounds.x + op.clipBounds.width,
          bottom: op.clipBounds.y + op.clipBounds.height,
        })
      : target
    if (requested.right <= requested.left || requested.bottom <= requested.top) {
      return { left: capture.left, top: capture.top, right: capture.left + 1, bottom: capture.top + 1 }
    }

    const ownerId = ctx.layer?.subtreeTransform
      ? Number(ctx.layer.key.slice("layer:".length))
      : NaN
    const deferred = Number.isSafeInteger(ownerId) && op.effect._node?.id === ownerId
    const tx = deferred ? 0 : (op.effect.transform?.[2] ?? 0)
    const ty = deferred ? 0 : (op.effect.transform?.[5] ?? 0)
    const visible = {
      left: Math.floor(requested.left - tx),
      top: Math.floor(requested.top - ty),
      right: Math.ceil(requested.right - tx),
      bottom: Math.ceil(requested.bottom - ty),
    }
    const bounded = intersectCaptureBounds(capture, visible)
    if (bounded.right <= bounded.left || bounded.bottom <= bounded.top) {
      return { left: capture.left, top: capture.top, right: capture.left + 1, bottom: capture.top + 1 }
    }
    return bounded
  }

  const getIsolatedSource = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
    ctx?: RendererBackendPaintContext,
  ) => {
    const capture = boundSubtreeCapture(op, getSubtreeCaptureBounds(op, subtreeOps), ctx, subtreeOps)
    const width = Math.max(1, capture.right - capture.left)
    const height = Math.max(1, capture.bottom - capture.top)
    const rootNode = op.effect._node
    const isAncestorClip = (nodeId: number | undefined) => {
      if (nodeId === undefined || !rootNode) return false
      let current = rootNode.parent
      while (current) {
        if (current.id === nodeId) return true
        current = current.parent
      }
      return false
    }
    const intersectClip = (
      left: { x: number; y: number; width: number; height: number },
      right: { x: number; y: number; width: number; height: number },
    ) => {
      const x = Math.max(left.x, right.x)
      const y = Math.max(left.y, right.y)
      const rightEdge = Math.min(left.x + left.width, right.x + right.width)
      const bottomEdge = Math.min(left.y + left.height, right.y + right.height)
      return rightEdge <= x || bottomEdge <= y
        ? { x, y, width: 0, height: 0 }
        : { x, y, width: rightEdge - x, height: bottomEdge - y }
    }
    const sourceClip = (entry: RenderGraphOp) => {
      const stack = getRenderOpClipStack(entry)
      if (stack.length === 0 || !rootNode) return entry.clipBounds
      const internal = stack.filter((clip) => !isAncestorClip(clip.nodeId))
      if (internal.length === 0) return undefined
      let bounds = internal[0].bounds
      for (let i = 1; i < internal.length; i++) bounds = intersectClip(bounds, internal[i].bounds)
      return bounds
    }
    const sourceSubtreeOps = subtreeOps.map((entry) => {
      const sourceEntry = {
        ...entry,
        clipBounds: sourceClip(entry),
      }
      const stack = getRenderOpClipStack(entry)
      if (stack.length > 0 && rootNode) {
        setRenderOpClipStack(sourceEntry, stack.filter((clip) => !isAncestorClip(clip.nodeId)))
      }
      return sourceEntry
    })
    const sourceOp: Extract<RenderGraphOp, { kind: "effect" }> = {
      ...op,
      clipBounds: undefined,
      effect: {
        ...op.effect,
        filter: undefined,
        opacity: undefined,
        transform: undefined,
        transformInverse: undefined,
        transformBounds: undefined,
      },
    }
    const source = renderOpToImage(sourceOp, width, height, capture.left, capture.top, [sourceOp, ...sourceSubtreeOps])
    if (!source) return null
    return { handle: source, width, height, left: capture.left, top: capture.top }
  }

  const getSelfFilterSprite = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
    ctx?: RendererBackendPaintContext,
  ) => {
    const vctx = getVexartCtx()
    const filter = op.effect.filter
    if (!filter || !hasSelfFilter(filter)) return null
    const source = getIsolatedSource(op, subtreeOps, ctx)
    if (!source) return null
    const filtered = vexartCompositeImageFilterBackdrop(vctx, source.handle, {
      blur: filter.blur ?? null,
      brightness: filter.brightness ?? null,
      contrast: filter.contrast ?? null,
      saturate: filter.saturate ?? null,
      grayscale: filter.grayscale ?? null,
      invert: filter.invert ?? null,
      sepia: filter.sepia ?? null,
      hueRotate: filter.hueRotate ?? null,
    })
    targetManager.instanceImageHandles.delete(source.handle)
    vexartRemoveImage(vctx, source.handle)
    if (!filtered) return null
    targetManager.instanceImageHandles.add(filtered)
    transientFullFrameImages.push(filtered)
    return { ...source, handle: filtered }
  }

  const getGroupOpacitySprite = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
    ctx?: RendererBackendPaintContext,
  ) => {
    const source = getIsolatedSource(op, subtreeOps, ctx)
    if (!source) return null
    transientFullFrameImages.push(source.handle)
    return source
  }

  const getTransformedSubtreeSprite = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
    ctx?: RendererBackendPaintContext,
  ) => {
    const source = getIsolatedSource(op, subtreeOps, ctx)
    if (!source) return null
    transientFullFrameImages.push(source.handle)
    return source
  }

  const renderGradientSprite = (
    gradient: NonNullable<EffectRenderOp["effect"]["gradient"]>,
    width: number,
    height: number,
    opacity: number,
    cornerRadii: EffectRenderOp["effect"]["cornerRadii"],
  ) => {
    const vctx = getVexartCtx()
    const target = vexartCompositeTargetCreate(vctx, width, height)
    if (!target) return null
    try {
      if (gradient.type === "linear") {
        const from = opacity < 1 ? applyOpacityToColor(gradient.from, opacity) : gradient.from
        const to = opacity < 1 ? applyOpacityToColor(gradient.to, opacity) : gradient.to
        const instance = packLinearGradientInstance(-1, 1, 2, -2, width, height, 0, from, to,
          Math.cos((gradient.angle * Math.PI) / 180),
          Math.sin((gradient.angle * Math.PI) / 180),
        )
        flushVexartBatchToTarget(vctx, target, 12, instance)
      } else {
        const from = opacity < 1 ? applyOpacityToColor(gradient.from, opacity) : gradient.from
        const to = opacity < 1 ? applyOpacityToColor(gradient.to, opacity) : gradient.to
        const instance = packRadialGradientInstance(-1, 1, 2, -2, width, height, Math.max(width, height) * 0.5, from, to)
        flushVexartBatchToTarget(vctx, target, 13, instance)
      }
      let handle = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height }).handle
      if (handle) targetManager.instanceImageHandles.add(handle)
      if (cornerRadii) {
        const rectBuf = new Float32Array(6)
        rectBuf[0] = 0
        rectBuf[1] = cornerRadii.tl
        rectBuf[2] = cornerRadii.tr
        rectBuf[3] = cornerRadii.br
        rectBuf[4] = cornerRadii.bl
        rectBuf[5] = 1
        const masked = vexartCompositeImageMaskRoundedRect(vctx, handle, rectBuf)
        targetManager.instanceImageHandles.delete(handle)
        vexartRemoveImage(vctx, handle)
        handle = masked
        if (handle) targetManager.instanceImageHandles.add(handle)
      }
      return handle
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  }

  const clipRect = (cmd: { x: number; y: number; width: number; height: number; clipBounds?: { x: number; y: number; width: number; height: number } | null }, ctx: RendererBackendPaintContext) => {
    const x = Math.round(cmd.x) - ctx.offsetX
    const y = Math.round(cmd.y) - ctx.offsetY
    const w = Math.round(cmd.width)
    const h = Math.round(cmd.height)
    const scissorLeft = cmd.clipBounds ? Math.round(cmd.clipBounds.x) - ctx.offsetX : 0
    const scissorTop = cmd.clipBounds ? Math.round(cmd.clipBounds.y) - ctx.offsetY : 0
    const scissorRight = cmd.clipBounds ? scissorLeft + Math.round(cmd.clipBounds.width) : ctx.target.width
    const scissorBottom = cmd.clipBounds ? scissorTop + Math.round(cmd.clipBounds.height) : ctx.target.height
    const left = Math.max(0, x, scissorLeft)
    const top = Math.max(0, y, scissorTop)
    const right = Math.min(ctx.target.width, x + w, scissorRight)
    const bottom = Math.min(ctx.target.height, y + h, scissorBottom)
    if (right <= left || bottom <= top) return null
    return { x, y, w, h, left, top, right, bottom }
  }

  const opBoundsInTarget = (op: RenderGraphOp, ctx: RendererBackendPaintContext) =>
    opBounds({ ...op, x: op.x - ctx.offsetX, y: op.y - ctx.offsetY }, ctx.target.width, ctx.target.height)

  const stripBackdropEffectOp = (op: EffectRenderOp): EffectRenderOp => {
    const stripped = { ...op.effect }
    for (const f of BACKDROP_FIELDS) stripped[f] = undefined
    return { ...op, backdrop: null, effect: stripped }
  }

  type ImageFitGeometry = {
    x: number
    y: number
    width: number
    height: number
    fitX: number
    fitY: number
  }

  const getImageFitGeometry = (
    fit: ImagePaintConfig["objectFit"],
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
  ): ImageFitGeometry => {
    const width = Math.max(1, targetWidth)
    const height = Math.max(1, targetHeight)
    const srcAspect = sourceWidth / Math.max(1, sourceHeight)
    const targetAspect = width / height
    if (fit === "none") {
      return { x: 0, y: 0, width: sourceWidth, height: sourceHeight, fitX: 0, fitY: 0 }
    }
    if (fit === "cover") {
      if (srcAspect > targetAspect) {
        return { x: 0, y: 0, width, height, fitX: (1 - targetAspect / srcAspect) / 2, fitY: 0 }
      }
      if (srcAspect < targetAspect) {
        return { x: 0, y: 0, width, height, fitX: 0, fitY: (1 - srcAspect / targetAspect) / 2 }
      }
      return { x: 0, y: 0, width, height, fitX: 0, fitY: 0 }
    }
    if (fit === "contain") {
      if (srcAspect > targetAspect) {
        const contentHeight = width / srcAspect
        const inset = (height - contentHeight) / (2 * height)
        return { x: 0, y: 0, width, height, fitX: 0, fitY: -Math.max(0, inset) }
      }
      if (srcAspect < targetAspect) {
        const contentWidth = height * srcAspect
        const inset = (width - contentWidth) / (2 * width)
        return { x: 0, y: 0, width, height, fitX: -Math.max(0, inset), fitY: 0 }
      }
    }
    return { x: 0, y: 0, width, height, fitX: 0, fitY: 0 }
  }

  const imageTransformInstance = (
    geometry: ImageFitGeometry,
    targetWidth: number,
    targetHeight: number,
    opacity = 1,
    radius = 0,
  ) => {
    const x0 = (geometry.x / targetWidth) * 2 - 1
    const y0 = 1 - (geometry.y / targetHeight) * 2
    const x1 = ((geometry.x + geometry.width) / targetWidth) * 2 - 1
    const y1 = 1 - ((geometry.y + geometry.height) / targetHeight) * 2
    return packImageTransformInstance(
      x0, y0,
      x1, y0,
      x0, y1,
      x1, y1,
      opacity,
      geometry.fitX,
      geometry.fitY,
      radius,
    )
  }

  type StyledImageCrop = {
    x: number
    y: number
    width: number
    height: number
  }

  const renderStyledImage = (
    op: Extract<RenderGraphOp, { kind: "image" }>,
    imageHandle: VexartImageHandle,
    crop?: StyledImageCrop,
    opacity = 1,
  ) => {
    const vctx = getVexartCtx()
    const boxWidth = Math.max(1, Math.round(op.width))
    const boxHeight = Math.max(1, Math.round(op.height))
    const width = Math.max(1, crop?.width ?? boxWidth)
    const height = Math.max(1, crop?.height ?? boxHeight)
    const geometry = getImageFitGeometry(
      op.image.objectFit,
      op.image.imageBuffer?.width ?? Math.max(1, Math.round(op.width)),
      op.image.imageBuffer?.height ?? Math.max(1, Math.round(op.height)),
      boxWidth,
      boxHeight,
    )
    const paintGeometry = crop
      ? { ...geometry, x: geometry.x - crop.x, y: geometry.y - crop.y }
      : geometry
    const target = vexartCompositeTargetCreate(vctx, width, height)
    if (!target) return null
    let layerOpen = false
    let image: VexartImageHandle | null = null
    try {
      vexartCompositeTargetBeginLayer(vctx, target, 0, 0x00000000)
      layerOpen = true
      vexartCompositeRenderImageTransformLayer(
        vctx,
        target,
        imageHandle,
        imageTransformInstance(paintGeometry, width, height, opacity),
      )
      vexartCompositeTargetEndLayer(vctx, target)
      layerOpen = false
      image = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height }).handle || null
      if (image) targetManager.instanceImageHandles.add(image)
    } finally {
      if (layerOpen) vexartCompositeTargetEndLayer(vctx, target)
      vexartCompositeTargetDestroy(vctx, target)
    }
    if (!image) return null

    const radius = clampShapeRadius(op.image.cornerRadius, boxWidth, boxHeight)
    if (radius > 0) {
      if (!crop) {
        const rectBuf = new Float32Array(6)
        rectBuf[0] = radius
        rectBuf[5] = 0
        const masked = vexartCompositeImageMaskRoundedRect(vctx, image, rectBuf)
        targetManager.instanceImageHandles.delete(image)
        vexartRemoveImage(vctx, image)
        if (!masked) return null
        image = masked
        targetManager.instanceImageHandles.add(image)
      } else {
        const rectBuf = new Float32Array(10)
        rectBuf[0] = 0
        rectBuf[1] = radius
        rectBuf[2] = radius
        rectBuf[3] = radius
        rectBuf[4] = radius
        rectBuf[5] = 1
        rectBuf[6] = ((-crop.x) / crop.width) * 2 - 1
        rectBuf[7] = 1 - ((boxHeight - crop.y) / crop.height) * 2
        rectBuf[8] = (boxWidth / crop.width) * 2
        rectBuf[9] = (boxHeight / crop.height) * 2
        const masked = vexartCompositeImageMaskRoundedRectRegion(vctx, image, rectBuf)
        targetManager.instanceImageHandles.delete(image)
        vexartRemoveImage(vctx, image)
        if (!masked) return null
        image = masked
        targetManager.instanceImageHandles.add(image)
      }
    }
    return { handle: image, width, height }
  }

  const renderClippedOp = (
    op: RenderGraphOp,
    clip: { left: number; top: number; right: number; bottom: number },
    ctx: RendererBackendPaintContext,
  ) => {
    const ownLeft = Math.round(op.x) - ctx.offsetX
    const ownTop = Math.round(op.y) - ctx.offsetY
    const bounds = {
      left: ownLeft,
      top: ownTop,
      right: ownLeft + Math.max(1, Math.round(op.width)),
      bottom: ownTop + Math.max(1, Math.round(op.height)),
    }
    const width = Math.max(1, bounds.right - bounds.left)
    const height = Math.max(1, bounds.bottom - bounds.top)
    const sourceLeft = bounds.left
    const sourceTop = bounds.top
    const cropX = clip.left - sourceLeft
    const cropY = clip.top - sourceTop
    const cropWidth = clip.right - clip.left
    const cropHeight = clip.bottom - clip.top
    if (cropX < 0 || cropY < 0 || cropX + cropWidth > width || cropY + cropHeight > height) return null
    if (op.kind === "image") {
      const imageHandle = (op.image.nativeImageHandle && op.image.nativeImageHandle > 0n)
        ? op.image.nativeImageHandle
        : (op.textureId && typeof op.textureId === "bigint" && op.textureId > 0n)
          ? op.textureId
          : (op.image.imageBuffer ? targetManager.getImage(op.image.imageBuffer.data, op.image.imageBuffer.width, op.image.imageBuffer.height) : 0n)
      if (!imageHandle) {
        const sourceOp = { ...op.rect, clipBounds: undefined }
        const source = renderOpToImage(
          sourceOp,
          width,
          height,
          bounds.left + ctx.offsetX,
          bounds.top + ctx.offsetY,
          [sourceOp],
        )
        if (!source) return null
        const cropped = targetManager.cropImage(source, width, height, cropX, cropY, cropWidth, cropHeight)
        targetManager.instanceImageHandles.delete(source)
        vexartRemoveImage(getVexartCtx(), source)
        return cropped ? { handle: cropped, width: cropWidth, height: cropHeight } : null
      }
      return renderStyledImage(op, imageHandle, { x: cropX, y: cropY, width: cropWidth, height: cropHeight }, op.rect.effect?.opacity ?? 1)
    }
    const sourceOp = { ...op, clipBounds: undefined }
    const source = renderOpToImage(
      sourceOp,
      width,
      height,
      bounds.left + ctx.offsetX,
      bounds.top + ctx.offsetY,
      [sourceOp],
    )
    if (!source) return null
    const cropped = targetManager.cropImage(source, width, height, cropX, cropY, cropWidth, cropHeight)
    targetManager.instanceImageHandles.delete(source)
    vexartRemoveImage(getVexartCtx(), source)
    return cropped ? { handle: cropped, width: cropWidth, height: cropHeight } : null
  }

  const renderClippedEffectOp = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    clip: { left: number; top: number; right: number; bottom: number },
    ctx: RendererBackendPaintContext,
  ) => {
    const capture = getSubtreeCaptureBounds(op, [])
    const captureLeft = capture.left - ctx.offsetX
    const captureTop = capture.top - ctx.offsetY
    const width = Math.max(1, capture.right - capture.left)
    const height = Math.max(1, capture.bottom - capture.top)
    const cropX = clip.left - captureLeft
    const cropY = clip.top - captureTop
    const cropWidth = clip.right - clip.left
    const cropHeight = clip.bottom - clip.top
    if (cropX < 0 || cropY < 0 || cropX + cropWidth > width || cropY + cropHeight > height) return null
    const source = renderOpToImage(
      { ...op, clipBounds: undefined },
      width,
      height,
      capture.left,
      capture.top,
      [{ ...op, clipBounds: undefined }],
    )
    if (!source) return null
    const cropped = targetManager.cropImage(source, width, height, cropX, cropY, cropWidth, cropHeight)
    targetManager.instanceImageHandles.delete(source)
    vexartRemoveImage(getVexartCtx(), source)
    return cropped ? { handle: cropped, width: cropWidth, height: cropHeight } : null
  }

  const getTransformedImageGeometry = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    sprite: { width: number; height: number; left: number; top: number },
    ctx: RendererBackendPaintContext,
    opacity: number,
  ) => {
    const matrix = op.effect.transform
    if (!matrix) return null
    const width = sprite.width
    const height = sprite.height
    const sourceX = sprite.left - Math.round(op.x)
    const sourceY = sprite.top - Math.round(op.y)
    const baseX = Math.round(op.x) - ctx.offsetX
    const baseY = Math.round(op.y) - ctx.offsetY
    const points = [
      transformPoint(matrix, sourceX, sourceY),
      transformPoint(matrix, sourceX + width, sourceY),
      transformPoint(matrix, sourceX, sourceY + height),
      transformPoint(matrix, sourceX + width, sourceY + height),
    ].map((point) => ({ x: baseX + point.x, y: baseY + point.y }))
    const quad = {
      p0: { x: (points[0].x / ctx.target.width) * 2 - 1, y: 1 - (points[0].y / ctx.target.height) * 2 },
      p1: { x: (points[1].x / ctx.target.width) * 2 - 1, y: 1 - (points[1].y / ctx.target.height) * 2 },
      p2: { x: (points[2].x / ctx.target.width) * 2 - 1, y: 1 - (points[2].y / ctx.target.height) * 2 },
      p3: { x: (points[3].x / ctx.target.width) * 2 - 1, y: 1 - (points[3].y / ctx.target.height) * 2 },
    }
    return {
      instance: packImageTransformInstance(
        quad.p0.x, quad.p0.y,
        quad.p1.x, quad.p1.y,
        quad.p2.x, quad.p2.y,
        quad.p3.x, quad.p3.y,
        opacity,
      ),
      quad,
      bounds: {
        left: Math.floor(Math.min(...points.map((point) => point.x))),
        top: Math.floor(Math.min(...points.map((point) => point.y))),
        right: Math.ceil(Math.max(...points.map((point) => point.x))),
        bottom: Math.ceil(Math.max(...points.map((point) => point.y))),
      },
    }
  }

  const renderTransformedSpriteClip = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    sprite: { handle: VexartImageHandle; width: number; height: number; left: number; top: number },
    ctx: RendererBackendPaintContext,
    opacity: number,
  ) => {
    if (!op.clipBounds) return null
    const geometry = getTransformedImageGeometry(op, sprite, ctx, opacity)
    if (!geometry) return null
    const clip = {
      left: Math.max(0, Math.round(op.clipBounds.x) - ctx.offsetX, geometry.bounds.left),
      top: Math.max(0, Math.round(op.clipBounds.y) - ctx.offsetY, geometry.bounds.top),
      right: Math.min(ctx.target.width, Math.round(op.clipBounds.x) - ctx.offsetX + Math.round(op.clipBounds.width), geometry.bounds.right),
      bottom: Math.min(ctx.target.height, Math.round(op.clipBounds.y) - ctx.offsetY + Math.round(op.clipBounds.height), geometry.bounds.bottom),
    }
    const outside = geometry.bounds.left < Math.round(op.clipBounds.x) - ctx.offsetX
      || geometry.bounds.top < Math.round(op.clipBounds.y) - ctx.offsetY
      || geometry.bounds.right > Math.round(op.clipBounds.x) - ctx.offsetX + Math.round(op.clipBounds.width)
      || geometry.bounds.bottom > Math.round(op.clipBounds.y) - ctx.offsetY + Math.round(op.clipBounds.height)
    if (!outside) return null
    if (clip.right <= clip.left || clip.bottom <= clip.top) return { handle: null, clip, geometry }
    const vctx = getVexartCtx()
    const temp = vexartCompositeTargetCreate(vctx, ctx.target.width, ctx.target.height)
    if (!temp) return { handle: null, clip, geometry }
    try {
      vexartCompositeTargetBeginLayer(vctx, temp, 0, 0x00000000)
      vexartCompositeTargetSetScissor(vctx, temp, clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top)
      vexartCompositeRenderImageTransformLayer(vctx, temp, sprite.handle, geometry.instance)
      vexartCompositeTargetResetScissor(vctx, temp)
      vexartCompositeTargetEndLayer(vctx, temp)
      const copied = copyGpuTargetRegionToImage(vctx, temp, {
        x: clip.left,
        y: clip.top,
        width: clip.right - clip.left,
        height: clip.bottom - clip.top,
      })
      if (copied.handle) targetManager.instanceImageHandles.add(copied.handle)
      return { handle: copied.handle || null, clip, geometry }
    } finally {
      vexartCompositeTargetDestroy(vctx, temp)
    }
  }

  const renderFrame = (
    ctx: RendererBackendPaintContext,
    targetHandle: VexartTargetHandle,
  ): { ok: boolean; rawLayer: null } => {
    let first = true
    imageGroups.clear()
    transformedImageGroups.clear()
    const parentTransientFullFrameImages = transientFullFrameImages
    transientFullFrameImages = []
    let targetMutationVersion = 0

    const vctx = getVexartCtx()
    const geometryStream = acquireGeometryStream()

    const flushStream = () => {
      if (geometryStream.isEmpty()) return false
      ensureLoadedLayer()
      const ok = geometryStream.flush(vctx, targetHandle)
      if (ok) {
        first = false
        targetMutationVersion += 1
      }
      return ok
    }

    const flushImages = () => {
      if (imageGroups.size === 0) return
      ensureLoadedLayer()
      for (const group of imageGroups.values()) {
        for (const instance of group.instances) {
          const x = ((instance.x + 1) * 0.5) * ctx.target.width
          const y = ((1 - instance.y) * 0.5) * ctx.target.height
          const w = Math.abs(instance.w) * 0.5 * ctx.target.width
          const h = Math.abs(instance.h) * 0.5 * ctx.target.height
          vexartCompositeRenderImageLayer(
            vctx, targetHandle, group.handle,
            x, y, w, h,
            0, 0x00000000,
          )
          first = false
          targetMutationVersion += 1
        }
      }
      imageGroups.clear()
    }
    const flushTransformedImages = () => {
      if (transformedImageGroups.size === 0) return
      ensureLoadedLayer()
      for (const group of transformedImageGroups.values()) {
        for (let i = 0; i < group.instances.length; i++) {
          const inst = group.instances[i]
          const instance = packImageTransformInstance(
            inst.p0.x, inst.p0.y,
            inst.p1.x, inst.p1.y,
            inst.p2.x, inst.p2.y,
            inst.p3.x, inst.p3.y,
            inst.opacity,
            inst.fitX ?? 0,
            inst.fitY ?? 0,
            inst.radius ?? 0,
          )
          vexartCompositeRenderImageTransformLayer(vctx, targetHandle, group.handle, instance)
          first = false
          targetMutationVersion += 1
        }
      }
      transformedImageGroups.clear()
    }
    const flushRasterImages = () => {
      flushImages()
      flushTransformedImages()
    }
    const flushText = () => {
      if (textEncoder.flush(vctx, targetHandle, ctx.target.width, ctx.target.height)) {
        targetMutationVersion += 1
      }
    }
    const flushAll = () => {
      flushStream()
      flushRasterImages()
      flushText()
    }

    let activeScissor: { x: number; y: number; width: number; height: number } | null = null
    const syncScissor = (clipBounds: { x: number; y: number; width: number; height: number } | null | undefined) => {
      if (clipBounds) {
        const sx = Math.max(0, Math.round(clipBounds.x) - ctx.offsetX)
        const sy = Math.max(0, Math.round(clipBounds.y) - ctx.offsetY)
        const sw = Math.max(0, Math.min(ctx.target.width - sx, Math.round(clipBounds.width)))
        const sh = Math.max(0, Math.min(ctx.target.height - sy, Math.round(clipBounds.height)))
        if (!activeScissor || activeScissor.x !== sx || activeScissor.y !== sy || activeScissor.width !== sw || activeScissor.height !== sh) {
          geometryStream.appendScissor(sx, sy, sw, sh)
          activeScissor = { x: sx, y: sy, width: sw, height: sh }
        }
      } else if (activeScissor !== null) {
        geometryStream.appendResetScissor()
        activeScissor = null
      }
    }

    let dirtyBounds: IntBounds | null = null
    let layerOpen = false

    frameGeneration += 1
    targetManager.pruneBackdropCaches(frameGeneration)

    const markDirty = (left: number, top: number, right: number, bottom: number) => {
      dirtyBounds = unionBounds(dirtyBounds, { left, top, right, bottom })
    }

    const ensureLoadedLayer = () => {
      if (layerOpen) return
      vexartCompositeTargetBeginLayer(vctx, targetHandle, 1, 0x00000000)
      layerOpen = true
      if (activeScissor !== null) {
        geometryStream.appendScissor(activeScissor.x, activeScissor.y, activeScissor.width, activeScissor.height)
      }
    }

    vexartCompositeTargetBeginLayer(vctx, targetHandle, 0, 0x00000000)
    layerOpen = true

    try {
      const skippedSubtreeOps = new Set<number>()
      const layerTransformOwnerId = ctx.layer?.subtreeTransform
        ? Number(ctx.layer.key.slice("layer:".length))
        : NaN
      const defersBoundaryTransform = (op: Extract<RenderGraphOp, { kind: "effect" }>) => (
        Number.isSafeInteger(layerTransformOwnerId)
        && op.effect._node?.id === layerTransformOwnerId
      )
      for (let opIndex = 0; opIndex < ctx.graph.ops.length; opIndex++) {
        if (skippedSubtreeOps.has(opIndex)) continue
        const op = ctx.graph.ops[opIndex]
        syncScissor(op.clipBounds)
        const haloCapture = op.kind === "effect" && (op.effect.shadow !== undefined || op.effect.glow !== undefined)
          ? getSubtreeCaptureBounds(op, [])
          : null
        const clip = clipRect(op, ctx)
        const haloClip = haloCapture && op.kind === "effect" && op.clipBounds
          ? {
              left: Math.max(0, Math.round(op.clipBounds.x) - ctx.offsetX, haloCapture.left - ctx.offsetX),
              top: Math.max(0, Math.round(op.clipBounds.y) - ctx.offsetY, haloCapture.top - ctx.offsetY),
              right: Math.min(ctx.target.width, Math.round(op.clipBounds.x) - ctx.offsetX + Math.round(op.clipBounds.width), haloCapture.right - ctx.offsetX),
              bottom: Math.min(ctx.target.height, Math.round(op.clipBounds.y) - ctx.offsetY + Math.round(op.clipBounds.height), haloCapture.bottom - ctx.offsetY),
            }
          : null
        const haloNeedsCrop = !!(haloCapture && op.kind === "effect" && op.clipBounds && (
          haloCapture.left < Math.round(op.clipBounds.x)
          || haloCapture.top < Math.round(op.clipBounds.y)
          || haloCapture.right > Math.round(op.clipBounds.x) + Math.round(op.clipBounds.width)
          || haloCapture.bottom > Math.round(op.clipBounds.y) + Math.round(op.clipBounds.height)
        ))
        if (haloNeedsCrop && haloClip && op.kind === "effect" && (op.effect._node?.children.length ?? 0) === 0 && !op.backdrop) {
          flushAll()
          const clipped = renderClippedEffectOp(op, haloClip, ctx)
          if (!clipped) return { ok: false, rawLayer: null }
          ensureLoadedLayer()
          const clippedInstance = packImageTransformInstance(
            (haloClip.left / ctx.target.width) * 2 - 1,
            1 - (haloClip.top / ctx.target.height) * 2,
            (haloClip.right / ctx.target.width) * 2 - 1,
            1 - (haloClip.top / ctx.target.height) * 2,
            (haloClip.left / ctx.target.width) * 2 - 1,
            1 - (haloClip.bottom / ctx.target.height) * 2,
            (haloClip.right / ctx.target.width) * 2 - 1,
            1 - (haloClip.bottom / ctx.target.height) * 2,
            1,
          )
          vexartCompositeRenderImageTransformLayer(vctx, targetHandle, clipped.handle, clippedInstance)
          transientFullFrameImages.push(clipped.handle)
          first = false
          targetMutationVersion += 1
          markDirty(haloClip.left, haloClip.top, haloClip.right, haloClip.bottom)
          continue
        }
        if (!clip) continue
        const ownLeft = Math.round(op.x) - ctx.offsetX
        const ownTop = Math.round(op.y) - ctx.offsetY
        const ownRight = ownLeft + Math.max(1, Math.round(op.width))
        const ownBottom = ownTop + Math.max(1, Math.round(op.height))
        const needsCrop = clip.left !== ownLeft || clip.top !== ownTop || clip.right !== ownRight || clip.bottom !== ownBottom
        const canCropAsSingleOp = op.kind !== "effect"
          || (op.effect._node?.children.length ?? 0) === 0
          && !op.backdrop
        if (needsCrop && canCropAsSingleOp) {
          flushAll()
          const clipped = renderClippedOp(op, clip, ctx)
          if (!clipped) return { ok: false, rawLayer: null }
          ensureLoadedLayer()
          const clippedInstance = packImageTransformInstance(
            (clip.left / ctx.target.width) * 2 - 1,
            1 - (clip.top / ctx.target.height) * 2,
            (clip.right / ctx.target.width) * 2 - 1,
            1 - (clip.top / ctx.target.height) * 2,
            (clip.left / ctx.target.width) * 2 - 1,
            1 - (clip.bottom / ctx.target.height) * 2,
            (clip.right / ctx.target.width) * 2 - 1,
            1 - (clip.bottom / ctx.target.height) * 2,
            1,
          )
          vexartCompositeRenderImageTransformLayer(vctx, targetHandle, clipped.handle, clippedInstance)
          transientFullFrameImages.push(clipped.handle)
          first = false
          targetMutationVersion += 1
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "rectangle") {
          flushRasterImages()
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          geometryStream.appendShapeRect(
            (clip.left / ctx.target.width) * 2 - 1,
            1 - (clip.top / ctx.target.height) * 2,
            (boxW / ctx.target.width) * 2,
            -((boxH / ctx.target.height) * 2),
            boxW,
            boxH,
            clampShapeRadius(op.radius, boxW, boxH),
            op.color >>> 0,
            0,
            0,
          )
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "effect") {
          flushRasterImages()
          let effectOp = op
          const effectOpacity = effectOp.effect.opacity ?? 1
          const cornerRadii = effectOp.effect.cornerRadii

          const hasFilteredOutput = !!(effectOp.effect.filter && hasSelfFilter(effectOp.effect.filter))
          const hasGroupOpacity = effectOpacity < 1 && effectOp.effect._node !== undefined && effectOp.effect._node.children.length > 0
          const hasTransformedSubtree = !!(effectOp.effect.transform && effectOp.effect._node !== undefined && effectOp.effect._node.children.length > 0)
          const deferTransform = hasTransformedSubtree && defersBoundaryTransform(effectOp)
          if (hasFilteredOutput || hasGroupOpacity || hasTransformedSubtree) {
            const subtreeNodeIds = new Set<number>()
            const collectNodeIds = (node: TGENode | undefined) => {
              if (!node || subtreeNodeIds.has(node.id)) return
              subtreeNodeIds.add(node.id)
              for (const child of node.children) collectNodeIds(child)
            }
            collectNodeIds(effectOp.effect._node)
            const subtreeOps: RenderGraphOp[] = []
            for (let descendantIndex = opIndex + 1; descendantIndex < ctx.graph.ops.length; descendantIndex++) {
              const descendant = ctx.graph.ops[descendantIndex]
              if (descendant.nodeId === undefined || !subtreeNodeIds.has(descendant.nodeId)) continue
              subtreeOps.push(descendant)
              skippedSubtreeOps.add(descendantIndex)
            }

            flushAll()
            const sprite = hasFilteredOutput
              ? getSelfFilterSprite(effectOp, subtreeOps, ctx)
              : hasGroupOpacity
                ? getGroupOpacitySprite(effectOp, subtreeOps, ctx)
                : getTransformedSubtreeSprite(effectOp, subtreeOps, ctx)
            if (!sprite) return { ok: false, rawLayer: null }
            const bounds = opBoundsInTarget(effectOp, ctx)
            if (!bounds) continue
            if (effectOp.effect.transform && !deferTransform) {
              const transformedSprite = {
                handle: sprite.handle,
                width: sprite.width,
                height: sprite.height,
                left: sprite.left,
                top: sprite.top,
              }
              const clippedTransformed = renderTransformedSpriteClip(effectOp, transformedSprite, ctx, effectOpacity)
              if (clippedTransformed) {
                if (clippedTransformed.handle) {
                  ensureLoadedLayer()
                  const output = clippedTransformed.clip
                  const imageInstance = packImageTransformInstance(
                    (output.left / ctx.target.width) * 2 - 1,
                    1 - (output.top / ctx.target.height) * 2,
                    (output.right / ctx.target.width) * 2 - 1,
                    1 - (output.top / ctx.target.height) * 2,
                    (output.left / ctx.target.width) * 2 - 1,
                    1 - (output.bottom / ctx.target.height) * 2,
                    (output.right / ctx.target.width) * 2 - 1,
                    1 - (output.bottom / ctx.target.height) * 2,
                    1,
                  )
                  vexartCompositeRenderImageTransformLayer(vctx, targetHandle, clippedTransformed.handle, imageInstance)
                  transientFullFrameImages.push(clippedTransformed.handle)
                  first = false
                  targetMutationVersion += 1
                }
                markDirty(clippedTransformed.clip.left, clippedTransformed.clip.top, clippedTransformed.clip.right, clippedTransformed.clip.bottom)
                continue
              }
              const geometry = getTransformedImageGeometry(effectOp, transformedSprite, ctx, effectOpacity)
              if (!geometry) continue
              ensureLoadedLayer()
              const group = transformedImageGroups.get(sprite.handle) ?? { handle: sprite.handle, instances: [] as TransformedImageInstance[] }
              group.instances.push({
                ...geometry.quad,
                opacity: effectOpacity,
              })
              transformedImageGroups.set(sprite.handle, group)
              markDirty(geometry.bounds.left, geometry.bounds.top, geometry.bounds.right, geometry.bounds.bottom)
              flushAll()
            } else {
              ensureLoadedLayer()
              let imageHandle = sprite.handle
              let imageWidth = sprite.width
              let imageHeight = sprite.height
              let imageLeft = sprite.left - ctx.offsetX
              let imageTop = sprite.top - ctx.offsetY
              const spriteLeft = sprite.left - ctx.offsetX
              const spriteTop = sprite.top - ctx.offsetY
              const spriteRight = spriteLeft + sprite.width
              const spriteBottom = spriteTop + sprite.height
              const spriteNeedsCrop = !!(effectOp.clipBounds && (
                spriteLeft < Math.round(effectOp.clipBounds.x) - ctx.offsetX
                || spriteTop < Math.round(effectOp.clipBounds.y) - ctx.offsetY
                || spriteRight > Math.round(effectOp.clipBounds.x) - ctx.offsetX + Math.round(effectOp.clipBounds.width)
                || spriteBottom > Math.round(effectOp.clipBounds.y) - ctx.offsetY + Math.round(effectOp.clipBounds.height)
              ))
              const outputClip = spriteNeedsCrop && effectOp.clipBounds
                ? {
                    left: Math.max(0, Math.round(effectOp.clipBounds.x) - ctx.offsetX),
                    top: Math.max(0, Math.round(effectOp.clipBounds.y) - ctx.offsetY),
                    right: Math.min(ctx.target.width, Math.round(effectOp.clipBounds.x) - ctx.offsetX + Math.round(effectOp.clipBounds.width)),
                    bottom: Math.min(ctx.target.height, Math.round(effectOp.clipBounds.y) - ctx.offsetY + Math.round(effectOp.clipBounds.height)),
                  }
                : clip
              if (needsCrop || spriteNeedsCrop) {
                const sourceLeft = sprite.left - ctx.offsetX
                const sourceTop = sprite.top - ctx.offsetY
                const cropX = outputClip.left - sourceLeft
                const cropY = outputClip.top - sourceTop
                const cropWidth = outputClip.right - outputClip.left
                const cropHeight = outputClip.bottom - outputClip.top
                const cropped = targetManager.cropImage(sprite.handle, imageWidth, imageHeight, cropX, cropY, cropWidth, cropHeight)
                if (!cropped) return { ok: false, rawLayer: null }
                transientFullFrameImages.push(cropped)
                imageHandle = cropped
                imageWidth = cropWidth
                imageHeight = cropHeight
                imageLeft = outputClip.left
                imageTop = outputClip.top
              }
              const imageInstance = packImageTransformInstance(
                (imageLeft / ctx.target.width) * 2 - 1,
                1 - (imageTop / ctx.target.height) * 2,
                ((imageLeft + imageWidth) / ctx.target.width) * 2 - 1,
                1 - (imageTop / ctx.target.height) * 2,
                (imageLeft / ctx.target.width) * 2 - 1,
                1 - ((imageTop + imageHeight) / ctx.target.height) * 2,
                ((imageLeft + imageWidth) / ctx.target.width) * 2 - 1,
                1 - ((imageTop + imageHeight) / ctx.target.height) * 2,
                effectOpacity,
              )
              vexartCompositeRenderImageTransformLayer(vctx, targetHandle, imageHandle, imageInstance)
              first = false
              targetMutationVersion += 1
              markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
            }
            continue
          }

          if (effectOp.backdrop && !cornerRadii) {
            if (first) {
              geometryStream.appendShapeRect(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            }
            flushAll()
            if (layerOpen) {
              vexartCompositeTargetEndLayer(vctx, targetHandle)
              layerOpen = false
            }
            const sprite = targetManager.getBackdropSprite(effectOp, ctx, targetHandle, frameGeneration, targetMutationVersion)
            if (!sprite) return { ok: false, rawLayer: null }
            if (effectOp.effect.transform) {
              ensureLoadedLayer()
              const bounds = opBoundsInTarget(effectOp, ctx)
              if (bounds) {
                const group = transformedImageGroups.get(sprite.handle) ?? { handle: sprite.handle, instances: [] as TransformedImageInstance[] }
                const matrix = effectOp.effect.transform
                const width = Math.max(1, Math.round(effectOp.width))
                const height = Math.max(1, Math.round(effectOp.height))
                const baseX = Math.round(effectOp.x) - ctx.offsetX
                const baseY = Math.round(effectOp.y) - ctx.offsetY
                const p0 = transformPoint(matrix, 0, 0)
                const p1 = transformPoint(matrix, width, 0)
                const p2 = transformPoint(matrix, 0, height)
                const p3 = transformPoint(matrix, width, height)
                group.instances.push({
                  p0: { x: ((baseX + p0.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p0.y) / ctx.target.height) * 2 },
                  p1: { x: ((baseX + p1.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p1.y) / ctx.target.height) * 2 },
                  p2: { x: ((baseX + p2.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p2.y) / ctx.target.height) * 2 },
                  p3: { x: ((baseX + p3.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p3.y) / ctx.target.height) * 2 },
                  opacity: effectOpacity,
                })
                transformedImageGroups.set(sprite.handle, group)
                markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
                flushAll()
              }
            } else {
              ensureLoadedLayer()
              vexartCompositeRenderImageLayer(
                vctx, targetHandle, sprite.handle,
                sprite.bounds.left,
                sprite.bounds.top,
                sprite.bounds.right - sprite.bounds.left,
                sprite.bounds.bottom - sprite.bounds.top,
                1, 0x00000000,
              )
              first = false
              targetMutationVersion += 1
              markDirty(sprite.bounds.left, sprite.bounds.top, sprite.bounds.right, sprite.bounds.bottom)
            }
            effectOp = stripBackdropEffectOp(effectOp)
          }

          if (effectOp.backdrop && cornerRadii) {
            if (first) {
              geometryStream.appendShapeRect(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            }
            flushAll()
            if (layerOpen) {
              vexartCompositeTargetEndLayer(vctx, targetHandle)
              layerOpen = false
            }
            const sprite = targetManager.getBackdropSprite(effectOp, ctx, targetHandle, frameGeneration, targetMutationVersion)
            if (!sprite) return { ok: false, rawLayer: null }
            const maskRectBuf = new Float32Array(6)
            maskRectBuf[0] = 0
            maskRectBuf[1] = cornerRadii.tl
            maskRectBuf[2] = cornerRadii.tr
            maskRectBuf[3] = cornerRadii.br
            maskRectBuf[4] = cornerRadii.bl
            maskRectBuf[5] = 1
            const masked = vexartCompositeImageMaskRoundedRect(vctx, sprite.handle, maskRectBuf)
            vexartCompositeRenderImageLayer(
              vctx, targetHandle, masked,
              sprite.bounds.left,
              sprite.bounds.top,
              sprite.bounds.right - sprite.bounds.left,
              sprite.bounds.bottom - sprite.bounds.top,
              first ? 0 : 1, 0x00000000,
            )
            vexartRemoveImage(vctx, masked)
            first = false
            targetMutationVersion += 1
            markDirty(sprite.bounds.left, sprite.bounds.top, sprite.bounds.right, sprite.bounds.bottom)
            effectOp = stripBackdropEffectOp(effectOp)
          }

          if (effectOp.backdrop) {
            failGpuOnly("backdrop effect requires removed software fallback path")
          }

          if (effectOp.effect.transform) {
            const bounds = opBoundsInTarget(effectOp, ctx)
            if (!bounds) continue
            const handle = targetManager.getTransformSprite(effectOp)
            if (!handle) return { ok: false, rawLayer: null }
            const group = transformedImageGroups.get(handle) ?? { handle, instances: [] as TransformedImageInstance[] }
            const matrix = effectOp.effect.transform
            const width = Math.max(1, Math.round(effectOp.width))
            const height = Math.max(1, Math.round(effectOp.height))
            const baseX = Math.round(effectOp.x) - ctx.offsetX
            const baseY = Math.round(effectOp.y) - ctx.offsetY
            const p0 = transformPoint(matrix, 0, 0)
            const p1 = transformPoint(matrix, width, 0)
            const p2 = transformPoint(matrix, 0, height)
            const p3 = transformPoint(matrix, width, height)
            group.instances.push({
              p0: { x: ((baseX + p0.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p0.y) / ctx.target.height) * 2 },
              p1: { x: ((baseX + p1.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p1.y) / ctx.target.height) * 2 },
              p2: { x: ((baseX + p2.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p2.y) / ctx.target.height) * 2 },
              p3: { x: ((baseX + p3.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p3.y) / ctx.target.height) * 2 },
              opacity: effectOp.effect.opacity ?? 1,
            })
            transformedImageGroups.set(handle, group)
            markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
            flushAll()
            continue
          }

          const baseFillRaw = effectOp.color >>> 0
          const baseFill = effectOpacity < 1 ? applyOpacityToColor(baseFillRaw, effectOpacity) : baseFillRaw
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          const radius = clampShapeRadius(effectOp.rect.radius, boxW, boxH)

          if (effectOp.effect.shadow) {
            const shadowDefs = Array.isArray(effectOp.effect.shadow) ? effectOp.effect.shadow : [effectOp.effect.shadow]
            const shadowRadii = cornerRadii ?? { tl: radius, tr: radius, br: radius, bl: radius }
            const sourceX = clip.x
            const sourceY = clip.y
            const sourceW = clip.w
            const sourceH = clip.h
            for (const s of shadowDefs) {
              const blur = Math.max(0, s.blur)
              const blurPad = Math.ceil(blur)
              const pad = blurPad * 2
              const quadLeft = sourceX + Math.min(0, s.x) - pad
              const quadTop = sourceY + Math.min(0, s.y) - pad
              const quadRight = sourceX + sourceW + Math.max(0, s.x) + pad
              const quadBottom = sourceY + sourceH + Math.max(0, s.y) + pad
              const quadW = quadRight - quadLeft
              const quadH = quadBottom - quadTop

              if (quadRight <= 0 || quadBottom <= 0 || quadLeft >= ctx.target.width || quadTop >= ctx.target.height) {
                continue
              }

              geometryStream.appendShadow(
                (quadLeft / ctx.target.width) * 2 - 1,
                1 - (quadTop / ctx.target.height) * 2,
                (quadW / ctx.target.width) * 2,
                -((quadH / ctx.target.height) * 2),
                effectOpacity < 1 ? applyOpacityToColor(s.color, effectOpacity) : s.color,
                shadowRadii,
                sourceW,
                sourceH,
                s.x,
                s.y,
                blur,
              )
              markDirty(
                Math.max(0, quadLeft),
                Math.max(0, quadTop),
                Math.min(ctx.target.width, quadRight),
                Math.min(ctx.target.height, quadBottom),
              )
            }
          }

          if (effectOp.effect.glow) {
            const sourceX = clip.x
            const sourceY = clip.y
            const sourceW = clip.w
            const sourceH = clip.h
            const margin = effectOp.effect.glow.radius
            const quadLeft = sourceX - margin
            const quadTop = sourceY - margin
            const quadRight = sourceX + sourceW + margin
            const quadBottom = sourceY + sourceH + margin
            const quadW = quadRight - quadLeft
            const quadH = quadBottom - quadTop

            if (quadRight > 0 && quadBottom > 0 && quadLeft < ctx.target.width && quadTop < ctx.target.height) {
              geometryStream.appendGlow(
                (quadLeft / ctx.target.width) * 2 - 1,
                1 - (quadTop / ctx.target.height) * 2,
                (quadW / ctx.target.width) * 2,
                -((quadH / ctx.target.height) * 2),
                effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.glow.color, effectOpacity) : effectOp.effect.glow.color,
                effectOp.effect.glow.intensity,
              )
              markDirty(
                Math.max(0, quadLeft),
                Math.max(0, quadTop),
                Math.min(ctx.target.width, quadRight),
                Math.min(ctx.target.height, quadBottom),
              )
            }
          }

          const hasGlowOrShadow = !!(effectOp.effect.glow || effectOp.effect.shadow)
          const shouldPaintBaseFill = !effectOp.effect.gradient
            ? (!hasGlowOrShadow || (effectOp.color & 0xff) > 1)
            : (!cornerRadii || (effectOp.color & 0xff) > 1)

          if (shouldPaintBaseFill) {
            if (cornerRadii) {
              geometryStream.appendShapeRectCorners(
                (clip.left / ctx.target.width) * 2 - 1,
                1 - (clip.top / ctx.target.height) * 2,
                (boxW / ctx.target.width) * 2,
                -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                cornerRadii,
                baseFill,
                0,
                0,
              )
            } else {
              geometryStream.appendShapeRect(
                (clip.left / ctx.target.width) * 2 - 1,
                1 - (clip.top / ctx.target.height) * 2,
                (boxW / ctx.target.width) * 2,
                -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                radius,
                baseFill,
                0,
                0,
              )
            }
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
          }

          if (effectOp.effect.gradient?.type === "linear") {
            if (cornerRadii) {
              flushAll()
              const handle = renderGradientSprite(effectOp.effect.gradient, boxW, boxH, effectOpacity, cornerRadii)
              if (!handle) return { ok: false, rawLayer: null }
              vexartCompositeRenderImageLayer(
                vctx, targetHandle, handle,
                clip.left,
                clip.top,
                boxW,
                boxH,
                first ? 0 : 1, 0x00000000,
              )
              vexartRemoveImage(vctx, handle)
              first = false
              targetMutationVersion += 1
              markDirty(clip.left, clip.top, clip.right, clip.bottom)
              continue
            }
            const from = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.from, effectOpacity) : effectOp.effect.gradient.from
            const to = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.to, effectOpacity) : effectOp.effect.gradient.to
            geometryStream.appendLinearGradient(
              (clip.left / ctx.target.width) * 2 - 1,
              1 - (clip.top / ctx.target.height) * 2,
              (boxW / ctx.target.width) * 2,
              -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radius,
              from,
              to,
              Math.cos((effectOp.effect.gradient.angle * Math.PI) / 180),
              Math.sin((effectOp.effect.gradient.angle * Math.PI) / 180),
            )
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }

          if (effectOp.effect.gradient?.type === "radial") {
            if (cornerRadii) {
              flushAll()
              const handle = renderGradientSprite(effectOp.effect.gradient, boxW, boxH, effectOpacity, cornerRadii)
              if (!handle) return { ok: false, rawLayer: null }
              vexartCompositeRenderImageLayer(
                vctx, targetHandle, handle,
                clip.left,
                clip.top,
                boxW,
                boxH,
                first ? 0 : 1, 0x00000000,
              )
              vexartRemoveImage(vctx, handle)
              first = false
              targetMutationVersion += 1
              markDirty(clip.left, clip.top, clip.right, clip.bottom)
              continue
            }
            const from = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.from, effectOpacity) : effectOp.effect.gradient.from
            const to = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.to, effectOpacity) : effectOp.effect.gradient.to
            geometryStream.appendRadialGradient(
              (clip.left / ctx.target.width) * 2 - 1,
              1 - (clip.top / ctx.target.height) * 2,
              (boxW / ctx.target.width) * 2,
              -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radius,
              from,
              to,
            )
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }

          continue
        }
        if (op.kind === "border") {
          flushRasterImages()
          if (op.borderWidths) {
            const sides = op.borderWidths
            const ownLeft = Math.round(op.x) - ctx.offsetX
            const ownTop = Math.round(op.y) - ctx.offsetY
            const ownWidth = Math.max(1, Math.round(op.width))
            const ownHeight = Math.max(1, Math.round(op.height))
            const pushStrip = (x: number, y: number, width: number, height: number) => {
              const left = Math.max(clip.left, x)
              const top = Math.max(clip.top, y)
              const right = Math.min(clip.right, x + width)
              const bottom = Math.min(clip.bottom, y + height)
              if (right <= left || bottom <= top) return
              const stripW = right - left
              const stripH = bottom - top
              geometryStream.appendShapeRect(
                (left / ctx.target.width) * 2 - 1,
                1 - (top / ctx.target.height) * 2,
                (stripW / ctx.target.width) * 2,
                -((stripH / ctx.target.height) * 2),
                stripW,
                stripH,
                0,
                op.color >>> 0,
                0,
                0,
              )
            }
            const top = Math.max(0, Math.round(sides.top))
            const bottom = Math.max(0, Math.round(sides.bottom))
            const left = Math.max(0, Math.round(sides.left))
            const right = Math.max(0, Math.round(sides.right))
            pushStrip(ownLeft, ownTop, ownWidth, top)
            pushStrip(ownLeft, ownTop + ownHeight - bottom, ownWidth, bottom)
            pushStrip(ownLeft, ownTop + top, left, ownHeight - top - bottom)
            pushStrip(ownLeft + ownWidth - right, ownTop + top, right, ownHeight - top - bottom)
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          if (op.cornerRadii) {
            geometryStream.appendShapeRectCorners(
              (clip.left / ctx.target.width) * 2 - 1,
              1 - (clip.top / ctx.target.height) * 2,
              (boxW / ctx.target.width) * 2,
              -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              op.cornerRadii,
              0,
              op.color >>> 0,
              op.borderWidth,
            )
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }
          geometryStream.appendShapeRect(
            (clip.left / ctx.target.width) * 2 - 1,
            1 - (clip.top / ctx.target.height) * 2,
            (boxW / ctx.target.width) * 2,
            -((boxH / ctx.target.height) * 2),
            boxW,
            boxH,
            clampShapeRadius(op.radius, boxW, boxH),
            0,
            op.color >>> 0,
            op.borderWidth,
          )
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "image") {
          const imageHandle = (op.image.nativeImageHandle && op.image.nativeImageHandle > 0n)
            ? op.image.nativeImageHandle
            : (op.textureId && typeof op.textureId === "bigint" && op.textureId > 0n)
              ? op.textureId
              : (op.image.imageBuffer ? targetManager.getImage(op.image.imageBuffer.data, op.image.imageBuffer.width, op.image.imageBuffer.height) : 0n)
          if (!imageHandle) {
            const boxW = clip.right - clip.left
            const boxH = clip.bottom - clip.top
            geometryStream.appendShapeRect(
              (clip.left / ctx.target.width) * 2 - 1,
              1 - (clip.top / ctx.target.height) * 2,
              (boxW / ctx.target.width) * 2,
              -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              clampShapeRadius(op.cornerRadius, boxW, boxH),
              0,
              op.color >>> 0,
              0,
            )
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }
          flushAll()
          const fit = op.image.objectFit
          const imageOpacity = op.rect.effect?.opacity ?? 1
          const radius = clampShapeRadius(op.image.cornerRadius, Math.max(1, Math.round(op.width)), Math.max(1, Math.round(op.height)))
          if (fit === "none") {
            const styled = renderStyledImage(op, imageHandle, undefined, imageOpacity)
            if (!styled) return { ok: false, rawLayer: null }
            transientFullFrameImages.push(styled.handle)
            ensureLoadedLayer()
            vexartCompositeRenderImageLayer(
              vctx,
              targetHandle,
              styled.handle,
              clip.x,
              clip.y,
              clip.w,
              clip.h,
              0,
              0x00000000,
            )
            first = false
            targetMutationVersion += 1
          } else if (fit === "cover" || fit === "contain" || radius > 0) {
            const geometry = getImageFitGeometry(
              fit,
              op.image.imageBuffer?.width ?? Math.max(1, Math.round(op.width)),
              op.image.imageBuffer?.height ?? Math.max(1, Math.round(op.height)),
              Math.max(1, Math.round(op.width)),
              Math.max(1, Math.round(op.height)),
            )
            const group = transformedImageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] as TransformedImageInstance[] }
            group.instances.push({
              p0: { x: (clip.x / ctx.target.width) * 2 - 1, y: 1 - (clip.y / ctx.target.height) * 2 },
              p1: { x: ((clip.x + clip.w) / ctx.target.width) * 2 - 1, y: 1 - (clip.y / ctx.target.height) * 2 },
              p2: { x: (clip.x / ctx.target.width) * 2 - 1, y: 1 - ((clip.y + clip.h) / ctx.target.height) * 2 },
              p3: { x: ((clip.x + clip.w) / ctx.target.width) * 2 - 1, y: 1 - ((clip.y + clip.h) / ctx.target.height) * 2 },
              opacity: imageOpacity,
              fitX: geometry.fitX,
              fitY: geometry.fitY,
              radius,
            })
            transformedImageGroups.set(imageHandle, group)
          } else if (imageOpacity < 1) {
            const group = transformedImageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] as TransformedImageInstance[] }
            group.instances.push({
              p0: { x: (clip.x / ctx.target.width) * 2 - 1, y: 1 - (clip.y / ctx.target.height) * 2 },
              p1: { x: ((clip.x + clip.w) / ctx.target.width) * 2 - 1, y: 1 - (clip.y / ctx.target.height) * 2 },
              p2: { x: (clip.x / ctx.target.width) * 2 - 1, y: 1 - ((clip.y + clip.h) / ctx.target.height) * 2 },
              p3: { x: ((clip.x + clip.w) / ctx.target.width) * 2 - 1, y: 1 - ((clip.y + clip.h) / ctx.target.height) * 2 },
              opacity: imageOpacity,
            })
            transformedImageGroups.set(imageHandle, group)
          } else {
            const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
            group.instances.push({
              x: (clip.x / ctx.target.width) * 2 - 1,
              y: 1 - (clip.y / ctx.target.height) * 2,
              w: (clip.w / ctx.target.width) * 2,
              h: -((clip.h / ctx.target.height) * 2),
              opacity: 1,
            })
            imageGroups.set(imageHandle, group)
          }
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "canvas") {
          flushAll()
          const imageHandle = targetManager.getCanvasSprite(op)
          if (!imageHandle) return { ok: false, rawLayer: null }
          const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
          group.instances.push({
            x: (clip.x / ctx.target.width) * 2 - 1,
            y: 1 - (clip.y / ctx.target.height) * 2,
            w: (clip.w / ctx.target.width) * 2,
            h: -((clip.h / ctx.target.height) * 2),
            opacity: 1,
          })
          imageGroups.set(imageHandle, group)
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "text") {
          const sym = textEncoder.getSymbols()
          if (!sym) continue
          const textX = Math.round(op.x) - ctx.offsetX
          const textY = Math.round(op.y) - ctx.offsetY
          const colorRgba = op.color >>> 0
          const preWrap = op.whiteSpace === "pre-wrap"
          const noWrap = op.whiteSpace === "nowrap"
          const text = preWrap
            ? layoutText(op.text, op.fontId, op.maxWidth, op.lineHeight, op.fontSize, {
                whiteSpace: "pre-wrap",
                wordBreak: op.wordBreak,
                fontFamily: op.fontFamily,
                fontWeight: op.fontWeight,
                fontStyle: op.fontStyle,
              }).lines.map((line) => line.text).join("\x0a")
            : op.text
          textEncoder.queueTextOp({
            text,
            x: textX,
            y: textY,
            fontSize: op.fontSize,
            lineHeight: op.lineHeight,
            maxWidth: preWrap || noWrap ? 0 : (op.maxWidth > 0 ? op.maxWidth : 999999),
            colorRgba,
            fontFamily: op.fontFamily,
            fontWeight: op.fontWeight,
            fontStyle: op.fontStyle,
          })
          const bounds = opBoundsInTarget(op, ctx)
          if (bounds) markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
          continue
        }
        failGpuOnly(`unsupported render op kind=${op.kind}`)
      }
      flushAll()
    } finally {
      activeScissor = null
      if (layerOpen) vexartCompositeTargetEndLayer(vctx, targetHandle)
      for (const handle of transientFullFrameImages) {
        targetManager.instanceImageHandles.delete(handle)
        vexartRemoveImage(vctx, handle)
      }
      transientFullFrameImages = parentTransientFullFrameImages
      releaseGeometryStream(geometryStream)
    }

    return { ok: true as const, rawLayer: null }
  }

  return {
    renderFrame,
    renderOpToImage,
  }
}
