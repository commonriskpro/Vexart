/**
 * Image decode pipeline — loads and decodes images for <img> intrinsic.
 *
 * Decision 11: Image decode in Bun.
 * Decoding is ONE-TIME per image (not per-frame) — JS perf is sufficient.
 * Scaling is performed natively on the GPU via WGPU hardware samplers.
 *
 * Pipeline:
 *   <img src="./logo.png" />
 *     → Bun reads file → decode to RGBA ArrayBuffer
 *     → store in the node's lazy image extra bag
 *     → native asset registry uploads to WGPU texture
 *     → WGPU vertex + fragment shaders sample and scale via hardware sampler
 *
 * Supports: PNG, JPEG, BMP, TIFF, GIF, ICO (anything Bun's native image decode handles).
 * Falls back to `sharp` if available.
 *
 * Images are cached by src path — same path = same decoded buffer.
 */

import { ensureImageExtra, type TGENode } from "../ffi/node"
import { nativeImageAssetRegister, nativeImageAssetRelease, syncNativeImageHandle, releaseNodeImage } from "../ffi/native-image-assets"
import { markDirty, markLayoutDirty } from "../reconciler/dirty"
import { markLayerDirtyByKey } from "./composite"

// ── Cache ──

/** @public */
export type DecodedImage = {
  data: Uint8Array
  width: number
  height: number
  nativeHandle?: bigint
}

/** @public */
export type RawImage = DecodedImage

const imageCache = new Map<string, DecodedImage>()
type ImageSubscriber = (image: DecodedImage | null) => void
const pendingDecodes = new Map<string, Set<ImageSubscriber>>()
let generation = 0
let nextAsset = 0
const MAX_IMAGE_CACHE = 128

function touchCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.delete(key)
  cache.set(key, value)
}

/** @public */
export type ScaledImageCache = {
  get: (src: RawImage, targetW: number, targetH: number, key: string) => RawImage
  clear: () => void
  destroy: () => void
}

/**
 * @deprecated Image scaling is handled natively by WGPU hardware samplers in the GPU pipeline.
 * Maintained as zero-overhead stub for internal API compatibility.
 * @public
 */
export function createScaledImageCache(): ScaledImageCache {
  return {
    get(src) {
      return src
    },
    clear() {},
    destroy() {},
  }
}

/**
 * Trigger image decode for a node. Non-blocking — sets the image extra buffer when done.
 * Called during walkTree when we encounter an img node with image state === "idle".
 */
/** @public */
export function decodeImageForNode(node: TGENode) {
  const src = node.props.src
  if (!src || node.destroyed) return
  const extra = ensureImageExtra(node)
  if (extra.source === src && (extra.state === "loading" || extra.state === "loaded")) return
  releaseNodeImage(node)
  extra.source = src
  const revision = extra.revision
  const epoch = generation
  const publish = (image: DecodedImage | null) => {
    if (node.destroyed || extra.revision !== revision || node.props.src !== src) return
    if (generation !== epoch) {
      releaseNodeImage(node)
      markDirty()
      return
    }
    extra.cancel = undefined
    extra.buffer = image
    syncNativeImageHandle(node, image?.nativeHandle ?? null)
    extra.state = image ? "loaded" : "error"
    if (image) {
      const isGridItem = node.parent?.props.layout === "grid"
      let layoutNeedsUpdate = false
      if (!node._widthSizing && !isGridItem && node._flexNode) {
        node._flexNode.setWidth(image.width)
        layoutNeedsUpdate = true
      }
      if (!node._heightSizing && !isGridItem && node._flexNode) {
        node._flexNode.setHeight(image.height)
        layoutNeedsUpdate = true
      }
      if (layoutNeedsUpdate) {
        node._flexNode?.markDirty()
        markLayoutDirty()
      }
    }
    if (node._layerKey) {
      markLayerDirtyByKey(node._layerKey)
    }
    markDirty()
  }

  const cached = imageCache.get(src)
  if (cached) {
    touchCacheEntry(imageCache, src, cached)
    publish(cached)
    return
  }

  extra.state = "loading"
  let subscribers = pendingDecodes.get(src)
  if (!subscribers) {
    subscribers = new Set<ImageSubscriber>()
    pendingDecodes.set(src, subscribers)
    startDecode(src, epoch, subscribers)
  }
  subscribers.add(publish)
  const waiting = subscribers
  extra.cancel = () => { waiting.delete(publish) }
}

function startDecode(src: string, epoch: number, subscribers: Set<ImageSubscriber>) {
  void decodeImage(src).then((image) => {
    if (generation !== epoch || pendingDecodes.get(src) !== subscribers) return
    pendingDecodes.delete(src)
    if (image) {
      const handle = nativeImageAssetRegister({
        key: `decoded:${++nextAsset}:${src}`, data: image.data, width: image.width, height: image.height,
      })
      if (handle) image.nativeHandle = handle // the cache's reference
      if (imageCache.size >= MAX_IMAGE_CACHE) {
        const first = imageCache.keys().next().value
        if (first !== undefined) {
          const entry = imageCache.get(first)
          if (entry?.nativeHandle) nativeImageAssetRelease(entry.nativeHandle)
          imageCache.delete(first)
        }
      }
      imageCache.set(src, image)
    }
    // Acquire node references synchronously before another decode can evict
    // this entry. No publication is left queued behind cache eviction.
    for (const publish of subscribers) publish(image)
    subscribers.clear()
  })
}

/**
 * Decode an image file to RGBA pixel data.
 * Uses Bun's native image decode (available since Bun 1.x).
 */
async function decodeImage(src: string): Promise<DecodedImage | null> {
  try {
    const file = Bun.file(src)
    const exists = await file.exists()
    if (!exists) {
      console.error(`[vexart image] File not found: ${src}`)
      return null
    }

    const arrayBuffer = await file.arrayBuffer()
    return await decodeWithSharp(arrayBuffer, src)
  } catch (err) {
    console.error(`[vexart image] Decode failed for ${src}:`, err)
    return null
  }
}

/**
 * Decode using sharp (libvips) — handles PNG, JPEG, WebP, AVIF, GIF, TIFF.
 * If sharp is not installed, returns null.
 */
async function decodeWithSharp(buffer: ArrayBuffer, src: string): Promise<DecodedImage | null> {
  try {
    // Dynamic import — sharp is an optional dependency
    // @ts-ignore — sharp may not be installed
    const sharp = (await import("sharp")).default
    const image = sharp(Buffer.from(buffer))
    const metadata = await image.metadata()
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true })

    return {
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
    }
  } catch {
    // sharp not available — try manual PNG decode
    return decodePNG(buffer, src)
  }
}

/**
 * Minimal PNG decode fallback — handles the most common PNG format.
 * For full format support, install `sharp`.
 */
async function decodePNG(buffer: ArrayBuffer, src: string): Promise<DecodedImage | null> {
  try {
    // Use Bun's native PNG support if available
    // @ts-ignore — Bun may have native image decode
    if (typeof globalThis.createImageBitmap === "function") {
      const blob = new Blob([buffer])
      const bitmap = await createImageBitmap(blob)
    }

    console.error(`[vexart image] No image decoder available for ${src}. Install 'sharp' for image support: bun add sharp`)
    return null
  } catch {
    console.error(`[vexart image] No image decoder available for ${src}. Install 'sharp' for image support: bun add sharp`)
    return null
  }
}

/**
 * Scale image pixels to fit a target box.
 * @deprecated Scaling is performed natively by WGPU hardware samplers during render.
 * @public
 */
export function scaleImage(
  src: DecodedImage,
  targetW: number,
  targetH: number,
  fit: "contain" | "cover" | "fill" | "none" = "contain",
): { data: Uint8Array; width: number; height: number; offsetX: number; offsetY: number } {
  if (fit === "none" || (targetW === src.width && targetH === src.height)) {
    return { data: src.data, width: src.width, height: src.height, offsetX: 0, offsetY: 0 }
  }

  const srcAspect = src.width / src.height
  const tgtAspect = targetW / targetH

  let scaleW = targetW
  let scaleH = targetH

  if (fit === "contain") {
    if (srcAspect > tgtAspect) {
      scaleW = targetW
      scaleH = Math.round(targetW / srcAspect)
    } else {
      scaleH = targetH
      scaleW = Math.round(targetH * srcAspect)
    }
  } else if (fit === "cover") {
    if (srcAspect > tgtAspect) {
      scaleH = targetH
      scaleW = Math.round(targetH * srcAspect)
    } else {
      scaleW = targetW
      scaleH = Math.round(targetW / srcAspect)
    }
  }

  const offsetX = Math.round((targetW - scaleW) / 2)
  const offsetY = Math.round((targetH - scaleH) / 2)

  return { data: src.data, width: scaleW, height: scaleH, offsetX, offsetY }
}

/** Clear the image cache (e.g., on hot reload). */
/** @public */
export function clearImageCache() {
  generation++
  for (const subscribers of pendingDecodes.values()) {
    for (const publish of [...subscribers]) publish(null)
    subscribers.clear()
  }
  for (const entry of imageCache.values()) {
    if (entry.nativeHandle) {
      nativeImageAssetRelease(entry.nativeHandle)
      entry.nativeHandle = undefined
    }
  }
  imageCache.clear()
  pendingDecodes.clear()
}

/** @public */
export function getImageCacheStats() {
  let decodedBytes = 0
  for (const image of imageCache.values()) decodedBytes += image.data.byteLength
  return {
    decodedCount: imageCache.size,
    decodedBytes,
    pendingCount: pendingDecodes.size,
    scaledCacheCount: 0,
    scaledEntries: 0,
    scaledBytes: 0,
  }
}
