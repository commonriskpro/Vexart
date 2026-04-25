# Tasks: Automatic Compositor Layer Promotion, Dirty Tracking & Readback Elimination

## S1: Backdrop auto-promotion

- [x] 1.1 Extend `packages/engine/src/loop/assign-layers.ts` `findLayerBoundaries` to boundary on non-zero `backdropBlur` and non-default backdrop-filter props.
- [x] 1.2 Emit the boundary hints from `packages/engine/src/loop/walk-tree.ts` walk state into layer assignment.
- [x] 1.3 Run `bun typecheck && bun test`.

## S2: Stable-subtree promotion / demotion

- [x] 2.1 Add `_stableFrameCount`, `_unstableFrameCount`, and `_autoLayer` to `packages/engine/src/ffi/node.ts`.
- [x] 2.2 Update `packages/engine/src/loop/assign-layers.ts` to promote after 3 stable frames, demote after 3 unstable frames, cap auto-layers at 8, and skip nodes under 64×64.
- [x] 2.3 Update frame bookkeeping in `packages/engine/src/loop/paint.ts` so the counters advance/reset per frame.
- [x] 2.4 Run `bun typecheck && bun test`.

## S3: Layer ownership keys

- [x] 3.1 Add `_layerKey` to `packages/engine/src/ffi/node.ts`.
- [x] 3.2 Set/reset `_layerKey` during assignment in `packages/engine/src/loop/assign-layers.ts`.
- [x] 3.3 Run `bun typecheck && bun test`.

## S4: Targeted dirty propagation

- [x] 4.1 In `packages/engine/src/reconciler/reconciler.ts`, make `setProperty` bump the generation counter and call `markLayerDirtyByKey` when `_layerKey` exists.
- [x] 4.2 Expose `markLayerDirtyByKey` through `packages/engine/src/loop/composite.ts` and its layer-store plumbing.
- [x] 4.3 Run `bun typecheck && bun test`.

## S5: Default full-repaint off

- [x] 5.1 Change `forceLayerRepaint` default to `false` in `packages/engine/src/loop/loop.ts` (and `types.ts` if that is where the default lives).
- [x] 5.2 Run `bun typecheck && bun test`.

## S6: Bench coverage

- [x] 6.1 Add `COSMIC_TYPING` and `COSMIC_IDLE` to `scripts/frame-breakdown.tsx`.
- [x] 6.2 Run the bench script and confirm the new scenarios execute without errors.

## S7: Reuse-path verification

- [x] 7.1 Smoke `canReuseStableLayer` + `reuseLayer` with auto-promoted layers in cosmic-shell using `forceLayerRepaint=false`.
- [ ] 7.2 Verify clean frames skip readback and Kitty re-emit.

## S8: Regional readback wiring

- [x] 8.1 Wire small dirty rects to regional readback in `packages/engine/src/loop/paint.ts`.
- [x] 8.2 Run `bun typecheck && bun test`, then manual smoke-run cosmic-shell.

## S9: Bench gate

- [ ] 9.1 Run `COSMIC_IDLE`, `COSMIC_TYPING`, and `COSMIC_SHELL_1080P` (`forceLayerRepaint=true`) and verify the p95 targets.

## Slice Summary

| Slice | Tasks | Focus |
|---|---:|---|
| S1 | 3 | Backdrop auto-promotion |
| S2 | 4 | Stable-subtree hysteresis + budget |
| S3 | 3 | `_layerKey` ownership |
| S4 | 3 | Layer-targeted dirty propagation |
| S5 | 2 | Default repaint behavior |
| S6 | 2 | Bench scenario coverage |
| S7 | 2 | Reuse-path smoke test |
| S8 | 2 | Regional readback wiring |
| S9 | 1 | Performance gate |
| **Total** | **22** | |
