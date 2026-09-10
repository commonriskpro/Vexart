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
import { createRequire } from "node:module"
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
  vexart_composite_target_set_scissor:  { args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_target_reset_scissor:{ args: [FFIType.u64, FFIType.u64],                                        returns: FFIType.i32 },
  // §5.4 Composite — image ops (Phase 2b)
  vexart_composite_render_image_layer:  { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_render_image_transform_layer: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_update_uniform: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  vexart_composite_copy_region_to_image:{ args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_image_filter_backdrop:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_image_mask_rounded_rect:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.ptr],           returns: FFIType.i32 },
  // Region variant: rect params + mask rect (10 × f32) for cropped source
  // images. Kept internal so a clipped image can preserve its original box
  // radius without allocating a full-width intermediate target.
  vexart_composite_image_mask_rounded_rect_region:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
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
  vexart_image_asset_register: { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
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
  if (os === "darwin") return arch === "arm64" ? "@vexart-native/darwin-arm64" : "@vexart-native/darwin-x64"
  if (os === "linux") return arch === "arm64" ? "@vexart-native/linux-arm64" : "@vexart-native/linux-x64"
  return "@vexart-native/win32-x64"
}

/**
 * Resolve the platform package relative to this module, not process.cwd().
 *
 * A consumer can launch a package entrypoint by absolute path while its cwd is
 * unrelated to the installed package. `createRequire(import.meta.url)` keeps
 * Node and Bun's package resolution anchored to the engine bundle in that case.
 */
function resolvePlatformPackagePath(pkgName: string, libName: string): string | undefined {
  try {
    const resolved = createRequire(import.meta.url).resolve(`${pkgName}/${libName}`)
    return existsSync(resolved) ? resolved : undefined
  } catch {
    return undefined
  }
}

/** Ordered list of candidate paths to try when loading libvexart. */
export function candidateLibPaths(): string[] {
  const ext = suffix // "dylib" on macOS, "so" on Linux, "dll" on Windows
  const libName = `libvexart.${ext}`
  const cwd = process.cwd()

  // 1. Platform package in node_modules (npm/bun install)
  const pkgName = platformPackageName()
  const resolvedPackagePath = resolvePlatformPackagePath(pkgName, libName)
  const nmPaths = [
    ...(resolvedPackagePath ? [resolvedPackagePath] : []),
    join(cwd, "node_modules", pkgName, libName),
    join(import.meta.dir, "../../../../node_modules", pkgName, libName),
  ]

  // 2. Workspace release build: target/release/ (cargo build --release)
  const wsReleasePath = join(import.meta.dir, "../../../../target/release", libName)
  const cwdReleasePath = join(cwd, "target/release", libName)

  // 3. Dev build: target/debug/ (cargo build without --release)
  const devPath = join(import.meta.dir, "../../../../target/debug", libName)
  const cwdDevPath = join(cwd, "target/debug", libName)

  // 4. Per-crate release build: native/libvexart/target/release/
  const crateReleasePath = join(import.meta.dir, "../../../../native/libvexart/target/release", libName)

  // 5. Legacy dist build: vendor/vexart/${platform}/libvexart.{dylib,so,dll}
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const vendorPlatform = `${arch}-${process.platform}`
  const vendorPath = join(import.meta.dir, "../../../vendor/vexart", vendorPlatform, libName)
  const cwdVendorPath = join(cwd, "vendor/vexart", vendorPlatform, libName)

  const workspacePaths = [wsReleasePath, cwdReleasePath, devPath, cwdDevPath]
  const fallbackPaths = [crateReleasePath, vendorPath, cwdVendorPath]
  // A local build is the source of truth while developing the workspace. In
  // particular, do not let a stale platform package in node_modules hide a
  // freshly built target/release (or target/debug) dylib. Consumers installed
  // from a package have no workspace artifact, so they retain package-first
  // resolution and the same vendor fallback as before.
  const candidates = workspacePaths.some((path) => existsSync(path))
    ? [...workspacePaths, ...nmPaths, ...fallbackPaths]
    : [...nmPaths, ...workspacePaths, ...fallbackPaths]
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const path of candidates) {
    if (seen.has(path)) continue
    seen.add(path)
    ordered.push(path)
  }
  return ordered
}

// ── Lazy singleton ──────────────────────────────────────────────────────────

// WARNING: Module-level singleton — prevents multi-loop usage.
let _lib: ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> | null = null
// WARNING: Module-level singleton — prevents multi-loop usage.
let _rawLib: ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> | null = null
let _libPath: string | null = null
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
      _libPath = path
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
    _libPath = null
  }
  _msdfLib = null
  _kittyPlaceholderLib?.close()
  _kittyPlaceholderLib = null
  _kittyShmLib?.close()
  _kittyShmLib = null
  _kittyShmCleanupLib?.close()
  _kittyShmCleanupLib = null
}

// ── MSDF Font symbols (lazy-loaded for backward compatibility) ──────────────

/** @public */
export const MSDF_FONT_SYMBOLS = {
  // font_init: () → i32 (face count or negative on error)
  vexart_font_init: { args: [], returns: FFIType.i32 },
  // font_query: families_ptr, families_len, weight, italic, out_handle → i32
  vexart_font_query: { args: [FFIType.ptr, FFIType.u32, FFIType.u16, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // font_render_text: ctx, target, text_ptr, text_len, params_ptr, params_len, stats_out → i32
  vexart_font_render_text: { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  // font_measure: text_ptr, text_len, families_ptr, families_len, font_size, weight, italic, out_w, out_h → i32
  vexart_font_measure: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.f32, FFIType.u16, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
} as const satisfies Record<string, { args: FFIType[]; returns: FFIType }>

let _msdfLib: ReturnType<typeof dlopen<typeof MSDF_FONT_SYMBOLS>> | null = null

/**
 * Try to open MSDF font symbols from the already-loaded libvexart.
 * Returns null if the dylib doesn't export them (backward compat).
 *
 * @public
 */
export function openMsdfFontSymbols(): ReturnType<typeof dlopen<typeof MSDF_FONT_SYMBOLS>>["symbols"] | null {
  if (_msdfLib) return _msdfLib.symbols
  // The main library must be opened first to get the path.
  const mainLib = openVexartLibrary()
  if (!mainLib) return null
  // Re-dlopen the same dylib with just the font symbols.
  for (const path of candidateLibPaths()) {
    try {
      _msdfLib = dlopen(path, MSDF_FONT_SYMBOLS)
      return _msdfLib.symbols
    } catch {
      // This dylib doesn't have font symbols — try next or give up.
    }
  }
  return null
}

// ── tmux Kitty placeholder symbols (lazy-loaded for backward compatibility) ─

/**
 * Native symbols for the tmux Kitty Unicode-placeholder presenter.
 *
 * These are deliberately kept out of VEXART_SYMBOLS. The mandatory symbol
 * set is also used with older published libvexart binaries, while the
 * placeholder ABI is only available in newer native builds.
 */
export const KITTY_PLACEHOLDER_SYMBOLS = {
  // emit_placeholder_frame: ctx, target, image_id, cols, rows, stats_out → i32
  vexart_kitty_emit_placeholder_frame: {
    args: [FFIType.u64, FFIType.u64, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.i32,
  },
  // delete_placeholder: ctx, image_id → i32
  vexart_kitty_delete_placeholder: {
    args: [FFIType.u64, FFIType.u32],
    returns: FFIType.i32,
  },
} as const satisfies Record<string, { args: FFIType[]; returns: FFIType }>

let _kittyPlaceholderLib: ReturnType<typeof dlopen<typeof KITTY_PLACEHOLDER_SYMBOLS>> | null = null

/**
 * Try to open the tmux placeholder symbols from libvexart.
 *
 * Returns null when the loaded native library predates the placeholder ABI;
 * callers that require the feature should report an actionable rebuild error.
 */
export function openKittyPlaceholderSymbols(): ReturnType<typeof dlopen<typeof KITTY_PLACEHOLDER_SYMBOLS>>["symbols"] | null {
  if (_kittyPlaceholderLib) return _kittyPlaceholderLib.symbols
  // Ensure the mandatory library is loaded first and, most importantly, that
  // the placeholder handle resolves the same candidate selected for context
  // creation. Loading a second candidate would make its symbols incompatible
  // with the context owned by the mandatory handle.
  openVexartLibrary()
  const paths = _libPath ? [_libPath] : candidateLibPaths()
  for (const path of paths) {
    try {
      _kittyPlaceholderLib = dlopen(path, KITTY_PLACEHOLDER_SYMBOLS)
      return _kittyPlaceholderLib.symbols
    } catch {
      // Old libvexart builds simply do not export this optional ABI.
    }
  }
  return null
}

// ── tmux Kitty SHM placeholder symbols (lazy-loaded) ───────────────────────

/**
 * Native symbols for the production tmux SHM placeholder presenter.
 *
 * This group is intentionally loaded separately from VEXART_SYMBOLS.  The
 * regular library ABI remains usable with published binaries that predate
 * the tmux SHM presenter; a tmux backend reports an actionable rebuild error
 * when this optional group is unavailable.
 */
export const KITTY_SHM_SYMBOLS = {
  // emit_placeholder_shm_frame: ctx, target, params(20 bytes), params_len,
  // out_handle, stats_out → i32
  vexart_kitty_emit_placeholder_shm_frame: {
    args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  // shm_is_consumed: 1=terminal read/unlinked, 0=still present, negative=error
  vexart_kitty_shm_is_consumed: {
    args: [FFIType.u64],
    returns: FFIType.i32,
  },
  // shm_release: close the registry handle and optionally unlink the name.
  vexart_kitty_shm_release: {
    args: [FFIType.u64, FFIType.u32],
    returns: FFIType.i32,
  },
} as const satisfies Record<string, { args: FFIType[]; returns: FFIType }>

let _kittyShmLib: ReturnType<typeof dlopen<typeof KITTY_SHM_SYMBOLS>> | null = null

/**
 * Open the tmux SHM placeholder symbols from the same native library selected
 * by openVexartLibrary(). Returns null for old native binaries.
 */
export function openKittyShmSymbols(): ReturnType<typeof dlopen<typeof KITTY_SHM_SYMBOLS>>["symbols"] | null {
  if (_kittyShmLib) return _kittyShmLib.symbols
  openVexartLibrary()
  const paths = _libPath ? [_libPath] : candidateLibPaths()
  for (const path of paths) {
    try {
      _kittyShmLib = dlopen(path, KITTY_SHM_SYMBOLS)
      return _kittyShmLib.symbols
    } catch {
      // Published libraries without the SHM placeholder ABI are valid for
      // non-tmux rendering; the caller decides whether this is fatal.
    }
  }
  return null
}

// ── Kitty SHM cleanup symbols (lazy-loaded) ─────────────────────────────────

/** @public */
export const KITTY_SHM_CLEANUP_SYMBOLS = {
  vexart_kitty_shm_cleanup_all: {
    args: [],
    returns: FFIType.i32,
  },
} as const satisfies Record<string, { args: FFIType[]; returns: FFIType }>

let _kittyShmCleanupLib: ReturnType<typeof dlopen<typeof KITTY_SHM_CLEANUP_SYMBOLS>> | null = null

/**
 * Open the Kitty SHM cleanup symbols from the same native library selected
 * by openVexartLibrary(). Returns null for old native binaries.
 *
 * @public
 */
export function openKittyShmCleanupSymbols(): ReturnType<typeof dlopen<typeof KITTY_SHM_CLEANUP_SYMBOLS>>["symbols"] | null {
  if (_kittyShmCleanupLib) return _kittyShmCleanupLib.symbols
  try {
    openVexartLibrary()
  } catch {
    return null
  }
  const paths = _libPath ? [_libPath] : candidateLibPaths()
  for (const path of paths) {
    try {
      _kittyShmCleanupLib = dlopen(path, KITTY_SHM_CLEANUP_SYMBOLS)
      return _kittyShmCleanupLib.symbols
    } catch {
      // Old libvexart builds without the SHM cleanup export.
    }
  }
  return null
}

/**
 * Clean up all POSIX SHM handles owned by the native layer.
 * Returns the number of segments cleaned up, or 0 if unavailable.
 *
 * @public
 */
export function vexartKittyShmCleanupAll(): number {
  try {
    const symbols = openKittyShmCleanupSymbols()
    if (!symbols) return 0
    return symbols.vexart_kitty_shm_cleanup_all() as number
  } catch {
    return 0
  }
}
