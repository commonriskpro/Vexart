# Tasks: Phase 14 — Rust Retained Cleanup

## S1 — Public mount surface

- [x] 1.1 Remove `nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, and `nativeEventDispatch` from `packages/engine/src/mount.ts` types (REQ-EMA-001/003).
- [x] 1.2 Confirm `packages/app/` still forwards only `nativePresentation`, `nativeLayerRegistry`, and `forceLayerRepaint`; patch any stale wiring.
- [x] Gate: `bun typecheck` passes.

## S2 — Delete retained-only tests

- [x] 2.1 Delete the 6 retained-only test files from the proposal and prune any dead imports.
- [x] Gate: `bun test` passes.

## S3 — TS runtime cleanup

- [x] 3.1 Strip retained branches from `loop/loop.ts`, `paint.ts`, `layout.ts`, `layout-adapter.ts`, `walk-tree.ts`, `mount.ts`, and `reconciler.ts` (REQ-EMA-003).
- [x] 3.2 Keep `paintNativeSnapshotMs` in `scripts/frame-breakdown.tsx` as `0` and mark it deprecated in JSON output.
- [x] 3.3 Remove `--path=ts|rust` handling from `scripts/frame-breakdown.tsx`; emit TS-only metrics.
- [x] 3.4 Smoke-run `examples/opencode-cosmic-shell/app.tsx` unchanged.
- [x] Gate: `bun typecheck && bun test` passes.

## S4 — Remove TS retained bridge

- [x] 4.1 Delete `native-scene*.ts`, `native-render-graph*.ts`, `native-scene-events.ts`, `native-event-dispatch-flags.ts`, `native-frame-orchestrator.ts`, and `native-retained-flags.ts`; keep `text-layout.ts` (REQ-EMA-003).
- [x] 4.2 Trim `packages/engine/src/ffi/vexart-bridge.ts` exports and callers to the dropped symbols.
- [x] Gate: `bun typecheck && bun test` passes.

## S5 — Trim Rust FFI surface

- [x] 5.1 Remove `vexart_scene_*`, `vexart_scene_layout_*`, `vexart_render_graph_*`, `vexart_frame_choose_strategy`, `vexart_scene_apply_mutations`, and `vexart_event_dispatch_*` from `native/libvexart/src/lib.rs` (REQ-PB-011).
- [x] Gate: `cd native/libvexart && cargo build && cargo test` passes.

## S6 — Remove Rust retained modules

- [x] 6.1 Delete the entire `native/libvexart/src/layout/` tree plus `scene.rs`, `render_graph/`, and retained logic from `frame.rs` (REQ-PB-011).
- [x] 6.2 Run `cargo clean && cargo test --release` immediately after deletion, then `cargo build --release` if clean.
- [x] 6.3 Smoke-run `examples/opencode-cosmic-shell/app.tsx` again after the Rust removal.
- [x] Gate: `cd native/libvexart && cargo clean && cargo test --release && cargo build --release` passes.

## S7 — Docs and generated artifacts

- [x] 7.1 Update `docs/PRD.md` with DEC-014, the 0.6→0.7 bump, and §6.7/§11 boundary edits.
- [x] 7.2 Add `SUPERSEDED` headers to `docs/PRD-RUST-RETAINED-ENGINE.md` and `docs/ROADMAP-RUST-RETAINED-ENGINE.md`.
- [x] 7.3 Update `AGENTS.md` and `docs/ARCHITECTURE.md` so TS owns scene/layout/event and Rust owns paint/composite/transport.
- [x] 7.4 Run `bun run build:dist` and `bun run api:update`; verify regenerated `*.d.ts` and `packages/styled/etc/styled.api.md` drop the removed symbols.
- [x] Gate: `bun typecheck` passes.

## S8 — Archive reverted phases

- [x] 8.1 Add `REVERTED by phase-14` notes to the 9 archived phase `proposal.md` files, pointing to `openspec/changes/phase-14-rust-retained-cleanup/proposal.md` (REQ-PB-012).
- [x] Gate: grep confirms every archived path contains the revert note.

## S9 — Bench verification

- [ ] 9.1 Run the cosmic-shell SHM bench and record p95 ≤ 16 ms.
- [ ] 9.2 Run the dashboard SHM bench, keep p95 ≤ 6 ms, and update `scripts/perf-baseline.json` only if numbers shift.
- [ ] Gate:
```bash
bun --conditions=browser run scripts/frame-breakdown.tsx --frames=60 --warmup=15 --scenarios=cosmic-shell-1080p --transport=shm --native-presentation
bun --conditions=browser run scripts/frame-breakdown.tsx --frames=60 --warmup=15 --scenarios=dashboard-1080p --transport=shm --native-presentation
```
