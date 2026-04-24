# Tasks: Phase 4a — Native Layout / Hit-Test / Focus / Pointer Cutover

## 1. Audit Baseline

- [x] 1.1 Inventory current ownership in `packages/engine/src/loop/layout.ts`, `composite.ts`, `loop.ts`, and `ffi/native-scene*.ts`; mark what is native-owned vs JS callback shell vs compat fallback.
- [x] 1.2 Record the Phase 3c baseline behavior in `openspec/changes/phase-4a-native-layout-hit-test-cutover/proposal.md` and note any missing design artifact assumptions.
- [x] 1.3 Add an implementation checklist in the change notes for layout, interaction, focus, and residual TS paths.

## 2. Native Layout Ownership

- [x] 2.1 Route `nativeSceneLayout` frames through `vexart_scene_layout_compute` as the source of truth and remove TS post-hoc layout sync from the native path in `packages/engine/src/loop/layout.ts`.
- [x] 2.2 Keep compat layout intact behind the fallback flag, but isolate it so the retained path does not dual-write native layout state.
- [ ] 2.3 Extend `packages/engine/src/ffi/native-scene-layout-parity.test.ts` with nested scroll, floating/absolute, wrap, border/padding, and alignment fixtures. (Nested scroll and border/padding landed; multiline text remains todo due native text wrap mismatch; floating/absolute still needs fixture.)

## 3. Native Interactive State And Event Dispatch

- [x] 3.1 Move retained-path hover/active/mouse record consumption into `packages/engine/src/loop/layout.ts` and `composite.ts` so TS only dispatches native event records.
- [x] 3.2 Add/adjust native event record types in `packages/engine/src/ffi/native-scene-events.ts` and wrapper wiring in `packages/engine/src/ffi/native-scene.ts`.
- [x] 3.3 Update `native/libvexart/src/scene.rs` to emit hover/active/mouse records and preserve scroll culling, pointer capture, passthrough, and min hit-area behavior.

## 4. Focus And Key Ownership Boundary

- [x] 4.1 Document the split: Rust owns focus order/traversal, TS owns focused ID and `onKeyDown` dispatch in `packages/engine/src/reconciler/focus.ts`.
- [x] 4.2 Verify `nativeEventDispatch` Tab / Shift-Tab traversal still updates TS focus state without moving key handling out of the JS callback shell.

## 5. TS Fallback Isolation

- [x] 5.1 Annotate retained TS branches in `packages/engine/src/loop/layout.ts`, `reconciler/hit-test.ts`, and related helpers as `JS-CALLBACK-SHELL`, `COMPAT-FALLBACK`, or `TEST-PATH`.
- [x] 5.2 Ensure fallback paths remain reachable when `nativeSceneLayout` or `nativeEventDispatch` is disabled, with no behavior change to compat mode.

## 6. Parity, Performance, And Verification

- [x] 6.1 Add parity cases in `packages/engine/src/ffi/native-scene.test.ts` for hover, active, press chain, focus traversal, pointer capture, passthrough, and offscreen scroll culling.
- [x] 6.2 Add retained-vs-compat performance/observability checks for frame time and native event record volume in the existing test harness.
- [x] 6.3 Write the verify report and update `openspec/changes/phase-4a-native-layout-hit-test-cutover/proposal.md` with results, gaps, and rollback notes.
