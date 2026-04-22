# Tasks: Phase 2b — Advanced Rendering + Tier 1 Optimizations

## Phase 1: Native target registry + compositing (BLOCKING)

- [x] 1.1 [ATOMIC] Replace `OffscreenTarget` with `TargetRecord`/`TargetRegistry` in `native/libvexart/src/composite/target.rs` (REQ-2B-001).
- [x] 1.2 [ATOMIC] Implement `vexart_composite_target_create/destroy/begin_layer/end_layer` in `native/libvexart/src/lib.rs` + `composite/mod.rs` (REQ-2B-001/002).
- [x] 1.3 [ATOMIC] Make `vexart_paint_dispatch`/`paint::PaintContext::dispatch` resolve real target handles, with `target=0` fallback (REQ-2B-007).
- [x] 1.4 [ATOMIC] Implement `composite_render_image_layer`, `copy_region_to_image`, and real full/region readback in `native/libvexart/src/composite/{mod.rs,readback.rs}` (REQ-2B-003/004/005).
- [x] 1.5 [ATOMIC] Wire backdrop filter + rounded-rect mask onto image pipeline reuse in `native/libvexart/src/composite/mod.rs` (REQ-2B-006).
- [x] 1.6 Add FFI exports/version bump in `native/libvexart/src/lib.rs`; add tests for invalid handles, nested layers, and buffer-too-small readback (REQ-2B-001/002/005).

## Phase 2: Rewire GPU backend (BLOCKING)

- [x] 2.1 [ATOMIC] Replace all `wgpu-canvas-bridge` layer/composite/readback calls in `packages/engine/src/ffi/gpu-renderer-backend.ts` with `vexart_*` equivalents (REQ-2B-008).
- [x] 2.2 [ATOMIC] Remove `beginWgpuCanvasTargetLayer`/final-frame bridge usage; switch context creation to `vexart_context_create` and image helpers to `vexart_paint_upload_image`/`vexart_paint_remove_image`.
- [x] 2.3 Delete `packages/engine/src/ffi/wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/`; grep gate zero `wgpu-canvas-bridge|tge_wgpu_canvas|createWgpuCanvasContext` refs (REQ-2B-008).
- [x] 2.4 Visual-check `showcase.tsx` after the rewire and log any target/composite regressions.

## Phase 3: Native Kitty encoding (depends on Slice 1)

- [x] 3.1 Add `base64` + `flate2` deps to `native/libvexart/Cargo.toml`; create `native/libvexart/src/kitty/{encoder.rs,writer.rs,transport.rs}` (REQ-2B-101/102/103/104/105).
- [x] 3.2 Implement `vexart_kitty_emit_frame` in `native/libvexart/src/lib.rs` and route TS output through one FFI call in `packages/engine/src/output/kitty.ts`.
- [x] 3.3 Keep SHM/file/direct transport selection working from Rust; add stdout-flush/error-path tests and a <0.5ms benchmark (REQ-2B-102/104/105).

## Phase 4: MSDF text pipeline (depends on Slice 1)

- [ ] 4.1 Create `packages/internal-atlas-gen` for TTF→MSDF PNG+metrics output (REQ-2B-201).
- [ ] 4.2 Implement `native/libvexart/src/text/{atlas.rs,glyph_info.rs,render.rs,mod.rs}` for atlas load, metrics parse, and dispatch (REQ-2B-202/204).
- [ ] 4.3 Add `native/libvexart/src/paint/{pipelines/glyph.rs,shaders/msdf_text.wgsl}` and wire the new cmd kind in `paint/mod.rs` (REQ-2B-203/204).
- [ ] 4.4 Delete bitmap text references; grep gate zero `tge_draw_text|tge_load_font_atlas|tge_measure_text` matches in `packages/` and `native/` (REQ-2B-205).
- [ ] 4.5 Add visual tests at 8px, 16px, 32px, and 72px for text sharpness (REQ-2B-201/203/204).

## Phase 5: Compositor animations + self filters + hints (depends on Slice 1)

- [ ] 5.1 Add `filter` prop plumbing in `packages/engine/src/types.ts` and interactive style merging (REQ-2B-401/405).
- [ ] 5.2 Implement `native/libvexart/src/paint/{pipelines/filter.rs,shaders/self_filter.wgsl}` and hook self-filter dispatch in `paint/mod.rs` (REQ-2B-402/403/404).
- [ ] 5.3 Wire `willChange` and `contain` in `packages/engine/src/loop/assign-layers.ts` and invalidation boundaries (REQ-2B-501/502/503).
- [ ] 5.4 Add compositor descriptor registration + fast-path frame logic in `packages/engine/src/animation/compositor-path.ts` (REQ-2B-301/302/303/304/305).
- [ ] 5.5 Add fallback-warning tests and microbenchmarks for animation/filter/hint behavior in `packages/engine/src/animation/compositor-path.ts` and `packages/engine/src/loop/assign-layers.ts` (REQ-2B-301/305/401/405/501/503).

## Phase 6: PipelineCache + ResourceManager (parallel after Slice 1)

- [ ] 6.1 Create `native/libvexart/src/paint/pipeline_cache.rs` and persist shared cache loading/saving (REQ-2B-601/602/603/604).
- [ ] 6.2 Create `native/libvexart/src/resource/{mod.rs,priority.rs,eviction.rs,stats.rs}` and route all GPU assets through `ResourceManager` (REQ-2B-701/702/703/704/705).
- [ ] 6.3 Wire `packages/engine/src/resources/stats.ts` + `packages/engine/src/ffi/functions.ts` to the budget/stats FFI; add eviction/cold-start/warm-start tests.

## Phase 7: Exit gates + polish

- [ ] 7.1 Run `cargo test` in `native/libvexart/` and `bun test` + `bun run typecheck` in `packages/engine/` clean.
- [ ] 7.2 Run `bun run lint:boundaries` and `bun run showcase`; verify perf targets, then mark completed checkboxes in `openspec/changes/phase-2b-advanced-rendering/tasks.md`.
