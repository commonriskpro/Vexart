# gpu-context-unification Specification

## Purpose

Single WGPU device/queue in `libvexart`. Target registry, layer lifecycle, compositing, readback, and backdrop/mask operations all owned by Rust. Eliminates the WGPU 26/29 dual-context split by deleting `wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/`.

**PRD trace**: `docs/PRD.md §743-801` (Phase 2b scope), `docs/PRD.md §12 DEC-012` (GPU-only rendering).
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §4.1` (crate layout), `§4.2` (FFI contract), `§5.2.5-5.2.6` (paint/composite phases).

## Requirements

### REQ-2B-001: Target registry create/destroy

The system SHALL expose `vexart_composite_target_create(ctx, width, height, out_target)` and `vexart_composite_target_destroy(ctx, target)`. Each target MUST allocate a real WGPU `Texture` + `TextureView` owned by the registry. Destroyed targets MUST release GPU memory via `ResourceManager`.

#### Scenario: Create offscreen target

- GIVEN a valid `PaintContext` handle
- WHEN `vexart_composite_target_create(ctx, 1920, 1080, &out)` is called
- THEN `out` receives a non-zero handle
- AND a WGPU `Texture` of size 1920×1080 RGBA8 exists in the registry

#### Scenario: Destroy releases resources

- GIVEN an existing target handle from a prior create call
- WHEN `vexart_composite_target_destroy(ctx, target)` is called
- THEN the handle becomes invalid (subsequent use returns `ERR_INVALID_HANDLE`)
- AND the GPU texture memory is released

#### Scenario: Invalid handle on create

- GIVEN a null or destroyed context handle
- WHEN `vexart_composite_target_create` is called
- THEN the return code is `ERR_INVALID_HANDLE` (-2)

### REQ-2B-002: Target layer begin/end

`vexart_composite_target_begin_layer(ctx, target, layer, clear_color)` SHALL push a render pass onto the target's layer stack. `vexart_composite_target_end_layer(ctx, target)` SHALL pop the layer. Layers within a target are composited in stack order (bottom-to-top). A target with no active layer is in a rested state.

#### Scenario: Begin and end a single layer

- GIVEN a valid target
- WHEN `begin_layer` is called with `clear_color=0x00000000`
- THEN a new WGPU render pass is active on that target
- WHEN `end_layer` is called
- THEN the render pass is submitted to the GPU queue
- AND the target returns to rested state

#### Scenario: Nested layers error

- GIVEN a target with an active layer (begin called, end not yet called)
- WHEN `begin_layer` is called again on the same target
- THEN the call returns a non-zero error code

### REQ-2B-003: Composite image layer

`vexart_composite_render_image_layer(ctx, target, image, x, y, w, h, z, clear_color)` SHALL composite a source image onto the target at the specified position and z-order. This replaces the old `renderWgpuCanvasTarget*Layer` bridge calls.

#### Scenario: Composite image at position

- GIVEN a target T with a painted layer and an image handle I
- WHEN `vexart_composite_render_image_layer(ctx, T, I, 10, 20, 100, 50, 0, 0x00000000)` is called
- THEN image I is drawn at (10,20) with size 100×50 onto target T

#### Scenario: Z-order respects layering

- GIVEN two images I1 and I2 composited onto target T with z=0 and z=1 respectively
- WHEN the final composite is read back
- THEN I2 pixels overlay I1 pixels at overlapping coordinates

### REQ-2B-004: Copy region to image

`vexart_composite_copy_region_to_image(ctx, target, x, y, w, h, out_image)` SHALL extract a rectangular region from a target into a new image handle. Used for backdrop filter source extraction.

#### Scenario: Extract region for backdrop

- GIVEN a target with painted content in region (50,50)-(150,150)
- WHEN `vexart_composite_copy_region_to_image(ctx, T, 50, 50, 100, 100, &out)` is called
- THEN `out` contains a 100×100 image with the target's pixels from that region

#### Scenario: Out-of-bounds region is clamped

- GIVEN a 200×200 target
- WHEN a copy region is requested at (180, 180, 50, 50)
- THEN the result contains only the valid overlapping pixels (20×20)

### REQ-2B-005: Readback (full + region)

`vexart_composite_readback_rgba(ctx, target, out_ptr, out_len)` and `vexart_composite_readback_region_rgba(ctx, target, x, y, w, h, out_ptr, out_len)` SHALL perform real GPU→CPU transfer using WGPU async buffer map. These MUST NOT return zero bytes (current stub behavior).

#### Scenario: Full-frame readback

- GIVEN a 100×100 target with painted content
- WHEN `vexart_composite_readback_rgba(ctx, T, buf, 40000)` is called
- THEN `buf` contains 40000 bytes of RGBA pixel data matching GPU content

#### Scenario: Region readback

- GIVEN a 200×200 target
- WHEN region readback is called for (10,10,50,50)
- THEN 10000 bytes are written (50×50×4)

#### Scenario: Readback buffer too small

- GIVEN a 100×100 target and a buffer of 100 bytes
- WHEN full readback is attempted
- THEN the call returns a non-zero error code without writing past the buffer

### REQ-2B-006: Backdrop filter and rounded rect mask

`vexart_composite_image_filter_backdrop(ctx, target, image, filter_params)` SHALL apply the existing backdrop-filter shader pipeline (ARCHITECTURE §4.1 `paint/pipelines/backdrop.rs`) to an image. `vexart_composite_image_mask_rounded_rect(ctx, target, image, radii)` and `_corners` variant SHALL clip image content to a rounded-rect mask.

#### Scenario: Backdrop blur on extracted region

- GIVEN an image extracted via copy_region (REQ-2B-004)
- WHEN `vexart_composite_image_filter_backdrop` is called with `blur=12`
- THEN the returned image has a Gaussian blur applied with radius 12

#### Scenario: Rounded rect mask clips content

- GIVEN a rectangular image I
- WHEN `vexart_composite_image_mask_rounded_rect(ctx, T, I, { radius: 16 })` is called
- THEN pixels outside the rounded rect boundary are transparent in the result

### REQ-2B-007: Paint dispatch accepts target handle

`vexart_paint_dispatch(context, target, graph_ptr, graph_len, stats_out)` MUST render into the caller-specified `target` handle instead of the `PaintContext` singleton texture. This is the critical change enabling single-context rendering.

#### Scenario: Paint renders into specified target

- GIVEN two targets T1 and T2
- WHEN paint dispatch is called with `target=T1` and a rect command
- THEN the rect appears in T1's GPU texture and T2 is unmodified

#### Scenario: Null target uses default

- GIVEN `target=0` is passed
- WHEN paint dispatch runs
- THEN rendering falls back to the `PaintContext` default offscreen texture

### REQ-2B-008: Bridge deletion — wgpu-canvas-bridge removed

After all call sites in `gpu-renderer-backend.ts` are rewired to `vexart_*` FFI, `packages/engine/src/ffi/wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/` MUST be deleted. Zero references to `tge_wgpu_canvas_*` or `createWgpuCanvasContext` MAY remain.

#### Scenario: No bridge references remain

- GIVEN the rewire is complete
- WHEN `grep -r "wgpu-canvas-bridge\|tge_wgpu_canvas\|createWgpuCanvasContext" packages/` is run
- THEN zero matches are found
- AND the files `wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/` do not exist

#### Scenario: Showcase renders identically

- GIVEN the bridge deletion is complete
- WHEN `bun run showcase` executes
- THEN all non-text regions render identically to the Phase 2 baseline (visual comparison)
