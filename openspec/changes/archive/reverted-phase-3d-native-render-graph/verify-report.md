# Verify Report: Phase 3d — Native Render Graph And Pipeline Batching

## Status

In progress.

## Verified

- Added `native/libvexart/src/render_graph/mod.rs` with native render op types and scene-to-op conversion for initial `rect`, `border`, and `text` coverage.
- Expanded native render graph snapshot coverage to include `effect`, `image`, and `canvas` ops plus material keys.
- Expanded native render graph snapshot metadata to expose semantic effect reachability (`gradient`, `shadow`, `glow`, `filter`, `backdrop`, `transform`, `opacity`).
- Added native batching/grouping by material key for the snapshot path.
- Added `nativeRenderGraph` flag wiring and a paint-path translator that can consume native render graph snapshots for covered layers.
- Added safe fallback to TS render graph generation when a layer contains op kinds the native paint-path translator does not fully cover yet.
- Expanded the paint-path native render graph gate to allow covered `effect`, `image`, and `canvas` layers in addition to basic rect/border/text layers.
- Added direct effect translation from native snapshot metadata for simple non-transform effect ops, reducing dependence on the TS effect queue on covered layers.
- Added transform-matrix reconstruction from native snapshot payloads so some transform-bearing effect ops can also translate through the native paint-path bridge.
- Added explicit paint-path gating tests so the partial TS render graph cutback is now directly verifiable, not just inferred from showcase smoke.
- Replaced whole-layer native gating with mixed command-level translation: layers can now use native render graph effect translation while uncovered commands in the same layer still fall back through the TS render-graph builder.
- Added clip-aware native backdrop metadata reconstruction so direct native effect translation no longer drops scissor-derived backdrop bounds/state.
- Added native render graph translation coverage stats so the paint path now reports fully-covered native layers separately from mixed native/TS fallback layers.
- Added coverage tests that prove partial native coverage remains allowed for compatibility while being explicitly marked as not fully covered.
- Added `vexart_scene_paint_dispatch`, which lowers selected retained scene render ops in Rust into the packed paint graph consumed by `PaintContext::dispatch`.
- Added direct scene-paint backend integration so supported fully-covered rect/border/simple-effect layers can skip TS `RenderGraphOp` creation and JS `cmd_kind` packing.
- Added direct scene-paint eligibility tests that reject unsupported text/image/canvas/advanced-effect layers back to the existing TS fallback.
- Expanded direct scene-paint lowering to linear gradients, radial gradients, analytic shadows, and glow.
- Unblocked `cmd_kind=20` in `PaintContext::dispatch`, so the analytic shadow pipeline is no longer skipped by the packed paint dispatcher.
- Added direct scene-paint text glyph batching from retained native text ops using the Rust atlas registry and `vexart_text_dispatch`.
- Added direct scene-paint native-image dispatch for retained image ops that already have Rust GPU image handles.
- Added explicit direct-ref fallback gating tests for image ops without native handles plus canvas callbacks, backdrop/filter semantics, transforms, and rounded-image masking.
- Added `vexart_scene_render_graph_snapshot` so TS can inspect the native render graph snapshot generated from retained scene + layout data.
- Added TS wrapper `packages/engine/src/ffi/native-render-graph.ts`.
- Added `packages/engine/src/ffi/native-render-graph.test.ts` to validate rect/border/text/effect/image/canvas snapshot generation and batch grouping end-to-end.
- Added translator tests covering mixed native/TS layers and native backdrop effects with scissor clipping.
- Extended `renderNodeToBuffer()` retained mirroring and existing retained verification to coexist with the new 3d snapshot path.
- `cargo test --lib render_graph` passed for the initial native render graph module.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after starting 3d.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after effect/image/canvas snapshot and batching additions.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after semantic effect reachability additions.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after gated paint-path native render graph consumption.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after broader effect/image/canvas layer gating in the native paint path.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after direct simple effect translation from snapshot metadata.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after transform-enabled effect translation from snapshot metadata.
- `cargo build && cargo test --lib && bun test packages/engine/src/loop/paint.test.ts packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after explicit native-vs-fallback paint gating tests.

## Required Verification

- Native render graph fixture tests for broader scene/effect coverage beyond the current snapshot path.
- Effect-specific golden tests.
- Showcase visual parity.
- Static validation that native path avoids TS `cmd_kind` batches for supported fully-covered rect/border/text/native-image/simple-effect/gradient/shadow/glow layers now has dedicated paint-gating and direct-ref tests.
- Mixed command-level native translation reduces full-layer fallback pressure; canvas callbacks and advanced-effect translation still depend on TS-side render-graph helpers and queues.
- Full scene-to-op coverage in the paint path remains for filters/backdrop, transforms, blend modes, and canvas callbacks.
- Semantic effect reachability is verified in the snapshot path, and paint now supports mixed native/TS translation per command; rect/border/text/native-image/opacity/corner-radii plus linear/radial gradients, analytic shadows, and glow can be consumed by native paint dispatch, while callback/filter/backdrop/transform/masking semantics still fall back.

## Latest verification

- `bun test packages/engine/src/loop/paint.test.ts packages/engine/src/ffi/native-render-graph.test.ts` — passed after adding coverage stats.
- `bun run typecheck` — passed after adding native render graph frame stats through internal WeakMap metadata.
- `bun test` — 306 passed after coverage stats and API export updates.
- `cargo test -p libvexart render_graph --lib && cargo build && bun run typecheck && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/loop/paint.test.ts` — passed after adding direct Rust scene-paint dispatch for supported retained ops.
- `cargo test -p libvexart render_graph --lib && cargo build && bun run typecheck && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/loop/paint.test.ts` — passed after expanding direct scene-paint lowering to gradients/shadows/glow.
- `cargo test -p libvexart render_graph --lib && cargo build && bun run typecheck && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/loop/paint.test.ts` — passed after adding direct text glyph batching.
- `cargo test -p libvexart render_graph --lib && cargo build && bun run typecheck && bun test packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/loop/paint.test.ts` — passed after adding direct native-image dispatch and explicit fallback gates.
