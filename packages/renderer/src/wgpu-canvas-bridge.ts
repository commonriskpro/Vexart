import { dlopen, FFIType } from "bun:ffi"
import { resolve } from "path"

const STATUS = {
  success: 0,
  unavailable: 1,
  invalidArgument: 2,
  invalidHandle: 3,
  unsupported: 4,
  internalError: 5,
} as const

const BRIDGE_ABI_VERSION = 4

const BRIDGE_NAMES: Record<string, string> = {
  darwin: "libtge_wgpu_canvas_bridge.dylib",
  linux: "libtge_wgpu_canvas_bridge.so",
  win32: "tge_wgpu_canvas_bridge.dll",
}

const BRIDGE_FFI_DEFS = {
  tge_wgpu_canvas_bridge_version: { args: [], returns: FFIType.u32 },
  tge_wgpu_canvas_bridge_available: { args: [], returns: FFIType.u32 },
  tge_wgpu_canvas_bridge_fill_info: { args: [FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_bridge_get_last_error_length: { args: [], returns: FFIType.u32 },
  tge_wgpu_canvas_bridge_copy_last_error: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
  tge_wgpu_canvas_context_create: { args: [FFIType.ptr], returns: FFIType.u64 },
  tge_wgpu_canvas_context_destroy: { args: [FFIType.u64], returns: FFIType.void },
  tge_wgpu_canvas_target_create: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.u64 },
  tge_wgpu_canvas_target_destroy: { args: [FFIType.u64, FFIType.u64], returns: FFIType.void },
  tge_wgpu_canvas_image_create: { args: [FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.u32], returns: FFIType.u64 },
  tge_wgpu_canvas_image_destroy: { args: [FFIType.u64, FFIType.u64], returns: FFIType.void },
  tge_wgpu_canvas_target_copy_region_to_image: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u64 },
  tge_wgpu_canvas_image_filter_backdrop: { args: [FFIType.u64, FFIType.u64, FFIType.ptr], returns: FFIType.u64 },
  tge_wgpu_canvas_image_mask_rounded_rect: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.f32], returns: FFIType.u64 },
  tge_wgpu_canvas_target_render_clear: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_begin_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32], returns: FFIType.u32 },
  tge_wgpu_canvas_target_end_layer: { args: [FFIType.u64, FFIType.u64], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_rects: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_rects_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_image: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_image_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_images_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_transformed_images_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_linear_gradients_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_radial_gradients_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_circles_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_polygons_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_beziers_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_shape_rects_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_render_glows_layer: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_composite_image_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_readback_rgba: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
  tge_wgpu_canvas_target_readback_region_rgba: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
} as const

type WgpuBridgeLib = ReturnType<typeof dlopen<typeof BRIDGE_FFI_DEFS>>

const BRIDGE_GLYPH_FFI_DEFS = {
  tge_wgpu_canvas_target_render_glyphs_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.u32 },
} as const

type WgpuGlyphBridgeLib = ReturnType<typeof dlopen<typeof BRIDGE_GLYPH_FFI_DEFS>>

export type WgpuCanvasBridgeProbe = {
  available: boolean
  libraryPath: string | null
  bridgeVersion: number | null
  abiVersion: number | null
  reason: string
}

export type WgpuCanvasBridgeInfo = {
  abiVersion: number
  bridgeVersion: number
  available: boolean
}

export type WgpuCanvasInitOptions = {
  powerPreference?: number
  backendPreference?: number
  enableValidation?: boolean
}

export type WgpuCanvasTargetDescriptor = {
  width: number
  height: number
  format?: number
}

export type WgpuCanvasImageDescriptor = {
  width: number
  height: number
}

export type WgpuCanvasFrameStats = {
  gpuMs: number
  readbackMs: number
  totalMs: number
}

export type WgpuCanvasRectFill = {
  x: number
  y: number
  w: number
  h: number
  color: number
}

export type WgpuCanvasLinearGradient = {
  x: number
  y: number
  w: number
  h: number
  boxW: number
  boxH: number
  radius: number
  from: number
  to: number
  dirX: number
  dirY: number
}

export type WgpuCanvasRadialGradient = {
  x: number
  y: number
  w: number
  h: number
  boxW: number
  boxH: number
  radius: number
  from: number
  to: number
}

export type WgpuCanvasCircle = {
  x: number
  y: number
  w: number
  h: number
  fill?: number
  stroke?: number
  strokeNorm: number
}

export type WgpuCanvasPolygon = {
  x: number
  y: number
  w: number
  h: number
  fill?: number
  stroke?: number
  strokeNorm: number
  sides: number
  rotationDeg: number
}

export type WgpuCanvasBezier = {
  x: number
  y: number
  w: number
  h: number
  boxW: number
  boxH: number
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  color: number
  strokeWidth: number
}

export type WgpuCanvasShapeRect = {
  x: number
  y: number
  w: number
  h: number
  boxW: number
  boxH: number
  radius: number
  strokeWidth: number
  fill?: number
  stroke?: number
}

export type WgpuCanvasGlow = {
  x: number
  y: number
  w: number
  h: number
  color: number
  intensity: number
}

export type WgpuCanvasGlyphInstance = {
  x: number
  y: number
  w: number
  h: number
  u: number
  v: number
  uw: number
  vh: number
  r: number
  g: number
  b: number
  a: number
  opacity: number
}

export interface WgpuBackdropFilterParams {
  blur: number | null
  brightness: number | null
  contrast: number | null
  saturate: number | null
  grayscale: number | null
  invert: number | null
  sepia: number | null
  hueRotate: number | null
}

export type WgpuCanvasContextHandle = bigint
export type WgpuCanvasTargetHandle = bigint
export type WgpuCanvasImageHandle = bigint

function readLastError(lib: WgpuBridgeLib) {
  const len = Number(lib.symbols.tge_wgpu_canvas_bridge_get_last_error_length())
  if (len <= 0) return "unknown bridge error"
  const buf = new Uint8Array(len + 1)
  lib.symbols.tge_wgpu_canvas_bridge_copy_last_error(buf, buf.length)
  return new TextDecoder().decode(buf.subarray(0, len))
}

function readBridgeInfo(lib: WgpuBridgeLib): WgpuCanvasBridgeInfo | null {
  const info = new Uint32Array(4)
  const status = Number(lib.symbols.tge_wgpu_canvas_bridge_fill_info(info))
  if (status !== STATUS.success) return null
  return {
    abiVersion: Number(info[0]),
    bridgeVersion: Number(info[1]),
    available: Number(info[2]) === 1,
  }
}

function createInitOptionsBuffer(options?: WgpuCanvasInitOptions) {
  const data = new Uint32Array(4)
  data[0] = options?.powerPreference ?? 0
  data[1] = options?.backendPreference ?? 0
  data[2] = options?.enableValidation ? 1 : 0
  data[3] = 0
  return data
}

function createTargetDescriptorBuffer(descriptor: WgpuCanvasTargetDescriptor) {
  const data = new Uint32Array(4)
  data[0] = descriptor.width >>> 0
  data[1] = descriptor.height >>> 0
  data[2] = descriptor.format ?? 0
  data[3] = 0
  return data
}

function createImageDescriptorBuffer(descriptor: WgpuCanvasImageDescriptor) {
  const data = new Uint32Array(4)
  data[0] = descriptor.width >>> 0
  data[1] = descriptor.height >>> 0
  data[2] = 0
  data[3] = 0
  return data
}

function readFrameStats(buf: Float64Array): WgpuCanvasFrameStats {
  return {
    gpuMs: Number(buf[0]),
    readbackMs: Number(buf[1]),
    totalMs: Number(buf[2]),
  }
}

function createBackdropFilterParamsBuffer(params: WgpuBackdropFilterParams) {
  const data = new Float32Array(8)
  data[0] = params.blur ?? Number.NaN
  data[1] = params.brightness ?? Number.NaN
  data[2] = params.contrast ?? Number.NaN
  data[3] = params.saturate ?? Number.NaN
  data[4] = params.grayscale ?? Number.NaN
  data[5] = params.invert ?? Number.NaN
  data[6] = params.sepia ?? Number.NaN
  data[7] = params.hueRotate ?? Number.NaN
  return data
}

let bridgeLib: WgpuBridgeLib | null = null
let bridgeChecked = false
let bridgePath: string | null = null
let glyphBridgeLib: WgpuGlyphBridgeLib | null = null
let glyphBridgeChecked = false

function findBridgePath() {
  const name = BRIDGE_NAMES[process.platform] ?? "libtge_wgpu_canvas_bridge.so"
  const explicit = process.env.TGE_WGPU_BRIDGE_PATH
  const candidates = [
    explicit,
    resolve(import.meta.dir, "../../../native/wgpu-canvas-bridge/target/release", name),
    resolve(process.cwd(), "native/wgpu-canvas-bridge/target/release", name),
  ].filter((value): value is string => Boolean(value))

  for (const path of candidates) {
    try {
      if (Bun.file(path).size > 0) return path
    } catch {}
  }

  return null
}

export function loadWgpuCanvasBridge() {
  if (bridgeChecked) return bridgeLib
  bridgeChecked = true
  bridgePath = findBridgePath()
  if (!bridgePath) return null

  try {
    bridgeLib = dlopen(bridgePath, BRIDGE_FFI_DEFS)
  } catch {
    bridgeLib = null
  }

  return bridgeLib
}

export function probeWgpuCanvasBridge(): WgpuCanvasBridgeProbe {
  const lib = loadWgpuCanvasBridge()
  if (!bridgePath) {
    return {
      available: false,
      libraryPath: null,
      bridgeVersion: null,
      abiVersion: null,
      reason: "bridge library not found",
    }
  }

  if (!lib) {
    return {
      available: false,
      libraryPath: bridgePath,
      bridgeVersion: null,
      abiVersion: null,
      reason: "bridge library failed to load",
    }
  }

  const info = readBridgeInfo(lib)
  const bridgeVersion = info?.bridgeVersion ?? Number(lib.symbols.tge_wgpu_canvas_bridge_version())
  const abiVersion = info?.abiVersion ?? null
  const available = info?.available ?? (Number(lib.symbols.tge_wgpu_canvas_bridge_available()) === 1)
  const abiCompatible = abiVersion === null || abiVersion === BRIDGE_ABI_VERSION

  return {
    available: available && abiCompatible,
    libraryPath: bridgePath,
    bridgeVersion,
    abiVersion,
    reason: !abiCompatible
      ? `bridge ABI mismatch: expected ${BRIDGE_ABI_VERSION}, got ${abiVersion}`
      : available
        ? "bridge available"
        : "bridge loaded but GPU backend is not ready",
  }
}

export function getWgpuCanvasBridgeInfo() {
  const lib = loadWgpuCanvasBridge()
  if (!lib) return null
  return readBridgeInfo(lib)
}

function loadWgpuGlyphBridge() {
  if (glyphBridgeChecked) return glyphBridgeLib
  glyphBridgeChecked = true
  if (!bridgePath) return null
  try {
    glyphBridgeLib = dlopen(bridgePath, BRIDGE_GLYPH_FFI_DEFS)
  } catch {
    glyphBridgeLib = null
  }
  return glyphBridgeLib
}

export function supportsWgpuCanvasGlyphLayer() {
  const info = getWgpuCanvasBridgeInfo()
  if (!info) return false
  if (info.bridgeVersion < 5) return false
  return !!loadWgpuGlyphBridge()
}

export function createWgpuCanvasContext(options?: WgpuCanvasInitOptions) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const probe = probeWgpuCanvasBridge()
  if (!probe.available) throw new Error(probe.reason)
  const init = createInitOptionsBuffer(options)
  const handle = BigInt(lib.symbols.tge_wgpu_canvas_context_create(init))
  if (handle === 0n) throw new Error(readLastError(lib))
  return handle
}

export function destroyWgpuCanvasContext(contextHandle: WgpuCanvasContextHandle) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) return
  lib.symbols.tge_wgpu_canvas_context_destroy(contextHandle)
}

export function createWgpuCanvasTarget(contextHandle: WgpuCanvasContextHandle, descriptor: WgpuCanvasTargetDescriptor) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const desc = createTargetDescriptorBuffer(descriptor)
  const handle = BigInt(lib.symbols.tge_wgpu_canvas_target_create(contextHandle, desc))
  if (handle === 0n) throw new Error(readLastError(lib))
  return handle
}

export function destroyWgpuCanvasTarget(contextHandle: WgpuCanvasContextHandle, targetHandle: WgpuCanvasTargetHandle) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) return
  lib.symbols.tge_wgpu_canvas_target_destroy(contextHandle, targetHandle)
}

export function createWgpuCanvasImage(contextHandle: WgpuCanvasContextHandle, descriptor: WgpuCanvasImageDescriptor, rgba: Uint8Array) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const desc = createImageDescriptorBuffer(descriptor)
  const handle = BigInt(lib.symbols.tge_wgpu_canvas_image_create(contextHandle, desc, rgba, rgba.length))
  if (handle === 0n) throw new Error(readLastError(lib))
  return handle
}

export function destroyWgpuCanvasImage(contextHandle: WgpuCanvasContextHandle, imageHandle: WgpuCanvasImageHandle) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) return
  lib.symbols.tge_wgpu_canvas_image_destroy(contextHandle, imageHandle)
}

export function copyWgpuCanvasTargetRegionToImage(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  region: { x: number; y: number; width: number; height: number },
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const stats = new Float64Array(3)
  const handle = BigInt(lib.symbols.tge_wgpu_canvas_target_copy_region_to_image(
    contextHandle,
    targetHandle,
    region.x,
    region.y,
    region.width,
    region.height,
    stats,
  ))
  if (handle === 0n) throw new Error(readLastError(lib))
  return { handle, stats: readFrameStats(stats) }
}

export function filterWgpuCanvasImageBackdrop(
  contextHandle: WgpuCanvasContextHandle,
  imageHandle: WgpuCanvasImageHandle,
  params: WgpuBackdropFilterParams,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const data = createBackdropFilterParamsBuffer(params)
  const handle = BigInt(lib.symbols.tge_wgpu_canvas_image_filter_backdrop(contextHandle, imageHandle, data))
  if (handle === 0n) throw new Error(readLastError(lib))
  return handle
}

export function maskWgpuCanvasImageRoundedRect(
  contextHandle: WgpuCanvasContextHandle,
  imageHandle: WgpuCanvasImageHandle,
  mask: { x: number; y: number; width: number; height: number; radius: number },
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const handle = BigInt(lib.symbols.tge_wgpu_canvas_image_mask_rounded_rect(
    contextHandle,
    imageHandle,
    mask.x,
    mask.y,
    mask.width,
    mask.height,
    mask.radius,
  ))
  if (handle === 0n) throw new Error(readLastError(lib))
  return handle
}

export function renderWgpuCanvasTargetClear(contextHandle: WgpuCanvasContextHandle, targetHandle: WgpuCanvasTargetHandle, rgba: number) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_clear(contextHandle, targetHandle, rgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function beginWgpuCanvasTargetLayer(contextHandle: WgpuCanvasContextHandle, targetHandle: WgpuCanvasTargetHandle, loadMode: 0 | 1 = 0, clearRgba = 0x00000000) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const status = Number(lib.symbols.tge_wgpu_canvas_target_begin_layer(contextHandle, targetHandle, loadMode, clearRgba >>> 0))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
}

export function endWgpuCanvasTargetLayer(contextHandle: WgpuCanvasContextHandle, targetHandle: WgpuCanvasTargetHandle) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const status = Number(lib.symbols.tge_wgpu_canvas_target_end_layer(contextHandle, targetHandle))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
}

export function readbackWgpuCanvasTargetRGBA(contextHandle: WgpuCanvasContextHandle, targetHandle: WgpuCanvasTargetHandle, byteLength: number) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const data = new Uint8Array(byteLength)
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_readback_rgba(contextHandle, targetHandle, data, data.length, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return { data, stats: readFrameStats(stats) }
}

export function readbackWgpuCanvasTargetRegionRGBA(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  region: { x: number; y: number; width: number; height: number },
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const byteLength = region.width * region.height * 4
  const data = new Uint8Array(byteLength)
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_readback_region_rgba(
    contextHandle,
    targetHandle,
    region.x,
    region.y,
    region.width,
    region.height,
    data,
    data.length,
    stats,
  ))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return { data, stats: readFrameStats(stats) }
}

export function renderWgpuCanvasTargetRects(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  rects: WgpuCanvasRectFill[],
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (rects.length === 0) throw new Error("renderWgpuCanvasTargetRects requires at least one rect")

  const data = new Float32Array(rects.length * 8)
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    const base = i * 8
    data[base] = rect.x
    data[base + 1] = rect.y
    data[base + 2] = rect.w
    data[base + 3] = rect.h
    data[base + 4] = ((rect.color >>> 24) & 0xff) / 255
    data[base + 5] = ((rect.color >>> 16) & 0xff) / 255
    data[base + 6] = ((rect.color >>> 8) & 0xff) / 255
    data[base + 7] = (rect.color & 0xff) / 255
  }

  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_rects(contextHandle, targetHandle, data, rects.length, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetRectsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  rects: WgpuCanvasRectFill[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (rects.length === 0) throw new Error("renderWgpuCanvasTargetRectsLayer requires at least one rect")
  const data = new Float32Array(rects.length * 8)
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    const base = i * 8
    data[base] = rect.x
    data[base + 1] = rect.y
    data[base + 2] = rect.w
    data[base + 3] = rect.h
    data[base + 4] = ((rect.color >>> 24) & 0xff) / 255
    data[base + 5] = ((rect.color >>> 16) & 0xff) / 255
    data[base + 6] = ((rect.color >>> 8) & 0xff) / 255
    data[base + 7] = (rect.color & 0xff) / 255
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_rects_layer(contextHandle, targetHandle, data, rects.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetImage(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  imageHandle: WgpuCanvasImageHandle,
  instance: { x: number; y: number; w: number; h: number; opacity: number },
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const data = new Float32Array(8)
  data[0] = instance.x
  data[1] = instance.y
  data[2] = instance.w
  data[3] = instance.h
  data[4] = instance.opacity
  data[5] = 0
  data[6] = 0
  data[7] = 0
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_image(contextHandle, targetHandle, imageHandle, data, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetImageLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  imageHandle: WgpuCanvasImageHandle,
  instance: { x: number; y: number; w: number; h: number; opacity: number },
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const data = new Float32Array(8)
  data[0] = instance.x
  data[1] = instance.y
  data[2] = instance.w
  data[3] = instance.h
  data[4] = instance.opacity
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_image_layer(contextHandle, targetHandle, imageHandle, data, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function compositeWgpuCanvasTargetImageLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  imageHandle: WgpuCanvasImageHandle,
  instance: { x: number; y: number; w: number; h: number; opacity: number },
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  const data = new Float32Array(8)
  data[0] = instance.x
  data[1] = instance.y
  data[2] = instance.w
  data[3] = instance.h
  data[4] = instance.opacity
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_composite_image_layer(contextHandle, targetHandle, imageHandle, data, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetImagesLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  imageHandle: WgpuCanvasImageHandle,
  instances: { x: number; y: number; w: number; h: number; opacity: number }[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (instances.length === 0) throw new Error("renderWgpuCanvasTargetImagesLayer requires at least one image instance")
  const data = new Float32Array(instances.length * 8)
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]
    const base = i * 8
    data[base] = instance.x
    data[base + 1] = instance.y
    data[base + 2] = instance.w
    data[base + 3] = instance.h
    data[base + 4] = instance.opacity
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_images_layer(contextHandle, targetHandle, imageHandle, data, instances.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetTransformedImagesLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  imageHandle: WgpuCanvasImageHandle,
  instances: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; opacity: number }[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (instances.length === 0) throw new Error("renderWgpuCanvasTargetTransformedImagesLayer requires at least one instance")
  const data = new Float32Array(instances.length * 12)
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]
    const base = i * 12
    data[base] = instance.p0.x
    data[base + 1] = instance.p0.y
    data[base + 2] = instance.p1.x
    data[base + 3] = instance.p1.y
    data[base + 4] = instance.p2.x
    data[base + 5] = instance.p2.y
    data[base + 6] = instance.p3.x
    data[base + 7] = instance.p3.y
    data[base + 8] = instance.opacity
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_transformed_images_layer(contextHandle, targetHandle, imageHandle, data, instances.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetGlyphsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  imageHandle: WgpuCanvasImageHandle,
  instances: WgpuCanvasGlyphInstance[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuGlyphBridge()
  if (!lib) throw new Error("WGPU glyph bridge extension is not loaded")
  if (instances.length === 0) throw new Error("renderWgpuCanvasTargetGlyphsLayer requires at least one glyph instance")
  const data = new Float32Array(instances.length * 16)
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]
    const base = i * 16
    data[base] = instance.x
    data[base + 1] = instance.y
    data[base + 2] = instance.w
    data[base + 3] = instance.h
    data[base + 4] = instance.u
    data[base + 5] = instance.v
    data[base + 6] = instance.uw
    data[base + 7] = instance.vh
    data[base + 8] = instance.r
    data[base + 9] = instance.g
    data[base + 10] = instance.b
    data[base + 11] = instance.a
    data[base + 12] = instance.opacity
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_glyphs_layer(contextHandle, targetHandle, imageHandle, data, instances.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(loadWgpuCanvasBridge()!))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetLinearGradientsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  gradients: WgpuCanvasLinearGradient[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (gradients.length === 0) throw new Error("renderWgpuCanvasTargetLinearGradientsLayer requires at least one gradient")
  const data = new Float32Array(gradients.length * 20)
  for (let i = 0; i < gradients.length; i++) {
    const gradient = gradients[i]
    const base = i * 20
    data[base] = gradient.x
    data[base + 1] = gradient.y
    data[base + 2] = gradient.w
    data[base + 3] = gradient.h
    data[base + 4] = gradient.boxW
    data[base + 5] = gradient.boxH
    data[base + 6] = gradient.radius
    data[base + 7] = 0
    data[base + 8] = ((gradient.from >>> 24) & 0xff) / 255
    data[base + 9] = ((gradient.from >>> 16) & 0xff) / 255
    data[base + 10] = ((gradient.from >>> 8) & 0xff) / 255
    data[base + 11] = (gradient.from & 0xff) / 255
    data[base + 12] = ((gradient.to >>> 24) & 0xff) / 255
    data[base + 13] = ((gradient.to >>> 16) & 0xff) / 255
    data[base + 14] = ((gradient.to >>> 8) & 0xff) / 255
    data[base + 15] = (gradient.to & 0xff) / 255
    data[base + 16] = gradient.dirX
    data[base + 17] = gradient.dirY
    data[base + 18] = 0
    data[base + 19] = 0
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_linear_gradients_layer(contextHandle, targetHandle, data, gradients.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetRadialGradientsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  gradients: WgpuCanvasRadialGradient[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (gradients.length === 0) throw new Error("renderWgpuCanvasTargetRadialGradientsLayer requires at least one gradient")
  const data = new Float32Array(gradients.length * 20)
  for (let i = 0; i < gradients.length; i++) {
    const gradient = gradients[i]
    const base = i * 20
    data[base] = gradient.x
    data[base + 1] = gradient.y
    data[base + 2] = gradient.w
    data[base + 3] = gradient.h
    data[base + 4] = gradient.boxW
    data[base + 5] = gradient.boxH
    data[base + 6] = gradient.radius
    data[base + 7] = 0
    data[base + 8] = ((gradient.from >>> 24) & 0xff) / 255
    data[base + 9] = ((gradient.from >>> 16) & 0xff) / 255
    data[base + 10] = ((gradient.from >>> 8) & 0xff) / 255
    data[base + 11] = (gradient.from & 0xff) / 255
    data[base + 12] = ((gradient.to >>> 24) & 0xff) / 255
    data[base + 13] = ((gradient.to >>> 16) & 0xff) / 255
    data[base + 14] = ((gradient.to >>> 8) & 0xff) / 255
    data[base + 15] = (gradient.to & 0xff) / 255
    data[base + 16] = 0
    data[base + 17] = 0
    data[base + 18] = 0
    data[base + 19] = 0
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_radial_gradients_layer(contextHandle, targetHandle, data, gradients.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetCirclesLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  circles: WgpuCanvasCircle[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (circles.length === 0) throw new Error("renderWgpuCanvasTargetCirclesLayer requires at least one circle")
  const data = new Float32Array(circles.length * 16)
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i]
    const base = i * 16
    data[base] = circle.x
    data[base + 1] = circle.y
    data[base + 2] = circle.w
    data[base + 3] = circle.h
    data[base + 4] = circle.fill ? ((circle.fill >>> 24) & 0xff) / 255 : 0
    data[base + 5] = circle.fill ? ((circle.fill >>> 16) & 0xff) / 255 : 0
    data[base + 6] = circle.fill ? ((circle.fill >>> 8) & 0xff) / 255 : 0
    data[base + 7] = circle.fill ? (circle.fill & 0xff) / 255 : 0
    data[base + 8] = circle.stroke ? ((circle.stroke >>> 24) & 0xff) / 255 : 0
    data[base + 9] = circle.stroke ? ((circle.stroke >>> 16) & 0xff) / 255 : 0
    data[base + 10] = circle.stroke ? ((circle.stroke >>> 8) & 0xff) / 255 : 0
    data[base + 11] = circle.stroke ? (circle.stroke & 0xff) / 255 : 0
    data[base + 12] = circle.strokeNorm
    data[base + 13] = circle.fill ? 1 : 0
    data[base + 14] = circle.stroke ? 1 : 0
    data[base + 15] = 0
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_circles_layer(contextHandle, targetHandle, data, circles.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetPolygonsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  polys: WgpuCanvasPolygon[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (polys.length === 0) throw new Error("renderWgpuCanvasTargetPolygonsLayer requires at least one polygon")
  const data = new Float32Array(polys.length * 20)
  for (let i = 0; i < polys.length; i++) {
    const poly = polys[i]
    const base = i * 20
    data[base] = poly.x
    data[base + 1] = poly.y
    data[base + 2] = poly.w
    data[base + 3] = poly.h
    data[base + 4] = poly.fill ? ((poly.fill >>> 24) & 0xff) / 255 : 0
    data[base + 5] = poly.fill ? ((poly.fill >>> 16) & 0xff) / 255 : 0
    data[base + 6] = poly.fill ? ((poly.fill >>> 8) & 0xff) / 255 : 0
    data[base + 7] = poly.fill ? (poly.fill & 0xff) / 255 : 0
    data[base + 8] = poly.stroke ? ((poly.stroke >>> 24) & 0xff) / 255 : 0
    data[base + 9] = poly.stroke ? ((poly.stroke >>> 16) & 0xff) / 255 : 0
    data[base + 10] = poly.stroke ? ((poly.stroke >>> 8) & 0xff) / 255 : 0
    data[base + 11] = poly.stroke ? (poly.stroke & 0xff) / 255 : 0
    data[base + 12] = poly.strokeNorm
    data[base + 13] = poly.fill ? 1 : 0
    data[base + 14] = poly.stroke ? 1 : 0
    data[base + 15] = poly.sides
    data[base + 16] = poly.rotationDeg
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_polygons_layer(contextHandle, targetHandle, data, polys.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetBeziersLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  beziers: WgpuCanvasBezier[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (beziers.length === 0) throw new Error("renderWgpuCanvasTargetBeziersLayer requires at least one bezier")
  const data = new Float32Array(beziers.length * 20)
  for (let i = 0; i < beziers.length; i++) {
    const bezier = beziers[i]
    const base = i * 20
    data[base] = bezier.x
    data[base + 1] = bezier.y
    data[base + 2] = bezier.w
    data[base + 3] = bezier.h
    data[base + 4] = bezier.x0
    data[base + 5] = bezier.y0
    data[base + 6] = bezier.cx
    data[base + 7] = bezier.cy
    data[base + 8] = bezier.x1
    data[base + 9] = bezier.y1
    data[base + 10] = bezier.boxW
    data[base + 11] = bezier.boxH
    data[base + 12] = ((bezier.color >>> 24) & 0xff) / 255
    data[base + 13] = ((bezier.color >>> 16) & 0xff) / 255
    data[base + 14] = ((bezier.color >>> 8) & 0xff) / 255
    data[base + 15] = (bezier.color & 0xff) / 255
    data[base + 16] = bezier.strokeWidth
    data[base + 17] = 1.5
    data[base + 18] = 0
    data[base + 19] = 0
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_beziers_layer(contextHandle, targetHandle, data, beziers.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetShapeRectsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  rects: WgpuCanvasShapeRect[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (rects.length === 0) throw new Error("renderWgpuCanvasTargetShapeRectsLayer requires at least one rect")
  const data = new Float32Array(rects.length * 20)
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    const base = i * 20
    data[base] = rect.x
    data[base + 1] = rect.y
    data[base + 2] = rect.w
    data[base + 3] = rect.h
    data[base + 4] = rect.fill ? ((rect.fill >>> 24) & 0xff) / 255 : 0
    data[base + 5] = rect.fill ? ((rect.fill >>> 16) & 0xff) / 255 : 0
    data[base + 6] = rect.fill ? ((rect.fill >>> 8) & 0xff) / 255 : 0
    data[base + 7] = rect.fill ? (rect.fill & 0xff) / 255 : 0
    data[base + 8] = rect.stroke ? ((rect.stroke >>> 24) & 0xff) / 255 : 0
    data[base + 9] = rect.stroke ? ((rect.stroke >>> 16) & 0xff) / 255 : 0
    data[base + 10] = rect.stroke ? ((rect.stroke >>> 8) & 0xff) / 255 : 0
    data[base + 11] = rect.stroke ? (rect.stroke & 0xff) / 255 : 0
    data[base + 12] = rect.radius
    data[base + 13] = rect.strokeWidth
    data[base + 14] = rect.fill ? 1 : 0
    data[base + 15] = rect.stroke ? 1 : 0
    data[base + 16] = rect.boxW
    data[base + 17] = rect.boxH
    data[base + 18] = 0
    data[base + 19] = 0
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_shape_rects_layer(contextHandle, targetHandle, data, rects.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}

export function renderWgpuCanvasTargetGlowsLayer(
  contextHandle: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  glows: WgpuCanvasGlow[],
  loadMode: 0 | 1,
  clearRgba = 0x00000000,
) {
  const lib = loadWgpuCanvasBridge()
  if (!lib) throw new Error("WGPU canvas bridge is not loaded")
  if (glows.length === 0) throw new Error("renderWgpuCanvasTargetGlowsLayer requires at least one glow")
  const data = new Float32Array(glows.length * 12)
  for (let i = 0; i < glows.length; i++) {
    const glow = glows[i]
    const base = i * 12
    data[base] = glow.x
    data[base + 1] = glow.y
    data[base + 2] = glow.w
    data[base + 3] = glow.h
    data[base + 4] = ((glow.color >>> 24) & 0xff) / 255
    data[base + 5] = ((glow.color >>> 16) & 0xff) / 255
    data[base + 6] = ((glow.color >>> 8) & 0xff) / 255
    data[base + 7] = (glow.color & 0xff) / 255
    data[base + 8] = glow.intensity
    data[base + 9] = 0
    data[base + 10] = 0
    data[base + 11] = 0
  }
  const stats = new Float64Array(3)
  const status = Number(lib.symbols.tge_wgpu_canvas_target_render_glows_layer(contextHandle, targetHandle, data, glows.length, loadMode, clearRgba >>> 0, stats))
  if (status !== STATUS.success) throw new Error(readLastError(lib))
  return readFrameStats(stats)
}
