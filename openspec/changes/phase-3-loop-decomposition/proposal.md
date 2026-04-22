# Proposal: Phase 3 — Loop Decomposition + Tier 2 Optimizations

## Intent

`loop.ts` (3030 lines) is a god module blocking testability and Tier 2 optimizations. `docs/ARCHITECTURE.md §3.1` mandates `loop/index.ts` ≤400 lines with per-phase files. **PRD**: `docs/PRD.md §Phase 3` (L803–838).

## Scope

### In Scope
- Extract 6 pipeline modules: `walk-tree.ts`, `layout-adapter.ts`, `assign-layers.ts`, `layout-writeback.ts`, `interaction-state.ts`, `frame-pipeline.ts`
- Reduce `loop.ts` → `index.ts` to ≤400-line coordinator
- Viewport culling (AABB bottom-up) inside `walk-tree.ts`
- Three-priority frame budget scheduler in `frame-scheduler.ts`
- `debugDumpCulledNodes()` · Unit tests · Integration tests · Micro-benchmarks

### Out of Scope
Rust native migration (Ph2b) · Public API changes (Ph4) · Golden tests (Ph4) · BVH hit-testing (v1.x)

## Capabilities

### New
- `viewport-culling`: AABB bottom-up walk culling, skip off-screen subtrees, preserve scroll containers
- `frame-budget-scheduler`: `user-blocking`/`user-visible`/`background` queues, 12ms per-frame budget

### Modified
- `package-boundaries`: single `loop.ts` → multi-file pipeline per `docs/ARCHITECTURE.md §3.1`

## Approach

**Downstream-first extraction** — least-coupled phases first, walk-tree last.

| # | Slice | Lines | Verify |
|---|-------|-------|--------|
| 1 | Interaction state (L2056–2277) | ~220 | Hover/click/focus tests |
| 2 | Layout writeback (L1875–2054) | ~180 | Transform tests |
| 3 | Assign-layers (L1430–1873) | ~440 | Layer-plan fixtures |
| 4 | Frame pipeline (L2325–2847) | ~520 | Showcase identical |
| 5 | Walk-tree (L1081–1428) | ~350 | Walk-result fixtures |
| 6 | Layout adapter (L49–568) | ~520 | Layout output identical |
| 7 | Viewport culling in walk-tree | +120 | Bench: ≥40% reduction |
| 8 | Frame budget scheduler | +180 | Bench: no missed frames |

1–6: pure extraction. 7–8: new behavior. Shared state (pointer, focus, rectNodes) → typed state bags; coordinator owns all.

## Affected Areas

`loop/loop.ts` → `loop/index.ts` (3030→≤400). New: `walk-tree.ts`, `layout-adapter.ts`, `assign-layers.ts`, `layout-writeback.ts`, `interaction-state.ts`, `frame-pipeline.ts`. Modified: `frame-scheduler.ts` (three-priority), `debug.ts` (`debugDumpCulledNodes`).

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| Shared state → circular deps | H | State bags as typed args; coordinator owns |
| Walk-tree extraction breaks | H | Extract AFTER layout adapter (#5 after #6) |
| Culling skips scroll content | M | Never cull scroll containers; scroll fixtures |
| Scheduler adds latency | L | Bench gate: user-blocking <16ms under load |

## Rollback

Each slice = one commit. Revert to undo. No public API surface changes.

## Dependencies

Ph2b does NOT block this (TS orchestration is backend-agnostic). Target: `docs/ARCHITECTURE.md §3.1`.

## Success Criteria

- [ ] `loop/index.ts` ≤400 lines · 6 modules standalone importable
- [ ] All existing tests pass · Showcase identical after each slice
- [ ] Culling bench: ≥40% wall-time (1000-node/100-visible)
- [ ] Scheduler bench: user-blocking never misses (10× background)
