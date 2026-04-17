// @tge/components — shim: re-exports from @vexart/primitives and @vexart/headless
// This shim exists during the Phase 1 migration and will be removed in slice 14.
export * from "@vexart/primitives"
export * from "@vexart/headless"
// Re-export ScrollHandle from renderer for convenience (preserved from original barrel)
export type { ScrollHandle } from "@tge/renderer-solid"
