# Tasks: Phase 4d — Native Canvas Display List API

## 1. Baseline

- [ ] 1.1 Inventory `CanvasContext` command types and current backend consumption.
- [ ] 1.2 Define supported display-list command subset and non-goals.

## 2. Serialization

- [ ] 2.1 Add deterministic TS serialization for `CanvasContext` commands.
- [ ] 2.2 Add hashing/versioning to avoid redundant native uploads.
- [ ] 2.3 Add tests for stable serialization.

## 3. Native Registry

- [ ] 3.1 Add Rust display-list registry and FFI update/release functions.
- [ ] 3.2 Track display-list memory in resource stats.
- [ ] 3.3 Attach display-list handles to native canvas scene nodes.

## 4. Render Integration

- [ ] 4.1 Extend native render graph canvas ops with display-list handles.
- [ ] 4.2 Prefer native replay in the native render path.
- [ ] 4.3 Preserve JS callback fallback for native-disabled/offscreen/test paths.

## 5. Verification

- [ ] 5.1 Add Rust registry tests.
- [ ] 5.2 Add TS display-list bridge tests.
- [ ] 5.3 Run typecheck, Bun tests, visual native render graph, perf, and API gate.
