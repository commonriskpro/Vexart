# Verify Report: Phase 8 — Retained Cleanup And Simplification

## Status

Implemented as a safe cleanup pass after Phase 4c and Phase 4d. Rust is documented as the retained runtime owner; TypeScript paths are classified as binding shell, explicit fallback, or test/offscreen readback.

## Implemented

- Added `docs/RETAINED-CLEANUP.md` with ownership classification for native-owned, binding-shell, compat-fallback, and test/offscreen paths.
- Added `scripts/check-retained-cleanup.ts` and `bun run check:retained-cleanup`.
- Removed obsolete TS canvas sprite cache/orchestration from `gpu-renderer-backend.ts`.
- Updated stale source comments referencing deleted experimental modules and permanent TS fallback language.
- Updated canonical docs wording to avoid stale hybrid ownership language outside historical/roadmap retained-engine documents.
- Kept layer target caches because they are native target-handle bookkeeping for composition, not retained scene ownership.
- Kept raw RGBA return modes only for explicit readback/fallback/test/offscreen behavior.

## Verification Run

- `bun run typecheck` — passed.
- `bun test` — 306 passed.
- `bun run test:visual:native-render-graph` — 40 passed, 0 failed.
- `bun run perf:check` — 15.72 ms/frame, +6.8% vs baseline, passed.
- `bun run api:check` — passed.
- `bun run check:retained-cleanup` — passed.
- `git diff --check` — passed.

## Grep Evidence

- `canvasSpriteCache`, `CanvasSpriteRecord`, `MAX_GPU_CANVAS_SPRITES`, `markCanvasSpritesUnusedForFrame`, `pruneCanvasSpriteCache`, `wgpu-mixed-scene`, and `gpu-raster-staging` no longer appear in `packages/engine/src`.

## Remaining Intentional Fallbacks

- `VEXART_RETAINED=0` and presentation disable flags remain compatibility controls.
- Offscreen/screenshot/test readback remains explicit and intentional.
- TS render graph build remains for fallback/test/offscreen paths; native render graph is preferred on the retained path.

## Rollback

- Revert the cleanup commit to restore removed canvas sprite bookkeeping and comments if needed.
- Compatibility fallback paths remain available behind existing flags.
