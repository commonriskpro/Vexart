# Vexart — Rust-Retained Engine Roadmap

**Status**: Adopted implementation roadmap — founder decisions recorded  
**Source PRD**: [`docs/PRD-RUST-RETAINED-ENGINE.md`](./PRD-RUST-RETAINED-ENGINE.md)  
**Last updated**: April 2026

> This roadmap is promoted by DEC-012 in [`docs/PRD.md`](./PRD.md). It is the execution sequence for the retained-engine migration. The master PRD owns product scope; this document owns retained-engine phase sequencing.

---

## Objective

Move Vexart from a TypeScript-owned render pipeline to a Rust-retained engine while preserving the public JS/JSX API.

Primary outcome:

```txt
JS/Solid API remains stable
  -> JS sends mutations/events via Bun FFI
  -> Rust owns scene graph, layout, render graph, layers, paint, composite, and Kitty output
  -> Normal presentation sends 0 raw RGBA bytes to JS
```

---

## Roadmap Principles

- Preserve public API first. No user-facing JSX or component migration.
- Remove RGBA transfer to JS before replacing the scene graph.
- Keep dual paths until visual and interaction parity are proven.
- Move ownership by boundary, not by file count.
- Every phase must leave the product runnable.
- Measure before deleting old code.

---

## Founder Decisions

Recorded from architecture planning discussion:

| Topic | Decision |
|---|---|
| Roadmap placement | Treat this work as **Phase 2b** because Phase 2 and part of Phase 3 are believed to be already implemented. |
| First implementation scope | Implement the full Native Presentation phase in one coordinated change, not only final-frame presentation. |
| Shader sequencing | Native presentation is mandatory before major new shader/material work. |
| Fallback | Keep the existing TS readback/render path for one compatibility window. |
| Input | Keep input parsing in JS initially; move hit-testing/event ownership later with the native scene graph path. |
| Stats | Add native presentation stats through FFI instead of relying on logs. |
| Transport | Support **SHM only** for the native presentation implementation scope. Defer direct/file transport work. |
| Feature flags | Use `nativePresentation`, `nativeLayerRegistry`, and `nativeSceneGraph`. |

Implication: Phase 0 is decision-complete, but not implementation-ready until baseline metrics and OpenSpec artifacts exist.

---

## Phase 0 — Approval And Baseline

**Goal**: Lock the decision and capture current performance before changing architecture.

**Why first**: Without baseline numbers, we cannot prove the Rust-retained path is better. Come on, hermano, otherwise we are just doing architecture cosplay.

**Scope**:

- Approve this roadmap and the PRD candidate.
- Use this roadmap as Phase 2b native presentation and Rust-retained migration planning.
- Capture current metrics for representative scenes.
- Define the compatibility window for the old TS render path.

**Deliverables**:

- OpenSpec change: `phase-2b-native-presentation` for the first implementation phase.
- Baseline benchmark report.
- Decision record for native presentation priority.
- Feature flags documented:
  - `nativePresentation`
  - `nativeLayerRegistry`
  - `nativeSceneGraph`

**Metrics to capture**:

- Bytes crossing Rust -> JS per frame.
- JS allocations per frame.
- FFI calls per frame.
- Kitty encode time.
- Paint/composite/readback time.
- Interaction latency.
- Idle CPU.

**Exit criteria**:

- Founder approves scope and sequencing.
- Baseline exists for showcase, heavy text, glass/effects, scrolling, and interaction scenes.
- No implementation phase starts without baseline.

---

## Phase 1 — Native Presentation

**Goal**: Stop returning raw RGBA buffers to JS during normal terminal presentation.

**Core idea**: Keep the current TS-owned render graph for now, but make Rust perform readback, Kitty encoding, and stdout output.

**Rust work**:

- Harden `vexart_kitty_emit_frame` for production path.
- Add native dirty-layer output:
  - `vexart_kitty_emit_layer`
  - `vexart_kitty_emit_region`
  - `vexart_kitty_delete_layer`
- Support SHM transport for native presentation.
- Return native presentation stats without returning pixel data.

**TS work**:

- Add backend result mode: `native-presented`.
- Route final-frame and layered presentation to Rust emit functions.
- Keep RGBA readback only for explicit debug/test/offscreen APIs.
- Update debug overlay to consume native output stats.

**Tests**:

- Golden parity for final-frame output.
- Golden parity for layered output.
- Terminal image deletion/replacement behavior.
- Fallback readback test path for screenshots.

**Performance target**:

- Raw RGBA bytes Rust -> JS during normal presentation: `0`.
- JS renderer allocation per presented frame: `< 64 KB`.

**Exit criteria**:

- Normal terminal rendering no longer allocates frame-sized `Uint8Array` in JS.
- Showcase renders unchanged.
- Old readback path is isolated behind debug/test code.

---

## Phase 2 — Native Layer Registry

**Goal**: Move layer target ownership, terminal image IDs, and layer lifecycle into Rust.

**Why now**: Once Rust presents output, Rust should own the things being presented. Otherwise TS and Rust fight over resource lifetime.

**Rust work**:

- Add `LayerRegistry` inside or alongside `ResourceManager`.
- Track:
  - layer key
  - GPU target
  - terminal image ID
  - bounds
  - z-order
  - dirty state
  - last-used frame
- Add FFI:
  - `vexart_layer_upsert`
  - `vexart_layer_mark_dirty`
  - `vexart_layer_reuse`
  - `vexart_layer_remove`
  - `vexart_layer_present_dirty`
- Integrate layer resources with eviction accounting.

**TS work**:

- Stop owning layer GPU target handles.
- Pass stable layer keys and layer descriptors to Rust.
- Keep existing layer assignment in TS for this phase.
- Remove TS-side terminal image placement where native path is enabled.

**Tests**:

- Layer creation/removal.
- Stable layer reuse.
- Layer move without repaint.
- Resize invalidation.
- Eviction does not delete visible layers.

**Exit criteria**:

- Rust owns all GPU targets used for terminal presentation.
- TS no longer tracks terminal image IDs in native presentation path.
- Resource stats include layer targets and terminal image resources.

---

## Phase 3 — Native Scene Graph Skeleton

**Goal**: Introduce a Rust-retained scene graph behind a feature flag without replacing rendering yet.

**Core idea**: Start by mirroring Solid mutations into Rust. Do not cut over layout/rendering until mutation parity is stable.

**Rust work**:

- Add scene module:
  - `scene/mod.rs`
  - `scene/node.rs`
  - `scene/props.rs`
  - `scene/tree.rs`
  - `scene/events.rs`
- Add FFI:
  - `vexart_scene_create`
  - `vexart_scene_destroy`
  - `vexart_node_create`
  - `vexart_node_destroy`
  - `vexart_node_insert`
  - `vexart_node_remove`
  - `vexart_node_set_props`
  - `vexart_text_set_content`
- Implement stable native node IDs.
- Implement parent/child ordering invariants.

**TS work**:

- Add native node handle wrapper.
- Add prop encoder with generated prop IDs.
- Mirror current Solid reconciler mutations into Rust when `nativeSceneGraph` is enabled.
- Keep TS `TGENode` as compatibility mirror in this phase.

**Tests**:

- Create/insert/remove/reorder tree operations.
- Text replacement.
- Prop update encoding.
- Destroy subtree behavior.
- Native scene snapshot equals TS tree snapshot for fixture UIs.

**Exit criteria**:

- Rust scene graph mirrors the TS tree for showcase fixtures.
- Feature flag can be enabled without rendering changes.
- No public API changes.

---

## Phase 4 — Native Layout, Damage, And Hit-Testing

**Goal**: Rust uses the retained scene graph to compute layout, damage, layers, and hit-testing.

**Rust work**:

- Replace flat per-frame layout rebuild with retained scene traversal.
- Map scene nodes to Taffy nodes.
- Compute layout dirty regions.
- Compute visual damage regions.
- Implement scroll viewport clipping.
- Implement hit-testing with:
  - transforms
  - scroll clipping
  - pointer passthrough
  - minimum hit area
  - pointer capture
- Emit event records for JS callback dispatch.

**TS work**:

- Route pointer/key input to Rust under flag.
- Add event decoder.
- Keep JS callback registry.
- Preserve `stopPropagation()` behavior.
- Preserve focus APIs while Rust owns focus traversal data.

**Tests**:

- Layout parity against existing output.
- Scroll hit-testing.
- Offscreen item hit prevention.
- Pointer capture.
- Press bubbling and stop propagation.
- Keyboard focus order.

**Exit criteria**:

- Rust can compute layout and hit-testing from native scene graph.
- JS no longer needs to walk native-enabled scenes for layout or input.
- Interaction parity passes.

---

## Phase 5 — Native Render Graph And Pipeline Batching

**Goal**: Rust generates render operations directly from the native scene graph.

**Rust work**:

- Add native render graph module:
  - `render_graph/mod.rs`
  - `render_graph/effects.rs`
  - `render_graph/text.rs`
  - `render_graph/images.rs`
  - `render_graph/materials.rs`
- Generate render ops from scene + computed layout.
- Batch ops by pipeline natively.
- Connect existing shaders through Rust prop handling:
  - rect/rounded/per-corner
  - border
  - shadow
  - glow
  - gradients
  - backdrop filters
  - self filters
  - images
  - text
- Add native material extension points for future visual work.

**TS work**:

- Stop packing `cmd_kind` batches for native scene path.
- Keep old render graph only for fallback path.
- Remove duplicated shader reachability logic from native path.

**Tests**:

- Golden parity for all showcase tabs.
- Effect-specific golden tests.
- Text layout/render tests.
- Backdrop/self-filter tests.
- Layer and transform tests.

**Exit criteria**:

- Native scene path renders showcase without TS render graph generation.
- Shader features are reachable by Rust prop handling.
- TS render graph is fallback-only.

---

## Phase 6 — Native Frame Orchestrator

**Goal**: Rust owns full frame scheduling decisions for native scene path.

**Current implementation note**:

- Native frame planning is live behind the retained path.
- Rust chooses `skip-present`, `layered-dirty`, `layered-region`, and `final-frame`.
- Compositor-only retained frames skip walk/layout/assign/paint and recompose retained layer targets directly.
- A dedicated native retained transform/opacity primitive (`vexart_composite_update_uniform`) is part of the production compositor-only path.
- Phase 6 verification now includes FFI-count benchmarking with `0` no-op calls and `6` dirty-frame calls in the benchmark harness.
- Remaining roadmap work now shifts to default cutover and cleanup, not to basic Phase 6 ownership.

**Rust work**:

- Add frame orchestrator:
  - `frame/mod.rs`
  - `frame/scheduler.rs`
  - `frame/strategy.rs`
  - `frame/stats.rs`
- Implement native strategy selection:
  - `skip-present`
  - `layered-dirty`
  - `layered-region`
  - `final-frame`
- Integrate compositor animation fast path for transform/opacity.
- Emit structured stats each frame.

**TS work**:

- Reduce render loop to:
  - request frames
  - forward terminal/input events
  - call native render/present
  - dispatch callbacks
  - show debug stats
- Keep JS scheduler only for user-facing timing and compatibility.

**Tests**:

- No-op frame does not repaint.
- Dirty region stays bounded.
- Animation path avoids layout when valid.
- Resize invalidates correctly.
- Resource budget pressure does not crash.

**Exit criteria**:

- Native path owns frame lifecycle from scene mutation to terminal presentation.
- FFI calls per dirty frame meet target.
- No raw RGBA crosses to JS in normal mode.

---

## Phase 7 — Default Cutover

**Goal**: Make the Rust-retained path the default runtime.

**Prerequisites**:

- Phase 1-6 exit criteria met.
- Golden image parity passes.
- Interaction parity passes.
- API extractor shows no unapproved public break.
- Benchmarks meet or beat baseline.
- Fallback path has a defined deprecation/removal decision.

**Tasks**:

- Flip default feature flag.
- Keep emergency fallback via environment variable for one compatibility window.
- Update docs and examples.
- Update `docs/ARCHITECTURE.md` after founder approval.
- Update `docs/PRD.md` after founder approval.
- Archive OpenSpec change.

**Current implementation note**:

- Kitty-compatible transports now default the retained scene/event/layout/render/presentation stack on.
- Native presentation now follows the active Kitty transport (`direct`, `file`, or `shm`) instead of limiting the default cutover to SHM-only sessions.
- `VEXART_RETAINED=0` now disables the full retained stack for the compatibility window.
- Remaining open gates are golden parity and API-snapshot execution, not the default-flag flip itself.

**Exit criteria**:

- Native retained path is default.
- Old TS render graph path is deprecated, test-only, or removed by decision.
- Public API remains stable.

---

## Phase 8 — Cleanup And Simplification

**Goal**: Remove dead code after native cutover.

**Tasks**:

- Delete TS render graph hot path if no longer needed.
- Delete TS layer target cache and sprite orchestration.
- Delete old backend result modes that returned raw presentation buffers.
- Keep explicit screenshot/offscreen APIs with intentional readback.
- Rename remaining TS backend files to reflect binding-shell role.

**Exit criteria**:

- TS renderer internals are a thin binding shell.
- Rust is the only implementation owner for rendering behavior.
- Tests and docs no longer describe stale hybrid ownership.

---

## Dependency Graph

```txt
Phase 0 Baseline
  -> Phase 1 Native Presentation
    -> Phase 2 Native Layer Registry
      -> Phase 3 Native Scene Graph Skeleton
        -> Phase 4 Native Layout/Damage/Hit-Test
          -> Phase 5 Native Render Graph
            -> Phase 6 Native Frame Orchestrator
              -> Phase 7 Default Cutover
                -> Phase 8 Cleanup
```

Only Phase 1 can start immediately after approval. Every later phase depends on previous ownership being stable.

---

## Recommended Milestones

| Milestone | Included phases | Expected outcome |
|---|---|---|
| M1: No JS pixel payloads | Phase 1 | Rust emits terminal output directly |
| M2: Rust owns presentation resources | Phase 2 | Layer/image lifetime lives in Rust |
| M3: Rust scene mirror | Phase 3 | Native scene graph mirrors Solid mutations |
| M4: Rust computes frame prep | Phase 4 | Layout, damage, layers, hit-test native |
| M5: Rust renders from scene | Phase 5 | No TS render graph on native path |
| M6: Rust owns frame lifecycle | Phase 6 | JS only drives mutations/events/stats |
| M7: Native default | Phase 7-8 | Old hybrid path removed or isolated |

---

## Parallel Work Allowed

Can run in parallel with Phase 1:

- Define prop ID registry.
- Design native scene structs.
- Write prop decoder tests.
- Add benchmark harness for JS allocation and FFI call counts.

Must not run in parallel before prerequisites:

- Native render graph before native layout is stable.
- Native hit-testing before layout parity exists.
- Default cutover before event parity exists.
- Old path deletion before benchmark and golden parity sign-off.

---

## Stop Conditions

Pause the roadmap if any of these happen:

- Public JSX behavior changes unexpectedly.
- Native path cannot reproduce current showcase output.
- Interaction parity fails for focus, scroll, pointer capture, or press bubbling.
- Native presentation is slower than current path after obvious fixes.
- Debuggability regresses enough that bugs cannot be isolated quickly.

---

## First Implementation Slice

Start with this slice, not with native scene graph:

1. Add native layer/frame emit FFI needed by current TS backend.
2. Add `native-presented` backend result mode.
3. Route final-frame presentation through Rust Kitty output.
4. Route dirty layer presentation through Rust Kitty output.
5. Keep test screenshot readback unchanged.
6. Add stats for bytes emitted, bytes read back, encode time, and presentation mode.
7. Compare before/after baseline.

This slice gives the first real performance win without touching JSX, Solid, `TGENode`, or render graph ownership.
