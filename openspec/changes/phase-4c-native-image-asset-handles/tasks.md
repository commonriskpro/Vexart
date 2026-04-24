# Tasks: Phase 4c — Native Image Asset Handles

## 1. Baseline

- [ ] 1.1 Inventory current image decode, cache, render queue, and GPU upload paths.
- [ ] 1.2 Define native image handle lifecycle and fallback boundary.

## 2. Native Resource API

- [ ] 2.1 Add Rust image asset registry and resource-manager integration.
- [ ] 2.2 Add FFI exports for register, touch, and release.
- [ ] 2.3 Add resource stats coverage for image assets.

## 3. TypeScript Bridge

- [ ] 3.1 Extend image cache entries with native handle metadata.
- [ ] 3.2 Register decoded RGBA buffers once per stable `src`.
- [ ] 3.3 Pass image handles through render graph image configs while preserving JS fallback buffers.

## 4. Render Integration

- [ ] 4.1 Update native render graph snapshots/ops to include image handles.
- [ ] 4.2 Prefer native handles in GPU/backend image upload paths.
- [ ] 4.3 Preserve offscreen/test fallback paths.

## 5. Verification

- [ ] 5.1 Add Rust registry/resource tests.
- [ ] 5.2 Add TS tests for handle reuse and fallback behavior.
- [ ] 5.3 Run typecheck, Bun tests, visual native render graph, perf, and API gate.
