/**
 * LightCode GPU harness.
 *
 * Preserves `examples/lightcode.tsx` as the CPU-first reference demo and
 * forces the WGPU canvas backend in this separate entrypoint.
 *
 * Run: bun --conditions=browser run examples/lightcode-gpu.tsx
 */

process.env.LIGHTCODE_CANVAS_BACKEND = "wgpu"
process.env.TGE_RENDERER_BACKEND = "gpu"

await import("./lightcode")
