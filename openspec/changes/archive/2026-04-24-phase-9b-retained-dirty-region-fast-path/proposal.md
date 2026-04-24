# Proposal: Phase 9b — Retained Dirty-Region Fast Path

## Problem

The frame breakdown profiler shows `dirty-region` at ~10 ms p95 on the 1080p smoke run, above the `<5 ms p95` target. A likely cause is that the render loop treats every global dirty mark as a full layer invalidation, forcing more repaint work than needed for hover/focus/active and small visual-only changes.

## Goal

Introduce scoped dirty invalidation so pointer/interaction-driven visual changes damage only affected node/layer regions instead of marking all layers dirty.

## Scope

- Audit global dirty handling and layer damage propagation.
- Add a mechanism to distinguish global/full dirty from scoped node damage.
- Route hover/focus/active and pointer-driven visual changes to node/layer damage where possible.
- Preserve full dirty behavior for structural/layout-affecting mutations.
- Measure dirty-region benchmark before/after.

## Non-goals

- Rewriting the renderer or layer assignment.
- Removing compatibility fallback paths.
- Optimizing full dashboard beyond the dirty-region bottleneck.

## Verification

- `bun run bench:frame-breakdown -- --frames=3 --warmup=1` shows dirty-region behavior and does not regress no-op/compositor-only.
- `bun run typecheck` passes.
- `bun test` passes.
- `git diff --check` passes.

## Rollback

- Revert the scoped dirty changes to restore conservative `markAllDirty` behavior.
