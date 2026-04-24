# Tasks: Phase 2c — Native Layer Registry

## 1. Native Registry Contract

- [x] 1.1 Define `LayerKey`, `LayerDescriptor`, `LayerRecord`, and `LayerRegistry` in Rust.
- [x] 1.2 Add resource accounting fields for layer targets and terminal images.
- [x] 1.3 Add unit tests for create/reuse/remove/dirty lifecycle.

## 2. FFI Surface

- [x] 2.1 Add `vexart_layer_upsert` export.
- [x] 2.2 Add `vexart_layer_mark_dirty` export.
- [x] 2.3 Add `vexart_layer_reuse` export.
- [x] 2.4 Add `vexart_layer_remove` export.
- [x] 2.5 Add `vexart_layer_present_dirty` export.
- [x] 2.6 Add TS FFI signatures and typed wrappers.

## 3. TS Integration

- [x] 3.1 Add `nativeLayerRegistry` feature flag and env override.
- [x] 3.2 Convert TS layer plans into native layer descriptors.
- [x] 3.3 Route native presentation through Rust layer handles.
- [x] 3.4 Keep TS layer composer as fallback only when native registry is disabled/unsupported.

## 4. Observability And Verification

- [x] 4.1 Add native layer stats to debug/resource stats.
- [x] 4.2 Add tests for layer churn, deletion, resize invalidation, and visible-layer eviction protection.
- [ ] 4.3 Run showcase parity check in Kitty-compatible terminal.
- [ ] 4.4 Update verify report with before/after layer ownership evidence.
