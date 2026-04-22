import { ptr } from "bun:ffi"

import { openVexartLibrary, EXPECTED_BRIDGE_VERSION } from "./vexart-bridge"

export type WgpuCanvasContext = {
  handle: bigint
  width: number
  height: number
}

export type WgpuCanvasTarget = {
  handle: bigint
  width: number
  height: number
}

export type WgpuCanvasImage = {
  handle: bigint
  width: number
  height: number
}

export type WgpuCanvasRectFill = {
  x: number
  y: number
  w: number
  h: number
  r: number
  g: number
  b: number
  a: number
  cornerRadius?: number
  borderR?: number
  borderG?: number
  borderB?: number
  borderA?: number
  borderWidth?: number
}

export type WgpuCanvasImagePlacement = {
  x: number
  y: number
  w: number
  h: number
  opacity?: number
}

const GRAPH_MAGIC = 0x56584152
const GRAPH_VERSION = 0x00020000

function vu16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function vu32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

function vf32(view: DataView, offset: number, value: number) {
  view.setFloat32(offset, value, true)
}

function throwLastError(prefix: string): never {
  const { symbols } = openVexartLibrary()
  const len = symbols.vexart_get_last_error_length() as number
  const raw = len > 0 ? new Uint8Array(len) : null
  if (raw) symbols.vexart_copy_last_error(raw, len)
  const msg = raw ? new TextDecoder().decode(raw) : "unknown error"
  throw new Error(`${prefix}: ${msg}`)
}

function packRectInstance(rect: WgpuCanvasRectFill): Uint8Array {
  const buf = new ArrayBuffer(32)
  const view = new DataView(buf)
  vf32(view, 0, rect.x)
  vf32(view, 4, rect.y)
  vf32(view, 8, rect.w)
  vf32(view, 12, rect.h)
  vf32(view, 16, rect.r)
  vf32(view, 20, rect.g)
  vf32(view, 24, rect.b)
  vf32(view, 28, rect.a)
  return new Uint8Array(buf)
}

function packImageInstance(placement: WgpuCanvasImagePlacement): Uint8Array {
  const buf = new ArrayBuffer(32)
  const view = new DataView(buf)
  vf32(view, 0, placement.x)
  vf32(view, 4, placement.y)
  vf32(view, 8, placement.w)
  vf32(view, 12, placement.h)
  vf32(view, 16, placement.opacity ?? 1)
  vf32(view, 20, 0)
  vf32(view, 24, 0)
  vf32(view, 28, 0)
  return new Uint8Array(buf)
}

function ndcRectToTargetPixels(
  target: WgpuCanvasTarget,
  placement: WgpuCanvasImagePlacement,
) {
  const x = ((placement.x + 1) * 0.5) * target.width
  const y = ((1 - placement.y) * 0.5) * target.height
  const w = Math.abs(placement.w) * 0.5 * target.width
  const h = Math.abs(placement.h) * 0.5 * target.height
  const top = placement.h < 0 ? y : y - h
  return { x, y: top, w, h }
}

function dispatchBatch(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, cmdKind: number, instances: Uint8Array) {
  if (instances.byteLength === 0) return { bytes: 0 }
  const { symbols } = openVexartLibrary()
  const headerBytes = 16
  const prefixBytes = 8
  const total = headerBytes + prefixBytes + instances.byteLength
  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)
  vu32(view, 0, GRAPH_MAGIC)
  vu32(view, 4, GRAPH_VERSION)
  vu32(view, 8, 1)
  vu32(view, 12, prefixBytes + instances.byteLength)
  vu16(view, 16, cmdKind)
  vu16(view, 18, 0)
  vu32(view, 20, instances.byteLength)
  new Uint8Array(buf).set(instances, headerBytes + prefixBytes)
  const stats = new Uint8Array(32)
  const result = symbols.vexart_paint_dispatch(ctx.handle, target.handle, ptr(new Uint8Array(buf)), total, ptr(stats)) as number
  if (result !== 0) throwLastError(`vexart_paint_dispatch(kind=${cmdKind}) failed`)
  return { bytes: total }
}

export function probeWgpuCanvasBridge() {
  try {
    const { symbols } = openVexartLibrary()
    const version = symbols.vexart_version() as number
    return {
      available: true,
      bridgeVersion: version,
      abiVersion: EXPECTED_BRIDGE_VERSION,
      reason: "libvexart bridge available",
    }
  } catch (error) {
    return {
      available: false,
      bridgeVersion: 0,
      abiVersion: EXPECTED_BRIDGE_VERSION,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export function createWgpuCanvasContext(opts: { width?: number; height?: number } = {}): WgpuCanvasContext {
  const { symbols } = openVexartLibrary()
  const out = new BigUint64Array(1)
  const result = symbols.vexart_context_create(ptr(new Uint8Array(1)), 0, ptr(out)) as number
  if (result !== 0) throwLastError("vexart_context_create failed")
  const ctx: WgpuCanvasContext = {
    handle: out[0],
    width: opts.width ?? 64,
    height: opts.height ?? 64,
  }
  symbols.vexart_context_resize(ctx.handle, ctx.width, ctx.height)
  return ctx
}

export function destroyWgpuCanvasContext(ctx: WgpuCanvasContext) {
  const { symbols } = openVexartLibrary()
  symbols.vexart_context_destroy(ctx.handle)
}

export function createWgpuCanvasTarget(ctx: WgpuCanvasContext, size: { width: number; height: number }): WgpuCanvasTarget {
  const { symbols } = openVexartLibrary()
  const out = new BigUint64Array(1)
  const result = symbols.vexart_composite_target_create(ctx.handle, size.width, size.height, ptr(out)) as number
  if (result !== 0) throwLastError("vexart_composite_target_create failed")
  return { handle: out[0], width: size.width, height: size.height }
}

export function destroyWgpuCanvasTarget(ctx: WgpuCanvasContext, target: WgpuCanvasTarget) {
  const { symbols } = openVexartLibrary()
  symbols.vexart_composite_target_destroy(ctx.handle, target.handle)
}

export function beginWgpuCanvasTargetLayer(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, loadMode: 0 | 1, clearRgba: number) {
  const { symbols } = openVexartLibrary()
  const result = symbols.vexart_composite_target_begin_layer(ctx.handle, target.handle, loadMode, clearRgba >>> 0) as number
  if (result !== 0) throwLastError("vexart_composite_target_begin_layer failed")
}

export function endWgpuCanvasTargetLayer(ctx: WgpuCanvasContext, target: WgpuCanvasTarget) {
  const { symbols } = openVexartLibrary()
  const result = symbols.vexart_composite_target_end_layer(ctx.handle, target.handle) as number
  if (result !== 0) throwLastError("vexart_composite_target_end_layer failed")
}

export function renderWgpuCanvasTargetClear(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, clearRgba: number) {
  const rect = packRectInstance({ x: -1, y: 1, w: 2, h: -2, r: ((clearRgba >>> 24) & 0xff) / 255, g: ((clearRgba >>> 16) & 0xff) / 255, b: ((clearRgba >>> 8) & 0xff) / 255, a: (clearRgba & 0xff) / 255 })
  return dispatchBatch(ctx, target, 0, rect)
}

export function renderWgpuCanvasTargetRects(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, rects: Array<{ x: number; y: number; w: number; h: number; color: number }>) {
  const bytes = new Uint8Array(rects.length * 32)
  rects.forEach((rect, index) => {
    bytes.set(packRectInstance({
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      r: ((rect.color >>> 24) & 0xff) / 255,
      g: ((rect.color >>> 16) & 0xff) / 255,
      b: ((rect.color >>> 8) & 0xff) / 255,
      a: (rect.color & 0xff) / 255,
    }), index * 32)
  })
  return dispatchBatch(ctx, target, 0, bytes)
}

export function renderWgpuCanvasTargetRectsLayer(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, rects: WgpuCanvasRectFill[], _loadMode: number, _clearRgba: number) {
  const bytes = new Uint8Array(rects.length * 32)
  rects.forEach((rect, index) => {
    bytes.set(packRectInstance(rect), index * 32)
  })
  return dispatchBatch(ctx, target, 0, bytes)
}

export function createWgpuCanvasImage(ctx: WgpuCanvasContext, size: { width: number; height: number }, pixels: Uint8Array): WgpuCanvasImage {
  const { symbols } = openVexartLibrary()
  const out = new BigUint64Array(1)
  const result = symbols.vexart_paint_upload_image(ctx.handle, ptr(pixels), pixels.byteLength, size.width, size.height, 0, ptr(out)) as number
  if (result !== 0) throwLastError("vexart_paint_upload_image failed")
  return { handle: out[0], width: size.width, height: size.height }
}

export function destroyWgpuCanvasImage(ctx: WgpuCanvasContext, image: WgpuCanvasImage) {
  const { symbols } = openVexartLibrary()
  symbols.vexart_paint_remove_image(ctx.handle, image.handle)
}

export function renderWgpuCanvasTargetImage(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, image: WgpuCanvasImage, placement: WgpuCanvasImagePlacement, _clearRgba: number) {
  const { symbols } = openVexartLibrary()
  const rect = ndcRectToTargetPixels(target, placement)
  const result = symbols.vexart_composite_render_image_layer(
    ctx.handle,
    target.handle,
    image.handle,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    0,
    0x00000000,
  ) as number
  if (result !== 0) throwLastError("vexart_composite_render_image_layer failed")
  return { bytes: 0 }
}

export function readbackWgpuCanvasTargetRGBA(ctx: WgpuCanvasContext, target: WgpuCanvasTarget, byteLength: number) {
  const { symbols } = openVexartLibrary()
  const data = new Uint8Array(byteLength)
  const stats = new Uint8Array(32)
  const result = symbols.vexart_composite_readback_rgba(ctx.handle, target.handle, ptr(data), byteLength, ptr(stats)) as number
  if (result !== 0) throwLastError("vexart_composite_readback_rgba failed")
  return { data, stats }
}
