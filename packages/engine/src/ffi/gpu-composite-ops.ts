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
import {
  vu16, vu32,
  packShapeRectDirect, packShapeRectCornersDirect,
  packGlowDirect, packShadowDirect,
  packLinearGradientDirect, packRadialGradientDirect,
  CMD_SHAPE_RECT, STRIDE_SHAPE_RECT,
  CMD_SHAPE_RECT_CORNERS, STRIDE_SHAPE_RECT_CORNERS,
  CMD_GLOW, STRIDE_GLOW,
  CMD_LINEAR_GRADIENT, STRIDE_LINEAR_GRADIENT,
  CMD_RADIAL_GRADIENT, STRIDE_RADIAL_GRADIENT,
  CMD_SHADOW, STRIDE_SHADOW,
  type WgpuCanvasCornerRadii,
} from "./gpu-pack"
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

export type ImageCleanupData = { vctx: bigint; handle: bigint }
export const _handleUnregisterTokens = new Map<bigint, object>()
export const _handleToBuffer = new Map<bigint, WeakRef<Uint8Array>>()

export function _handleImageFinalization({ vctx, handle }: ImageCleanupData): void {
  if (activeImageHandles.has(handle)) {
    vexartRemoveImage(vctx, handle)
  }
}

export const _imageFinalizationRegistry = new FinalizationRegistry<ImageCleanupData>(({ vctx, handle }) => {
  _handleImageFinalization({ vctx, handle })
})

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

export function vexartCompositeTargetSetScissor(
  vctx: bigint, target: bigint,
  x: number, y: number, width: number, height: number,
): void {
  const result = getSymbols().vexart_composite_target_set_scissor(
    vctx, target,
    Math.max(0, Math.round(x)) >>> 0,
    Math.max(0, Math.round(y)) >>> 0,
    Math.max(0, Math.round(width)) >>> 0,
    Math.max(0, Math.round(height)) >>> 0,
  ) as number
  if (result !== 0) throw new Error(`vexart_composite_target_set_scissor failed: ${result}`)
}

export function vexartCompositeTargetResetScissor(vctx: bigint, target: bigint): void {
  const result = getSymbols().vexart_composite_target_reset_scissor(vctx, target) as number
  if (result !== 0) throw new Error(`vexart_composite_target_reset_scissor failed: ${result}`)
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

export function vexartCompositeRenderImageTransformLayer(
  vctx: bigint, target: bigint, image: bigint, instanceData: Uint8Array,
  clearRgba = 0,
): void {
  const result = getSymbols().vexart_composite_render_image_transform_layer(
    vctx, target, image, ptr(instanceData), clearRgba >>> 0,
  ) as number
  if (result !== 0) throw new Error(`vexart_composite_render_image_transform_layer failed: ${result}`)
}

export function vexartCompositeCopyRegionToImage(
  vctx: bigint, target: bigint,
  x: number, y: number, w: number, h: number,
): bigint {
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_copy_region_to_image(vctx, target, x, y, w, h, ptr(_handleOut)) as number
  if (result !== 0) return 0n
  const handle = _handleOut[0]
  if (handle !== 0n) activeImageHandles.add(handle)
  return handle
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
  const handle = _handleOut[0]
  if (handle !== 0n) activeImageHandles.add(handle)
  return handle
}

export function vexartCompositeImageMaskRoundedRect(
  vctx: bigint, image: bigint, rectBuf: Float32Array,
): bigint {
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_image_mask_rounded_rect(
    vctx, image, ptr(new Uint8Array(rectBuf.buffer, rectBuf.byteOffset, rectBuf.byteLength)), ptr(_handleOut)
  ) as number
  if (result !== 0) return 0n
  const handle = _handleOut[0]
  if (handle !== 0n) activeImageHandles.add(handle)
  return handle
}

/**
 * Apply a rounded-rect mask whose box may extend beyond a cropped source
 * image. `rectBuf` is six mask radii/mode floats followed by the mask box in
 * NDC (mask_x, mask_y, mask_w, mask_h).
 */
export function vexartCompositeImageMaskRoundedRectRegion(
  vctx: bigint, image: bigint, rectBuf: Float32Array,
): bigint {
  _handleOut[0] = 0n
  const result = getSymbols().vexart_composite_image_mask_rounded_rect_region(
    vctx, image, ptr(new Uint8Array(rectBuf.buffer, rectBuf.byteOffset, rectBuf.byteLength)), ptr(_handleOut)
  ) as number
  if (result !== 0) return 0n
  const handle = _handleOut[0]
  if (handle !== 0n) activeImageHandles.add(handle)
  return handle
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

export interface GpuRasterImage {
  readonly handle: VexartImageHandle
  readonly width: number
  readonly height: number
  dispose(): void
  [Symbol.dispose](): void
}

export function copyGpuTargetRegionToImage(
  vctx: bigint, target: VexartTargetHandle,
  region: { x: number; y: number; width: number; height: number },
): GpuRasterImage {
  const handle = vexartCompositeCopyRegionToImage(vctx, target, region.x, region.y, region.width, region.height)
  const imageObj: GpuRasterImage = {
    handle,
    width: region.width,
    height: region.height,
    dispose() {
      vexartRemoveImage(vctx, handle)
    },
    [Symbol.dispose]() {
      vexartRemoveImage(vctx, handle)
    },
  }
  if (handle !== 0n) {
    const token = {}
    _handleUnregisterTokens.set(handle, token)
    _imageFinalizationRegistry.register(imageObj, { vctx, handle }, token)
  }
  return imageObj
}

export function vexartUploadImage(ctx: bigint, data: Uint8Array, width: number, height: number): bigint {
  const cached = _vexartImageHandles.get(data)
  if (cached !== undefined) {
    if (activeImageHandles.has(cached)) {
      return cached
    }
    _vexartImageHandles.delete(data)
  }
  _handleOut[0] = 0n
  const result = getSymbols().vexart_paint_upload_image(
    ctx, ptr(data), data.byteLength, width, height, 0, ptr(_handleOut)
  ) as number
  if (result !== 0) return 0n
  const handle = _handleOut[0]
  if (handle === 0n) return 0n
  _vexartImageHandles.set(data, handle)
  activeImageHandles.add(handle)
  _handleToBuffer.set(handle, new WeakRef(data))

  const token = {}
  _handleUnregisterTokens.set(handle, token)
  _imageFinalizationRegistry.register(data, { vctx: ctx, handle }, token)
  return handle
}

export function vexartRemoveImage(ctx: bigint, handle: bigint) {
  if (!handle || !activeImageHandles.has(handle)) return
  activeImageHandles.delete(handle)

  const token = _handleUnregisterTokens.get(handle)
  if (token) {
    _imageFinalizationRegistry.unregister(token)
    _handleUnregisterTokens.delete(handle)
  }

  const bufRef = _handleToBuffer.get(handle)
  if (bufRef) {
    const buf = bufRef.deref()
    if (buf) _vexartImageHandles.delete(buf)
    _handleToBuffer.delete(handle)
  }

  const rc = getSymbols().vexart_paint_remove_image(ctx, handle) as number
  if (rc !== 0) {
    const err = vexartGetLastError()
    console.error(`[vexart] paint_remove_image failed (${rc}): ${err}`)
  }
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

// ── Geometry Stream ──────────────────────────────────────────────────────

/**
 * GeometryStream — Streaming buffer for batched WGPU geometry dispatches.
 *
 * Accumulates multiple command kinds (shapes, corners, shadows, glows, gradients)
 * into a single graph buffer before dispatching to vexart_paint_dispatch.
 * Consecutive instances of the same cmdKind coalesce into a single CmdPrefix block.
 */
export class GeometryStream {
  private _buffer: ArrayBuffer
  public view: DataView
  public u8: Uint8Array
  private _writeHead = 16
  private _cmdCount = 0
  private _currentCmdKind = -1
  private _currentCmdLengthOffset = -1
  private _currentCmdPayloadBytes = 0
  private _commands: { kind: number; count: number }[] = []

  constructor(initialCapacity = 256 * 1024) {
    this._buffer = new ArrayBuffer(Math.max(initialCapacity, 1024))
    this.view = new DataView(this._buffer)
    this.u8 = new Uint8Array(this._buffer)
  }

  public isEmpty(): boolean {
    return this._cmdCount === 0
  }

  public get commandCount(): number {
    return this._cmdCount
  }

  public get totalBytes(): number {
    return this._writeHead
  }

  public reset(): void {
    this._writeHead = 16
    this._cmdCount = 0
    this._currentCmdKind = -1
    this._currentCmdLengthOffset = -1
    this._currentCmdPayloadBytes = 0
    this._commands.length = 0
  }

  public describeCommands(): string {
    return this._commands.map((c) => `k${c.kind}:${c.count}`).join(",")
  }

  private ensureCapacity(required: number): void {
    if (required <= this._buffer.byteLength) return
    let newCap = this._buffer.byteLength * 2
    while (newCap < required) newCap *= 2
    const newBuf = new ArrayBuffer(newCap)
    const newU8 = new Uint8Array(newBuf)
    newU8.set(this.u8.subarray(0, this._writeHead))
    this._buffer = newBuf
    this.u8 = newU8
    this.view = new DataView(newBuf)
  }

  /**
   * Reserve space for a single instance of cmdKind.
   * If cmdKind matches the current open command, extends its byte length.
   * Otherwise, writes a new 8-byte CmdPrefix and increments cmdCount.
   *
   * @returns The byte offset in this.view / this.u8 where instance data should be written.
   */
  public reserve(cmdKind: number, stride: number): number {
    if (cmdKind === this._currentCmdKind) {
      this.ensureCapacity(this._writeHead + stride)
      this._currentCmdPayloadBytes += stride
      vu32(this.view, this._currentCmdLengthOffset, this._currentCmdPayloadBytes)
      this._commands[this._commands.length - 1].count += 1
      const offset = this._writeHead
      this._writeHead += stride
      return offset
    }

    this.ensureCapacity(this._writeHead + 8 + stride)
    this._cmdCount++
    const prefixOffset = this._writeHead
    vu16(this.view, prefixOffset, cmdKind)
    vu16(this.view, prefixOffset + 2, 0)
    this._currentCmdLengthOffset = prefixOffset + 4
    this._currentCmdPayloadBytes = stride
    vu32(this.view, this._currentCmdLengthOffset, stride)
    this._currentCmdKind = cmdKind
    this._commands.push({ kind: cmdKind, count: 1 })
    const offset = prefixOffset + 8
    this._writeHead = offset + stride
    return offset
  }

  /**
   * Reserve space for `count` instances of cmdKind.
   */
  public reserveInstances(cmdKind: number, stride: number, count: number): number {
    if (count <= 0) return -1
    const totalStride = stride * count
    if (cmdKind === this._currentCmdKind) {
      this.ensureCapacity(this._writeHead + totalStride)
      this._currentCmdPayloadBytes += totalStride
      vu32(this.view, this._currentCmdLengthOffset, this._currentCmdPayloadBytes)
      this._commands[this._commands.length - 1].count += count
      const offset = this._writeHead
      this._writeHead += totalStride
      return offset
    }

    this.ensureCapacity(this._writeHead + 8 + totalStride)
    this._cmdCount++
    const prefixOffset = this._writeHead
    vu16(this.view, prefixOffset, cmdKind)
    vu16(this.view, prefixOffset + 2, 0)
    this._currentCmdLengthOffset = prefixOffset + 4
    this._currentCmdPayloadBytes = totalStride
    vu32(this.view, this._currentCmdLengthOffset, totalStride)
    this._currentCmdKind = cmdKind
    this._commands.push({ kind: cmdKind, count })
    const offset = prefixOffset + 8
    this._writeHead = offset + totalStride
    return offset
  }

  public appendInstance(
    cmdKind: number,
    stride: number,
    packFn: (view: DataView, offset: number) => void,
  ): void {
    const off = this.reserve(cmdKind, stride)
    packFn(this.view, off)
  }

  public appendInstances<T>(
    items: readonly T[],
    cmdKind: number,
    stride: number,
    packFn: (view: DataView, offset: number, item: T) => void,
  ): void {
    if (items.length === 0) return
    let off = this.reserveInstances(cmdKind, stride, items.length)
    for (let i = 0; i < items.length; i++) {
      packFn(this.view, off, items[i])
      off += stride
    }
  }

  public appendShapeRect(
    x: number, y: number, w: number, h: number,
    boxW: number, boxH: number, radius: number,
    fill: number, stroke: number, strokeWidth: number,
  ): void {
    const off = this.reserve(CMD_SHAPE_RECT, STRIDE_SHAPE_RECT)
    packShapeRectDirect(this.view, off, x, y, w, h, boxW, boxH, radius, fill, stroke, strokeWidth)
  }

  public appendShapeRectCorners(
    x: number, y: number, w: number, h: number,
    boxW: number, boxH: number, radii: WgpuCanvasCornerRadii,
    fill: number, stroke: number, strokeWidth: number,
  ): void {
    const off = this.reserve(CMD_SHAPE_RECT_CORNERS, STRIDE_SHAPE_RECT_CORNERS)
    packShapeRectCornersDirect(this.view, off, x, y, w, h, boxW, boxH, radii, fill, stroke, strokeWidth)
  }

  public appendShadow(
    x: number, y: number, w: number, h: number,
    color: number, radii: WgpuCanvasCornerRadii,
    boxW: number, boxH: number,
    offsetX: number, offsetY: number, blur: number,
  ): void {
    const off = this.reserve(CMD_SHADOW, STRIDE_SHADOW)
    packShadowDirect(this.view, off, x, y, w, h, color, radii, boxW, boxH, offsetX, offsetY, blur)
  }

  public appendGlow(
    x: number, y: number, w: number, h: number,
    color: number, intensity: number,
  ): void {
    const off = this.reserve(CMD_GLOW, STRIDE_GLOW)
    packGlowDirect(this.view, off, x, y, w, h, color, intensity)
  }

  public appendLinearGradient(
    x: number, y: number, w: number, h: number,
    boxW: number, boxH: number, radius: number,
    from: number, to: number, dirX: number, dirY: number,
  ): void {
    const off = this.reserve(CMD_LINEAR_GRADIENT, STRIDE_LINEAR_GRADIENT)
    packLinearGradientDirect(this.view, off, x, y, w, h, boxW, boxH, radius, from, to, dirX, dirY)
  }

  public appendRadialGradient(
    x: number, y: number, w: number, h: number,
    boxW: number, boxH: number, radius: number,
    from: number, to: number,
  ): void {
    const off = this.reserve(CMD_RADIAL_GRADIENT, STRIDE_RADIAL_GRADIENT)
    packRadialGradientDirect(this.view, off, x, y, w, h, boxW, boxH, radius, from, to)
  }

  /**
   * Flush all accumulated commands in a single vexart_paint_dispatch call.
   * Resets the stream upon completion.
   *
   * @returns true if commands were dispatched, false if stream was empty or error occurred.
   */
  public flush(vctx: bigint, targetHandle: bigint = 0n): boolean {
    if (this._cmdCount === 0) return false
    const total = this._writeHead
    const payloadSize = total - 16
    vu32(this.view, 0, GRAPH_MAGIC)
    vu32(this.view, 4, GRAPH_VERSION)
    vu32(this.view, 8, this._cmdCount)
    vu32(this.view, 12, payloadSize)

    const rc = getSymbols().vexart_paint_dispatch(
      vctx,
      targetHandle,
      ptr(this.u8),
      total,
      ptr(_flushStatsBuf),
    ) as number

    if (rc !== 0) {
      const err = vexartGetLastError()
      console.error(`[vexart] paint_dispatch failed (${rc}): ${err}`)
    }

    this.reset()
    return rc === 0
  }
}

const _streamPool: GeometryStream[] = []

export function acquireGeometryStream(): GeometryStream {
  return _streamPool.pop() ?? new GeometryStream()
}

export function releaseGeometryStream(stream: GeometryStream): void {
  stream.reset()
  _streamPool.push(stream)
}
