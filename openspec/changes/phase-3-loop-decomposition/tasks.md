# Tasks: Phase 3 — Loop Decomposition + Tier 2 Optimizations

## Phase 1: Contracts + Downstream Adapters

- [x] 1.1 Add `packages/engine/src/loop/types.ts` with `WalkResult`, `LayoutResult`, `LayerPlan`, `PaintResult`, `FrameState`. Verification: `bun run typecheck` + import compiles. Files: `loop/types.ts`.
- [x] 1.2 Extract `VexartLayoutCtx` and buffer helpers into `packages/engine/src/loop/layout-adapter.ts`; keep `loop.ts` as importer. Verification: existing showcase renders unchanged. Files: `loop/layout-adapter.ts`, `loop/loop.ts`.
- [x] 1.3 Move layout writeback + interaction state into `packages/engine/src/loop/layout.ts` (or split `layout-writeback.ts`/`interaction-state.ts` if needed) behind typed state bags. Verification: hover/click/focus smoke cases still pass. Files: `loop/layout.ts`, `loop/loop.ts`.

## Phase 2: Core Pipeline Extraction

- [x] 2.1 Extract layer assignment into `packages/engine/src/loop/assign-layers.ts` and wire `LayerPlan` consumers. Verification: layer-plan fixture matches current output. Files: `loop/assign-layers.ts`, `loop/loop.ts`.
- [x] 2.2 Extract `walkTree()` + node processing into `packages/engine/src/loop/walk-tree.ts`, threaded with `WalkResult`. Verification: walk-result fixture equals baseline counts. Files: `loop/walk-tree.ts`, `loop/loop.ts`.
- [x] 2.3 Extract paint orchestration into `packages/engine/src/loop/paint.ts`; keep frame output identical. Verification: showcase frame diff is unchanged. Files: `loop/paint.ts`, `loop/loop.ts`.

## Phase 3: Output + Coordinator Reduction

- [x] 3.1 Move composite/output logic into `packages/engine/src/loop/composite.ts` and isolate present/flush behavior. Verification: output backend smoke test still draws. Files: `loop/composite.ts`, `loop/loop.ts`.
- [x] 3.2 Reduce `packages/engine/src/loop/loop.ts` to a thin coordinator (target <400 lines, or split to `loop/index.ts` if renaming). Verification: `bun run typecheck` + coordinator imports all pipeline modules. Files: `loop/loop.ts`, `loop/index.ts`, pipeline modules.
- [x] 3.3 Add AABB viewport culling in `walk-tree.ts` and `debugDumpCulledNodes()` in `debug.ts`; exempt scroll containers. Verification: culling fixture marks off-screen subtrees only. Files: `loop/walk-tree.ts`, `loop/debug.ts`.
- [x] 3.4 Add 3-priority frame scheduler in `packages/engine/src/scheduler/` and wire the coordinator to it. Verification: scheduler benchmark preserves `user-blocking` latency under background load. Files: `scheduler/*`, `loop/loop.ts`.

## Phase 4: Tests + Exit Gate

- [x] 4.1 Add fixture-based tests for each extracted module (`types`, `layout-adapter`, `layout`, `assign-layers`, `walk-tree`, `paint`, `composite`, `scheduler`). Verification: `bun test` passes with generated fixtures. Files: `packages/engine/src/**/__tests__/*`.
- [x] 4.2 Add culling and scheduler benchmarks plus final exit-gate checks: `<400` line coordinator, showcase parity, PRD Phase 3 criteria met. Verification: benchmarks and smoke run pass. Files: `benchmarks/*`, `openspec/changes/phase-3-loop-decomposition/verify-report.md`.
