/**
 * Layer system — browser-style compositing for TGE.
 *
 * Instead of one giant raw buffer for the entire screen, each visual
 * element group gets its own retained layer identity. The official path now
 * treats a layer as GPU-facing backing metadata first, and only uses raw bytes
 * at explicit presentation boundaries.
 *
 * Like browsers:
 *   - Each layer is its own "texture" (Kitty image with unique ID)
 *   - The terminal composites layers with z-ordering (GPU-accelerated)
 *   - When a signal changes, only the affected layer repaints
 *   - Unchanged layers stay in terminal VRAM — zero retransmission
 *
 * Layer assignment:
 *   - Layer 0: fullscreen background
 *   - Each direct child of root: its own layer (z=1, z=2, ...)
 *   - Future: `layer` prop for explicit layer control
 *
 * Layer lifecycle:
 *   1. frame() walks TGENode tree, assigns layer IDs to each subtree
 *   2. Layout adapter (Flexily) computes layout for ALL elements (single pass)
 *   3. RenderCommands are grouped by layer ID
 *   4. Only dirty layers: render into GPU layer target → read back only for terminal presentation
 *   5. Clean layers: skip entirely (terminal still has the old image)
 */

import type { DamageRect } from "./damage"
import { unionRect } from "./damage"

// ── Layer type ──

/** @public */
export type Layer = {
  /** Unique layer ID. Also used as Kitty image ID. */
  id: number
  /** Z-order for terminal compositing. Higher = on top. */
  z: number
  /** Position in pixels relative to screen origin. */
  x: number
  y: number
  /** Size in pixels. */
  width: number
  height: number
  /** Whether this layer needs repainting. */
  dirty: boolean
  /** Previous position/size — to detect if placement needs updating. */
  prevX: number
  prevY: number
  prevW: number
  prevH: number
  prevZ: number
  /** Accumulated global damage rect for this layer. */
  damageRect: DamageRect | null
}

// ── Layer registry ──

/** Image IDs 1-2 are reserved for legacy single-image paths. */
const BASE_IMAGE_ID = 10

/** @public */
export type LayerStore = {
  createLayer: (z: number) => Layer
  getLayer: (id: number) => Layer | undefined
  removeLayer: (layer: Layer) => void
  allLayers: () => Layer[]
  markLayerDirty: (id: number) => void
  markAllDirty: () => void
  anyLayerDirty: () => boolean
  updateLayerGeometry: (layer: Layer, x: number, y: number, w: number, h: number, opts?: { moveOnly?: boolean }) => void
  markLayerClean: (layer: Layer) => void
  markLayerDamaged: (layer: Layer, rect: DamageRect) => void
  getLayerRect: (layer: Layer) => DamageRect
  getPreviousLayerRect: (layer: Layer) => DamageRect | null
  imageIdForLayer: (layer: Layer) => number
  resetLayers: () => void
  dirtyCount: () => number
  layerCount: () => number
}

/** @public */
export function createLayerStore(): LayerStore {
  const layers = new Map<number, Layer>()
  let nextLayerId = 0

  const createLayer = (z: number): Layer => {
    const id = nextLayerId++
    const layer: Layer = {
      id,
      z,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      dirty: true,
      prevX: -1,
      prevY: -1,
      prevW: -1,
      prevH: -1,
      prevZ: z,
      damageRect: null,
    }
    layers.set(id, layer)
    return layer
  }

  const getLayer = (id: number) => layers.get(id)

  const removeLayer = (layer: Layer) => {
    layers.delete(layer.id)
  }

  const allLayers = () => Array.from(layers.values()).sort((a, b) => a.z - b.z)

  const markLayerDirty = (id: number) => {
    const layer = layers.get(id)
    if (layer) layer.dirty = true
  }

  const markAllDirty = () => {
    for (const layer of layers.values()) {
      layer.dirty = true
    }
  }

  const anyLayerDirty = () => {
    for (const layer of layers.values()) {
      if (layer.dirty) return true
    }
    return false
  }

  const updateLayerGeometry = (layer: Layer, x: number, y: number, w: number, h: number, opts?: { moveOnly?: boolean }) => {
    if (w <= 0 || h <= 0) return

    const hadPrev = layer.prevW > 0 && layer.prevH > 0
    const prevRect = hadPrev
      ? { x: layer.prevX, y: layer.prevY, width: layer.prevW, height: layer.prevH }
      : null
    const moved = x !== layer.prevX || y !== layer.prevY
    const resized = w !== layer.prevW || h !== layer.prevH
    const nextRect = { x, y, width: w, height: h }

    layer.x = x
    layer.y = y
    layer.width = w
    layer.height = h
    if (resized) {
      layer.dirty = true
      layer.damageRect = nextRect
    }

    if (moved) {
      if (opts?.moveOnly && !resized) {
        layer.damageRect = null
      } else {
        layer.dirty = true
        layer.damageRect = prevRect ? unionRect(prevRect, nextRect) : nextRect
      }
    }

    if (!moved && !resized && !layer.damageRect) {
      layer.damageRect = null
    }
  }

  const markLayerClean = (layer: Layer) => {
    layer.dirty = false
    layer.prevX = layer.x
    layer.prevY = layer.y
    layer.prevW = layer.width
    layer.prevH = layer.height
    layer.prevZ = layer.z
    layer.damageRect = null
  }

  const markLayerDamaged = (layer: Layer, rect: DamageRect) => {
    layer.damageRect = layer.damageRect ? unionRect(layer.damageRect, rect) : rect
    layer.dirty = true
  }

  const getLayerRect = (layer: Layer): DamageRect => ({
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  })

  const getPreviousLayerRect = (layer: Layer): DamageRect | null => {
    if (layer.prevW <= 0 || layer.prevH <= 0) return null
    return {
      x: layer.prevX,
      y: layer.prevY,
      width: layer.prevW,
      height: layer.prevH,
    }
  }

  const imageIdForLayer = (layer: Layer) => BASE_IMAGE_ID + layer.id

  const resetLayers = () => {
    layers.clear()
    nextLayerId = 0
  }

  const dirtyCount = () => {
    let count = 0
    for (const layer of layers.values()) {
      if (layer.dirty) count++
    }
    return count
  }

  const layerCount = () => layers.size

  return {
    createLayer,
    getLayer,
    removeLayer,
    allLayers,
    markLayerDirty,
    markAllDirty,
    anyLayerDirty,
    updateLayerGeometry,
    markLayerClean,
    markLayerDamaged,
    getLayerRect,
    getPreviousLayerRect,
    imageIdForLayer,
    resetLayers,
    dirtyCount,
    layerCount,
  }
}
