# Proposal: Phase 2b — Advanced Rendering + Tier 1 Optimizations

## Intent

Fix the **dual-GPU-context visual blocker**: `libvexart` (WGPU 29) and `wgpu-canvas-bridge` (WGPU 26) split target lifecycle, compositing, and readback across two incompatible surfaces. Until unified into one native context, the paint pipeline cannot produce correct pixels for composited layers. Once unified, unlock the PRD DEC-008 advanced rendering features (MSDF text, compositor-thread animations, self filters, declarative hints) and DEC-010 Tier 1 optimizations (native Kitty encoding, pipeline cache, unified GPU memory budget).

**PRD trace**: `docs/PRD.md §743-801` (Phase 2b scope + exit criteria), `docs/PRD.md §12 DEC-008` (advanced rendering), `docs/PRD.md §12 DEC-010` (Tier 1 performance), `docs/PRD.md §12 DEC-012` (GPU-only rendering).

## Scope

### In Scope

**Goal A — Single GPU context (visual blocker)**:
- Port target lifecycle (create/destroy/begin-end layer) to `libvexart`
- Port compositing (composite image layer, copy region to image) to `libvexart`
- Port backdrop filter + rounded rect mask to `libvexart`
- Port readback (full + region) from stubs to real GPU→CPU transfer
- Make `vexart_paint_dispatch` render into caller-specified target
- Rewire `gpu-renderer-backend.ts` (~15 remaining bridge call sites) to `vexart_*` only
- Delete `wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/`

**Goal B — Advanced rendering features**:
- MSDF text pipeline (atlas gen, WGSL shader, 8-72px, 1024×1024 atlas)
- Compositor-thread animation fast path (transform/opacity, 60fps under load)
- Self filters (`filter` prop: blur, brightness, contrast, etc.)
- Declarative hints (`willChange`, `contain` props)
- Native Kitty protocol encoding in Rust (base64 + zlib + escape assembly, <0.5ms)
- WGPU PipelineCache persisted to disk (<120ms cold, <50ms warm)
- Unified GPU memory budget with LRU eviction (128MB default)

### Out of Scope

- Blend modes (CSS `mix-blend-mode`) — deferred past Phase 2b
- Gradient stroke — deferred past Phase 2b
- Frame budget scheduler (Tier 2) — Phase 3
- Viewport culling in Rust (Tier 2) — Phase 3
- Windows platform support — v1.x
- `@vexart/styled` token migration to MSDF — separate follow-up

## Capabilities

### New Capabilities

- `gpu-context-unification`: Single WGPU device/queue in `libvexart`; target registry, layer lifecycle, compositing, readback all owned by Rust. Eliminates the WGPU 26/29 split.
- `msdf-text-pipeline`: Offline MSDF atlas generation → runtime atlas loading → WGSL distance-field sampling. Replaces bitmap glyph path. Covers 8-72px range with 1024×1024 atlas per font.
- `compositor-thread-animation`: Transform/opacity fast path bypassing reconciler + layout + paint. Persistent GPU targets per compositor-animated node.
- `self-filters`: `filter` prop on elements (blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate). Reuses backdrop-filter shader pipeline with self-bound source.
- `native-kitty-encoding`: Base64 + zlib + Kitty escape-sequence assembly entirely in Rust. Single FFI call: readback handle → encoded stdout bytes.
- `gpu-resource-manager`: Unified `ResourceManager` in Rust with priority-based LRU eviction (128MB default). All GPU-resident assets routed through one allocator.
- `pipeline-cache`: WGPU `PipelineCache` persisted to `~/.cache/vexart/pipeline.{platform}-{version}.bin`. Invalidation on version change.

### Modified Capabilities

- `package-boundaries`: New modules (`kitty/encoder.rs`, `kitty/writer.rs`, `text/atlas.rs`, `text/render.rs`, `text/glyph_info.rs`, `resource/*`, `paint/pipeline_cache.rs`, `paint/pipelines/filter.rs`, `paint/pipelines/glyph.rs`, `paint/pipelines/blend.rs`, `paint/shaders/msdf_text.wgsl`, `paint/shaders/self_filter.wgsl`) added to ARCHITECTURE §4.1 target tree — Phase 2b stubs become real implementations.

## Approach

**Single-context native cutover** (exploration recommendation #2). Dependency order:

1. **Target lifecycle + compositing in Rust** — make `composite/target.rs` own real WGPU textures; make `composite/readback.rs` do real async map-then-copy; make `vexart_paint_dispatch` accept and render into caller-specified target handle.
2. **Rewire gpu-renderer-backend.ts** — replace ~15 remaining `renderWgpuCanvasTarget*Layer` / `filterWgpuCanvasImage*` / `maskWgpuCanvasImage*` / target-lifecycle calls with `vexart_paint_dispatch` graph-buffer commands and `vexart_composite_*` FFI. Delete `gpu-stub.ts` and `wgpu-canvas-bridge.ts`.
3. **Rust Kitty encoding** — port `packages/engine/src/output/kitty.ts` TS path to `native/libvexart/src/kitty/encoder.rs` + `writer.rs`. Depends on real readback (step 1).
4. **MSDF text pipeline** — offline atlas gen tool + WGSL shader + runtime atlas loading + `cmd_kind` 11 dispatch. Depends on stable paint plumbing (step 2).
5. **Self filters + declarative hints + compositor-thread animations** — `filter` prop as new cmd_kind, `willChange`/`contain` props for layer promotion, animation descriptor system. Depend on persistent GPU targets (step 1).
6. **Pipeline cache + memory budget** — parallel track. `PipelineCache` from WGPU 29 API; `ResourceManager` struct with priority tiers.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `native/libvexart/src/composite/*` | Modified | Stub → real target lifecycle, readback, merge |
| `native/libvexart/src/paint/mod.rs` | Modified | `dispatch` accepts target handle parameter |
| `native/libvexart/src/paint/pipelines/` | New | `glyph.rs` (MSDF), `filter.rs` (self filters), `blend.rs` (deferred) |
| `native/libvexart/src/paint/shaders/` | New | `msdf_text.wgsl`, `self_filter.wgsl` |
| `native/libvexart/src/paint/pipeline_cache.rs` | New | Disk-persisted pipeline cache |
| `native/libvexart/src/text/*` | Modified | Stub → real MSDF atlas loading + dispatch + metrics |
| `native/libvexart/src/kitty/` | New | `encoder.rs`, `writer.rs`, `transport.rs` |
| `native/libvexart/src/resource/` | New | `ResourceManager` with LRU eviction |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | Modified | Final 15% bridge call migration |
| `packages/engine/src/ffi/wgpu-canvas-bridge.ts` | Removed | Deleted after migration complete |
| `packages/engine/src/output/kitty.ts` | Modified | TS encoding → FFI call to native encoder |
| `packages/engine/src/types.ts` | Modified | Add `filter`, `willChange`, `contain` to TGEProps |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Target registry handle semantics diverge from bridge expectations | Med | Audit all ~62 call sites before rewire; integration test with single rect |
| MSDF atlas texture/metrics contract leaks bitmap-era assumptions | Med | Design atlas schema against ARCHITECTURE §4 text/ module spec, not old bitmap code |
| Compositor-thread animation fallback detection misses edge cases | Low | Strict 4-condition qualification per ARCHITECTURE §7.1; runtime `console.warn` |
| Pipeline cache binary format breaks across WGPU patch versions | Low | Version-locked to Vexart version; cache invalidation on mismatch |
| `wgpu-canvas-bridge` deletion removes code still depended on | Med | Pre-deletion grep gates per Phase 2 design §11; incremental migration |

## Rollback Plan

1. `git tag -a pre-phase-2b -m "Phase 2b baseline"` before first task.
2. Each of the 6 dependency-order steps is an independently revertable slice (atomic commits per FFI contract change per Phase 2 design §12).
3. Point of no return: deletion of `wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/`. Rollback: `git reset --hard pre-phase-2b && git clean -fd`.

## Dependencies

- Phase 2 native consolidation must be complete (current status: 85% migrated, remaining 15% in Slice 11B/11E)
- `wgpu 29` `PipelineCache` API availability (confirmed in design §2.2 pin at `29.0.1`)
- `fdsm 0.8.0` crate for MSDF atlas generation (deferred from Phase 2 per design §9)
- `base64 0.22.1` + `flate2 1.1.9` for Kitty encoding (deferred from Phase 2 per design §9)

## Success Criteria

- [ ] Single WGPU context: `wgpu-canvas-bridge.ts` deleted, zero references to `tge_wgpu_canvas_*`
- [ ] Visual output: showcase renders all non-text regions identically to Phase 2 baseline
- [ ] MSDF text: renders sharp at 8px, 16px, 32px, 72px (golden tests)
- [ ] Compositor animation: 60fps maintained with main thread saturated
- [ ] Kitty encoding: <0.5ms for 1920×1080 RGBA frame
- [ ] Pipeline cache: cold start <120ms, warm start <50ms
- [ ] GPU budget: 200 fonts + 500 images within 128MB, zero crashes
- [ ] New props (`filter`, `willChange`, `contain`) appear in `TGEProps` with tests
- [ ] `showcase.tsx` demonstrates each new feature with a dedicated tab
