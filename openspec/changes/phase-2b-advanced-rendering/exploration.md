# Phase 2b — Advanced Rendering Exploration

## Current State

- Vexart is split across **two GPU contexts** today: `libvexart` owns a WGPU 29 paint context, while `packages/engine/src/ffi/wgpu-canvas-bridge.ts` still drives a separate WGPU 26 target/composite path.
- That split is the blocker: `gpu-renderer-backend.ts` paints primitives through `vexart_paint_dispatch`, but target creation / begin-end layer / copy / readback still route through the old bridge.
- `native/libvexart/src/composite/*` is mostly stubbed: `target.rs` is a placeholder, `readback.rs` returns zero bytes, and `composite_merge()` only zeros outputs.
- `vexart_paint_dispatch` already handles the primitive pipelines, but it currently ignores the caller target and renders into `PaintContext`'s singleton offscreen texture.
- Kitty output is still TS-owned in `packages/engine/src/output/kitty.ts`: readback bytes are base64/zlib encoded and emitted as Kitty escape sequences from JS.
- Text is still Phase 2-deferred: `vexart_text_*` exists, but `text/mod.rs` is a no-op and `paint/mod.rs` reserves glyphs for later.

### Q1. Exact FFI surface needed for target lifecycle + compositing

Blocking additions for the bridge delete:

- `vexart_composite_target_create(ctx, width, height, out_target) -> i32`
- `vexart_composite_target_destroy(ctx, target) -> i32`
- `vexart_composite_target_begin_layer(ctx, target, layer, clear_color) -> i32`
- `vexart_composite_target_end_layer(ctx, target) -> i32`
- `vexart_composite_copy_region_to_image(ctx, target, x, y, w, h, out_image) -> i32`
- `vexart_composite_render_image_layer(ctx, target, image, x, y, w, h, z, clear_color) -> i32`
- `vexart_composite_readback_rgba(...)` and `vexart_composite_readback_region_rgba(...)` must become real, not stubs
- `vexart_composite_merge(...)` must become a real merge path, not a no-op

If you want parity with the old bridge call graph, the next wave also needs native equivalents for backdrop filters and masks:

- `vexart_composite_image_filter_backdrop(...)`
- `vexart_composite_image_mask_rounded_rect(...)`
- `vexart_composite_image_mask_rounded_rect_corners(...)`

### Q2. Minimum to get visual output working on one GPU context

The minimum is **not** just renaming symbols. The target handle has to become real in `libvexart`, and `vexart_paint_dispatch` must render into the target selected by that handle instead of the current singleton texture.

So the smallest working cut is:

1. Make `libvexart` own the only WGPU device/queue.
2. Implement real target registry + target lifecycle in Rust.
3. Make paint/composite/readback all read and write through that same registry.
4. Rewire `gpu-renderer-backend.ts` to drop `createWgpuCanvasContext` and every `wgpu-canvas-bridge` call.
5. Delete `wgpu-canvas-bridge.ts` once the last call site is gone.

That is the only path that fixes the zero-pixels layer path and removes the WGPU 26/29 split.

### Q3. Kitty encoding data flow

Current TS flow:

`vexart_composite_readback_rgba` → `Uint8Array` in JS → `packages/engine/src/output/kitty.ts` → choose `shm|file|direct` → base64 + optional deflate → Kitty escape sequences → writer callback / stdout.

The direct path chunks base64 into 4096-byte pieces; shm/file paths transmit metadata plus a shared-memory name or file path.

Phase 2b target flow:

`readback` in Rust → zlib/base64/escape assembly in Rust → buffered stdout writer in Rust.

### Q4. Composite module status

What exists:

- `composite/mod.rs`: wrappers exist, but they are stubs.
- `composite/target.rs`: placeholder `OffscreenTarget` with no WGPU storage.
- `composite/readback.rs`: returns 0 / does nothing.

What is missing:

- real target storage (`Texture`, `TextureView`, layer stack)
- real begin/end layer behavior
- real region copy and readback
- real merge/composite logic

### Q5. MSDF integration path

MSDF should plug into the **existing paint pipeline**, not live as a special-case text renderer.

The clean shape is:

- keep the `vexart_text_*` FFI surface stable
- replace the bitmap atlas generator with offline MSDF atlas generation
- load atlas texture + metrics into native text state
- add a new text pipeline / cmd kind in the reserved Phase 2b range (`paint/mod.rs` and `paint/pipelines/mod.rs` already reserve this space)
- batch glyph instances like the other paint instances, sampling the atlas in WGSL

That lets text measurement, atlas loading, and paint all stay aligned.

### Q6. Dependency order

1. **Single-context target lifecycle + compositing** — blocking foundation.
2. **Rewire `gpu-renderer-backend.ts`** — removes the old bridge.
3. **Rust Kitty encoding** — depends on real readback.
4. **MSDF text pipeline** — depends on stable atlas + paint plumbing.
5. **Self filters / declarative hints / compositor-thread animations** — depend on persistent GPU targets and layer promotion semantics.
6. **Pipeline cache + memory budget** — can land in parallel once the native context is unified, but it is not the visual blocker.

## Affected Areas

- `docs/PRD.md` — Phase 2b scope and ordering.
- `docs/ARCHITECTURE.md` — target `libvexart` package layout and FFI contract.
- `openspec/changes/phase-2-native-consolidation/design.md` — remaining migration scope and bridge inventory.
- `native/libvexart/src/lib.rs` — current FFI surface and stubs.
- `native/libvexart/src/composite/*` — target lifecycle / readback stubs.
- `native/libvexart/src/paint/*` — existing primitive pipelines and reserved MSDF slots.
- `packages/engine/src/ffi/gpu-renderer-backend.ts` — remaining bridge call sites.
- `packages/engine/src/ffi/wgpu-canvas-bridge.ts` — delete after migration.
- `packages/engine/src/output/kitty.ts` — TS Kitty encoding to port.
- `packages/engine/src/output/layer-composer.ts` — final-frame compositing path.

## Approaches

1. **Bridge shim first** — keep the old bridge alive while adding a thin libvexart wrapper layer.
   - Pros: lower immediate churn
   - Cons: preserves the dual-context bug, delays deletion, and risks another false-green migration
   - Effort: Medium

2. **Single-context native cutover** — move target lifecycle, composite, readback, and Kitty output fully into `libvexart`, then delete the bridge.
   - Pros: fixes the root bug, matches PRD intent, makes Phase 2b features build on one substrate
   - Cons: larger initial Rust change
   - Effort: High

## Recommendation

Take the **single-context native cutover**. The current architecture already has the primitives in Rust; the missing piece is a real native target/composite model. Anything less keeps the zero-pixel bridge path alive.

## Risks

- Target handle semantics are currently fake in Rust; if the registry is wrong, paint and readback will still diverge.
- Self filters and backdrop filters share shader/state assumptions, so the compositing model must be stable before those land.
- MSDF text needs a texture/metrics contract that does not leak bitmap-era assumptions.

## Ready for Proposal

Yes — the change is ready for a proposal/design split. The next spec should define the native target registry, the bridge-delete cutover, and the Phase 2b feature ordering.
