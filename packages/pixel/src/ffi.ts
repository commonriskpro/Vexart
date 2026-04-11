/**
 * bun:ffi bindings to the TGE Zig shared library.
 *
 * Colors are packed as u32 RGBA (0xRRGGBBAA) across the FFI boundary
 * to keep all functions at ≤ 8 parameters. bun:ffi on ARM64 has issues
 * with >8 params due to stack ABI mismatches.
 */

import { dlopen, FFIType, ptr } from "bun:ffi"
import { resolve } from "path"

const LIB_NAMES: Record<string, string> = {
  darwin: "libtge.dylib",
  linux: "libtge.so",
  win32: "tge.dll",
}

function findLib(): string {
  const name = LIB_NAMES[process.platform] ?? "libtge.so"
  const candidates = [
    resolve(import.meta.dir, "../../../zig/zig-out/lib", name),
    resolve(process.cwd(), "zig/zig-out/lib", name),
  ]
  for (const path of candidates) {
    try { if (Bun.file(path).size > 0) return path } catch {}
  }
  return candidates[0]
}

const FFI_DEFS = {
  // Rect (8 params max)
  tge_fill_rect:      { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  tge_rounded_rect:   { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  tge_stroke_rect:    { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  // Circle
  tge_filled_circle:  { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  tge_stroked_circle: { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  // Line
  tge_line:           { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  tge_bezier:         { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  // Shadow
  tge_blur:           { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  // Halo
  tge_halo:           { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  // Gradient
  tge_linear_gradient: { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
  tge_radial_gradient: { args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u32], returns: FFIType.void },
} as const

let lib: ReturnType<typeof dlopen<typeof FFI_DEFS>> | null = null

export function loadLib() {
  if (lib) return lib
  const path = findLib()
  lib = dlopen(path, FFI_DEFS)
  return lib
}

/** Get the buffer reference for FFI calls. bun:ffi accepts TypedArray directly for ptr params. */
export function bufPtr(data: Uint8Array): Uint8Array {
  return data
}

/** Pack r,g,b,a into u32 RGBA for FFI. */
export function packColor(r: number, g: number, b: number, a: number): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}
