# Tasks: Phase 3b — Native Scene Graph Skeleton

## 1. Rust Scene Core

- [x] 1.1 Add scene graph core (implemented in `native/libvexart/src/scene.rs`).
- [x] 1.2 Implement scene create/destroy/clear lifecycle.
- [x] 1.3 Implement native node create/destroy/insert/remove/reorder invariants.
- [x] 1.4 Add Rust unit tests for subtree destroy and child ordering.

## 2. Prop And Text Encoding

- [x] 2.1 Generate or define stable prop IDs from `TGEProps`.
- [x] 2.2 Add Rust prop decoder with typed value tags.
- [x] 2.3 Add TS prop encoder.
- [x] 2.4 Add text content setter path.
- [x] 2.5 Add decoder/encoder parity tests (covered by Rust prop decode tests + TS/native scene parity tests).

## 3. Reconciler Mirroring

- [x] 3.1 Add native node handle wrapper behind `nativeSceneGraph`.
- [x] 3.2 Mirror create/insert/remove/update/text operations from Solid renderer.
- [x] 3.3 Keep TS `TGENode` compatibility mirror for current rendering.

## 4. Verification

- [x] 4.1 Add fixture UI snapshots and compare TS tree vs Rust scene snapshot.
- [ ] 4.2 Run existing examples with flag enabled and rendering unchanged.
- [x] 4.3 Record verify report with mutation parity evidence.
