# Tasks: Phase 4b — Native Transform-Aware Hit Testing

## 1. Baseline

- [x] 1.1 Audit the current transform fallback gate in `composite.ts` and the TS transform hit-test implementation in `layout.ts`.
- [x] 1.2 Document the transform semantics and event payload boundary.

## 2. Native Transform Math

- [x] 2.1 Add Rust matrix helpers matching `packages/engine/src/ffi/matrix.ts`.
- [x] 2.2 Parse native `transform` and `transformOrigin` JSON props.
- [x] 2.3 Compose accumulated ancestor transforms for native hit-testing.

## 3. Native Hit Testing

- [x] 3.1 Update `SceneGraph::hit_test_node()` and hovered collection to use transformed local coordinates.
- [x] 3.2 Preserve scroll viewport culling, pointer capture, passthrough, and min hit-area expansion.
- [x] 3.3 Remove the transform-specific native interaction dispatch fallback gate.

## 4. Tests And Verification

- [x] 4.1 Add Rust unit tests for transformed hit-test inclusion/exclusion.
- [x] 4.2 Add TypeScript FFI tests proving native interaction frames hit transformed nodes.
- [x] 4.3 Run Rust tests, targeted Bun tests, typecheck, visual parity, and perf gates.
