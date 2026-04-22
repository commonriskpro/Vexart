// @vexart/engine public API — populated during slices 3-13
export * from "./ffi/index"
export * from "./reconciler/index"
export * from "./loop/index"
export * from "./input/index"
export * from "./terminal/index"
export * from "./output/index"
export * from "./mount"
// paint-legacy exports removed — Phase 2 Slice 11G (DEC-004).
// All CPU paint paths deleted. Use vexart_paint_dispatch for GPU rendering.
