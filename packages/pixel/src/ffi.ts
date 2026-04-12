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
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const target = `${arch}-${process.platform}`
  const candidates = [
    // npm package: vendor/tge/{arch}-{platform}/
    resolve(import.meta.dir, "vendor/tge", target, name),
    // monorepo development
    resolve(import.meta.dir, "../../../zig/zig-out/lib", name),
    resolve(process.cwd(), "zig/zig-out/lib", name),
  ]
  for (const path of candidates) {
    try { if (Bun.file(path).size > 0) return path } catch {}
  }
  return candidates[0]
}

// All functions use ≤8 params. Spatial/extra params packed via pointer (ARM64 ABI safety).
// Pattern: (data, width, height, color?, ...minimal, params_ptr)
const P = FFIType.ptr
const U = FFIType.u32

const FFI_DEFS = {
  // Rect — fill_rect is exactly 8 params (no packing needed)
  tge_fill_rect:              { args: [P, U, U, FFIType.i32, FFIType.i32, U, U, U], returns: FFIType.void },
  // (data, w, h, color, params_ptr)  — 5 params
  tge_rounded_rect:           { args: [P, U, U, U, P], returns: FFIType.void },
  tge_stroke_rect:            { args: [P, U, U, U, P], returns: FFIType.void },
  tge_rounded_rect_corners:   { args: [P, U, U, U, P], returns: FFIType.void },
  tge_stroke_rect_corners:    { args: [P, U, U, U, P], returns: FFIType.void },
  // Circle — filled is exactly 8 params (no packing needed)
  tge_filled_circle:          { args: [P, U, U, FFIType.i32, FFIType.i32, U, U, U], returns: FFIType.void },
  // (data, w, h, color, params_ptr)  — 5 params
  tge_stroked_circle:         { args: [P, U, U, U, P], returns: FFIType.void },
  // Line — (data, w, h, color, params_ptr)  — 5 params
  tge_line:                   { args: [P, U, U, U, P], returns: FFIType.void },
  tge_bezier:                 { args: [P, U, U, U, P], returns: FFIType.void },
  // Shadow — (data, w, h, params_ptr)  — 4 params
  tge_blur:                   { args: [P, U, U, P], returns: FFIType.void },
  // Inset shadow — (data, w, h, color, params_ptr)  — 5 params
  tge_inset_shadow:           { args: [P, U, U, U, P], returns: FFIType.void },
  // Halo — (data, w, h, color, params_ptr)  — 5 params
  tge_halo:                   { args: [P, U, U, U, P], returns: FFIType.void },
  // Gradient — (data, w, h, color0, params_ptr)  — 5 params
  tge_linear_gradient:        { args: [P, U, U, U, P], returns: FFIType.void },
  // radial_gradient is exactly 8 params (no packing needed)
  tge_radial_gradient:        { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  // Multi-stop — (data, w, h, stops_ptr, stop_count, params_ptr)  — 6 params
  tge_linear_gradient_multi:  { args: [P, U, U, P, U, P], returns: FFIType.void },
  // radial_gradient_multi is exactly 8 params (no packing needed)
  tge_radial_gradient_multi:  { args: [P, U, U, U, U, U, P, U], returns: FFIType.void },
  tge_conic_gradient:         { args: [P, U, U, P, U, P], returns: FFIType.void },
  tge_gradient_stroke:        { args: [P, U, U, P, U, P], returns: FFIType.void },
  // Backdrop filters — in-place region operations (all exactly 8 params)
  tge_filter_brightness:      { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  tge_filter_contrast:        { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  tge_filter_saturate:        { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  tge_filter_grayscale:       { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  tge_filter_invert:          { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  tge_filter_sepia:           { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  tge_filter_hue_rotate:      { args: [P, U, U, U, U, U, U, U], returns: FFIType.void },
  // Blend modes — (data, w, h, color, mode, params_ptr)  — 6 params
  tge_blend_mode:             { args: [P, U, U, U, FFIType.u8, P], returns: FFIType.void },
  // Text — exactly 8 params (no packing needed)
  tge_draw_text:              { args: [P, U, U, FFIType.i32, FFIType.i32, P, U, U], returns: FFIType.void },
  tge_measure_text:           { args: [U], returns: U },
  // Runtime font atlas — load is 6 params (fine)
  tge_load_font_atlas:        { args: [U, P, U, U, U, P], returns: FFIType.void },
  // (data, w, h, text_ptr, text_len, color, params_ptr)  — 7 params
  tge_draw_text_font:         { args: [P, U, U, P, U, U, P], returns: FFIType.void },
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
