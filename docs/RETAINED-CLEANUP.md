# Retained Runtime Cleanup Boundaries

Vexart's retained runtime owner is Rust. TypeScript remains the JSX/public API shell,
native binding layer, JS callback dispatcher, and explicit compatibility/test fallback.

## Path Classification

| Path | Classification | Notes |
| --- | --- | --- |
| `native/libvexart/src/render_graph/` | native-owned | Builds retained render ops from the native scene and layout state. |
| `native/libvexart/src/image_asset.rs` | native-owned | Stores image asset identity and resource accounting. |
| `native/libvexart/src/canvas_display_list.rs` | native-owned | Stores canvas display-list bytes and resource accounting. |
| `packages/engine/src/ffi/native-render-graph.ts` | binding-shell | Reads native snapshots and translates them for the backend/test bridge. |
| `packages/engine/src/ffi/native-image-assets.ts` | binding-shell | Registers decoded image bytes and syncs handles to scene nodes. |
| `packages/engine/src/ffi/native-canvas-display-list.ts` | binding-shell | Registers deterministic canvas display-list bytes and syncs handles. |
| `packages/engine/src/loop/walk-tree.ts` | binding-shell + callback shell | Reconciles JSX nodes, captures JS callbacks, and syncs native scene metadata. |
| `packages/engine/src/loop/layout.ts` | binding-shell + compat-fallback | Native interaction frames are default; TS hit-test loop remains explicit fallback/test path. |
| `packages/engine/src/loop/paint.ts` | binding-shell + compat-fallback | Prefers native render graph snapshots; TS graph build remains fallback/test/offscreen path. |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | binding-shell + explicit readback | Dispatches batches through native FFI and keeps explicit readback for screenshots/offscreen/fallback. |
| `packages/engine/src/testing/render-to-buffer.ts` | test/offscreen | Intentional raw readback helper for tests and screenshots. |

## Deleted Or Isolated In Phase 8

- Removed the obsolete TS canvas sprite cache/orchestration. Canvas identity is now a native display-list handle; hidden TS sprite caching is not allowed to reappear.
- Kept layer target caches because they are still native target-handle bookkeeping for final-frame/layer composition, not a retained ownership source.
- Kept raw RGBA readback only behind explicit presentation fallback, screenshot, test, or offscreen APIs.

## Grep Gate

`bun run check:retained-cleanup` rejects stale source/docs wording that implies deleted experimental pipelines or permanent hybrid ownership outside archived/historical retained-engine roadmap docs.
