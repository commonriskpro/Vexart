# Retained Runtime Cleanup Boundaries

> **Phase-14 completed cleanup** (April 2026): the Rust retained scene graph / render graph / layout / event dispatch path has been removed. TypeScript owns scene graph, reactivity, walk-tree, Taffy layout, render graph, event dispatch, and interaction. Rust owns WGPU paint pipelines, composite, Kitty encoding, SHM/file/direct transport, image assets, and canvas display lists. This document is historical unless a section explicitly matches the DEC-014 boundary.

Vexart's scene/layout/event runtime owner is TypeScript. Rust remains the paint/composite/transport owner and native binding target for paint-forward work.

## Path Classification

| Path | Classification | Notes |
| --- | --- | --- |
| `native/libvexart/src/render_graph/` | deleted/reverted | Historical retained render graph path removed by phase-14. |
| `native/libvexart/src/image_asset.rs` | native-owned | Stores image asset identity and resource accounting. |
| `native/libvexart/src/canvas_display_list.rs` | native-owned | Stores canvas display-list bytes and resource accounting. |
| `packages/engine/src/ffi/native-render-graph.ts` | deleted/reverted | Historical retained snapshot bridge removed by phase-14. |
| `packages/engine/src/ffi/native-image-assets.ts` | binding-shell | Registers decoded image bytes and syncs handles to scene nodes. |
| `packages/engine/src/ffi/native-canvas-display-list.ts` | binding-shell | Registers deterministic canvas display-list bytes and syncs handles. |
| `packages/engine/src/loop/walk-tree.ts` | TS-owned | Reconciles JSX nodes, captures JS callbacks, and prepares layout/interaction metadata. |
| `packages/engine/src/loop/layout.ts` | TS-owned | Taffy layout runs in TS; no native layout writeback path remains. |
| `packages/engine/src/loop/paint.ts` | paint-forward binding | Builds TS render graph paint commands and dispatches paint/composite work to Rust. |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | binding-shell + explicit readback | Dispatches batches through native FFI and keeps explicit readback for screenshots/offscreen/fallback. |
| `packages/engine/src/testing/render-to-buffer.ts` | test/offscreen | Intentional raw readback helper for tests and screenshots. |

## Deleted Or Isolated In Phase 8

- Removed the obsolete TS canvas sprite cache/orchestration. Canvas identity is now a native display-list handle; hidden TS sprite caching is not allowed to reappear.
- Kept layer target caches because they are still native target-handle bookkeeping for final-frame/layer composition, not a retained ownership source.
- Kept raw RGBA readback only behind explicit presentation fallback, screenshot, test, or offscreen APIs.

## Grep Gate

`bun run check:retained-cleanup` rejects stale source/docs wording that implies deleted experimental pipelines or permanent hybrid ownership outside archived/historical retained-engine roadmap docs.
