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
- Static validation that native path avoids TS `cmd_kind` batches for ordinary nodes on fully covered native layers now has dedicated paint-gating tests.
- Mixed command-level native translation now reduces full-layer fallback pressure, but ordinary rect/text/image/canvas translation still depends on TS-side render-graph helpers and queues.
- Full scene-to-op coverage in the paint path: rounded/per-corner geometry, shadows, glow, gradients, filters, images, transforms, opacity, and text batching.
- Semantic effect reachability is verified in the snapshot path, and paint now supports mixed native/TS translation per command; simple effect ops including some transform-bearing and backdrop-clipped cases can now be translated directly from snapshot metadata, while full semantic consumption by native paint dispatch is still pending.
