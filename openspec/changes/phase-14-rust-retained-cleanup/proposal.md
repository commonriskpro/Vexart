# Phase 14 — Drop Rust retained scene graph / render graph / scene layout / event dispatch

## Intent

Remove the Rust-retained scene graph, scene layout, render graph, and event dispatch subsystems from Vexart. Comparative benchmarking at 1080p proves the TS path is **4.8× faster** than the Rust retained path on real workloads — the retained subsystems add ~60 ms of pure FFI overhead with no compensating benefit. Rust retains ownership of paint, composite, encoding, presentation, image assets, and canvas display lists.

This reverses **DEC-012 partially**: the paint/composite/transport portion of the retained-engine plan stands; the retained scene/render/layout/event portion is reverted.

## Master document alignment

| Document | Section | Relation |
|---|---|---|
| `docs/PRD.md` | §6.7, §11 (retained overlay) | Supersedes the retained-engine target that assigns scene/layout/render/event to Rust. |
| `docs/PRD.md` | §12 (DEC-012) | Partially superseded by new DEC-014 (this change). |
| `docs/PRD-RUST-RETAINED-ENGINE.md` | All | Marked SUPERSEDED for scene/render/layout/event sections. Paint/composite/transport sections remain valid. |
| `docs/ROADMAP-RUST-RETAINED-ENGINE.md` | R3–R8 | Marked SUPERSEDED. R1 (presentation) and R2 (layer registry) remain valid. |
| `docs/API-POLICY.md` | §5 (change classification) | Removing four `experimental.*` flags is a breaking public API change (0.x minor bump). |
| `docs/ARCHITECTURE.md` | Engine boundary | Update to reflect TS owns scene/layout, Rust owns paint/composite/transport. |

## Evidence — bench results

### cosmic-shell-1080p (real workload)

Scenario: `examples/opencode-cosmic-shell/app.tsx` — Starfield, glassmorphism panels, NOVA, dock, syntax highlighting. 1080p, SHM, nativePresentation ON, 60 frames + 15 warmup.

| Metric | Rust retained | TS path | TS advantage |
|---|---|---|---|
| **Total p95** | 75.42 ms (~13 fps) | **15.84 ms** (~63 fps) | **4.8×** |
| Total p50 | 60.84 ms | 11.24 ms | **5.4×** |
| Total p99 | 95.35 ms | 16.56 ms | **5.8×** |

**Rust retained bottleneck breakdown (p95)**:
- `paintNativeSnapshotMs`: 39.21 ms — FFI snapshot of scene graph dominates under reactivity
- `layoutMs`: 25.23 ms — native layout + writeback FFI is 8× slower than Taffy in TS
- `layoutWritebackMs`: 20.09 ms — boundary serialization cost
- `paintBackendEndMs`: 7.90 ms — shared GPU cost (irreducible)

**TS path top stages (p95)**:
- `paintBackendEndMs`: 7.84 ms
- `layoutMs`: 3.09 ms
- `paintBackendPaintMs`: 4.68 ms

**Key insight**: Both paths share identical GPU paint + SHM cost (~7.8 ms p95). The Rust retained subsystem adds ~60 ms of pure overhead in the cosmic workload. The retained model's amortization benefit collapses under realistic SolidJS reactivity (signals, Show/For, floating panels).

### dashboard-1080p (synthetic)

| Metric | Rust path | TS path | TS advantage |
|---|---|---|---|
| Total p95 | 6.49 ms | **5.36 ms** | 17% |

Synthetic workload shows only 17% gap because reactivity is minimal — confirms the overhead is mutation-driven, not inherent to the Rust language.

### Reports persisted

- `/tmp/cosmic-rust.json`, `/tmp/cosmic-ts.json`
- `/tmp/bench-rust.json`, `/tmp/bench-ts.json`

### Engram traceability

| ID | Topic key | Content |
|---|---|---|
| #3621 | — | Original SHM pipeline profiling |
| #3625 | — | Retained native hot path optimization (mutation batching, VXRF, lazy snapshots) |
| #3629 | `performance/ts-vs-rust-retained-1080p` | Cosmic-shell bench results, decision to drop retained subsystem |

## Scope

### In scope — engine package removals

**Files to delete** (exist solely for retained native path):

- `packages/engine/src/ffi/native-render-graph.ts` + `.test.ts`
- `packages/engine/src/ffi/native-render-graph-flags.ts`
- `packages/engine/src/ffi/native-scene.ts` + `.test.ts`
- `packages/engine/src/ffi/native-scene-graph-flags.ts` + `.test.ts`
- `packages/engine/src/ffi/native-scene-layout-flags.ts`
- `packages/engine/src/ffi/native-scene-layout-parity.test.ts`
- `packages/engine/src/ffi/native-scene-events.ts`
- `packages/engine/src/ffi/native-event-dispatch-flags.ts`
- `packages/engine/src/ffi/native-frame-orchestrator.ts` + `.test.ts`
- `packages/engine/src/ffi/native-retained-flags.ts`
- `packages/engine/src/ffi/text-layout.ts` + `.test.ts` — **verify before dropping**; drop only if exclusively used for native scene layout
- `packages/engine/src/loop/native-default-cutover.test.ts`
- Any tests under `packages/engine/src/loop/*` that exclusively test `nativeSceneGraph`/`nativeSceneLayout`/`nativeRenderGraph`/`nativeEventDispatch` flag-on behavior

**Code paths to remove from existing modules**:

| File | What to remove |
|---|---|
| `packages/engine/src/loop/loop.ts` | `experimental.nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, `nativeEventDispatch` options and branches gated on them |
| `packages/engine/src/loop/paint.ts` | `paintNativeSnapshotMs` accumulator and snapshot bridge calls |
| `packages/engine/src/loop/layout.ts` + `layout-adapter.ts` | Native layout writeback logic (FFI roundtrip). Taffy in TS stays. |
| `packages/engine/src/mount.ts` | Public API surface for the four dropped flags |
| `packages/engine/src/loop/walk-tree.ts` | Branches gated on retained-native flags |
| `packages/engine/src/reconciler/reconciler.ts` | Retained-native mutation propagation |
| `packages/engine/src/ffi/vexart-bridge.ts` | Exports: `vexart_scene_*`, `vexart_scene_layout_*`, `vexart_render_graph_*`, `vexart_frame_choose_strategy`, `vexart_scene_apply_mutations`, `vexart_event_dispatch_*`. **Keep**: paint, image, canvas, kitty, composite, layout-compute (Taffy bridge) FFI. |

### In scope — native crate removals

**Verify usage first, then remove**:

| Path | Action |
|---|---|
| `native/libvexart/src/scene.rs` | Drop entirely if no consumer remains |
| `native/libvexart/src/render_graph/` | Drop entirely |
| `native/libvexart/src/layout/` | Drop ONLY writeback path; retain layout-compute pieces if used by paint pipelines |
| `native/libvexart/src/frame.rs` | Drop `frame_choose_strategy` retained-side logic; keep paint/composite frame management |
| `native/libvexart/src/lib.rs` | Remove public FFI exports for dropped subsystems |

### In scope — PRD and doc updates

1. **`docs/PRD.md`** — Add DEC-014; update §6.7 to reflect new boundary; update §11 retained overlay to mark reverted phases.
2. **`docs/PRD-RUST-RETAINED-ENGINE.md`** — Add SUPERSEDED header with date, link to this proposal, bench rationale.
3. **`docs/ROADMAP-RUST-RETAINED-ENGINE.md`** — Same SUPERSEDED treatment.
4. **`AGENTS.md`** — Update engine boundary description: TS = scene + reactivity + layout; Rust = paint + composite + transport.

### In scope — public API change

`mount({ experimental: { ... } })` currently exposes the four flags being dropped.

**Removed**:
- `nativeSceneGraph`
- `nativeSceneLayout`
- `nativeRenderGraph`
- `nativeEventDispatch`

**Retained** (unchanged):
- `nativePresentation`
- `nativeLayerRegistry`
- `forceLayerRepaint`

Per `docs/API-POLICY.md` §5.3 this is a breaking change (removing public symbols) → 0.x minor bump.

### In scope — phases to mark REVERTED

These phases were predicated on Rust retained being the right path. Re-tag with a `REVERTED by phase-14` note pointing to this proposal:

| Phase | Location |
|---|---|
| `phase-3b-native-scene-graph` | `openspec/changes/phase-3b-native-scene-graph/` |
| `phase-3c-native-layout-hit-test` | `openspec/changes/phase-3c-native-layout-hit-test/` |
| `phase-3d-native-render-graph` | `openspec/changes/phase-3d-native-render-graph/` |
| `phase-3e-native-frame-orchestrator` | `openspec/changes/phase-3e-native-frame-orchestrator/` |
| `phase-3f-native-default-cutover` | `openspec/changes/phase-3f-native-default-cutover/` |
| `phase-3g-native-cleanup` | `openspec/changes/phase-3g-native-cleanup/` |
| `phase-4a-native-layout-hit-test-cutover` | `openspec/changes/phase-4a-native-layout-hit-test-cutover/` |
| `phase-4b-native-transform-hit-test` | `openspec/changes/phase-4b-native-transform-hit-test/` |
| `phase-13-rust-retained-mutation-protocol` | `openspec/changes/phase-13-rust-retained-mutation-protocol/` |

### Out of scope — what stays untouched

| Subsystem | Files / modules |
|---|---|
| `nativePresentation` flag + SHM/file/direct transport | `packages/engine/src/ffi/native-presentation-*` |
| `nativeLayerRegistry` flag + FFI | `packages/engine/src/ffi/native-layer-registry*` |
| WGPU paint pipelines | `native/libvexart/src/paint/` (rect, gradients, glow, shadow, blur, backdrop, starfield, nebula) |
| Composite | `native/libvexart/src/composite/` |
| Kitty encoder + transport | `native/libvexart/src/kitty/` |
| Image assets | `native/libvexart/src/image_asset.rs`, `packages/engine/src/ffi/native-image-assets*` |
| Canvas display list | `native/libvexart/src/canvas_display_list.rs`, `packages/engine/src/ffi/native-canvas-display-list*` |
| Text (MSDF) | `native/libvexart/src/text/` |
| GPU renderer backend + layer strategy | `packages/engine/src/ffi/gpu-renderer-backend.ts`, `gpu-layer-strategy.ts` |

### Out of scope — phases that remain valid (keep archived as-is)

- `phase-2b-native-presentation` — presentation, valid
- `phase-2c-native-layer-registry` — presentation, valid
- `phase-4c-native-image-asset-handles` — paint-side, valid
- `phase-4d-native-canvas-display-list` — paint-side, valid
- `phase-12-canvas-display-list-replay` — active, canvas, valid
- `phase-12-opencode-cosmic-showcase` — active, example showcase

## Capabilities

### New Capabilities

None. This is a removal/revert change.

### Modified Capabilities

- `engine-mount-api`: `mount()` experimental options surface loses four flags. No new behavior is introduced; the TS path becomes the only path for scene/render/layout/event.

## Approach

1. **Delete engine package files** that exist solely for the retained native path (~15 files + associated tests).
2. **Strip retained-native branches** from loop.ts, paint.ts, layout.ts, walk-tree.ts, reconciler.ts, mount.ts — leave the TS-only path as the sole path.
3. **Trim vexart-bridge.ts** FFI exports: remove scene/render/layout/event symbols, keep paint/composite/image/canvas/kitty FFI.
4. **Delete native crate modules**: scene.rs, render_graph/, layout writeback in layout/, retained frame strategy in frame.rs. Remove corresponding `pub fn` FFI exports from lib.rs.
5. **Update docs**: PRD (DEC-014), PRD-RUST-RETAINED-ENGINE (SUPERSEDED header), ROADMAP-RUST-RETAINED-ENGINE (SUPERSEDED header), AGENTS.md (boundary description).
6. **Re-tag reverted phases**: add `REVERTED by phase-14` note to each proposal.md in the nine reverted phase directories.
7. **Run full test suite + typecheck** to verify no dangling imports.

## Affected areas

| Area | Impact | Description |
|---|---|---|
| `packages/engine/src/ffi/` | Removed | ~15 files deleted (retained-native FFI bridge modules + tests) |
| `packages/engine/src/loop/` | Modified | Remove retained-native branches from loop, paint, layout, walk-tree |
| `packages/engine/src/reconciler/` | Modified | Remove retained-native mutation propagation |
| `packages/engine/src/mount.ts` | Modified | Drop four experimental flags from public API |
| `native/libvexart/src/` | Removed | scene.rs, render_graph/, layout writeback, retained frame logic |
| `native/libvexart/src/lib.rs` | Modified | Remove FFI exports for dropped subsystems |
| `docs/PRD.md` | Modified | Add DEC-014, update §6.7 and §11 |
| `docs/PRD-RUST-RETAINED-ENGINE.md` | Modified | Add SUPERSEDED header |
| `docs/ROADMAP-RUST-RETAINED-ENGINE.md` | Modified | Add SUPERSEDED header |
| `AGENTS.md` | Modified | Update engine boundary description |
| `packages/styled/etc/styled.api.md` | Possibly modified | Snapshot may need regen if engine types changed |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tests that depend on retained-native code paths must be deleted | High | Estimate ~20-30 test files/modules. Delete, not migrate. |
| `examples/opencode-cosmic-shell/app.tsx` references retained-native APIs | Low | Verified: it uses no retained-native APIs directly. Should work unchanged. |
| Bench scripts (`opencode-cosmic-perf.tsx`) reference dropped flags | Medium | Update `--path` flag handling in `scripts/frame-breakdown.tsx` to remove rust-retained toggle. |
| `packages/styled/etc/styled.api.md` snapshot drift | Low | Regenerate with `bun run api:update` after changes. |
| Dead FFI imports in Rust after module removal | Medium | `cargo test` and `cargo build` will catch compile errors. |
| `text-layout.ts` shared between retained and non-retained paths | Medium | Verify before deleting — may be used by TS paint path too. |

## Rollback plan

The commit history for the retained-native path is the rollback. Key refs:

| Commit | Description |
|---|---|
| `d47d7a4` | `feat(rendering): complete native render graph cutover` |
| `1f2c5c8` | `feat(retained): add native interaction frame cutover` |
| `1486616` | `feat(retained): complete native cutover cleanup` |
| `1e4d685` | `fix(layout): close native parity gaps` |
| `b7003a0` | `feat(interaction): add native transform hit-testing` |
| `e1a4cdc` | `feat(engine): harden native render graph` |
| `41a0f6d` | `chore(api): update engine snapshot` |

Full revert: `git revert` the phase-14 commit(s). The four flags reappear in the experimental options, the Rust retained modules return, and the dual-path logic is restored.

## Dependencies

- Bench results must be reproducible from `/tmp/cosmic-*.json` and `/tmp/bench-*.json`.
- `cargo test` must pass before and after native crate changes.
- `bun typecheck` must pass before and after engine package changes.

## Success criteria

- [ ] cosmic-shell-1080p TS path p95 ≤ 16 ms after cleanup (currently 15.84 ms; no regression)
- [ ] dashboard-1080p TS path p95 ≤ 6 ms after cleanup (currently 5.36 ms; no regression)
- [ ] All non-retained tests pass (`bun test`)
- [ ] `bun typecheck` passes with zero errors
- [ ] `cargo test` passes in `native/libvexart/`
- [ ] `examples/opencode-cosmic-shell/app.tsx` runs unchanged
- [ ] Four experimental flags (`nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, `nativeEventDispatch`) removed from public API surface
- [ ] `nativePresentation` and `nativeLayerRegistry` flags still functional
- [ ] DEC-014 added to PRD §12
- [ ] PRD-RUST-RETAINED-ENGINE and ROADMAP-RUST-RETAINED-ENGINE marked SUPERSEDED
- [ ] Nine reverted phase directories tagged with REVERTED note
