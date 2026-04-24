# Verify Report: Phase 2c — Native Layer Registry

## Status

Partially implemented.

## Verified

- Added native `LayerRegistry` in `native/libvexart/src/layer.rs` with stable keys, terminal image IDs, dirty state, size tracking, and resource accounting.
- Added `TerminalImage` resource kind and included it in resource stats serialization.
- Added FFI exports: `vexart_layer_upsert`, `vexart_layer_mark_dirty`, `vexart_layer_reuse`, `vexart_layer_remove`, `vexart_layer_clear`, `vexart_layer_present_dirty`.
- Added TS wrappers and feature flag/env override: `native-layer-registry.ts`, `native-layer-registry-flags.ts`.
- Integrated native layer upsert/present/reuse/remove in the GPU native presentation path.
- Added Rust lifecycle tests (create/reuse/resize/remove) and passed them.
- `cargo test --lib` passed with the new layer registry tests.
- `tsc --noEmit` passed after TS integration.

## Required Verification

- TS feature flag and fallback tests are partially covered (`native-layer-registry-flags.test.ts`).
- ResourceManager layer accounting includes `TerminalImage`, but end-to-end debug evidence still needs runtime capture.
- Kitty showcase visual parity check.
