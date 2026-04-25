# Design: Phase 14 — Drop Rust Retained Scene Graph / Render Graph / Scene Layout / Event Dispatch

## 1. Final Architecture (target state)

After cleanup, the FFI boundary is **paint-forward only**. Everything above paint lives in the TS heap; everything at paint and below lives in Rust. No return-trip snapshot crosses FFI.

```txt
JSX (SolidJS createRenderer)
  → reconciler (TS) ─── scene graph + reactivity
    → walk-tree (TS) ─── visual prop coalescing, text measurement
      → layout (Taffy in TS) ─── flexbox, sizing constraints
        → render-graph (TS) ─── ordered paint commands, layer plan
          ══════════════ FFI boundary (paint-forward) ══════════════
          → paint (Rust/WGPU) ─── SDF rects, gradients, glow, shadow, blur, text
            → composite (Rust) ─── layer composition, dirty-region readback
              → kitty encoding (Rust) ─── base64 / zstd / SHM
                → transport (Rust) ─── SHM / file / direct → terminal
```

**FFI crossing points** (all TS → Rust, no Rust → TS snapshot):
- Paint commands via packed ArrayBuffer (`vexart_paint_*`, `vexart_composite_*`)
- Image asset upload/evict (`vexart_image_*`)
- Canvas display-list register/replay (`vexart_canvas_*`)
- Kitty presentation emit (`vexart_present_*`)
- Text layout measurement (`vexart_text_*`) — stays, used by `walk-tree.ts` and `gpu-renderer-backend.ts`

**No FFI for**: scene graph mutations, layout compute/writeback, render-graph snapshot, event dispatch, frame strategy selection.

Refs: `docs/ARCHITECTURE.md` §5 (frame lifecycle), `docs/PRD.md` §6.7 (retained overlay — **superseded by this design**).

## 2. Architecture Decisions

### D1: Source-of-truth for scene graph is TS

| | |
|---|---|
| **Decision** | TS reconciler owns the scene graph. No native scene mirror. |
| **Alternatives** | (a) Keep dual-path with experimental flags. (b) Full Rust retained. (c) Hybrid with cached snapshots. |
| **Rationale** | cosmic-shell-1080p: `paintNativeSnapshotMs` = 39 ms p95 — FFI snapshot cost under SolidJS reactivity collapses the retained amortization model. TS path total = 15.84 ms p95 vs Rust retained 75.42 ms (4.8×). Dashboard-1080p gap is only 17% — confirms overhead is mutation-driven, not language-intrinsic. |
| **Tradeoffs** | Gives up theoretical native scaling for scenes >5000 nodes (not on v0.9 roadmap). |

### D2: Layout source-of-truth is Taffy in TS

| | |
|---|---|
| **Decision** | Taffy runs in TS via `walk-tree.ts` → Clay/Taffy binding. No native layout compute or writeback FFI. |
| **Alternatives** | (a) Native Taffy via FFI (`vexart_layout_compute`). (b) Port Taffy to a separate Rust crate with shared memory. |
| **Rationale** | cosmic-shell: `layoutMs` = 25 ms + `layoutWritebackMs` = 20 ms on native path vs `layoutMs` = 3.09 ms on TS path (8× slower native). The writeback serialization cost dominates. |
| **Tradeoffs** | Layout is single-threaded TS work. Not the bottleneck at 1080p (3 ms p95). |

### D3: Event dispatch is TS-only

| | |
|---|---|
| **Decision** | All pointer/keyboard dispatch stays in TS. Drop `native-event-dispatch-flags.ts`, `native-scene-events.ts`. |
| **Alternatives** | Native event dispatch with FFI callback return. |
| **Rationale** | TS dispatch shipped and stabilized before retained; native added complexity (callback registry, event record serialization) with no measurable latency improvement. |
| **Tradeoffs** | None — TS dispatch is <0.5 ms in all benchmarks. |

### D4: Paint-forward boundary stays Rust

| | |
|---|---|
| **Decision** | Rust owns paint, composite, Kitty encoding, transport. Boundary is one-way: TS → Rust paint commands. |
| **Alternatives** | TS paint via wgpu-js or WebGPU bindings. |
| **Rationale** | `paintBackendEndMs` ≈ 7.8 ms p95 in BOTH paths — confirms Rust paint is correctly sized and not the bottleneck. Moving paint to TS would add JS GC pressure in the hot path. |
| **Tradeoffs** | Maintains FFI dependency, but boundary is simple (packed buffer, no return-trip). |

### D5: PRD bump 0.6 → 0.7

| | |
|---|---|
| **Decision** | Bump PRD version. Add DEC-014 documenting partial revert of DEC-012. |
| **Alternatives** | Changelog-only update. |
| **Rationale** | Removing 4 public `experimental.*` flags = breaking change per `docs/API-POLICY.md` §5.3. Pre-1.0 minor bumps are cheap and document evolution per §6.1. |
| **Tradeoffs** | None. |

### D6: Reverted phases archived with `reverted-` prefix

| | |
|---|---|
| **Decision** | Move 9 reverted phase directories to `openspec/changes/archive/` with `reverted-` prefix. |
| **Alternatives** | In-place REVERTED.md marker. |
| **Rationale** | Keeps active `openspec/changes/` directory clean. Preserves full history in archive. Prefix makes reverted status grep-friendly. |
| **Tradeoffs** | Phase names change in filesystem — references in Engram/memory need the new path. |

## 3. Removal Sequence

Each slice keeps `bun typecheck`, `bun test`, and `bench:dashboard-1080p` green.

| Slice | Description | Verification |
|---|---|---|
| **S1** | Lock public API: remove 4 flags from `mount()` types in `mount.ts`. Typecheck-only. | `bun typecheck` |
| **S2** | Delete standalone retained-flag tests: `native-default-cutover.test.ts`, `native-render-graph.test.ts`, `native-scene.test.ts`, `native-scene-layout-parity.test.ts`, `native-frame-orchestrator.test.ts`, `native-scene-graph-flags.test.ts`. | `bun test` |
| **S3** | Strip flag branches from `loop/loop.ts`, `paint.ts`, `layout.ts`, `layout-adapter.ts`, `walk-tree.ts`, `mount.ts`, `reconciler.ts`. Remove `paintNativeSnapshotMs` accumulator. | `bun typecheck && bun test` |
| **S4** | Delete TS retained-bridge files: `native-scene.ts`, `native-render-graph.ts`, `native-render-graph-flags.ts`, `native-scene-graph-flags.ts`, `native-scene-layout-flags.ts`, `native-scene-events.ts`, `native-event-dispatch-flags.ts`, `native-frame-orchestrator.ts`, `native-retained-flags.ts`. Clean `vexart-bridge.ts` exports. | `bun typecheck && bun test` |
| **S5** | Drop FFI exports in `native/libvexart/src/lib.rs`: `vexart_scene_*`, `vexart_render_graph_*`, `vexart_scene_layout_*`, `vexart_frame_choose_strategy`, `vexart_event_dispatch_*`. | `cargo test` |
| **S6** | Delete Rust modules: `scene.rs`, `render_graph/`, `layout/` (entire — `mod.rs`, `tree.rs`, `writeback.rs`). Remove retained-side logic from `frame.rs`. | `cargo test && cargo build --release` |
| **S7** | Update docs: PRD (DEC-014, §6.7, §11), `PRD-RUST-RETAINED-ENGINE.md` (SUPERSEDED), `ROADMAP-RUST-RETAINED-ENGINE.md` (SUPERSEDED), `AGENTS.md` boundary, `ARCHITECTURE.md` §5 target state. Regen `styled.api.md`. | `bun typecheck` |
| **S8** | Move 9 reverted phases to `openspec/changes/archive/reverted-{name}/`. | `ls openspec/changes/archive/` |
| **S9** | Bench validation: `cosmic-shell-1080p` TS p95 ≤ 16 ms, `dashboard-1080p` TS p95 ≤ 6 ms. | `frame-breakdown.tsx --scenarios=*` |

## 4. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| TS Taffy cold-start skew in bench | Warmup frames (already 15) ensure Taffy is loaded before measurement. |
| `paintNativeSnapshotMs` removal breaks `frame-breakdown.tsx` profiler | Keep field as `0` in JSON output or remove with a version bump to the profiler schema. Verify JSON parse. |
| `examples/opencode-cosmic-shell/app.tsx` passes internal flags via `@vexart/app` | Pre-verified: `@vexart/app` does not forward retained flags. Confirmed in proposal. |
| Public types in `.d.ts` reference dropped types | Run `bun run build:dist` after S4; regenerate `.d.ts`. Part of S7. |
| `packages/styled/etc/styled.api.md` snapshot noise | Regen with `bun run api:update` in S7. |
| Retained test cleanup leaves broken `import` in surviving test files | S3/S4 run typecheck after each file-level change. CI is the gate. |

## 5. Success Criteria

Restated from proposal, with verification commands:

| # | Criterion | Verification |
|---|---|---|
| 1 | cosmic-shell-1080p TS p95 ≤ 16 ms | `bun --conditions=browser run scripts/frame-breakdown.tsx --frames=60 --warmup=15 --scenarios=cosmic-shell-1080p --path=ts --transport=shm --native-presentation` |
| 2 | dashboard-1080p TS p95 ≤ 6 ms | Same with `--scenarios=dashboard-1080p` |
| 3 | All non-retained tests pass | `bun test` |
| 4 | Typecheck clean | `bun typecheck` |
| 5 | Cargo tests pass | `cd native/libvexart && cargo test` |
| 6 | cosmic-shell example runs unchanged | `bun --conditions=browser run examples/opencode-cosmic-shell/app.tsx` |
| 7 | 4 experimental flags removed from public API | grep `mount.ts` confirms absence |
| 8 | `nativePresentation` + `nativeLayerRegistry` still functional | Run cosmic-shell with those flags ON; verify SHM transport active |
| 9 | DEC-014 in PRD §12 | `grep DEC-014 docs/PRD.md` |
| 10 | PRD-RUST-RETAINED-ENGINE + ROADMAP marked SUPERSEDED | Header check |
| 11 | 9 reverted phases in archive | `ls openspec/changes/archive/reverted-*` |

## 6. Out of Scope

These are explicitly NOT addressed by phase-14:

- **Layer caching** for cosmic-shell glassmorphism panels (next phase — closes ~5–7 ms toward 120fps).
- **Cached background RT** for `cosmic-bg` static gradient.
- **Instanced starfield draw** optimization (invalidation, not initial implementation).
- **Dirty regions for editor** workloads.
- **Native MSDF text** (PRD-tracked under Phase 2b, separate SDD change).
- **Removal of TS compatibility fallback** for `nativePresentation` / `nativeLayerRegistry` — those flags remain untouched.
