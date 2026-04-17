/**
 * vexart-bridge.ts
 * bun:ffi loader for libvexart.{dylib,so,dll} — all 20 Phase 2 FFI exports.
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

/** Expected bridge version for Phase 2.0 — matches vexart_version() return value. */
export const EXPECTED_BRIDGE_VERSION = 0x00020000 as const

// ── Error class ─────────────────────────────────────────────────────────────

/** Error thrown when a vexart FFI call returns a non-zero error code. */
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

const VEXART_SYMBOLS = {
  // §5.1 Version & lifecycle
  vexart_version:           { args: [],                                        returns: FFIType.u32  },
  vexart_context_create:    { args: [FFIType.ptr, FFIType.u32, FFIType.ptr],   returns: FFIType.i32  },
  vexart_context_destroy:   { args: [FFIType.u64],                             returns: FFIType.i32  },
  vexart_context_resize:    { args: [FFIType.u64, FFIType.u32, FFIType.u32],   returns: FFIType.i32  },

  // §5.2 Layout
  vexart_layout_compute:    { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_layout_measure:    { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.f32, FFIType.ptr, FFIType.ptr],         returns: FFIType.i32 },
  vexart_layout_writeback:  { args: [FFIType.u64, FFIType.ptr, FFIType.u32],   returns: FFIType.i32  },

  // §5.3 Paint
  vexart_paint_dispatch:      { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_paint_upload_image:  { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],       returns: FFIType.i32 },
  vexart_paint_remove_image:  { args: [FFIType.u64, FFIType.u64],              returns: FFIType.i32  },

  // §5.4 Composite
  vexart_composite_merge:               { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_readback_rgba:       { args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_composite_readback_region_rgba:{ args: [FFIType.u64, FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr],          returns: FFIType.i32 },

  // §5.5 Text stubs
  vexart_text_load_atlas: { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  vexart_text_dispatch:   { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_text_measure:    { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.f32, FFIType.ptr, FFIType.ptr],           returns: FFIType.i32 },

  // §5.6 Kitty SHM transport
  vexart_kitty_shm_prepare: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  vexart_kitty_shm_release: { args: [FFIType.u64, FFIType.u32],                returns: FFIType.i32  },

  // §5.7 Error retrieval
  vexart_get_last_error_length: { args: [],                     returns: FFIType.u32 },
  vexart_copy_last_error:       { args: [FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
} as const satisfies Record<string, { args: FFIType[]; returns: FFIType }>

// ── Library path resolution ─────────────────────────────────────────────────

/** Ordered list of candidate paths to try when loading libvexart. */
function candidateLibPaths(): string[] {
  const ext = suffix // "dylib" on macOS, "so" on Linux, "dll" on Windows
  const libName = `libvexart.${ext}`

  // Dev build: target/debug/ (cargo build without --release)
  const devPath = join(import.meta.dir, "../../../../target/debug", libName)

  // Dist build: native/${platform}/libvexart.{dylib,so,dll}
  const platform = process.platform === "darwin" ? "arm64-darwin"
    : process.platform === "linux"  ? "x86_64-linux"
    : "x86_64-win"
  const prodPath = join(import.meta.dir, "../../../../native", platform, libName)

  // Prefer whichever exists; fall back to the other for dlopen error message.
  return existsSync(devPath)  ? [devPath, prodPath]
       : existsSync(prodPath) ? [prodPath, devPath]
       : [devPath, prodPath]
}

// ── Lazy singleton ──────────────────────────────────────────────────────────

let _lib: ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> | null = null

/**
 * Open the vexart native library.
 * Tries the dev build path first (target/debug/libvexart.dylib),
 * then the dist path (native/${platform}/libvexart.dylib).
 *
 * @returns { symbols, close } from bun:ffi dlopen
 * @throws VexartNativeError if neither path succeeds
 */
export function openVexartLibrary(): ReturnType<typeof dlopen<typeof VEXART_SYMBOLS>> {
  if (_lib) return _lib

  let lastErr: Error | undefined
  for (const path of candidateLibPaths()) {
    try {
      _lib = dlopen(path, VEXART_SYMBOLS)
      return _lib
    } catch (e) {
      lastErr = e as Error
    }
  }
  throw new VexartNativeError(-1, `failed to open libvexart: ${lastErr?.message ?? "unknown error"}`)
}

/** Close the library (if open) and reset the singleton. */
export function closeVexartLibrary(): void {
  if (_lib) {
    _lib.close()
    _lib = null
  }
}
