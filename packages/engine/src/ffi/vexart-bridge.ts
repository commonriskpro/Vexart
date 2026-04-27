/**
 * vexart-bridge.ts
 * bun:ffi loader for libvexart.{dylib,so,dll} FFI exports.
 * Per design §5, §12, REQ-NB-003.
 *
 * Loaded lazily (on first access) so import does not crash if the dylib is missing.
 * Build libvexart before invoking any symbol:
 *   cargo build  (dev)
 *   cargo build --release --locked  (dist)
 */

import { dlopen, FFIType, suffix } from "bun:ffi"
import { join } from "node:path"
import { existsSync } from "node:fs"

// ── Version constant ────────────────────────────────────────────────────────

/** @public */
export const EXPECTED_BRIDGE_VERSION = 0x00020B00 as const

// ── Error class ─────────────────────────────────────────────────────────────

/** @public */
export class VexartNativeError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = "VexartNativeError"
  }
}

// ── Symbol definitions for all 20 exports ──────────────────────────────────

/** @public */
export const VEXART_SYMBOLS = {
  // §5.1 Version & lifecycle
  vexart_version:           { args: [],                                        returns: FFIType.u32  },
  vexart_context_create:    { args: [FFIType.ptr, FFIType.u32, FFIType.ptr],   returns: FFIType.i32  },
  vexart_context_destroy:   { args: [FFIType.u64],                             returns: FFIType.i32  },
  vexart_context_resize:    { args: [FFIType.u64, FFIType.u32, FFIType.u32],   returns: FFIType.i32  },

  // §5.3 Paint
  vexart_paint_dispatch:      { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_paint_upload_image:  { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],       returns: FFIType.i32 },
  vexart_paint_remove_image:  { args: [FFIType.u64, FFIType.u64],              returns: FFIType.i32  },

  // §5.4 Composite — target registry (Phase 2b)
  vexart_composite_target_create:       { args: [FFIType.u64, FFIType.u32, FFIType.u32, FFIType.ptr],              returns: FFIType.i32 },
  vexart_composite_target_destroy:      { args: [FFIType.u64, FFIType.u64],                                        returns: FFIType.i32 },
  vexart_composite_target_begin_layer:  { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32],             returns: FFIType.i32 },
  vexart_composite_target_end_layer:    { args: [FFIType.u64, FFIType.u64],                                        returns: FFIType.i32 },
  // §5.4 Composite — image ops (Phase 2b)
  vexart_composite_render_image_layer:  { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_render_image_transform_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_update_uniform: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_copy_region_to_image:{ args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_image_filter_backdrop:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_image_mask_rounded_rect:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.ptr],           returns: FFIType.i32 },
  // §5.4 Composite — readback
  vexart_composite_readback_rgba:       { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_readback_region_rgba:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr],          returns: FFIType.i32 },

  // §5.5 Text — atlas loading, glyph dispatch, measure
  vexart_text_load_atlas: { args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  vexart_text_dispatch:   { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_text_measure:    { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.f32, FFIType.ptr, FFIType.ptr],           returns: FFIType.i32 },

  // §5.6 Kitty transport (Phase 2b Slice 3)
  vexart_kitty_emit_frame:    { args: [FFIType.u64, FFIType.u64, FFIType.u32], returns: FFIType.i32  },
  vexart_kitty_set_transport: { args: [FFIType.u64, FFIType.u32],              returns: FFIType.i32  },
  // §5.6 Kitty SHM helpers (legacy — used directly by kitty.ts shm path)
  vexart_kitty_shm_prepare: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_kitty_shm_release: { args: [FFIType.u64, FFIType.u32],                returns: FFIType.i32  },
  // §5.6 Kitty native presentation (Phase 2b)
  // emit_frame_with_stats: ctx, target, image_id, stats_out → i32
  vexart_kitty_emit_frame_with_stats: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // emit_layer: ctx, image_id, rgba_ptr, rgba_len, layer_ptr (width,height,col,row,z), stats_out → i32
  vexart_kitty_emit_layer: { args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // emit_layer_target: ctx, target, image_id, layer_ptr (col,row,z), stats_out → i32
  vexart_kitty_emit_layer_target: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // emit_region: ctx, image_id, rgba_ptr, rgba_len, region_ptr (4×u32: rx,ry,rw,rh), stats_out → i32
  // region_ptr is a 16-byte packed buffer [rx,ry,rw,rh] as u32 LE — satisfies ≤8 param ARM64 rule.
  vexart_kitty_emit_region: { args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // emit_region_target: ctx, target, image_id, region_ptr (4×u32: rx,ry,rw,rh), stats_out → i32
  vexart_kitty_emit_region_target: { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // delete_layer: ctx, image_id, stats_out → i32
  vexart_kitty_delete_layer: { args: [FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },

  // §5.7 Native layer registry (Phase 2c)
  // upsert: ctx, key_ptr, key_len, desc_ptr, out_ptr → i32
  vexart_layer_upsert: { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // mark_dirty: ctx, layer_handle → i32
  vexart_layer_mark_dirty: { args: [FFIType.u64, FFIType.u64], returns: FFIType.i32 },
  // reuse: ctx, layer_handle, frame, out_image_id → i32
  vexart_layer_reuse: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
  // remove: ctx, layer_handle, out_image_id → i32
  vexart_layer_remove: { args: [FFIType.u64, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
  // clear: ctx → i32
  vexart_layer_clear: { args: [FFIType.u64], returns: FFIType.i32 },
  // present_dirty: ctx, layer_handle, frame, out_image_id → i32
  vexart_layer_present_dirty: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },

  // §5.8 Resource manager (Phase 2b Slice 6)
  vexart_resource_get_stats:  { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_resource_set_budget: { args: [FFIType.u64, FFIType.u32],                          returns: FFIType.i32 },
  vexart_image_asset_register: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  vexart_image_asset_touch: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64], returns: FFIType.i32 },
  vexart_image_asset_release: { args: [FFIType.u64, FFIType.u64, FFIType.u64], returns: FFIType.i32 },
  vexart_canvas_display_list_update: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_canvas_display_list_touch: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64], returns: FFIType.i32 },
  vexart_canvas_display_list_release: { args: [FFIType.u64, FFIType.u64, FFIType.u64], returns: FFIType.i32 },

  // §5.9 Font system — MSDF text pipeline (Phase 2b / DEC-008)
  // NOTE: These symbols are loaded lazily via a separate dlopen call (MSDF_FONT_SYMBOLS)
  // to maintain backward compatibility with dylibs that don't have them.
  // See openMsdfFontSymbols() below.

  // §5.7 Error retrieval
  vexart_get_last_error_length: { args: [],                     returns: FFIType.u32 },
  vexart_copy_last_error:       { args: [FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
} as const satisfies Record<string, { args: FFIType[]; returns: FFIType }>

// ── Library path resolution ─────────────────────────────────────────────────

/** Resolve the platform package name for the current OS/arch. */
function platformPackageName(): string {
  const arch = process.arch
  const os = process.platform
  if (os === "darwin") return arch === "arm64" ? "@vxrt/darwin-arm64" : "@vxrt/darwin-x64"
  if (os === "linux") return arch === "arm64" ? "@vxrt/linux-arm64" : "@vxrt/linux-x64"
  return "@vxrt/win32-x64"
}

/** Ordered list of candidate paths to try when loading libvexart. */
function candidateLibPaths(): string[] {
  const ext = suffix // "dylib" on macOS, "so" on Linux, "dll" on Windows
  const libName = `libvexart.${ext}`
  const cwd = process.cwd()

  // 1. Platform package in node_modules (npm/bun install)
  const pkgName = platformPackageName()
  const nmPaths = [
    join(cwd, "node_modules", pkgName, libName),
    join(import.meta.dir, "../../../../node_modules", pkgName, libName),
  ]

  // 2. Dev build: target/debug/ (cargo build without --release)
  const devPath = join(import.meta.dir, "../../../../target/debug", libName)
  const cwdDevPath = join(cwd, "target/debug", libName)

  // 3. Dev build: native/libvexart/target/release (cargo build --release)
  const releasePath = join(import.meta.dir, "../../../../native/libvexart/target/release", libName)

  // 4. Legacy dist build: vendor/vexart/${platform}/libvexart.{dylib,so,dll}
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const vendorPlatform = `${arch}-${process.platform}`
  const vendorPath = join(import.meta.dir, "../../../vendor/vexart", vendorPlatform, libName)
  const cwdVendorPath = join(cwd, "vendor/vexart", vendorPlatform, libName)

  const candidates = [...nmPaths, devPath, cwdDevPath, releasePath, vendorPath, cwdVendorPath]
  const seen = new Set<string>()
  const existing: string[] = []
  const missing: string[] = []
  for (const path of candidates) {
    if (seen.has(path)) continue
    seen.add(path)
    if (existsSync(path)) existing.push(path)
    else missing.push(path)
  }

  // Prefer all existing paths first, then missing ones for clearer final error.
  return [...existing, ...missing]
}

// ── Lazy singleton ──────────────────────────────────────────────────────────

// WARNING: Module-level singleton — prevents multi-loop usage.
let _lib: ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> | null = null
// WARNING: Module-level singleton — prevents multi-loop usage.
let _rawLib: ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> | null = null
let ffiCallCount = 0
const ffiCallCountsBySymbol = new Map<string, number>()
const FFI_DEBUG = process.env.VEXART_DEBUG_FFI === "1"

function instrumentSymbols(symbols: ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>>["symbols"]) {
  const wrapped: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(symbols)) {
    wrapped[name] = (...args: unknown[]) => {
      ffiCallCount += 1
      ffiCallCountsBySymbol.set(name, (ffiCallCountsBySymbol.get(name) ?? 0) + 1)
      return (value as (...inner: unknown[]) => unknown)(...args)
    }
  }
  return wrapped as ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>>["symbols"]
}

export function getVexartFfiCallCount() {
  return ffiCallCount
}

export function getVexartFfiCallCountsBySymbol() {
  return new Map(ffiCallCountsBySymbol)
}

export function resetVexartFfiCallCounts() {
  ffiCallCount = 0
  ffiCallCountsBySymbol.clear()
}

/**
 * Open the vexart native library.
 *
 * @public
 */
export function openVexartLibrary(): ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> {
  if (_lib) return _lib

  const attempts: string[] = []
  for (const path of candidateLibPaths()) {
    try {
      _rawLib = dlopen(path, VEXART_SYMBOLS)
      if (FFI_DEBUG) {
        _lib = {
          symbols: instrumentSymbols(_rawLib.symbols),
          close: () => _rawLib?.close(),
        } as ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>>
      } else {
        _lib = _rawLib
      }
      return _lib
    } catch (e) {
      attempts.push(`${path} => ${(e as Error).message}`)
    }
  }
  throw new VexartNativeError(-1, `failed to open libvexart: ${attempts.join(" | ") || "unknown error"}`)
}

/** Close the library (if open) and reset the singleton. */
/** @public */
export function closeVexartLibrary(): void {
  if (_lib) {
    _rawLib?.close()
    _lib = null
    _rawLib = null
  }
}
