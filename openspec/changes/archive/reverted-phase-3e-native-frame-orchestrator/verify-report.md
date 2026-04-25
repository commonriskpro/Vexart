# Verify Report: Phase 3e — Native Frame Orchestrator

## Status

Implemented.

## Verified

- Added `native/libvexart/src/frame.rs` with `NativeFrameStrategy`, packed planner input/output structs, reason flags, and `choose_frame_strategy()`.
- Added `vexart_frame_choose_strategy` FFI export so TS can ask Rust to choose between `skip-present`, `layered-dirty`, `layered-region`, and `final-frame` from current frame telemetry.
- Added `packages/engine/src/ffi/native-frame-orchestrator.ts` as the TS wrapper for the packed planner input/output.
- Updated `packages/engine/src/ffi/gpu-layer-strategy.ts` so public/backend strategy names now align with the native planner (`skip-present`, `layered-dirty`, `layered-region`, `final-frame`) instead of mapping everything back to legacy labels.
- Updated `packages/engine/src/ffi/gpu-renderer-backend.ts` so begin-frame strategy choice is Rust-owned, `skip-present` short-circuits paint work, `layered-region` prefers native region emission, `layered-dirty` prefers full-layer emission, and `final-frame` drives full-frame composition/presentation.
- Updated `packages/engine/src/loop/paint.ts` so frame-plan metadata flows through the paint path and `skip-present` can bypass layer paint/reuse work while still honoring orphan cleanup.
- Exposed native frame planner reason flags through `packages/engine/src/loop/debug.ts` so debug output explains WHY a given native frame strategy was chosen.
- Added structured native frame execution stats in `packages/engine/src/ffi/native-frame-orchestrator.ts` / `packages/engine/src/loop/debug.ts`, covering strategy, reason flags, dirty/full-repaint shape, reuse/repaint counters, resource totals, output mode, and native presentation stats.
- Wired compositor descriptor plumbing into production code: `createTransition` / `createSpring` now accept optional compositor metadata, reconciler prop/subtree mutations feed compositor fallback tracking, and `isCompositorOnlyFrame()` now reflects real descriptor cleanliness instead of always returning false.
- Added a compositor-only retained composition path in `packages/engine/src/loop/composite.ts` plus backend support in `packages/engine/src/ffi/gpu-renderer-backend.ts`, so qualifying transform/opacity animation frames can skip walk/layout/assign/paint and composite existing retained layer targets directly.
- Added a dedicated native retained transform/opacity composite export `vexart_composite_update_uniform` in `native/libvexart/src/lib.rs` / `native/libvexart/src/composite/mod.rs`, and updated the GPU backend to use it so compositor-only retained frames no longer need per-layer GPU target → image copies before transform composition.
- Added `packages/engine/src/loop/composite.test.ts` to verify compositor-only retained composition bypasses layer paint calls.
- Added per-frame FFI call instrumentation in `packages/engine/src/ffi/vexart-bridge.ts`, surfaced counts in structured frame stats/debug, and used it to verify no-op and dirty-frame call budgets.
- Added `packages/engine/src/loop/frame-orchestrator.test.ts` to cover dirty-frame FFI budget, resize invalidation, and low-budget resource-pressure survival.
- Added `scripts/frame-orchestrator-bench.ts` and `package.json` script `perf:frame-orchestrator` to benchmark no-op and dirty frame FFI counts directly.
- Updated offscreen test harness `packages/engine/src/testing/render-to-buffer.ts` to capture layered payloads as a fallback, keeping visual verification stable even when the orchestrator does not return a final-frame buffer.
- Added Rust unit tests for no-damage skip, transform-heavy final-frame, small-SHM layered-region, and hysteresis retention.
- Added TS tests for the native frame planner wrapper, structured frame stats helpers, and the current backend-strategy mapping.
- `cargo build && cargo test --lib && bun test && bun --conditions=browser run scripts/frame-orchestrator-bench.ts && bun run typecheck` passed after the full 3e close-out work.

## Completion Notes

- No-op frame benchmark now records `0` FFI calls in the benchmark harness.
- Dirty frame benchmark now records `6` FFI calls in both direct and SHM modes, meeting the PRD Phase 6 target.
- Compositor-only retained frames now avoid walk/layout/assign/paint in production and use native retained transform/opacity composition.
- JS remains the control-plane shell for Solid reactivity, callbacks, and mutation handoff by design; Phase 6 completion means frame-strategy and present lifecycle ownership are native, not that the public JS runtime disappears.
