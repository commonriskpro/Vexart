# Verify Report: Phase 3g — Native Cleanup And Simplification

## Status

Implemented.

## Implemented Cleanup

- Native presentation now follows the active Kitty transport (`direct`, `file`, or `shm`) instead of restricting retained defaulting to SHM-only sessions.
- `createRenderLoop()` now instantiates the TS raw frame presenter only when native presentation is explicitly disabled, isolating raw terminal image orchestration to emergency/offscreen paths instead of the normal runtime.
- TS layer state no longer stores per-layer backing metadata or terminal image ownership in `packages/engine/src/ffi/layers.ts`; the normal runtime now depends on the native layer registry for target/image lifecycle.
- The TS render-graph builder stays available only as an explicit fallback/offscreen shell; the default retained runtime uses the native render-graph snapshot path.
- Explicit screenshot/offscreen readback remains intentionally supported via `packages/engine/src/testing/render-to-buffer.ts` with `nativePresentation: false` / `nativeRenderGraph: false`.

## Final Classification

- `packages/engine/src/ffi/render-graph.ts` — retained as a fallback/offscreen shell only, no longer the normal retained hot path.
- `packages/engine/src/ffi/layers.ts` — retained as lightweight dirty/geometry bookkeeping; TS-owned terminal image backing metadata was removed.
- `packages/engine/src/output/gpu-frame-composer.ts` — retained as explicit raw-frame presenter for emergency fallback/offscreen capture only.
- `final-frame-raw` / `kitty-payload` backend result variants — isolated to explicit readback / emergency-disabled presentation flows, not the default retained runtime.

## Low-Risk Cleanup Completed

- Removed the dead flat-rectangle batch path from `packages/engine/src/ffi/gpu-renderer-backend.ts` after switching all rectangle rendering through the stable shape-rect path.
- This reduces hybrid paint-path surface without changing the compatibility-window policy or offscreen readback APIs.
- Made a broad set of previously implicit API types/subcomponents explicit in `public.ts` and source exports across `engine`, `headless`, and `styled`, reducing `ae-forgotten-export` noise and making the remaining API debt more honest.

## Behavior After Cleanup

- Rust is now the implementation owner for normal terminal presentation on Kitty-compatible transports.
- JS readback remains explicit-only for tests, screenshots, debug, or emergency opt-out flows.
- `VEXART_RETAINED=0` still preserves the emergency compatibility-window fallback.

## Verification Context

- `bun run typecheck` ✅
- `bun test` ✅ (289 passing)
- `bun run api:update` ✅
- `bun run test:visual` ✅ (`colors`, `hello`, `layout` at `0.00%` diff)
- `bun run perf:check` ✅
- `bun run perf:frame-orchestrator` ✅ (`0` no-op / `6` dirty for direct and SHM)
- Static search/docs update completed for stale SHM-only default-cutover wording in the retained architecture docs.

## Remaining Intentional Exceptions

- Explicit offscreen/screenshot/debug readback remains intentional.
- Emergency compatibility fallback via `VEXART_RETAINED=0` remains intentional.
