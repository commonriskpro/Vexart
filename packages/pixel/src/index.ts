/**
 * @tge/pixel — Pixel buffer and SDF paint primitives.
 *
 * The heart of TGE — everything that paints pixels:
 * - PixelBuffer (RGBA array, blend, set, clear)
 * - Rounded rect (fill + stroke) with SDF anti-aliasing
 * - Ellipse (filled, stroked) with SDF
 * - Line/bezier with segment-distance SDF
 * - Box shadow with blur
 * - Linear/radial gradients
 * - Halo/glow effects
 *
 * V1: CPU (Zig shared library via bun:ffi)
 * V2: GPU optional (compute shaders, replaceable backend)
 */

// TODO: Phase 1 — port pixel primitives from LightCode TGE
export {};
