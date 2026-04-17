# Tasks: Phase 2 Native Consolidation

## Slice 1: Pre-Apply Baseline Tag (Safe)

Objective: Create an immutable rollback point before any Phase 2 work begins.

- [x] 1.1 Create annotated git tag: `git tag -a pre-phase-2 -m "Phase 2 baseline — pre-consolidation"`. Per design §14.

---

## Slice 2: Scaffold `native/libvexart/` Crate with Stub Exports (Safe)

Objective: Create the full crate skeleton with all 20 FFI stubs returning OK, no deletions of existing code. Per design §4 and §5.

- [x] 2.1 Create directory `native/libvexart/src/` with subdirectories `layout/`, `paint/`, `composite/`, `kitty/`, `text/`, `ffi/`, and `paint/pipelines/`, `paint/shaders/`. Per design §4.
- [x] 2.2 Create `native/libvexart/Cargo.toml` with `crate-type = ["cdylib", "rlib"]`, dependencies `taffy = "0.10.1"`, `wgpu = "29.0.1"`, `pollster = "0.4"`, `bytemuck = "1.25"` (with derive), `nix = "0.29"` (features `mman`, `fs` only). Pin all with rationale comments. Per design §2.2, REQ-NB-009.
- [x] 2.3 Create `native/libvexart/src/types.rs` with `#[repr(C)]` structs: `Color`, `Rect`, `TransformMatrix`, `FrameStats`, `NodeHandle(u64)`. Per design §4.
- [x] 2.4 Create `native/libvexart/src/ffi/mod.rs` re-exporting `buffer`, `error`, `panic` submodules. Per design §4.
- [x] 2.5 Create `native/libvexart/src/ffi/error.rs` with `thread_local! LAST_ERROR` storage, `set_last_error()`, `clear_last_error()`, `vexart_get_last_error_length()`, `vexart_copy_last_error()`. Per design §6, REQ-NB-003.
- [x] 2.6 Create `native/libvexart/src/ffi/panic.rs` with error code constants (`OK=0`, `ERR_PANIC=-1` through `ERR_INVALID_ARG=-9`) and `ffi_guard!` macro. Per design §7, REQ-NB-003.
- [x] 2.7 Create `native/libvexart/src/ffi/buffer.rs` with `GRAPH_MAGIC = 0x56584152`, `GRAPH_VERSION = 0x00020000`, `GraphHeader` struct, `parse_header()` function. Per design §8.
- [x] 2.8 Create `native/libvexart/src/layout/mod.rs` with `LayoutContext` struct (owns Taffy `Tree`), stub `compute()`, `measure()`, `writeback()` methods. Per design §4, §5.2.
- [x] 2.9 Create `native/libvexart/src/paint/mod.rs` with `PaintContext` struct stub (no GPU init yet), `dispatch()` returning `OK`. Per design §4.
- [x] 2.10 Create `native/libvexart/src/paint/context.rs` with placeholder `WgpuContext` struct (empty for now; real init in Slice 5). Per design §4.
- [x] 2.11 Create `native/libvexart/src/composite/mod.rs` with `composite_merge()` and `readback_rgba()` stubs returning `OK`. Per design §4.
- [x] 2.12 Create `native/libvexart/src/kitty/mod.rs` re-exporting `shm`. Create `native/libvexart/src/kitty/shm.rs` with `vexart_kitty_shm_prepare()` and `vexart_kitty_shm_release()` stubs returning `OK`. Per design §4.
- [x] 2.13 Create `native/libvexart/src/text/mod.rs` with `vexart_text_load_atlas()`, `vexart_text_dispatch()`, `vexart_text_measure()` stubs. `dispatch` returns OK with `AtomicBool` first-call warning emitting `[vexart] text rendering disabled during Phase 2 (DEC-011)` to stderr. `measure` writes `0.0, 0.0`. Per design §5.5, REQ-NB-005.
- [x] 2.14 Create `native/libvexart/src/lib.rs` with all 20 `#[no_mangle] pub extern "C" fn` exports wrapping bodies in `ffi_guard!`, plus `vexart_version()` returning `0x00020000`. Module re-exports. Per design §5, REQ-NB-003.
- [x] 2.15 Verify crate compiles: `cd native/libvexart && cargo check`. Fix any compilation errors.

---

## Slice 3: Root `Cargo.toml` Workspace + `rust-toolchain.toml` (Safe)

Objective: Establish the Cargo workspace and pinned toolchain. Per design §2, §3, REQ-NB-008.

- [x] 3.1 Create root `Cargo.toml` with `[workspace] resolver = "2"`, `members = ["native/libvexart"]`, `workspace.package` block (edition 2021, rust-version 1.95.0, publish = false), and `workspace.lints.rust` with `unsafe_op_in_unsafe_fn = "deny"`. Per design §2.1.
- [x] 3.2 Create `rust-toolchain.toml` with `channel = "1.95.0"`, `components = ["rustfmt", "clippy", "rust-src"]`, `targets = ["aarch64-apple-darwin"]`, `profile = "minimal"`. Per design §3, founder resolution.
- [x] 3.3 Verify workspace builds: `cargo check` from repo root. Per REQ-NB-008.

---

## Slice 4: Wire TS `ffi/bridge.ts` Loader to `libvexart` (Safe)

Objective: Add a new TS loader for `libvexart` alongside existing bridge loaders. No existing code paths change yet. Per design §8.4, §12.3.

- [x] [ATOMIC] 4.1 Create `packages/engine/src/ffi/vexart-bridge.ts` with `dlopen` loader resolving `native/${platform}/libvexart.{dylib,so,dll}`. Define symbol signatures for all 20 exports per design §5. Wire version handshake: `vexart_version()` must return `0x00020000`. Per design §12, §8.4.
- [x] [ATOMIC] 4.2 Create `packages/engine/src/ffi/vexart-functions.ts` with typed TS wrappers for each `vexart_*` function, using the packed buffer pattern from design §8. Export `EXPECTED_BRIDGE_VERSION = 0x00020000`, `GRAPH_MAGIC`, `GRAPH_VERSION`, `writeHeader()`. Per design §8.4, REQ-NB-003.
- [x] [ATOMIC] 4.3 Create `packages/engine/src/ffi/vexart-buffer.ts` with `ArrayBuffer(65536)` graph buffer, `DataView`, `writeHeader()`, `writeCommandPrefix()`, and per-command body writers for Rect, Gradient, Shadow, etc. Per design §8.
- [x] 4.4 Create `packages/engine/src/ffi/bridge.test.ts`: smoke test that `vexart_version()` returns `0x00020000` and version mismatch throws `VexartNativeError`. Per design §13.3.
- [x] 4.5 Verify: `bun run typecheck` passes (new files are not yet imported by consumers).

---

## Slice 5: Port + Author WGPU Pipelines into `libvexart/src/paint/` (Safe)

**SUPERSEDED by design §17 (Apply-time amendment 2026-04-17).** Original 21-task structure was calibrated against an assumed bridge layout that did not match reality. Slice 5 now splits into Slice 5a (port + infra) and Slice 5b (NEW GPU pipelines that replace CPU paths per DEC-012). All downstream slices (6, 7, ...) are unchanged.

### Slice 5a — Port + Infra (Apply #2a)

Objective: Port the 13 portable GPU pipelines from `native/wgpu-canvas-bridge/src/lib.rs` (monolithic 4675 LOC) into the `libvexart/src/paint/pipelines/` modular tree, upgrade WGPU 26 → 29.0.1, wire the `vexart_paint_dispatch` graph buffer parser, and ship a working `libvexart.dylib` with all 13 pipelines registered. No new shaders authored. Per design §17.1, §17.4, §17.6.

**Hard rules for Apply #2a:**
- **Do NOT touch `paint/instances.rs`** — already complete from Slice 2 apply (11 Pod+Zeroable structs). Apply #2a wires them into pipelines.
- **Do NOT author new WGSL** — every shader in 5a is `include_str!` of a `.wgsl` file produced by extracting the inline raw string from the bridge source line range listed in §17.1.
- **Do NOT port `glyph_pipeline`** (DEC-011 — text stays stubbed).
- **Do NOT port the 4 CPU functions** (`apply_box_blur_rgba`, `apply_backdrop_filters_rgba`, `apply_rounded_rect_mask_rgba`, `apply_rounded_rect_corners_mask_rgba`) — they become NEW GPU pipelines in Slice 5b.

- [ ] [ATOMIC] 5a.1 Replace stub in `native/libvexart/src/paint/context.rs` with real `WgpuContext` init: `wgpu::Instance::default()`, adapter request via `request_adapter`, device + queue via `pollster::block_on(adapter.request_device(...))`. Port the 2-binding `image_bind_group_layout` (texture + sampler at fragment stage) from bridge L2185-2205. Upgrade all API call shapes from `wgpu = "26"` to `wgpu = "29.0.1"` — note `request_adapter` and `request_device` signatures changed (read wgpu 27/28/29 changelogs in-line during the work). Per design §17.1, §17.4.
- [ ] [ATOMIC] 5a.2 Replace stub in `native/libvexart/src/paint/pipelines/mod.rs` with real `PipelineRegistry` struct that holds 13 named `wgpu::RenderPipeline` fields (rect, shape_rect, shape_rect_corners, circle, polygon, bezier, glow, nebula, starfield, image, image_transform, gradient_linear, gradient_radial). Add `PipelineRegistry::new(device, format, image_bgl)` constructor that calls each `paint::pipelines::*::create()` in order. Per design §17.6.
- [ ] 5a.3 Create `native/libvexart/src/paint/shaders/rect.wgsl` (extract from bridge L612-642 raw string) and `paint/pipelines/rect.rs` with `pub fn create(device, format) -> RenderPipeline` that follows bridge L646-677 pipeline descriptor (Instance step mode, ALPHA_BLENDING, Float32x4 + Float32x4 vertex attributes for `rect` + `color`, `cache: None`).
- [ ] 5a.4 Same pattern: `paint/shaders/circle.wgsl` (bridge L683-738) + `paint/pipelines/circle.rs`. Vertex attributes per `CircleInstance` (16 floats).
- [ ] 5a.5 Same: `paint/shaders/polygon.wgsl` (bridge L778-885) + `paint/pipelines/polygon.rs`. Vertex attributes per `PolygonInstance` (20 floats).
- [ ] 5a.6 Same: `paint/shaders/bezier.wgsl` (bridge L889-1002) + `paint/pipelines/bezier.rs`. Vertex attributes per `BezierInstance` (20 floats).
- [ ] 5a.7 Same: `paint/shaders/shape_rect.wgsl` (bridge L1006-1112) + `paint/pipelines/shape_rect.rs`. Vertex attributes per `ShapeRectInstance` (20 floats).
- [ ] 5a.8 Same: `paint/shaders/rect_corners.wgsl` (bridge L1116-1231) + `paint/pipelines/rect_corners.rs`. Vertex attributes per `ShapeRectCornersInstance` (24 floats).
- [ ] 5a.9 Same: `paint/shaders/glow.wgsl` (bridge L1491-1571) + `paint/pipelines/glow.rs`. Vertex attributes per `GlowInstance` (12 floats).
- [ ] 5a.10 Same: `paint/shaders/nebula.wgsl` (bridge L1235-1380, complex 32-float instance with 4 gradient stops) + `paint/pipelines/nebula.rs`.
- [ ] 5a.11 Same: `paint/shaders/starfield.wgsl` (bridge L1384-1487, 24-float instance with cluster + warm/neutral/cool colors) + `paint/pipelines/starfield.rs`.
- [ ] 5a.12 Same: `paint/shaders/image.wgsl` (bridge L1575-1663) + `paint/pipelines/image.rs`. Uses `image_bind_group_layout` (texture + sampler bindings).
- [ ] 5a.13 Same: `paint/shaders/image_transform.wgsl` (bridge L1757-1845) + `paint/pipelines/image_transform.rs`. Uses `image_bind_group_layout`.
- [ ] 5a.14 Same: `paint/shaders/gradient_linear.wgsl` (bridge L1849-1949) + `paint/pipelines/gradient_linear.rs`. Vertex attributes per `LinearGradientInstance` (20 floats).
- [ ] 5a.15 Same: `paint/shaders/gradient_radial.wgsl` (bridge L1953 to end of fn) + `paint/pipelines/gradient_radial.rs`. Vertex attributes per `RadialGradientInstance` (20 floats).
- [ ] [ATOMIC] 5a.16 Wire `paint/mod.rs` `PaintContext::dispatch()` to (a) parse `graph_ptr` per design §8 (`parse_header()` returns `cmd_count` and `payload_bytes`), (b) iterate `cmd_count` command headers (cmd_kind + flags + payload_bytes), (c) for each command, deserialize payload into the appropriate Pod struct (`bytemuck::from_bytes`), (d) accumulate instance batches per pipeline (group by cmd_kind), (e) upload each batch as a `wgpu::Buffer` (vertex buffer with `Instance` step mode) via `device.create_buffer_init`, (f) submit one `wgpu::CommandEncoder` per frame with one render pass per pipeline that has instances, (g) write `gpu_ms` and `total_ms` into `*stats_out` if non-null. Use cmd_kind allocation per design §17.6 (0..10 reserved for the 13 ports; 11 reserved unused; 12-15 reserved for Slice 5b). Stub the dispatch for unknown cmd_kinds with a no-op (silent skip — Slice 5b will fill them).
- [ ] [ATOMIC] 5a.17 Wire `vexart_paint_upload_image()` in `lib.rs` to create a `wgpu::Texture` from the input RGBA bytes (use `device.create_texture_with_data` from `wgpu::util::DeviceExt`), create a sampler, build an `wgpu::BindGroup` with the existing `image_bind_group_layout`, and store all 3 in an `Image` registry inside `PaintContext`. Return the registry handle as the `out_image` u64. Wire `vexart_paint_remove_image()` to drop the entry.
- [ ] 5a.18 Add Rust unit test `native/libvexart/src/paint/pipelines/mod.rs` `#[cfg(test)] tests`: assert `PipelineRegistry::new(device, format, bgl)` returns OK when given a valid device. Use `pollster::block_on` to obtain a real adapter / device for the test (gated behind `#[cfg(feature = "gpu-tests")]`).
- [ ] 5a.19 Add Rust unit test in `native/libvexart/src/paint/mod.rs`: build a graph buffer with 1 rect command (cmd_kind = 0), call `PaintContext::dispatch()` against a 64x64 offscreen target, verify it returns OK. Gated behind `#[cfg(feature = "gpu-tests")]`.
- [ ] 5a.20 Verify: from repo root, `cargo check` passes with real WGPU code compiled. Then `cargo build` succeeds and produces `target/debug/libvexart.dylib`. Then `bun run typecheck` still passes (no TS imports yet of the new pipelines). The bridge.test.ts from Slice 4 still passes (no regression).

### Slice 5b — NEW GPU pipelines per DEC-012 (Apply #2b)

Objective: Author 4 NEW WGPU pipelines that (a) introduce conic gradient (genuinely new) and (b) replace the 4 CPU pixel-mutation functions in the bridge with GPU equivalents per DEC-012 ("todo por WGPU, nada por CPU"). Wire each new pipeline behind a new `cmd_kind` tag in `vexart_paint_dispatch`. Per design §17.2, §17.3, §17.4, §17.5, §17.6.

**Hard rules for Apply #2b:**
- All shaders authored from scratch (no port source). Reference algorithms documented per shader below.
- New pipelines plug into `PipelineRegistry` and `PaintContext::dispatch()` from Slice 5a — Apply #2b extends, never refactors.
- Each new pipeline gets a new `Pod + Zeroable` instance struct in `paint/instances.rs` if its parameters do not fit existing structs.

- [ ] [ATOMIC] 5b.1 Create `paint/shaders/gradient_conic.wgsl` + `paint/pipelines/gradient_conic.rs` + `ConicGradientInstance` struct in `paint/instances.rs`. Algorithm: fragment shader computes `atan2(uv.y - center.y, uv.x - center.x)` normalized to [0, 1], samples a 2-stop or multi-stop color along that angle. Mirror the API shape of `LinearGradientInstance` with an extra `start_angle` field. Wire `cmd_kind = 12` in `paint/mod.rs` dispatch.
- [ ] [ATOMIC] 5b.2 Create `paint/shaders/backdrop_blur.wgsl` + `paint/pipelines/backdrop_blur.rs` + `BackdropBlurInstance` struct (fields: rect [4 floats], blur_radius f32, padding). 2-pass Gaussian blur: pipeline runs ping-pong, first pass = horizontal Gaussian sample, second pass = vertical. Replaces `apply_box_blur_rgba` (bridge L2427-2480). Wire `cmd_kind = 13` (note: requires 2 render passes per dispatch — design accordingly in `PaintContext::dispatch()`).
- [ ] [ATOMIC] 5b.3 Create `paint/shaders/backdrop_filter.wgsl` + `paint/pipelines/backdrop_filter.rs` + `BackdropFilterInstance` struct (fields per `TgeWgpuBackdropFilterParams` from bridge L57-66: blur ignored here — handled by 5b.2 — plus brightness, contrast, saturate, grayscale, invert, sepia, hue_rotate as 7 f32 fields + `_pad`). Single fragment shader applies the 7 ops in order: brightness multiply → contrast curve → saturate via luma blend (matrix from bridge L2502-2511) → grayscale luma → invert → sepia matrix → hue rotation matrix (3x3 derived from cos/sin of degrees, formula from bridge L2492-2500). Replaces `apply_backdrop_filters_rgba` (bridge L2481-2579). Wire `cmd_kind = 14`.
- [ ] [ATOMIC] 5b.4 Create `paint/shaders/image_mask.wgsl` + `paint/pipelines/image_mask.rs` + `ImageMaskInstance` struct (fields: rect [4 floats], mask_rect [4 floats], radius_uniform f32, radius_per_corner [4 floats: tl/tr/br/bl], mode u32 [0 = uniform, 1 = per-corner]). Single fragment shader with `if mode == 0` branch using `radius_uniform`, else uses the 4-corner SDF (signed distance to rounded rect corners). Replaces `apply_rounded_rect_mask_rgba` (bridge L2580-2633) AND `apply_rounded_rect_corners_mask_rgba` (bridge L2634-2699) in one pipeline. Wire `cmd_kind = 15`.
- [ ] 5b.5 Update `PipelineRegistry` to hold the 4 new pipelines. Update its `new()` constructor to call the 4 new `create()` functions.
- [ ] 5b.6 Add Rust unit test for gradient_conic: build a 32x32 offscreen target, dispatch 1 conic command 360°-spanning red→blue, sample center pixel — expect midpoint color (purple-ish). Gated `#[cfg(feature = "gpu-tests")]`.
- [ ] 5b.7 Add Rust unit test for backdrop_blur: solid red 32x32 target, apply blur radius 4, verify edge pixels still red and center still red (uniform color stays uniform under blur). Gated `gpu-tests`.
- [ ] 5b.8 Add Rust unit test for backdrop_filter: white 32x32 target, apply `brightness=50` (50%), verify all pixels mid-gray (0x80). Then test `invert=100` on white target → all pixels black. Gated `gpu-tests`.
- [ ] 5b.9 Add Rust unit test for image_mask: red 64x64 image, mask with `radius_uniform=10` over center 40x40 rect, verify corner pixels of mask region are transparent (mask cuts the corners). Gated `gpu-tests`.
- [ ] 5b.10 Verify: from repo root, `cargo check` passes. `cargo build` produces `libvexart.dylib`. `bun run typecheck` still passes. `cargo test --features gpu-tests` runs all 5a + 5b GPU tests green.

---

## Slice 6: Integrate Taffy in `libvexart/src/layout/` (Safe)

Objective: Implement layout computation using Taffy, replacing Clay's role. Per design §5.2, §10, REQ-NB-004.

- [ ] [ATOMIC] 6.1 Create `native/libvexart/src/layout/tree.rs` with `LayoutTree` struct owning a `taffy::Tree` and a `HashMap<u64, taffy::NodeId>` for stable ID mapping. Implement `build_from_commands()` that parses the flat command buffer into Taffy nodes with proper `Style` settings per design §10 migration map. Per design §4, §10.
- [ ] 6.2 Implement Clay → Taffy style translations in `tree.rs`: `"grow"` → `Dimension::Auto + flex_grow=1.0`, `"fit"` → `Dimension::Auto`, fixed → `Length(n)`, percent → `Percent(n)`, `direction` → `FlexDirection`, `alignX/alignY` → `JustifyContent/AlignItems`, `gap` → both axes equal, padding/border/min/max direct mapping. Per design §10.
- [ ] 6.3 Implement `floating`/`absolute` positioning translation: `Position::Absolute` with computed `inset` from TS-side attach math. Per design §10.
- [ ] 6.4 Create `native/libvexart/src/layout/writeback.rs` with `write_layout()` that reads `taffy::Tree::layout(node)` computed values and writes `PositionedCommand` structs to the caller output buffer. Respect `out_cap`. Per design §4.
- [ ] 6.5 Wire `vexart_layout_compute()` in `lib.rs` to call `build_from_commands()` + `taffy.compute_layout_with_measure()` + `write_layout()`. Per design §5.2.
- [ ] 6.6 Wire `vexart_layout_measure()` to return `(0.0, 0.0)` per DEC-011 stub. Per design §5.2.
- [ ] 6.7 Wire `vexart_layout_writeback()` to accept flat writeback buffer with scroll offsets / handle updates. Per design §5.2.
- [ ] 6.8 Verify: `cargo check` passes with Taffy integration compiled.

---

## Slice 7: Port `kitty-shm-helper.c` to `libvexart/src/kitty/shm.rs` (Safe)

Objective: Port the 139-LOC C SHM transport to Rust using `nix` crate with real implementation. Per design §5.6, REQ-NB-006.

- [ ] [ATOMIC] 7.1 Implement `native/libvexart/src/kitty/shm.rs` with real POSIX SHM: `shm_open` + `ftruncate` + `mmap` + `memcpy` + `munmap` in `vexart_kitty_shm_prepare()`, and `close(fd)` + optional `shm_unlink` in `vexart_kitty_shm_release()`. Use `nix::sys::mman::*` and `nix::unistd::close`. Per design §5.6, REQ-NB-006, proposal Kitty scope boundary.
- [ ] 7.2 Add error handling: invalid name → `ERR_INVALID_ARG` with `set_last_error()`, `shm_open` failure → `ERR_KITTY_TRANSPORT` with OS error message. Per REQ-NB-006.
- [ ] 7.3 Verify: `cargo check` passes with `nix` crate linked.

---

## Slice 8: Implement `vexart_text_*` Stubs per DEC-011 (Safe)

Objective: Finalize text stubs with the one-time stderr warning behavior. Per design §5.5, REQ-NB-005.

- [ ] [ATOMIC] 8.1 Verify `native/libvexart/src/text/mod.rs` has `AtomicBool` guard: first `vexart_text_dispatch()` call writes `[vexart] text rendering disabled during Phase 2 (DEC-011) — MSDF lands in Phase 2b` to stderr via `eprintln!`, subsequent calls are silent. Per design §5.5, REQ-NB-005 scenario.
- [ ] 8.2 Verify `vexart_text_load_atlas()` returns `OK` without side effects. Per REQ-NB-005.
- [ ] 8.3 Verify `vexart_text_measure()` writes `0.0` to both `out_w` and `out_h` pointers, returns `OK`. Per REQ-NB-005.

---

## Slice 9: Switch TS Consumers to `vexart_*` Calls (Safe)

Objective: Rewire TS consumer code from old Clay/Zig/bridge paths to new `vexart_*` FFI. Clay path still compiles behind internal feature flag. Per design §11.

- [ ] [ATOMIC] 9.1 Modify `packages/engine/src/ffi/node.ts`: convert internal shape from Clay-oriented to flat command buffer format per design §8. Each node emits a `cmd_kind` + `flags` + `payload_bytes` prefix. Per design §11.
- [ ] [ATOMIC] 9.2 Modify `packages/engine/src/ffi/render-graph.ts`: remove `import ... from "./clay"` (Clay type dependencies), keep all exported types (`ShadowDef`, `EffectConfig`, `BackdropFilterParams`, `RenderGraphFrame`, `RectangleRenderOp`, etc.), adapt `buildRenderGraphFrame()` to serialize into the §8 packed graph buffer format consumed by `vexart_paint_dispatch`. Per design §16 Q3 resolution, §11.
- [ ] [ATOMIC] 9.3 Modify `packages/engine/src/ffi/gpu-renderer-backend.ts` (78KB — largest TS change): rework to emit to packed graph buffer, call `vexart_paint_dispatch` once per frame instead of per-operation bridge calls. Split into sub-tasks:
  - [ ] 9.3a Remove all `tge_wgpu_canvas_*` per-operation calls. Replace with graph buffer accumulation.
  - [ ] 9.3b Add graph buffer header write at frame start, per-command prefix write for each render op, body serialization matching Rust `instances.rs` layouts.
  - [ ] 9.3c Replace image upload/download with `vexart_paint_upload_image` / `vexart_paint_remove_image`.
  - [ ] 9.3d Replace readback with `vexart_composite_readback_rgba` / `vexart_composite_readback_region_rgba`.
- [ ] [ATOMIC] 9.4 Modify `packages/engine/src/ffi/renderer-backend.ts`: update `RenderGraphFrame` consumer to new shape from render-graph.ts. Per design §11.
- [ ] [ATOMIC] 9.5 Modify `packages/engine/src/ffi/layout-writeback.ts`: rewire from Clay layout output shape to Taffy layout output shape (flat `PositionedCommand` buffer). Per design §10, §11.
- [ ] [ATOMIC] 9.6 Modify `packages/engine/src/ffi/canvas.ts`: rewire from `tge_wgpu_canvas_*` calls to `vexart_paint_*` + `vexart_composite_*`. Per design §11.
- [ ] [ATOMIC] 9.7 Modify `packages/engine/src/ffi/font-atlas.ts`: adapt to Phase 2 text stub — no glyph data uploaded, calls `vexart_text_load_atlas` (success no-op). Per design §11.
- [ ] [ATOMIC] 9.8 Modify `packages/engine/src/ffi/text-layout.ts`: adapt to Phase 2 text stub — `vexart_text_measure` returns `(0, 0)`, text nodes occupy zero layout space. Per design §11, DEC-011.
- [ ] [ATOMIC] 9.9 Modify `packages/engine/src/loop/loop.ts`: replace `clay.*` calls with `vexart_context_*` + `vexart_layout_*` + `vexart_paint_*` + `vexart_composite_*` via new bridge. Remove Clay layout orchestration. Per design §11.
- [ ] [ATOMIC] 9.10 Modify `packages/engine/src/loop/scroll.ts`: consume Taffy output shape instead of Clay layout output. Scissor logic unchanged. Per design §11 — verify `rg "import.*clay" packages/engine/src/loop/scroll.ts` returns 0 after edit.
- [ ] [ATOMIC] 9.11 Modify `packages/engine/src/output/kitty-shm-native.ts`: rewire `bun:ffi` loader from `libkitty-shm-helper` to `libvexart`'s `vexart_kitty_shm_*` exports. Signature-compatible. Per design §11.
- [ ] [ATOMIC] 9.12 Modify `packages/engine/src/output/transport-manager.ts`: remove placeholder/halfblock branches. Per design §11, DEC-005.
- [ ] [ATOMIC] 9.13 Modify `packages/engine/src/output/layer-composer.ts`: remove CPU/GPU switch; single native path via `vexart_composite_merge`. Per design §11.
- [ ] [ATOMIC] 9.14 Modify `packages/engine/src/reconciler/node.ts`: keep stable ID hashing; emit commands in new flat buffer shape per §8. Per design §11.
- [ ] [ATOMIC] 9.15 Modify `packages/engine/src/ffi/index.ts`: remove Clay-facing exports (`ATTACH_TO`, `ATTACH_POINT`, etc. from `./clay`), add `vexart_*` bridge exports from `./vexart-bridge` and `./vexart-functions`. Remove `export * from "./pixel-buffer"` and `export * from "./paint-bridge"`. Per design §11.

---

## Slice 10: Tests — DEC-011 Warning + Rust Unit + TS Buffer Symmetry (Safe)

Objective: Validate FFI contract, text stub behavior, and buffer round-trip before irreversible deletions. Per design §13.

- [ ] 10.1 Create `native/libvexart/src/ffi/buffer.rs` unit tests (inline `#[cfg(test)]`): `parse_header` rejects bad magic, bad version, short buffer. Per design §13.1.
- [ ] 10.2 Create `native/libvexart/src/ffi/error.rs` unit tests: `set_last_error` / `get_last_error_length` / `copy_last_error` roundtrip (ASCII + UTF-8 + empty + oversized cap). Per design §13.1.
- [ ] 10.3 Create `native/libvexart/src/ffi/panic.rs` unit tests: `ffi_guard!` catches `panic!("test")`, returns `ERR_PANIC`, sets last_error containing "test". Per design §13.1.
- [ ] 10.4 Create `native/libvexart/src/layout/tree.rs` unit tests: 3-node command buffer → Taffy tree → expected positions (compare against Taffy reference). Per design §13.1.
- [ ] 10.5 Create `native/libvexart/src/layout/writeback.rs` unit tests: layout output writes N `PositionedCommand` to buffer, respects `out_cap`. Per design §13.1.
- [ ] 10.6 Create `native/libvexart/src/kitty/shm.rs` unit tests: `shm_open` + `mmap` + `shm_unlink` roundtrip on `/vexart_test_` prefix. Per design §13.1.
- [ ] 10.7 Create `native/libvexart/src/text/mod.rs` unit tests: `dispatch` returns OK, measure writes `0.0, 0.0`, first call emits stderr (capture via pipe), second is silent. Per design §13.1, REQ-NB-005 scenario.
- [x] 10.8 Create `native/libvexart/src/paint/instances.rs` unit tests: `Pod + Zeroable` round-trips through `bytemuck::cast_slice`. Per design §13.1. **Done early in Slice 2 apply (2026-04-17); `test_rect_instance_pod_roundtrip` and `test_shadow_instance_pod_roundtrip` cover the pattern for all 11 structs.**
- [ ] 10.9 Create `native/libvexart/tests/integration/roundtrip.rs` gated behind `#[cfg(feature = "gpu-tests")]`: create context → trivial layout → paint single rect → composite → readback center pixel. Per design §13.2.
- [ ] 10.10 Add `gpu-tests` feature to `native/libvexart/Cargo.toml` `[features]` section. Per design §16 Q4 resolution.
- [ ] 10.11 Create/modify `packages/engine/src/ffi/vexart-buffer.test.ts`: pack N rect commands, decode via mock Rust-shape reader, assert round-trip symmetry of header + per-command prefix + body. Per design §13.3.
- [ ] 10.12 Create `packages/engine/src/output/text-warning.test.ts`: mount engine, render `<text>` twice (two frames), capture stderr, assert exactly one line matches `/\[vexart\].*Phase 2.*DEC-011/`. Per design §13.5.
- [ ] 10.13 Verify: `cargo test` passes (unit tests only, no GPU). Per design §13.2.
- [ ] 10.14 Verify: `bun run typecheck` passes.

---

## Checkpoint: Slices 1–10

- [ ] Run `bun run typecheck` — verify no regression.
- [ ] Run `cargo check` — verify Rust builds.
- [ ] Run `cargo test` — verify Rust unit tests pass.
- [ ] Commit with message: `refactor(phase-2): scaffold libvexart, wire TS bridge, port WGPU+Taffy+SHM+text-stubs`.

---

## Slice 11: Point of No Return — Delete Legacy Surfaces (IRREVERSIBLE)

Objective: Delete all legacy native surfaces, legacy TS modules, and fallback backends. Every deletion has a pre-condition grep gate per REQ-NB-002, REQ-NB-011.

### 11A. Delete `packages/engine/src/ffi/clay.ts`

- [ ] 11A.1a Verify no unknown consumers: `rg "from.*['\"].*clay['\"]" packages/engine/src/` returns only known files: `index.ts`, `render-graph.ts`, `layout-writeback.ts`, `node.ts`, `renderer-backend.ts`, `loop/loop.ts`, `loop/scroll.ts`. All must be already migrated in Slice 9. Per design §11, REQ-NB-011.
- [ ] 11A.1b Delete: `git rm packages/engine/src/ffi/clay.ts`. Per REQ-NB-002.

### 11B. Delete `packages/engine/src/ffi/gpu-stub.ts`

- [ ] 11B.1a Verify no unknown consumers: `rg "gpu-stub" packages/` returns 0 non-comment hits. Per design §11.
- [ ] 11B.1b Delete: `git rm packages/engine/src/ffi/gpu-stub.ts`. Per REQ-NB-002.

### 11C. Delete `packages/engine/src/ffi/pixel-buffer.ts` (founder-confirmed legacy pixelbuffer)

- [ ] 11C.1a Verify no unknown consumers: `rg "pixel-buffer" packages/` returns only `packages/engine/src/ffi/index.ts` (already cleaned in 9.15). Per design §16 Q2.
- [ ] 11C.1b Delete: `git rm packages/engine/src/ffi/pixel-buffer.ts`. Per REQ-NB-002.

### 11D. Delete `packages/engine/src/ffi/gpu-frame-composer.ts`

- [ ] 11D.1a Verify no unknown consumers: `rg "gpu-frame-composer" packages/` returns only known files already migrated in Slice 9. Per design §11.
- [ ] 11D.1b Delete: `git rm packages/engine/src/ffi/gpu-frame-composer.ts`. Per REQ-NB-002, PRD §11.

### 11E. Delete `packages/engine/src/ffi/wgpu-canvas-bridge.ts`

- [ ] 11E.1a Verify no unknown consumers: `rg "from.*wgpu-canvas-bridge" packages/` returns only known files already migrated in Slice 9. Per design §11.
- [ ] 11E.1b Delete: `git rm packages/engine/src/ffi/wgpu-canvas-bridge.ts`. Per REQ-NB-002.

### 11F. Delete `packages/engine/src/ffi/paint-bridge.ts`

- [ ] 11F.1a Verify no unknown consumers: `rg "paint-bridge" packages/` returns only `packages/engine/src/ffi/index.ts` (already cleaned in 9.15).
- [ ] 11F.1b Delete: `git rm packages/engine/src/ffi/paint-bridge.ts`. Per REQ-NB-002.

### 11G. Delete `packages/engine/src/paint-legacy/` (whole directory)

- [ ] 11G.1a Verify no unknown consumers: `rg "paint-legacy" packages/` returns 0 non-comment hits. Per design §11.
- [ ] 11G.1b Delete: `git rm -r packages/engine/src/paint-legacy/`. Per REQ-NB-002.

### 11H. Delete `packages/engine/src/loop/clay-layout.ts`

- [ ] 11H.1a Verify no unknown consumers: `rg "clay-layout" packages/` returns 0 non-self hits. Per design §11.
- [ ] 11H.1b Delete: `git rm packages/engine/src/loop/clay-layout.ts`. Per REQ-NB-002.

### 11I. Delete `native/wgpu-canvas-bridge/` (whole crate)

- [ ] 11I.1a Verify no references: `rg "wgpu-canvas-bridge" packages/ native/libvexart/ Cargo.toml` returns 0 non-comment hits. Per design §11.
- [ ] 11I.1b Delete: `git rm -r native/wgpu-canvas-bridge/`. Per REQ-NB-002.

### 11J. Delete `native/kitty-shm-helper/` (whole crate)

- [ ] 11J.1a Verify no references: `rg "kitty-shm-helper" packages/ native/libvexart/ Cargo.toml` returns 0 non-comment hits. Per design §11.
- [ ] 11J.1b Delete: `git rm -r native/kitty-shm-helper/`. Per REQ-NB-002.

### 11K. Delete `zig/` (whole directory)

- [ ] 11K.1a Verify no references: `rg '@tge/pixel|tge_[a-z_]+' packages/ native/libvexart/` returns 0 non-comment hits. Per design §11.
- [ ] 11K.1b Delete: `git rm -r zig/`. Per REQ-NB-002, DEC-004.

### 11L. Delete `vendor/clay*`

- [ ] 11L.1a Verify no references: `rg 'clay\.h|vendor/clay|clay_[a-z_]+' packages/ native/libvexart/` returns 0 non-comment hits. Per design §11.
- [ ] 11L.1b Delete: `git rm -r vendor/clay*`. Per REQ-NB-002, DEC-004.

### 11M. Delete placeholder + halfblock output backends (if present)

- [ ] 11M.1a Verify no references: `rg 'placeholder-backend|halfblock' packages/` returns 0 non-comment hits. Per design §11.
- [ ] 11M.1b If any placeholder or halfblock backend files exist under `packages/engine/src/output/`, delete them with `git rm`. Per REQ-NB-002, DEC-005.

### 11N. Clean up `packages/engine/src/public.ts`

- [ ] 11N.1a Verify public surface: `rg "paint-legacy|@vexart/pixel" packages/engine/src/public.ts` returns 0. Per REQ-NB-011.
- [ ] 11N.1b Remove any re-exports of deleted modules from `packages/engine/src/public.ts`. Keep public surface stable per design §11 (no API breaks for user code — Phase 4 locks API).

### 11O. Test migration — handle casualties per design §13.6

- [ ] 11O.1 `packages/engine/src/reconciler/node.test.ts` — REWRITE: migrate Clay output assertions to new flat command buffer shape. Per design §13.6.
- [ ] 11O.2 `packages/engine/src/paint-legacy/buffer.test.ts` — DELETE: tests deleted code. `git rm`. Per design §13.6.
- [ ] 11O.3 `packages/engine/src/paint-legacy/composite.test.ts` — DELETE: tests deleted code. `git rm`. Per design §13.6.
- [ ] 11O.4 Any test importing `@tge/pixel` or `clay.*` — DELETE (tested deleted code) or REWRITE (same intent, new FFI). Run: `rg -l "@tge/pixel|from.*clay|import.*clay" packages/ --type ts` and handle each hit. Per design §13.6.

### 11P. Clean npm/bun references

- [ ] 11P.1 Remove any `package.json` entries referencing `zig/`, `vendor/clay*`, `@tge/pixel`, `paint-legacy`, or deleted backends from `scripts`, `dependencies`, or `files` fields. Per REQ-NB-011.
- [ ] 11P.2 Remove `zig build test` from any npm scripts (replaced by `cargo test`). Per config.yaml `testing.native.zig` (marked "deleted in Phase 2").

---

## Slice 12: Final `render-graph.ts` Modify Pass (Safe)

Objective: Ensure no Clay references remain in render-graph.ts after all consumers are migrated. Per design §16 Q3.

- [ ] 12.1 Verify `packages/engine/src/ffi/render-graph.ts` has zero `import ... from "./clay"` lines. Per design §16 Q3.
- [ ] 12.2 Verify all exported types from `render-graph.ts` are preserved: `ShadowDef`, `EffectConfig`, `BackdropFilterParams`, `RenderGraphFrame`, `RectangleRenderOp`, `TextRenderOp`, `ImageRenderOp`, `EffectRenderOp`, `BorderRenderOp`, `BACKDROP_FILTER_KIND`. Per design §16 Q3.

---

## Slice 13: Final Grep Verification (Safe)

Objective: Confirm zero remaining references to deleted surfaces. Per REQ-NB-011, design §11.

- [ ] 13.1 Run: `rg '@tge/pixel|tge_[a-z_]+' packages/ native/libvexart/ --type ts --type rust` — must return 0 non-comment hits.
- [ ] 13.2 Run: `rg 'clay\.h|vendor/clay|clay_[a-z_]+|from.*["\x27].*clay["\x27]' packages/ native/libvexart/ --type ts --type rust` — must return 0 non-comment hits.
- [ ] 13.3 Run: `rg 'paint-legacy|@vexart/pixel|gpu-stub|gpu-frame-composer|wgpu-canvas-bridge|paint-bridge|pixel-buffer|clay-layout' packages/ --type ts` — must return 0 non-comment hits.
- [ ] 13.4 Run: `rg 'placeholder-backend|halfblock' packages/ --type ts` — must return 0 non-comment hits.

---

## Slice 14: Exit-Gate Commands (Safe)

Objective: Validate the consolidated codebase passes all required checks. Per design §13.4, proposal success criteria.

- [ ] 14.1 Run: `cargo test` — all Rust unit tests pass. Per REQ-NB-003.
- [ ] 14.2 Run: `cargo check` — Rust compiles cleanly.
- [ ] 14.3 Run: `bun run typecheck` — TypeScript type-checks. Per proposal success criteria.
- [ ] 14.4 Run: `bun test` — all surviving TS tests pass. Per proposal success criteria.
- [ ] 14.5 Run: `bun run lint:boundaries` — zero violations. Per proposal success criteria.
- [ ] 14.6 Run: `bun --conditions=browser run examples/hello.tsx` — starts without crash, renders a single box, exits cleanly. Per design §13.4.
- [ ] 14.7 Run: `bun --conditions=browser run examples/showcase.tsx` — starts without crash, cycles tabs, no crash. Text regions blank per DEC-011. Per design §13.4, REQ-NB-010.

---

## Slice 15: Visual Diff of Showcase POTENTIAL_DRIFT Regions (Safe)

Objective: Hand-diff the showcase regions flagged in design §15 to confirm non-text visual parity. Per REQ-NB-010.

- [ ] 15.1 Compare shadow rendering (single + multi) against pre-phase-2 screenshot. Check blur radius algorithm: old Zig 3-pass box vs new Rust shader. Per design §15 (POTENTIAL_DRIFT).
- [ ] 15.2 Compare outer glow rendering against pre-phase-2 screenshot. Check plateau + falloff curve. Per design §15 (POTENTIAL_DRIFT).
- [ ] 15.3 Compare gradient rendering (linear, radial, multi-stop, conic) against pre-phase-2 screenshot. Check color-space interpolation (must be sRGB linear blend, matching old Zig). Per design §15 (POTENTIAL_DRIFT).
- [ ] 15.4 Compare backdrop blur + filter chain rendering against pre-phase-2 screenshot. Verify filter ordering matches: brightness → contrast → saturate. Per design §15 (POTENTIAL_DRIFT).
- [ ] 15.5 Confirm all text regions are blank (expected per DEC-011). Non-text box shapes (rects, rounded corners, per-corner radius) match pre-phase-2. Per design §15, REQ-NB-010.
- [ ] 15.6 Commit final state with message: `chore(phase-2): complete native consolidation — single libvexart binary`.

---

## Verification (Exit Gates)

- [ ] V.1 `cargo test` passes — all Rust unit tests green.
- [ ] V.2 `cargo check` passes — no Rust compilation warnings.
- [ ] V.3 `bun run typecheck` passes — no TS errors.
- [ ] V.4 `bun test` passes — all surviving TS tests green.
- [ ] V.5 `bun run lint:boundaries` passes — zero violations.
- [ ] V.6 `rg '@tge/pixel|tge_|clay\.|paint-legacy' packages/ native/libvexart/ --type ts --type rust` returns 0 non-comment hits. Per REQ-NB-011.
- [ ] V.7 `bun --conditions=browser run examples/showcase.tsx` starts without crash, text regions blank, non-text regions visually identical. Per REQ-NB-010.
- [ ] V.8 Only one native cdylib exists: `native/libvexart/`. Per REQ-NB-001.
- [ ] V.9 `vexart_text_dispatch` emits exactly one DEC-011 stderr warning on first call, silent thereafter. Per REQ-NB-005.
- [ ] V.10 No `zig/`, `vendor/clay*`, `paint-legacy/`, `clay-layout.ts`, `gpu-stub.ts`, placeholder, or halfblock paths exist. Per REQ-NB-002.
