# Native WGPU Boundary, Pipelines & Transport Architecture

The native runtime lives in `native/libvexart` and compiles to a single C dynamic library (`libvexart.dylib` on macOS, `libvexart.so` on Linux, and `vexart.dll` on Windows). It is driven by WGPU 29.0.1, exposing low-level GPU rendering, compositing, MSDF vector typography, GPU resource budgeting, and high-performance Kitty protocol presentation over `bun:ffi`.

---

## 1. Headless WGPU Device & Concurrency Model

Vexart operates entirely headlessly—it does not create a native OS window or display surface. All GPU operations render into offscreen `wgpu::Texture` targets formatted as `Rgba8Unorm`.

### 1.1 `SHARED_PAINT` Singleton
Native context state is held in static memory wrapped in thread-safe, poison-resistant synchronization:
```rust
pub static SHARED_PAINT: LazyLock<Mutex<Option<PaintContext>>> =
    LazyLock::new(|| Mutex::new(None));
```

### 1.2 Poison-Resistant Mutex Recovery (`lock_or_recover`)
If an operation encounters an internal panic while holding a lock, standard Rust mutexes poison their state, normally causing subsequent calls to crash. Vexart recovers automatically:
```rust
pub fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
```

### 1.3 Panic Guard (`ffi_guard!`) & Error Thread-Local
Rust unwinding across `extern "C"` triggers undefined behavior in C ABI runtimes. Every FFI entry point is wrapped in `ffi_guard!`:
```rust
macro_rules! ffi_guard {
    ($body:block) => {{
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || $body)) {
            Ok(code) => code,
            Err(payload) => {
                let msg = if let Some(s) = payload.downcast_ref::<&'static str>() {
                    (*s).to_string()
                } else if let Some(s) = payload.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "unknown panic payload".to_string()
                };
                $crate::ffi::error::set_last_error(format!("panic: {msg}"));
                $crate::ffi::panic::ERR_PANIC
            }
        }
    }};
}
```

---

## 2. All 21 Render Pipeline IDs (`cmd_kind`)

Vexart implements exactly 21 GPU pipeline command kinds indexed in `native/libvexart/src/paint/pipelines/mod.rs`:

| `cmd_kind` | Pipeline Name | WGSL Shader File | Vertex / Instance Stride | Visual Responsibility |
| :---: | :--- | :--- | :---: | :--- |
| **0** | `rect` | `rect.wgsl` | **32B** (`BridgeRectInstance`) | Flat quads, borders, clear areas |
| **1** | `shape_rect` | `shape_rect.wgsl` | **80B** (`BridgeShapeRectInstance`) | SDF rounded quads with uniform corner radius |
| **2** | `shape_rect_corners` | `rect_corners.wgsl`| **96B** (`BridgeShapeRectCornersInstance`)| SDF quads with independent per-corner radii |
| **3** | `circle` | `circle.wgsl` | **64B** (`BridgeCircleInstance`) | Perfect SDF circles with stroke/fill support |
| **4** | `polygon` | `polygon.wgsl` | **80B** (`BridgePolygonInstance`) | Regular N-sided convex polygons |
| **5** | `bezier` | `bezier.wgsl` | **80B** (`BridgeBezierInstance`) | Quadratic Bezier curves with anti-aliasing |
| **6** | `glow` | `glow.wgsl` | **48B** (`BridgeGlowInstance`) | Outer exponential glow and halo rings |
| **7** | `nebula` | `nebula.wgsl` | **80B** (`BridgeNebulaInstance`) | Procedural noise nebula background clouds |
| **8** | `starfield` | `starfield.wgsl` | **80B** (`BridgeStarfieldInstance`) | Procedural depth-animated starfields |
| **9** | `image` | `image.wgsl` | **48B** (`BridgeImageInstance`) | Direct texture blit (Paint Pass) |
| **10** | `image_transform` | `image_transform.wgsl` | **48B** (`BridgeImageTransformInstance`) | 3x3 projective matrix transformed textures |
| **11** | *reserved* | — | — | Legacy glyph slot (reserved / skipped) |
| **12** | `gradient_linear` | `gradient_linear.wgsl` | **80B** (`BridgeLinearGradientInstance`) | 2-stop arbitrary angle linear gradients |
| **13** | `gradient_radial` | `gradient_radial.wgsl` | **80B** (`BridgeRadialGradientInstance`) | 2-stop centered radial gradients |
| **14** | `gradient_conic` | `gradient_conic.wgsl` | **48B** (`ConicGradientInstance`) | Angular sweep / conic gradients |
| **15** | `backdrop_blur` | `backdrop_blur.wgsl` | **32B** (`BackdropBlurInstance`) | Separable Gaussian blur sampling backdrop |
| **16** | `backdrop_filter` | `backdrop_filter.wgsl`| **48B** (`BackdropFilterInstance`) | Color matrix filters (brightness/contrast) |
| **17** | `image_mask` | `image_mask.wgsl` | **64B** (`ImageMaskInstance`) | Alpha masking texture with rounded shapes |
| **18** | `glyph` | `msdf_text.wgsl` | **64B** (`MsdfGlyphInstance`) | MSDF vector font typography |
| **19** | `self_filter` | `self_filter.wgsl` | **48B** (`SelfFilterInstance`) | Element-level CSS self-filters |
| **20** | `shadow` | `shadow.wgsl` | **80B** (`BridgeShadowInstance`) | Analytic Gaussian drop and inset shadows |

> **Prohibition Invariant (`cmd_kind` 9 & 10)**:
> In `paint::dispatch` (`native/libvexart/src/paint/mod.rs`), `cmd_kind` 9 (`image`) and 10 (`image_transform`) are **strictly prohibited** in the direct render graph buffer. If encountered, dispatch immediately aborts with an error. Image layers are managed exclusively through native compositing operations (`vexart_composite_render_image_layer` and `vexart_composite_render_image_transform_layer`) to preserve correct z-ordering and target lifecycle.

---

## 3. Wire Format & Binary Command Protocol

Commands are transferred from TypeScript to Rust via a contiguous packed memory buffer passed by pointer (`buf_ptr: *const u8`, `buf_len: u32`).

### 3.1 16-Byte Wire Header
Every command buffer begins with a 16-byte fixed header:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 GRAPH_MAGIC (0x56584152 = "VXAR")             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                GRAPH_VERSION (0x00020000 = v2.0)              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     cmd_count (u32, LE)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   payload_bytes (u32, LE)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### 3.2 8-Byte Command Record Prefix
Each command is serialized with an 8-byte prefix followed immediately by its instance payload:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         cmd_kind (u16)        |          flags (u16)          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     payload_bytes (u32)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Instance Data...                         |
```

### 3.3 Packed Instance Buffer Strides
Instance structures are marked `#[repr(C)]` and implement `bytemuck::Pod`:
- **`BridgeShapeRectInstance` (80 Bytes)**:
  `x, y, w, h` (16B), `fill_r, fill_g, fill_b, fill_a` (16B), `stroke_r, stroke_g, stroke_b, stroke_a` (16B), `radius` (4B), `stroke_width` (4B), `has_fill, has_stroke` (8B), `_pad` (16B).
- **`BridgeShapeRectCornersInstance` (96 Bytes)**:
  `x, y, w, h` (16B), `fill_r, fill_g, fill_b, fill_a` (16B), `stroke_r, stroke_g, stroke_b, stroke_a` (16B), `r_top_left, r_top_right, r_bottom_right, r_bottom_left` (16B), `stroke_width` (4B), `has_fill, has_stroke` (8B), `_pad` (20B).
- **`BridgeGlowInstance` (48 Bytes)**:
  `x, y, w, h` (16B), `r, g, b, a` (16B), `radius` (4B), `intensity` (4B), `_pad` (8B).
- **`BridgeShadowInstance` (80 Bytes)**:
  `x, y, w, h` (16B), `color_r, color_g, color_b, color_a` (16B), `offset_x, offset_y, blur, spread` (16B), `corner_radius` (4B), `inset_flag` (4B), `_pad` (8B).
- **`BridgeLinearGradientInstance` (80 Bytes)**:
  `x, y, w, h` (16B), `from_r, from_g, from_b, from_a` (16B), `to_r, to_g, to_b, to_a` (16B), `angle_degrees` (4B), `_pad` (28B).
- **`BridgeRadialGradientInstance` (80 Bytes)**:
  `x, y, w, h` (16B), `from_r, from_g, from_b, from_a` (16B), `to_r, to_g, to_b, to_a` (16B), `radius_fraction` (4B), `_pad` (28B).
- **`BridgeImageTransformInstance` (48 Bytes)**:
  `x, y, w, h` (16B), `image_handle` (8B), `m00..m22` packed 3x3 transform (24B).

---

## 4. Dynamic Vertex Buffer Architecture & Decay Cooldown

In early revisions, vertex buffers were allocated dynamically per batch, triggering severe PCIe bus saturation and memory allocator fragmentation.

### 4.1 Steady-State Ring Buffer (2 MB)
Vexart maintains a persistent GPU vertex buffer initialized to **2 MB** (`BASE_VERTEX_BUFFER_CAPACITY = 2 * 1024 * 1024`):
- Operates via bump allocation: `vertex_buffer_offset` advances as instances are copied via `queue.write_buffer`.
- **Zero Allocations**: During standard 60/120 FPS execution, `device.create_buffer` is never called.

### 4.2 Elastic Doubling & Peak Tracking
If an intensive scene exceeds 2 MB:
1. `alloc_vertex_space()` calculates needed capacity and doubles the buffer (`new_capacity = current * 2`).
2. Tracks the highest memory mark reached in the current frame (`vertex_buffer_peak_frame_bytes`).

### 4.3 120-Frame Decay Cooldown
To prevent high-water mark bloat from permanently hoarding VRAM:
1. When frame demand drops back below 2 MB, `vertex_buffer_idle_frames` increments.
2. If peak frame usage remains below 2 MB for **120 consecutive frames** (`VERTEX_BUFFER_COOLDOWN_FRAMES = 120`, ~2 seconds at 60 FPS):
   - Rust frees the oversized buffer.
   - Reallocates the base 2 MB vertex buffer.
   - Returns unused VRAM to the host OS.

---

## 5. Complete C FFI Export Signatures (Exactly 50 Functions)

Native C API exports are declared `#[no_mangle] pub extern "C"` or `#[no_mangle] pub unsafe extern "C"`. There are exactly 50 functions exported across all native subsystems:

### 5.1 Library Version & Lifecycle (3 Functions)
```rust
pub extern "C" fn vexart_version() -> u32
pub unsafe extern "C" fn vexart_context_create(opts_ptr: *const u8, opts_len: u32, out_ctx: *mut u64) -> i32
pub extern "C" fn vexart_context_destroy(ctx: u64) -> i32
```

### 5.2 Paint & Command Dispatch (3 Functions)
```rust
pub unsafe extern "C" fn vexart_paint_dispatch(ctx: u64, target: u64, buf_ptr: *const u8, buf_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_paint_upload_image(ctx: u64, rgba_ptr: *const u8, rgba_len: u32, width: u32, height: u32, flags: u32, out_handle: *mut u64) -> i32
pub extern "C" fn vexart_paint_remove_image(ctx: u64, image: u64) -> i32
```

### 5.3 Composite Targets & Operations (13 Functions)
```rust
pub unsafe extern "C" fn vexart_composite_target_create(ctx: u64, width: u32, height: u32, out_target: *mut u64) -> i32
pub extern "C" fn vexart_composite_target_destroy(ctx: u64, target: u64) -> i32
pub extern "C" fn vexart_composite_target_begin_layer(ctx: u64, target: u64, clear_color: u32, flags: u32) -> i32
pub extern "C" fn vexart_composite_target_end_layer(ctx: u64, target: u64) -> i32
pub extern "C" fn vexart_composite_target_set_scissor(ctx: u64, target: u64, x: u32, y: u32, w: u32, h: u32) -> i32
pub extern "C" fn vexart_composite_target_reset_scissor(ctx: u64, target: u64) -> i32
pub extern "C" fn vexart_composite_render_image_layer(ctx: u64, target: u64, image: u64, x: f32, y: f32, w: f32, h: f32, flags: u32, opacity_u32: u32) -> i32
pub unsafe extern "C" fn vexart_composite_render_image_transform_layer(ctx: u64, target: u64, image: u64, matrix_ptr: *const f32, flags: u32) -> i32
pub unsafe extern "C" fn vexart_composite_update_uniform(_ctx: u64, target: u64, source_target: u64, params_ptr: *const u8, clear_rgba: u32) -> i32
pub unsafe extern "C" fn vexart_composite_copy_region_to_image(ctx: u64, target: u64, x: u32, y: u32, w: u32, h: u32, out_image: *mut u64) -> i32
pub unsafe extern "C" fn vexart_composite_image_filter_backdrop(ctx: u64, target: u64, params_ptr: *const u8, params_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_composite_image_mask_rounded_rect(ctx: u64, target: u64, rect_ptr: *const f32, radii_ptr: *const f32) -> i32
pub unsafe extern "C" fn vexart_composite_image_mask_rounded_rect_region(_ctx: u64, image: u64, rect_ptr: *const u8, out_image: *mut u64) -> i32
```

### 5.4 Composite Readback Operations (2 Functions)
```rust
pub unsafe extern "C" fn vexart_composite_readback_rgba(ctx: u64, target: u64, out_ptr: *mut u8, out_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_composite_readback_region_rgba(_ctx: u64, target: u64, rect_ptr: *const u8, dst: *mut u8, dst_cap: u32, stats_out: *mut FrameStats) -> i32
```

### 5.5 Text & MSDF Typography (4 Functions)
```rust
pub extern "C" fn vexart_font_init() -> i32
pub unsafe extern "C" fn vexart_font_query(families_ptr: *const u8, families_len: u32, weight: u16, italic: u32, out_handle: *mut u64) -> i32
pub unsafe extern "C" fn vexart_font_render_text(ctx: u64, target: u64, text_ptr: *const u8, text_len: u32, params_ptr: *const u8, params_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_font_measure(text_ptr: *const u8, text_len: u32, families_ptr: *const u8, families_len: u32, font_size: f32, weight: u16, italic: u32, out_w: *mut f32, out_h: *mut f32) -> i32
```

### 5.6 Kitty Presentation & Transport (13 Functions)
```rust
pub unsafe extern "C" fn vexart_kitty_emit_frame_with_stats(ctx: u64, target: u64, image_id: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_kitty_emit_layer(ctx: u64, image_id: u32, rgba_ptr: *const u8, rgba_len: u32, layer_ptr: *const u32, layer_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_kitty_emit_layer_target(ctx: u64, target: u64, image_id: u32, layer_ptr: *const u32, layer_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_kitty_emit_region_target(ctx: u64, target: u64, image_id: u32, region_ptr: *const u32, region_len: u32, stats_out: *mut u32) -> i32
pub unsafe extern "C" fn vexart_kitty_delete_layer(ctx: u64, image_id: u32, stats_out: *mut u32) -> i32
pub extern "C" fn vexart_kitty_set_transport(ctx: u64, mode: u32) -> i32
pub unsafe extern "C" fn vexart_kitty_shm_prepare(name_ptr: *const u8, name_len: u32, data_ptr: *const u8, data_len: u32, mode: u32, out_handle: *mut u64) -> i32
pub extern "C" fn vexart_kitty_shm_release(handle: u64, unlink_flag: u32) -> i32
pub unsafe extern "C" fn vexart_kitty_emit_placeholder_shm_frame(ctx: u64, target: u64, params_ptr: *const u8, params_len: u32, out_handle: *mut u64, stats_out: *mut u32) -> i32
pub extern "C" fn vexart_kitty_shm_is_consumed(handle: u64) -> i32
pub extern "C" fn vexart_kitty_shm_cleanup_all() -> i32
pub unsafe extern "C" fn vexart_kitty_emit_placeholder_frame(ctx: u64, target: u64, image_id: u32, cols: u32, rows: u32, stats_out: *mut u32) -> i32
pub extern "C" fn vexart_kitty_delete_placeholder(ctx: u64, image_id: u32) -> i32
```

### 5.7 Native Retained Layer Registry (5 Functions)
```rust
pub unsafe extern "C" fn vexart_layer_upsert(ctx: u64, key_ptr: *const u8, key_len: u32, desc_ptr: *const u8, desc_len: u32, out_ptr: *mut u8) -> i32
pub unsafe extern "C" fn vexart_layer_reuse(ctx: u64, layer_handle: u64, frame: u64, out_image_id: *mut u32) -> i32
pub unsafe extern "C" fn vexart_layer_remove(ctx: u64, layer_handle: u64, out_image_id: *mut u32) -> i32
pub extern "C" fn vexart_layer_clear(ctx: u64) -> i32
pub unsafe extern "C" fn vexart_layer_present_dirty(ctx: u64, layer_handle: u64, frame: u64, out_image_id: *mut u32) -> i32
```

### 5.8 GPU Resource Manager & Image Assets (5 Functions)
```rust
pub unsafe extern "C" fn vexart_resource_get_stats(ctx: u64, buf_ptr: *mut u8, buf_len: u32, stats_out: *mut u32) -> i32
pub extern "C" fn vexart_resource_set_budget(ctx: u64, budget_mb: u32) -> i32
pub unsafe extern "C" fn vexart_image_asset_register(current_frame: u64, key_ptr: *const u8, key_len: u32, rgba_ptr: *const u8, rgba_len: u32, meta_ptr: *const u8, out_handle: *mut u64) -> i32
pub extern "C" fn vexart_image_asset_touch(current_frame: u64, handle: u64) -> i32
pub extern "C" fn vexart_image_asset_release(handle: u64) -> i32
```

### 5.9 Error Diagnostics (2 Functions)
```rust
pub extern "C" fn vexart_get_last_error_length() -> u32
pub extern "C" fn vexart_copy_last_error(dst: *mut u8, cap: u32) -> u32
```

---

## 6. Kitty Protocol Transports

Vexart outputs graphics through four specialized transport channels:

### 6.1 Direct Base64 Transport (`t=d`)
- Readback pixels are compressed via `flate2` (zlib deflate).
- Transmitted as base64-encoded strings chunked into **4096-byte** payloads:
  - First chunk: `\x1b_Gf=32,s={w},v={h},m=1,a=T,o=z;{chunk}\x1b\\`
  - Subsequent chunks: `\x1b_Gm=1;{chunk}\x1b\\`
  - Final chunk: `\x1b_Gm=0;{chunk}\x1b\\`

### 6.2 Temporary File Transport (`t=f`)
Used on legacy terminals or local file workflows:
- Pixels are written to a temporary binary file in `/tmp/`.
- Path is base64-encoded and sent via Kitty control code `\x1b_Ga=T,f=32,s={w},v={h},t=f;{base64_path}\x1b\\`.
- **Graceful Degradation**: If file creation fails (disk full, permissions), the transport manager automatically degrades to direct base64 transport (`t=d`) without frame loss.

### 6.3 POSIX Shared Memory Transport (`t=s`)
Highest throughput transport on Linux/macOS:
- **Ring Buffer (`SHM_RING_SLOTS = 3`)**: Pre-allocates a fixed pool of 3 reusable POSIX SHM slots.
- **Naming Pattern**: Formats names as `/vx-{pid:x}-s{slot:x}-g{gen:x}` to stay well below the POSIX 31-character limit and guarantee monotonic generational isolation across frames.
- Control code: `\x1b_Ga=T,f=32,s={w},v={h},t=s;{base64_shm_name}\x1b\\`.
- The terminal reads pixels directly from RAM via kernel zero-copy.
- **Panic Cleanup**: Registers a global emergency unwinding hook that invokes `cleanup_all()` on the ring buffer to unlink all active shared memory segments upon unexpected crashes.

### 6.4 Tmux Unicode Placeholder Transport & Double-Buffering
Enables full-resolution graphics inside tmux 3.4+:
1. **DCS Passthrough**: Graphics control APCs are wrapped inside tmux device control strings: `\x1bPtmux;\x1b\x1b_G...;\x1b\x1b\\\x1b\\`.
2. **Double-Buffering (`a=f` / `a=a`)**: Frame image buffers are preloaded with `a=f` (frame upload) and committed synchronously via placement actions (`a=a`), eliminating display flicker during redraws.
3. **Placeholder Grid**: The visible viewport is emitted as a grid of Unicode private-use characters (`U+10EEEE`), each tagged with combining diacritics encoding image ID, cell row, and cell column.
4. **Retention**: Tmux natively stores and scrolls the Unicode text grid while the outer Kitty terminal overlays the GPU graphic at the exact placeholder coordinates.

---

## 7. Unified Resource Management & MSDF Atlas Engine

### 7.1 Unified `ResourceManager`
Native GPU assets are monitored under a global memory cap in `native/libvexart/src/resource/mod.rs`:
- **Default Budget**: **512 MB** (`DEFAULT_BUDGET_BYTES = 512 * 1024 * 1024`), configurable via `vexart_resource_set_budget` (enforced minimum: 32 MB).
- **Three Priority Tiers**:
  1. `Visible`: Touched in the active frame; strictly protected from eviction.
  2. `Recent`: Active within the last 5 seconds; candidate for eviction under heavy memory pressure.
  3. `Cold`: Unused for >5 seconds; prioritized for immediate LRU reclamation.
- **Tracked Asset Kinds**: `LayerTarget`, `TerminalImage`, `FontAtlas`, `GlyphAtlas`, `ImageSprite`, `TransformSprite`, `BackdropSprite`.

### 7.2 Native MSDF Vector Typography (`fdsm` + `ttf-parser`)
Vexart renders crisp, vector-quality typography at any scale using Multi-channel Signed Distance Fields (`native/libvexart/src/font/`):
- **Atlas Page Architecture**: Pre-allocates 1024×1024 RGBA8 texture pages (4 MB per page).
- **Glyph Cell Dimensions**: Generates glyphs at fixed 36×36 texel cell bounds using pure-Rust `fdsm` vector contour distance evaluation.
- **Page Capacity**: Fits ~900 glyphs per atlas page, delivering razor-sharp text rendering from 8px to 72px without runtime texture re-rasterization.
