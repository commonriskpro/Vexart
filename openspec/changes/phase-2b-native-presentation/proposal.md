# Proposal: Phase 2b — Native Presentation

## Intent

Move normal terminal presentation out of the TypeScript hot path and into `libvexart`, while preserving the current JS/JSX public API and keeping the existing TS readback path as a compatibility fallback.

The immediate problem is not that Rust cannot paint or encode Kitty output; it can. The problem is that the runtime still routes normal presentation through TypeScript in key paths, returning raw RGBA buffers to JS before terminal emission. This change makes Rust own presentation for final-frame and dirty-layer output using SHM transport only.

**PRD trace**:
- `docs/PRD.md §743-801` — Phase 2b native Kitty encoding and Tier 1 optimization goals.
- `docs/PRD-RUST-RETAINED-ENGINE.md §11-13` — native readback/presentation requirements and migration plan.
- `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 1` — Native Presentation phase.

## Scope

### In Scope

- Route normal final-frame presentation through native Kitty output.
- Route dirty layer presentation through native Kitty output.
- Add native layer/region/delete presentation exports required by the current TS backend.
- Add a `native-presented` backend result mode so TS can distinguish native terminal output from JS raw payload output.
- Keep screenshot/offscreen/debug readback paths working.
- Keep the current TS render graph, TS layer assignment, and JS input parsing unchanged.
- Support SHM transport only for this implementation scope.
- Add native presentation stats exposed through FFI.
- Preserve public JS/JSX API compatibility.

### Out of Scope

- Rust-retained scene graph.
- Native layout, damage, hit-testing, or event ownership.
- Native render graph generation.
- Direct/file Kitty transport implementation.
- Removing the TS readback/render path.
- New shader/material work beyond what is required to keep current rendering working.

## Decisions

| Topic | Decision |
|---|---|
| Roadmap placement | Phase 2b. Phase 2 and part of Phase 3 are considered already implemented. |
| First scope | Implement full Native Presentation in one coordinated change. |
| Shader sequencing | Native presentation gates major new shader/material work. |
| Fallback | Keep TS path for one compatibility window. |
| Input | Keep input parsing in JS for now. |
| Stats | Native stats exposed through FFI. |
| Transport | SHM only. |
| Feature flags | `nativePresentation`, `nativeLayerRegistry`, `nativeSceneGraph`. |

## Approach

1. Establish baseline metrics before changing code.
2. Extend native Kitty presentation APIs for frame/layer/region/delete output over SHM.
3. Extend backend contracts with `native-presented` and native stats.
4. Rewire `gpu-renderer-backend.ts` and `paint.ts` so normal presentation uses native output and does not pass raw RGBA to JS.
5. Keep test/offscreen readback using the existing raw path.
6. Add parity and fallback tests.
7. Compare after metrics against baseline.

## Affected Areas

| Area | Impact |
|---|---|
| `native/libvexart/src/kitty/*` | Harden and extend native presentation APIs. |
| `native/libvexart/src/lib.rs` | Add new FFI exports/stats wiring. |
| `native/libvexart/src/composite/*` | Provide target/layer readback data to Kitty emitter without JS. |
| `packages/engine/src/ffi/vexart-bridge.ts` | Add FFI signatures. |
| `packages/engine/src/ffi/renderer-backend.ts` | Add `native-presented` result contract. |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | Route presentation to native output and keep raw fallback/test path. |
| `packages/engine/src/loop/paint.ts` | Accept native-presented results without calling `layerComposer.render*Raw`. |
| `packages/engine/src/output/*` | Keep fallback/test path and avoid normal raw payload emission. |
| `packages/engine/src/loop/debug.ts` | Display native presentation stats. |

## Risks

| Risk | Mitigation |
|---|---|
| Native output regresses terminal presentation | Keep TS fallback behind flag/env override. |
| Stats contract becomes unstable | Use versioned packed stats struct. |
| SHM transport assumptions differ by terminal/tmux | Keep capability checks and fallback. |
| Tests depend on raw buffers | Keep explicit offscreen/readback API unchanged. |
| Layered native output is too large for one slice | Do not move scene graph/layer assignment; only presentation ownership changes. |

## Rollback Plan

- Disable `nativePresentation` feature flag.
- Use existing TS raw readback/presentation path.
- Revert new native FFI exports if not yet used by default.
- Keep screenshot/offscreen paths independent so test coverage survives rollback.

## Success Criteria

- [ ] Normal terminal presentation transfers 0 raw RGBA bytes from Rust to JS.
- [ ] Final-frame native presentation works through SHM.
- [ ] Dirty-layer native presentation works through SHM.
- [ ] Region/delete native presentation APIs exist and are covered by tests or smoke checks.
- [ ] TS fallback can be enabled for one compatibility window.
- [ ] `renderToBuffer`/screenshot paths still return raw buffers intentionally.
- [ ] Debug stats report native presentation mode and bytes/timing metrics.
- [ ] Showcase output remains visually equivalent.
