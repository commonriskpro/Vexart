/**
 * gpu-composite-ops.ts — Low-level FFI wrappers for vexart composite operations.
 *
 * Pure wrappers around vexart_composite_* and vexart_paint_* symbols.
 * All take the vexart context handle as first parameter — no closure state.
 *
 * Extracted from gpu-renderer-backend.ts to isolate the FFI boundary.
 */

import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import { vexartGetLastError } from "./vexart-functions"
import { GRAPH_MAGIC, GRAPH_VERSION } from "./vexart-buffer"
import { vu16, vu32 } from "./gpu-pack"
import type { BackdropFilterParams } from "./render-graph"

// ── Handle types ─────────────────────────────────────────────────────────

export type VexartTargetHandle = bigint
export type VexartImageHandle = bigint

// ── Pre-allocated buffers ────────────────────────────────────────────────

const _handleOut = new BigUint64Array(1)
const _backdropParamBuf = new Float32Array(8)
const _backdropParamU8 = new Uint8Array(_backdropParamBuf.buffer)
const _flushStatsBuf = new Uint8Array(32)

let _cachedSymbols: ReturnType<typeof openVexartLibrary>["symbols"] | null = null
export function getSymbols() {
  if (_cachedSymbols) return _cachedSymbols
  _cachedSymbols = openVexartLibrary().symbols
  return _cachedSymbols
}

let _readbackBuf: Uint8Array | null = null
let _readbackSize = 0

let _batchBuf: ArrayBuffer | null = null
let _batchView: DataView | null = null
let _batchU8: Uint8Array | null = null

function ensureBatchBuf(size: number) {
  if (!_batchBuf || _batchBuf.byteLength < size) {
    _batchBuf = new ArrayBuffer(Math.max(size, 1024))
    _batchView = new DataView(_batchBuf)
    _batchU8 = new Uint8Array(_batchBuf)
  }
  return { view: _batchView!, u8: _batchU8! }
}

// ── Image upload registry ────────────────────────────────────────────────

// TODO(perf): Image handles are tracked in 4 places. Consider unifying
// around nativeImageHandle as the authoritative path.
export const _vexartImageHandles = new WeakMap<Uint8Array, bigint>()
export const activeImageHandles = new Set<bigint>()

// ── Target lifecycle ─────────────────────────────────────────────────────

export function vexartCompositeTargetCreate(vctx: bigint, width: number, height: number): bigint {
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_target_create(vctx, width, height, ptr(_handleOut)) as number
  if (result !== 0) return 0n
  return _handleOut[0]
}

export function vexartCompositeTargetDestroy(vctx: bigint, target: bigint): void {
  if (!target) return
  getSymbols().vexart_composite_target_destroy(vctx, target)
}

export function vexartCompositeTargetBeginLayer(vctx: bigint, target: bigint, loadMode: 0 | 1, clearRgba: number): void {
  const result = getSymbols().vexart_composite_target_begin_layer(vctx, target, loadMode, clearRgba >>> 0) as number
  if (result !== 0) throw new Error(`vexart_composite_target_begin_layer failed: ${result}`)
}

export function vexartCompositeTargetEndLayer(vctx: bigint, target: bigint): void {
  const result = getSymbols().vexart_composite_target_end_layer(vctx, target) as number
  if (result !== 0) throw new Error(`vexart_composite_target_end_layer failed: ${result}`)
}

// ── Compositing ──────────────────────────────────────────────────────────

export function vexartCompositeRenderImageLayer(
  vctx: bigint, target: bigint, image: bigint,
  x: number, y: number, w: number, h: number,
  z: number, clearRgba: number,
): void {
  const result = getSymbols().vexart_composite_render_image_layer(vctx, target, image, x, y, w, h, z, clearRgba >>> 0) as number
  if (result !== 0) throw new Error(`vexart_composite_render_image_layer failed: ${result}`)
}

export function vexartCompositeCopyRegionToImage(
  vctx: bigint, target: bigint,
  x: number, y: number, w: number, h: number,
): bigint {
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_copy_region_to_image(vctx, target, x, y, w, h, ptr(_handleOut)) as number
  if (result !== 0) return 0n
  return _handleOut[0]
}

export function vexartCompositeImageFilterBackdrop(
  vctx: bigint, image: bigint, params: BackdropFilterParams,
): bigint {
  _backdropParamBuf[0] = params.blur ?? Number.NaN
  _backdropParamBuf[1] = params.brightness ?? Number.NaN
  _backdropParamBuf[2] = params.contrast ?? Number.NaN
  _backdropParamBuf[3] = params.saturate ?? Number.NaN
  _backdropParamBuf[4] = params.grayscale ?? Number.NaN
  _backdropParamBuf[5] = params.invert ?? Number.NaN
  _backdropParamBuf[6] = params.sepia ?? Number.NaN
  _backdropParamBuf[7] = params.hueRotate ?? Number.NaN
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_image_filter_backdrop(
    vctx, image, ptr(_backdropParamU8), _backdropParamBuf.byteLength, ptr(_handleOut)
  ) as number
  if (result !== 0) return 0n
  return _handleOut[0]
}

export function vexartCompositeImageMaskRoundedRect(
  vctx: bigint, image: bigint, rectBuf: Float32Array,
): bigint {
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_image_mask_rounded_rect(
    vctx, image, ptr(new Uint8Array(rectBuf.buffer)), ptr(_handleOut)
  ) as number
  if (result !== 0) return 0n
  return _handleOut[0]
}

export function vexartCompositeReadbackRgba(vctx: bigint, target: bigint, byteLength: number): Uint8Array | null {
  if (!_readbackBuf || _readbackSize < byteLength) {
    _readbackBuf = new Uint8Array(byteLength)
    _readbackSize = byteLength
  }
  const result = getSymbols().vexart_composite_readback_rgba(vctx, target, ptr(_readbackBuf), byteLength, ptr(_flushStatsBuf)) as number
  if (result !== 0) return null
  return _readbackBuf.byteLength === byteLength ? _readbackBuf : _readbackBuf.subarray(0, byteLength)
}

// ── Image helpers ────────────────────────────────────────────────────────

export type GpuRasterImage = { handle: VexartImageHandle; width: number; height: number }

export function copyGpuTargetRegionToImage(
  vctx: bigint, target: VexartTargetHandle,
  region: { x: number; y: number; width: number; height: number },
): GpuRasterImage {
  const handle = vexartCompositeCopyRegionToImage(vctx, target, region.x, region.y, region.width, region.height)
  return { handle, width: region.width, height: region.height }
}

export function vexartUploadImage(ctx: bigint, data: Uint8Array, width: number, height: number): bigint {
  const cached = _vexartImageHandles.get(data)
  if (cached !== undefined) return cached
  _handleOut[0] = 0n
  const result = getSymbols().vexart_paint_upload_image(
    ctx, ptr(data), data.byteLength, width, height, 0, ptr(_handleOut)
  ) as number
  if (result !== 0) return 0n
  const handle = _handleOut[0]
  _vexartImageHandles.set(data, handle)
  activeImageHandles.add(handle)
  return handle
}

export function vexartRemoveImage(ctx: bigint, handle: bigint) {
  if (!handle) return
  const rc = getSymbols().vexart_paint_remove_image(ctx, handle) as number
  if (rc !== 0) {
    const err = vexartGetLastError()
    console.error(`[vexart] paint_remove_image failed (${rc}): ${err}`)
  }
  activeImageHandles.delete(handle)
}

// ── Paint dispatch ───────────────────────────────────────────────────────

export function flushVexartBatch(ctx: bigint, cmdKind: number, instanceData: Uint8Array, target: bigint = 0n): void {
  if (instanceData.byteLength === 0) return
  const PREFIX = 8
  const HEADER = 16
  const total = HEADER + PREFIX + instanceData.byteLength
  const { view, u8 } = ensureBatchBuf(total)
  vu32(view, 0, GRAPH_MAGIC)
  vu32(view, 4, GRAPH_VERSION)
  vu32(view, 8, 1)
  vu32(view, 12, PREFIX + instanceData.byteLength)
  vu16(view, 16, cmdKind)
  vu16(view, 18, 0)
  vu32(view, 20, instanceData.byteLength)
  u8.set(instanceData, HEADER + PREFIX)
  const rc = getSymbols().vexart_paint_dispatch(ctx, target, ptr(u8), total, ptr(_flushStatsBuf)) as number
  if (rc !== 0) {
    const err = vexartGetLastError()
    console.error(`[vexart] paint_dispatch failed (${rc}): ${err}`)
  }
}

export function flushVexartBatchToTarget(ctx: bigint, target: bigint, cmdKind: number, instanceData: Uint8Array): void {
  flushVexartBatch(ctx, cmdKind, instanceData, target)
}

export function compositeTargetUniformToTarget(ctx: bigint, target: bigint, sourceTarget: bigint, instanceData: Uint8Array): boolean {
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_composite_update_uniform(ctx, target, sourceTarget, ptr(instanceData), 0) as number
  return rc === 0
}
