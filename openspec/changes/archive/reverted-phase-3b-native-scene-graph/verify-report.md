# Verify Report: Phase 3b — Native Scene Graph Skeleton

## Status

Partially implemented.

## Verified

- Added native scene graph skeleton in `native/libvexart/src/scene.rs`.
- Added FFI exports: `vexart_scene_create`, `vexart_scene_destroy`, `vexart_scene_clear`, `vexart_node_create`, `vexart_node_destroy`, `vexart_node_insert`, `vexart_node_remove`, `vexart_node_set_props`, `vexart_text_set_content`.
- Added TS scene wrappers and `nativeSceneGraph` feature flag.
- Added `_nativeId` to `TGENode` and wired the Solid reconciler to mirror create/insert/remove/prop/text operations to Rust when the flag is enabled.
- Added `vexart_scene_snapshot` export and TS snapshot wrapper for native tree inspection.
- Added native layout sync (`vexart_node_set_layout`) so the retained scene can accumulate computed layout while rendering still uses the compatibility path.
- Added Rust unit tests for insertion order, subtree destroy, and prop decoding.
- `cargo test --lib scene` passed, including hit-test/layout-backed tests.
- `tsc --noEmit` passed after TS integration.
- Added TS parity tests in `packages/engine/src/ffi/native-scene.test.ts` validating snapshot mirroring and native hit-test behavior.
- `cargo build && bun test packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts` passed.

## Required Verification

- Existing examples with `nativeSceneGraph` enabled and rendering unchanged.
- Public API compatibility check.
