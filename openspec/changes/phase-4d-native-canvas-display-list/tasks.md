# Tasks: Phase 4d — Native Canvas Display List API

## 1. Baseline

- [x] 1.1 Inventory `CanvasContext` command types and current backend consumption.
- [x] 1.2 Define supported display-list command subset and non-goals.

## 2. Serialization

- [x] 2.1 Add deterministic TS serialization for `CanvasContext` commands.
- [x] 2.2 Add hashing/versioning to avoid redundant native uploads.
- [x] 2.3 Add tests for stable serialization.

## 3. Native Registry

- [x] 3.1 Add Rust display-list registry and FFI update/release functions.
- [x] 3.2 Track display-list memory in resource stats.
- [x] 3.3 Attach display-list handles to native canvas scene nodes.

## 4. Render Integration

- [x] 4.1 Extend native render graph canvas ops with display-list handles.
- [x] 4.2 Prefer native display-list handles in the native render path metadata.
- [x] 4.3 Preserve JS callback fallback for native-disabled/offscreen/test paths.

## 5. Verification

- [x] 5.1 Add Rust registry tests.
- [x] 5.2 Add TS display-list bridge tests.
- [x] 5.3 Run typecheck, Bun tests, visual native render graph, perf, and API gate.
