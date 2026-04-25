# Phase 16 — Automatic Compositor Layer Promotion, Dirty Tracking, and Readback Elimination

## Intent

GPU→CPU readback consumes 4.28 ms p95 (~49% of frame) in cosmic-shell-1080p at 7.63 ms p50 / 8.69 ms p95. The engine already has layer reuse infrastructure (`canReuseStableLayer`, `reuseLayer`, `markLayerClean`) but it's defeated by (a) `forceLayerRepaint=true` forcing full repaint every frame, and (b) layer promotion requiring explicit `layer={true}` / `willChange` from devs. The motor should automatically promote nodes to cached GPU layers and skip readback for unchanged layers — the dev writes `<box>` and gets 120fps without knowing layers, readback, or SHM exist.

## PRD Alignment

| Document | Section | Relation |
|---|---|---|
| `docs/PRD.md` | §7.3 (DEC-013) | 120fps/5ms performance program — this change targets the readback bottleneck DEC-013 identifies |
| `docs/PRD.md` | DEC-014 | TS/Rust boundary preserved — layer caching is TS orchestration + Rust GPU reuse |
| `docs/PERFORMANCE-120FPS-PLAN.md` | Table §1 | Small dirty-region < 5 ms p95 target |
| `docs/PERF-AUDIT-PHASE-15.md` | Full audit | Readback 4.28 ms p95 is the #1 remaining bottleneck |

## Scope

### In Scope

- Auto-promotion heuristics: backdrop-blur nodes, backdrop-filter nodes, stable subtrees (N=3 frames), background root, deterministic canvases
- Per-layer content hash / generation counter for dirty tracking
- Reactive dirty propagation: `setProperty` marks only the owning layer dirty (`nodeIdToLayerIdx`)
- Readback elimination for clean layers: skip `vexart_composite_readback_rgba` + Kitty emit when content hash matches
- Default `forceLayerRepaint` to `false` (or remove the flag)
- Auto-promoted layer budget cap (max N=8) and size threshold (≥64×64 px) to prevent GPU memory pressure
- Hysteresis: require N=3 stable frames to promote, M=3 unstable frames to demote
- `_autoLayer` tag for debug tooling

### Out of Scope

- Async double-buffer readback (stretch goal — documented in approach, deferred to separate slice)
- Changes to Rust paint pipelines or Kitty encoding
- New public JSX props (dev writes zero performance code)
- Visual output changes (must be pixel-identical)

## Capabilities

### New Capabilities

- `auto-compositor`: automatic layer promotion heuristics, per-layer dirty tracking with content hash / generation counter, and readback elimination for clean layers

### Modified Capabilities

- `performance-dirty-region`: extends scoped dirty invalidation to per-layer content hash matching and node-to-layer dirty propagation
- `performance-presentation`: clean-layer reuse path that skips readback and Kitty emit entirely for unchanged layers

## Approach

1. **Auto-promotion in `assign-layers.ts`**: extend `findLayerBoundaries` to check backdrop-blur/filter props, stable frame counter, root background, and canvas cache key. Tag auto-promoted nodes `_autoLayer: true`.

2. **Node-to-layer mapping in `walk-tree.ts` / `node.ts`**: add `_layerKey` field to TGENode so `setProperty` can mark only the owning layer dirty. Use a generation counter (cheaper than hashing render graph).

3. **Clean-layer reuse in `paint.ts`**: flip `forceLayerRepaint` default to `false`. When `canReuseStableLayer` fires, skip GPU paint + readback. Reuse previous Kitty image ID (still on screen in terminal).

4. **Budget enforcement**: cap auto-promoted layers at N=8 total; skip promotion for nodes < 64×64 px. Demote after M=3 unstable frames.

**Stretch goal (deferred slice)**: async double-buffer readback — overlap `copy_texture_to_buffer` with next frame's paint. 1-frame latency trade for eliminating readback stall. Only pursued if layer caching alone doesn't close the 120fps gap.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/engine/src/loop/assign-layers.ts` | Modified | Auto-promotion heuristics in `findLayerBoundaries` |
| `packages/engine/src/loop/paint.ts` | Modified | Wire auto-promoted layers into reuse path, default `forceLayerRepaint=false` |
| `packages/engine/src/loop/composite.ts` | Modified | Per-layer content hash, `nodeIdToLayerIdx` dirty propagation |
| `packages/engine/src/loop/walk-tree.ts` | Modified | Emit auto-promotion hints, node-to-layer mapping |
| `packages/engine/src/ffi/node.ts` | Modified | Add `_autoLayer`, `_layerKey`, `_stableFrameCount` fields |
| `packages/engine/src/loop/loop.ts` | Modified | Change `forceLayerRepaint` default to `false` |
| `packages/engine/src/mount.ts` | Possibly modified | Keep `forceLayerRepaint` as escape hatch but default off |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Auto-promotion thrashing (stable↔unstable oscillation) | Medium | Hysteresis: N=3 promote, M=3 demote |
| GPU memory pressure from too many layers | Medium | Budget cap (8 auto-layers), size threshold (64×64 px) |
| Layer composition overhead (more GPU draw calls) | Low | Budget cap limits total layers |
| Content hash / generation counter cost | Low | Use generation counter (increment on `setProperty`) not full render-graph hash |
| Visual artifacts from incorrect dirty tracking | Medium | `_autoLayer` flag enables instant disable; `forceLayerRepaint=true` as escape hatch |

## Rollback Plan

All auto-promotion is gated behind `_autoLayer: true` tagging. If visual artifacts appear:
1. Set `forceLayerRepaint=true` in `mount()` options (existing escape hatch).
2. Disable auto-promotion heuristics in `findLayerBoundaries` — manual `layer={true}` still works.
3. Full revert: `git revert` the phase-16 commit(s) restores previous behavior.

## Dependencies

- Phase 14 (retained cleanup) complete — TS path is the only path
- Phase 15 (33 JS-side optimizations) complete — readback is now the dominant bottleneck
- `docs/PERF-AUDIT-PHASE-15.md` evidence establishing readback as 49% of frame

## Success Criteria

- [ ] cosmic-shell-1080p "typing" scenario (60 frames, only editor changes): p95 ≤ 4 ms
- [ ] cosmic-shell-1080p "idle" scenario (60 frames, no changes): p95 ≤ 1 ms (zero readback)
- [ ] cosmic-shell-1080p "full repaint": p95 ≤ 9 ms (no regression)
- [ ] `examples/opencode-cosmic-shell/app.tsx` requires ZERO code changes
- [ ] `bun typecheck && bun test` passes
- [ ] No visual artifacts (pixel-identical output with auto-compositor on vs off)
