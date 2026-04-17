# Phase 2 Native Consolidation — Exploration

## Founder decisions embedded in this exploration

- **Migration strategy**: big bang — Zig + Clay + wgpu-canvas-bridge wrapper all die in a single change.
- **FFI surface**: consolidated clean API (`vexart_*`), NOT 1:1 rename from `tge_*`. See `docs/ARCHITECTURE.md §4.2`.
- **Taffy**: latest stable (`0.10.1`).
- **WGPU**: latest stable (`29.0.1`). Upgrade from current `26` is in-scope.
- **MSDF crate**: researcher's criterion — recommending `fdsm = "0.8.0"` (see Q7). **Implementation deferred to Phase 2b per DEC-008.**
- **`nebula` / `starfield`**: DELETED, not moved to TS examples. PRD §11 Phase 2 updated accordingly.
- **Text rendering in Phase 2**: **SKIPPED per DEC-011**. Bitmap text is NOT ported to Rust. `vexart_text_*` exists as stubs that return success without painting. MSDF in Phase 2b replaces stubs. Phase 2 exit criteria masks text regions from the golden diff.

## Scope boundary vs Phase 2b

This exploration originally blended Phase 2 with items from Phase 2b Tier 1 (DEC-010). Corrected scope:

| Item | Original placement | Corrected placement | Rationale |
|------|---------------------|---------------------|-----------|
| Taffy + WGPU consolidation | Phase 2 | Phase 2 | Core of native consolidation |
| Kitty encoding in Rust | Phase 2 (Q8) | **Phase 2b Tier 1** | DEC-010 explicit |
| `ResourceManager` FFI | Phase 2 (Q6) | **Phase 2b Tier 1** | DEC-010 explicit |
| `PipelineCache` persisted | Phase 2 (Q2) | **Phase 2b Tier 1** | DEC-010 explicit |
| MSDF text | Phase 2 (Q7) | **Phase 2b** | DEC-008 explicit |
| Bitmap text port | Phase 2 | **Skipped entirely** | DEC-011 |

Q6 (FFI surface) reserves stable module namespaces for these Phase 2b items so the contract doesn't shift between phases. The **implementations** live in 2b; the **signatures** land in Phase 2 as stubs.

## Q1. What is Phase 2 actually changing?

Phase 2 is the PRD's Rust-only native consolidation step: one native binary (`libvexart`), no C, no Zig, no Clay. The scope is explicit in `docs/PRD.md §11` lines 716-736: inventory Zig FFI usages, move/delete the Zig demos, port missing primitives to Rust/WGPU, replace Clay with Taffy, merge the WGPU bridge + Taffy into one `libvexart` cdylib, delete `zig/`, `vendor/clay*`, `@tge/pixel`, output-placeholder/output-halfblock, `gpu-frame-composer`, and simplify `loop.ts`.

The target architecture already matches that outcome: `docs/ARCHITECTURE.md §4` lines 429-527 defines `native/libvexart` with `layout/`, `paint/`, `composite/`, `resource/`, `text/`, `kitty/`, and `ffi/`, plus the FFI contract (`vexart_<module>_<action>`, ≤8 params, `catch_unwind`, `vexart_get_last_error_*`). `docs/API-POLICY.md §11` lines 519-527 confirms the FFI boundary is internal and error-retrievable.

Current code is still the old world:
- `packages/runtime/src/loop.ts` still imports `../../core/src/clay`, `gpu-renderer-backend`, `gpu-frame-composer`, `render-graph`, `layout-writeback` and calls `clay.*` throughout (lines 23-87, 338, 592-885, 1757-2448).
- `packages/core/src/clay.ts` is still the Clay C FFI wrapper (lines 1-400).
- `packages/pixel/src/index.ts` / `ffi.ts` are still the Zig paint bridge (lines 1-259, 40-168).
- `packages/output/src/kitty.ts` still does Kitty encoding in TypeScript with `deflateSync` + base64 (lines 16, 359-431).

So the real work is not “rename a few symbols”; it is a hard boundary collapse.

## Q2. What versions should we pin for Taffy and WGPU?

As of 2026-04-17, crates.io reports:

| crate | latest stable | source |
|---|---:|---|
| `taffy` | `0.10.1` | `https://crates.io/api/v1/crates/taffy` (updated_at `2026-04-14T10:37:04.903469Z`) |
| `wgpu` | `29.0.1` | `https://crates.io/api/v1/crates/wgpu` (updated_at `2026-03-26T13:13:12.312144Z`) |

Implication:
- `taffy = 0.10.1` is the right replacement for Clay. The crate already supports measure callbacks, `compute_layout_with_measure`, gap, flexbox, percent/fixed/grow/fit sizing, and min/max constraints.
- `wgpu = 29.0.1` is **not** drop-in compatible with the current bridge. `native/wgpu-canvas-bridge/src/lib.rs` was written against much older shapes; the current bridge hardcodes old pipeline creation patterns and uses `cache: None` everywhere.

This matches the PRD's warning in `docs/PRD.md §11` lines 776-780: the pipeline cache needs to be shared and persisted; `cache: None` is no longer acceptable.

## Q3. What is the Zig FFI inventory and what happens to each export?

`zig/src/lib.zig` exposes 36 `tge_*` exports (grep count: 36). They split into three fates:

| export | line | fate | why |
|---|---:|---|---|
| `tge_fill_rect` | 119 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_rounded_rect` | 126 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_stroke_rect` | 133 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_rounded_rect_corners` | 141 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_stroke_rect_corners` | 148 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_filled_circle` | 155 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_stroked_circle` | 162 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_line` | 170 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_bezier` | 177 | PORTED | Core primitive; direct Rust/WGPU path exists. |
| `tge_blur` | 185 | PORTED | Shadow blur primitive maps to WGPU pipeline. |
| `tge_inset_shadow` | 194 | NEW_SHADER | PRD explicitly calls out inset shadow as missing work (`docs/PRD.md §11` lines 722-727). |
| `tge_halo` | 213 | NEW_SHADER | PRD calls for outer glow / halo; needs shader work. |
| `tge_linear_gradient` | 221 | PORTED | Already exists conceptually in WGPU bridge. |
| `tge_radial_gradient` | 228 | PORTED | Already exists conceptually in WGPU bridge. |
| `tge_linear_gradient_multi` | 237 | NEW_SHADER | PRD explicitly calls for multi-stop gradients (`docs/PRD.md §11` lines 722-725). |
| `tge_radial_gradient_multi` | 242 | NEW_SHADER | PRD explicitly calls for multi-stop gradients (`docs/PRD.md §11` lines 722-725). |
| `tge_conic_gradient` | 248 | NEW_SHADER | PRD explicitly calls for conic gradients (`docs/PRD.md §11` lines 722-724). |
| `tge_gradient_stroke` | 254 | NEW_SHADER | No current WGPU bridge analog; needs a shader path. |
| `tge_nebula` | 261 | DELETED | Demo/procedural-only; PRD says move/delete demo assets (`docs/PRD.md §11` lines 721-733). |
| `tge_starfield` | 268 | DELETED | Demo/procedural-only; PRD says move/delete demo assets (`docs/PRD.md §11` lines 721-733). |
| `tge_draw_text` | 275 | SKIPPED_PHASE_2 | Per DEC-011. `vexart_text_dispatch` stub returns success without painting. Real impl lands in Phase 2b (MSDF). |
| `tge_measure_text` | 281 | SKIPPED_PHASE_2 | Per DEC-011. `vexart_text_measure` stub returns `(0, 0)` width/height. Callers handle zero-sized text nodes gracefully during Phase 2. |
| `tge_load_font_atlas` | 312 | SKIPPED_PHASE_2 | Per DEC-011. `vexart_text_load_atlas` stub returns success. Phase 2b replaces with MSDF atlas loader. |
| `tge_draw_text_font` | 327 | SKIPPED_PHASE_2 | Per DEC-011. Subsumed into `vexart_text_dispatch` stub. |
| `tge_filled_polygon` | 402 | PORTED | Geometry primitive; direct WGPU path exists. |
| `tge_stroked_polygon` | 412 | PORTED | Geometry primitive; direct WGPU path exists. |
| `tge_filter_brightness` | 422 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_filter_contrast` | 427 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_filter_saturate` | 432 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_filter_grayscale` | 437 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_filter_invert` | 442 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_filter_sepia` | 447 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_filter_hue_rotate` | 452 | PORTED | Self/backdrop filter pipeline already exists in Rust bridge. |
| `tge_blend_mode` | 459 | NEW_SHADER | PRD explicitly calls for blend modes (`docs/PRD.md §11` lines 725-726). |
| `tge_affine_blit` | 474 | PORTED | Existing composite behavior; can be rehomed in native composite. |
| `tge_blit_rgba` | 492 | PORTED | Generic copy path; likely becomes an internal helper. |

Evidence that this inventory is real:
- `zig/src/lib.zig` contains the exports at lines 119-492.
- `packages/pixel/src/index.ts` consumes almost all of them directly (lines 70-259, 267-313, 315-431, 459-492).
- `packages/pixel/src/ffi.ts` still declares `tge_nebula`, `tge_starfield`, and `tge_blit_rgba` as optional bridge symbols (lines 95-105).

## Q4. What is the WGPU bridge inventory and what happens to each export?

`native/wgpu-canvas-bridge/src/lib.rs` exposes 38 `#[no_mangle] pub extern "C" fn` exports. Current wrapper surface in `packages/core/src/wgpu-canvas-bridge.ts` mirrors them 1:1 (lines 21-58, plus `tge_wgpu_canvas_target_render_glyphs_layer` in the secondary defs at line 64).

| export | line | fate | why |
|---|---:|---|---|
| `tge_wgpu_canvas_bridge_version` | 2119 | DELETE | Bridge metadata goes away; new native binary gets `vexart_version`. |
| `tge_wgpu_canvas_bridge_available` | 2124 | DELETE | Same as above; capability probing is folded into the new binary. |
| `tge_wgpu_canvas_bridge_fill_info` | 2129 | DELETE | Replaced by `vexart_version` + `vexart_context_create`. |
| `tge_wgpu_canvas_bridge_get_last_error_length` | 2145 | KEEP | Semantics survive as `vexart_get_last_error_length`. |
| `tge_wgpu_canvas_bridge_copy_last_error` | 2150 | KEEP | Semantics survive as `vexart_copy_last_error`. |
| `tge_wgpu_canvas_context_create` | 2165 | REDESIGN | Survives, but the signature should move to the new `vexart_context_*` contract. |
| `tge_wgpu_canvas_context_destroy` | 2242 | REDESIGN | Same lifecycle, new module surface. |
| `tge_wgpu_canvas_target_create` | 2258 | REDESIGN | Target lifecycle moves under `vexart_context_*`/`vexart_composite_*`. |
| `tge_wgpu_canvas_target_destroy` | 2305 | REDESIGN | Same as above. |
| `tge_wgpu_canvas_image_create` | 2319 | REDESIGN | Resource creation moves under `vexart_resource_*`. |
| `tge_wgpu_canvas_image_destroy` | 2365 | REDESIGN | Resource teardown moves under `vexart_resource_*`. |
| `tge_wgpu_canvas_target_begin_layer` | 2788 | REDESIGN | Layer begin/end becomes a native composite concern. |
| `tge_wgpu_canvas_target_end_layer` | 2814 | REDESIGN | Same as above. |
| `tge_wgpu_canvas_target_render_clear` | 2841 | REDESIGN | Clear becomes a paint/composite primitive. |
| `tge_wgpu_canvas_target_readback_rgba` | 2883 | REDESIGN | Readback moves under composite/output boundary. |
| `tge_wgpu_canvas_target_readback_region_rgba` | 2979 | REDESIGN | Same as above. |
| `tge_wgpu_canvas_target_copy_region_to_image` | 3046 | REDESIGN | Resource/composite helper, not a public bridge primitive. |
| `tge_wgpu_canvas_image_filter_backdrop` | 3090 | REDESIGN | Becomes part of paint pipeline (`backdrop` / `filter`). |
| `tge_wgpu_canvas_image_mask_rounded_rect` | 3127 | REDESIGN | Masking moves into paint/composite pipeline. |
| `tge_wgpu_canvas_image_mask_rounded_rect_corners` | 3163 | REDESIGN | Same as above. |
| `tge_wgpu_canvas_target_composite_image_layer` | 3202 | DELETE | Alias wrapper only; redundant with `render_image_layer`. |
| `tge_wgpu_canvas_target_render_rects` | 3215 | REDESIGN | Paint module primitive. |
| `tge_wgpu_canvas_target_render_rects_layer` | 3278 | REDESIGN | Same primitive, layered variant. |
| `tge_wgpu_canvas_target_render_image` | 3363 | REDESIGN | Paint/composite primitive. |
| `tge_wgpu_canvas_target_render_image_layer` | 3443 | REDESIGN | Same as above, layered variant. |
| `tge_wgpu_canvas_target_render_images_layer` | 3546 | REDESIGN | Batched image paint primitive. |
| `tge_wgpu_canvas_target_render_glyphs_layer` | 3650 | REDESIGN | Text pipeline moves to `vexart_text_*`. |
| `tge_wgpu_canvas_target_render_transformed_images_layer` | 3754 | REDESIGN | Paint/composite primitive. |
| `tge_wgpu_canvas_target_render_linear_gradients_layer` | 3858 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_radial_gradients_layer` | 3943 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_circles_layer` | 4028 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_polygons_layer` | 4113 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_beziers_layer` | 4198 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_shape_rects_layer` | 4283 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_shape_rect_corners_layer` | 4368 | REDESIGN | Paint primitive. |
| `tge_wgpu_canvas_target_render_glows_layer` | 4451 | REDESIGN | Paint primitive / shader path. |
| `tge_wgpu_canvas_target_render_nebulas_layer` | 4536 | DELETE | Demo-only native effect; PRD says remove/move demo assets. |
| `tge_wgpu_canvas_target_render_starfields_layer` | 4602 | DELETE | Demo-only native effect; PRD says remove/move demo assets. |

Evidence:
- The Rust bridge defines all 38 exports in `native/wgpu-canvas-bridge/src/lib.rs` (lines 2118-4602).
- The TS wrapper in `packages/core/src/wgpu-canvas-bridge.ts` still exposes the same shape (lines 21-58, 64).

## Q5. Which TypeScript consumers must change first?

The migration boundary is already visible in code:

| file | current role | phase 2 action |
|---|---|---|
| `packages/runtime/src/loop.ts` | Clay-driven orchestration; still branches on CPU/GPU, render graph, and layout writeback | Collapse into a smaller coordinator around `vexart_layout_*`, `vexart_paint_*`, `vexart_composite_*`, `vexart_kitty_*`. |
| `packages/core/src/clay.ts` | Clay C FFI wrapper | Delete with Clay. |
| `packages/layout-clay/src/index.ts` | Temporary bridge re-exporting core | Delete with Clay. |
| `packages/core/src/wgpu-canvas-bridge.ts` | Low-level canvas bridge wrapper | Replace with new `libvexart` loader and a much smaller surface. |
| `packages/pixel/src/index.ts` | Zig paint API | Delete / fold into native Rust bindings. |
| `packages/pixel/src/ffi.ts` | Zig symbol loader | Delete. |
| `packages/output/src/kitty.ts` | Kitty encoding in TS | Move encoding/compression/base64 to Rust. |
| `packages/output/src/kitty-shm-native.ts` | Native Kitty SHM helper | Keep only if the new Rust encoder still needs a helper path. |

Concrete evidence from the current code:
- `packages/runtime/src/loop.ts` imports Clay and the now-deprecated bridge helpers at lines 23-87, and still calls `clay.init`, `clay.beginLayout`, `clay.endLayout`, `clay.setDimensions`, `clay.destroy` (lines 338, 1790-1816, 2324, 2448).
- `packages/core/src/clay.ts` enumerates the Clay FFI surface in one file (lines 41-70).
- `packages/core/src/wgpu-canvas-bridge.ts` enumerates 30+ bridge calls (lines 21-58, 64).
- `packages/output/src/kitty.ts` still does base64 + `deflateSync` in JS (lines 16, 359-431).

## Q6. What should the new `libvexart` FFI surface look like?

Keep the contract from `docs/ARCHITECTURE.md §4.2` lines 519-527: `vexart_<module>_<action>`, `i32` status codes, ≤8 params, packed buffers when needed, `catch_unwind`, `vexart_get_last_error_length`, `vexart_copy_last_error`.

Proposed surface (rough signatures only):

### `vexart_context_*`
- `vexart_version() -> u32`
- `vexart_context_create(opts_ptr: *const u8, opts_len: u32, out_context: *mut u64) -> i32`
- `vexart_context_destroy(context: u64) -> i32`
- `vexart_context_resize(context: u64, width: u32, height: u32) -> i32`
- `vexart_context_set_budget(context: u64, budget_mb: u32) -> i32`

### `vexart_layout_*`
- `vexart_layout_compute(context: u64, nodes_ptr: *const u8, nodes_len: u32, out_layout_ptr: *mut u8, out_layout_len: u32) -> i32`
- `vexart_layout_measure(context: u64, text_ptr: *const u8, text_len: u32, font_id: u32, font_size: f32, out_w: *mut f32, out_h: *mut f32) -> i32`
- `vexart_layout_writeback(context: u64, layout_ptr: *const u8, layout_len: u32) -> i32`

### `vexart_paint_*`
- `vexart_paint_dispatch(context: u64, paint_ptr: *const u8, paint_len: u32, stats_out: *mut FrameStats) -> i32`
- `vexart_paint_upload_image(context: u64, image_ptr: *const u8, image_len: u32, out_image: *mut u64) -> i32`
- `vexart_paint_remove_image(context: u64, image: u64) -> i32`

### `vexart_composite_*`
- `vexart_composite_merge(context: u64, composite_ptr: *const u8, composite_len: u32, stats_out: *mut FrameStats) -> i32`
- `vexart_composite_readback_rgba(context: u64, target: u64, dst: *mut u8, dst_len: u32, stats_out: *mut FrameStats) -> i32`
- `vexart_composite_readback_region_rgba(context: u64, target: u64, x: u32, y: u32, w: u32, h: u32, dst: *mut u8, dst_len: u32, stats_out: *mut FrameStats) -> i32`

### `vexart_text_*`
- `vexart_text_load_atlas(context: u64, atlas_ptr: *const u8, atlas_len: u32, font_id: u32) -> i32`
- `vexart_text_measure(context: u64, text_ptr: *const u8, text_len: u32, font_id: u32, font_size: f32, out_w: *mut f32, out_h: *mut f32) -> i32`
- `vexart_text_dispatch(context: u64, glyphs_ptr: *const u8, glyph_len: u32, stats_out: *mut FrameStats) -> i32`

### `vexart_kitty_*`
- `vexart_kitty_emit_frame(context: u64, frame_ptr: *const u8, frame_len: u32, mode: u32, out_bytes: *mut u32) -> i32`
- `vexart_kitty_set_transport(context: u64, transport: u32) -> i32`

### `vexart_resource_*`
- `vexart_resource_stats(context: u64, out_stats: *mut ResourceStats) -> i32`
- `vexart_resource_evict(context: u64, budget_mb: u32) -> i32`
- `vexart_resource_set_budget(context: u64, budget_mb: u32) -> i32`

### `vexart_get_last_error*`
- `vexart_get_last_error_length() -> u32`
- `vexart_copy_last_error(dst: *mut u8, dst_len: u32) -> i32`

This is intentionally narrower than the current bridge. The current `tge_wgpu_canvas_*` surface is an implementation detail leak.

## Q7. Which MSDF crate should we use?

Recommendation: `fdsm = "0.8.0"`.

| crate | version | maturity | license | deps shape | runtime vs offline | verdict |
|---|---:|---|---|---|---|---|
| `fdsm` | `0.8.0` | medium/high (2025-10-02, 2.9k Rust LOC, 14 files, 134k downloads on latest version) | MIT | pure Rust; optional `visualize` feature only | best as offline atlas generator | **pick this** |
| `msdf_font` | `0.3.1` | newer but thin docs, tiny download count | MIT or Apache-2.0 | pure Rust; features `atlas`, `serde` | also offline-friendly | fallback candidate |

Why `fdsm` wins:
- It is explicitly a **pure-Rust implementation of multi-channel signed distance field generation**.
- It is recent enough to be maintained, but not so new that it looks unproven.
- The architecture favors offline atlas generation (`@vexart/internal-atlas-gen` in `docs/ARCHITECTURE.md §2.2` lines 166-170), so runtime generation is not required.

Tradeoff:
- `fdsm` is not the fanciest option, but it minimizes native deps and matches the no-C/no-C++ direction.

## Q8. What crate stack should we use for Kitty encoding?

Recommendation:

| crate | version | why |
|---|---:|---|
| `base64` | `0.22.1` | direct encoding path for the Kitty escape payload; mature and tiny. |
| `flate2` | `1.1.9` | Kitty only supports RFC 1950 ZLIB/deflate compression (`o=z`), and this crate does that cleanly. |
| `zstd` | not recommended | Kitty protocol does **not** accept zstd payloads. |

Evidence:
- `packages/output/src/kitty.ts` currently uses `deflateSync` from `node:zlib` (line 16) and base64 via `Buffer.from(...).toString("base64")` (lines 307, 362, 431, 633, 667, 760, 826).
- The Kitty graphics protocol says payloads are base64-encoded and, for compression, only `o=z` (RFC 1950 ZLIB/deflate) is supported. See `https://sw.kovidgoyal.net/kitty/graphics-protocol/#compression` and `#transferring-pixel-data`.
- The direct escape-code path chunking is also base64-based and limited to 4096-byte chunks per the spec.

So the Rust encoder should be `base64 + flate2 + BufWriter`.

## Q9. What are the biggest risks and open questions?

| risk | impact | mitigation |
|---|---|---|
| WGPU 26 → 29 API breakage | high | Rewrite the bridge around the new `wgpu` APIs first; do not try to patch incrementally. |
| Clay parity bugs (ID hashing, scroll, layout) | high | Keep `showcase.tsx` as the golden visual contract; preserve hashing semantics while swapping engines. |
| Big-bang deletion of Zig/Clay | high | Delete only after the Rust surface is wired and the non-text showcase diff passes. |
| Text absence confuses developer during Phase 2 | medium | Per DEC-011: emit a one-time runtime warning on first `vexart_text_dispatch` call. Document behavior in Phase 2 proposal. |
| MSDF in Phase 2b discovers API gap that bitmap would have caught | low | FFI signatures are locked in Phase 2 (`vexart_text_*`). Phase 2b only swaps the implementation. If the signature needs to change, that's a separate breaking change. |
| Phase 2b slips and text stays blank for 8+ weeks | medium | DEC-011 non-reversal clause triggers. Falls back to emergency bitmap port. |

Open questions requiring founder input:
- **None**. All previously-open decisions are now recorded: `nebula`/`starfield` DELETE (PRD §11 updated), text rendering SKIP (DEC-011), scope boundary between Phase 2 and 2b (scope boundary table at top of this document).

## Q10. How big is this change?

Estimate:
- **Rust/native**: ~2,500-4,000 LOC net new or rewritten (`libvexart`, WGPU upgrade, kitty encoder, resource manager, FFI glue).
- **TypeScript cleanup**: ~500-1,000 LOC removed/reworked (`loop.ts`, `clay.ts`, `pixel/`, output kitty path, bridge wrappers).
- **Calendar**: **3-4 weeks** real effort.

Why that estimate:
- The PRD budgets Phase 2 at 3 weeks (`docs/PRD.md §11` lines 716-736), but the WGPU jump to 29.0.1 plus the surface collapse makes 4 weeks the safer planning number.
- The architecture target is straightforward, but the current code is still deeply split across Clay, Zig, and the canvas bridge.

Bottom line: this is a **single-binary rewrite with a narrow public surface**, not a refactor.
