/**
 * Layer system — browser-style compositing for TGE.
 *
 * Instead of one giant pixel buffer for the entire screen, each visual
 * element group gets its own pixel buffer (layer). Only dirty layers
 * are repainted and retransmitted to the terminal.
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
 *   2. Clay computes layout for ALL elements (single pass)
 *   3. RenderCommands are grouped by layer ID
 *   4. Only dirty layers: create pixel buffer → paint commands → transmit
 *   5. Clean layers: skip entirely (terminal still has the old image)
 */

import type { PixelBuffer } from "@tge/pixel"
import { create, clear } from "@tge/pixel"
import type { DamageRect } from "./damage"
import { unionRect } from "./damage"

// ── Layer type ──

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
  /** Pixel buffer for this layer. Null until first paint. */
  buf: PixelBuffer | null
  /** Whether this layer needs repainting. */
  dirty: boolean
  /** Previous position/size — to detect if placement needs updating. */
  prevX: number
  prevY: number
  prevW: number
  prevH: number
  /** Accumulated global damage rect for this layer. */
  damageRect: DamageRect | null
}

// ── Layer registry ──

/** Image IDs 1-2 are reserved for double-buffering in the old single-image path. */
const BASE_IMAGE_ID = 10

/** All active layers, keyed by layer ID. */
const layers = new Map<number, Layer>()

/** Next layer ID counter. */
let nextLayerId = 0

/** Create a new layer. Returns the layer. */
export function createLayer(z: number): Layer {
  const id = nextLayerId++
  const layer: Layer = {
    id,
    z,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    buf: null,
    dirty: true,
    prevX: -1,
    prevY: -1,
    prevW: -1,
    prevH: -1,
    damageRect: null,
  }
  layers.set(id, layer)
  return layer
}

/** Get a layer by ID. */
export function getLayer(id: number): Layer | undefined {
  return layers.get(id)
}

/** Get all layers sorted by z-order. */
export function allLayers(): Layer[] {
  return Array.from(layers.values()).sort((a, b) => a.z - b.z)
}

/** Mark a layer as dirty (needs repaint + retransmit). */
export function markLayerDirty(id: number) {
  const layer = layers.get(id)
  if (layer) layer.dirty = true
}

/** Mark ALL layers dirty (e.g., on resize). */
export function markAllDirty() {
  for (const layer of layers.values()) {
    layer.dirty = true
  }
}

/** Check if ANY layer is dirty. */
export function anyLayerDirty(): boolean {
  for (const layer of layers.values()) {
    if (layer.dirty) return true
  }
  return false
}

/**
 * Update a layer's geometry. If position or size changed, marks it dirty.
 * Also ensures the pixel buffer exists and is the right size.
 */
export function updateLayerGeometry(layer: Layer, x: number, y: number, w: number, h: number) {
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

  if (resized || !layer.buf) {
    layer.buf = create(w, h)
    layer.dirty = true
    layer.damageRect = nextRect
  }

  if (moved) {
    layer.dirty = true
    layer.damageRect = prevRect ? unionRect(prevRect, nextRect) : nextRect
  }

  if (!moved && !resized && !layer.damageRect) {
    layer.damageRect = null
  }
}

/** Clear a layer's pixel buffer. */
export function clearLayer(layer: Layer, color = 0x00000000) {
  if (layer.buf) clear(layer.buf, color)
}

/** Mark a layer as clean (after successful transmit). */
export function markLayerClean(layer: Layer) {
  layer.dirty = false
  layer.prevX = layer.x
  layer.prevY = layer.y
  layer.prevW = layer.width
  layer.prevH = layer.height
  layer.damageRect = null
}

export function markLayerDamaged(layer: Layer, rect: DamageRect) {
  layer.damageRect = layer.damageRect ? unionRect(layer.damageRect, rect) : rect
  layer.dirty = true
}

export function getLayerRect(layer: Layer): DamageRect {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  }
}

export function getPreviousLayerRect(layer: Layer): DamageRect | null {
  if (layer.prevW <= 0 || layer.prevH <= 0) return null
  return {
    x: layer.prevX,
    y: layer.prevY,
    width: layer.prevW,
    height: layer.prevH,
  }
}

/** Get the Kitty image ID for a layer. */
export function imageIdForLayer(layer: Layer): number {
  return BASE_IMAGE_ID + layer.id
}

/** Reset the entire layer system. */
export function resetLayers() {
  layers.clear()
  nextLayerId = 0
}

/** Get count of dirty layers (for debug/stats). */
export function dirtyCount(): number {
  let count = 0
  for (const layer of layers.values()) {
    if (layer.dirty) count++
  }
  return count
}

/** Get total layer count. */
export function layerCount(): number {
  return layers.size
}
