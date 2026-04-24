# Verify Report: Phase 4d — Native Canvas Display List API

## Status

Implemented for native display-list ownership and metadata propagation. JS `onDraw` remains the authoring/fallback API; TypeScript now serializes deterministic command lists and Rust owns registered display-list handles/resource accounting.

## Implemented

- Added deterministic `CanvasContext` command serialization and FNV hash helpers.
- Added Rust `CanvasDisplayListRegistry` with stable key reuse and resource-manager accounting as `CanvasDisplayList`.
- Added FFI exports:
  - `vexart_canvas_display_list_update`
  - `vexart_canvas_display_list_touch`
  - `vexart_canvas_display_list_release`
- Added TS bridge `native-canvas-display-list.ts`.
- Extended `TGENode` and `CanvasPaintConfig` with native display-list handle/hash metadata.
- `walk-tree.ts` now runs `onDraw`, serializes commands, uploads/touches native display lists, syncs `__canvasDisplayListHandle`, and still queues `onDraw` for fallback paths.
- Native render graph canvas snapshots now expose `canvasDisplayListHandle`.
- Native render graph translation propagates `canvasDisplayListHandle` into `CanvasPaintConfig.nativeDisplayListHandle`.

## Verification Run

- `cargo build --quiet --manifest-path native/libvexart/Cargo.toml` — passed.
- `cargo test --quiet --manifest-path native/libvexart/Cargo.toml` — 152 passed.
- `bun test packages/engine/src/ffi/native-canvas-display-list.test.ts packages/engine/src/ffi/native-render-graph.test.ts` — 13 passed.
- `bun run typecheck` — passed.
- `bun test` — 306 passed.
- `bun run test:visual:native-render-graph` — 40 passed, 0 failed.
- `bun run perf:check` — 14.67 ms/frame, -0.4% vs baseline, passed.
- `bun run api:check` — passed and updated `packages/engine/etc/engine.api.md`.
- `git diff --check` — passed after normalizing generated API snapshot whitespace.

## Added Coverage

- Rust tests for handle reuse and resource accounting.
- TS tests for deterministic serialization/hash, FFI handle reuse, and resource stats.
- Native render graph test for canvas display-list handle propagation.

## Remaining Gaps

- Full native GPU replay of display-list commands is not implemented in this slice; the native render path now owns display-list identity/metadata and preserves callback fallback. A later rendering slice can replay the registered commands directly.

## Rollback

- Native-disabled/offscreen/test paths keep `onDraw` callback fallback.
- If display-list upload fails, `onDraw` remains queued in `CanvasPaintConfig`.
