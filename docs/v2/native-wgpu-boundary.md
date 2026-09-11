# Native WGPU Boundary & Transport Architecture

The native runtime lives in `native/libvexart` and compiles to a native C dynamic library (`libvexart.dylib`, `libvexart.so`, or `vexart.dll`). It interfaces with TypeScript through `bun:ffi`, providing GPU-accelerated rendering pipelines, texture compositing, font generation, and terminal transport.

---

## 1. FFI Boundary Function Reference (56 Functions)

All FFI exports use `#[no_mangle] pub extern "C"` or `#[no_mangle] pub unsafe extern "C"` and are wrapped with the `ffi_guard!` panic handler. Functions return `i32` status codes (`0` on success, negative on error).

### §1.1 Lifecycle & Context Management (4 Functions)
- `vexart_version() -> u32`: Returns current ABI bridge version (`0x00020B00`).
- `vexart_context_create(opts_ptr: *const u8, opts_len: u32, out_ctx: *mut u64) -> i32`: Creates or returns the shared GPU context handle.
- `vexart_context_destroy(ctx: u64) -> i32`: Destroys the context and releases resources.
- `vexart_context_resize(ctx: u64, width: u32, height: u32) -> i32`: Reallocates the default offscreen swapchain render target.

### §1.2 Paint & Command Dispatch (3 Functions)
- `vexart_paint_dispatch(ctx: u64, target: u64, buf_ptr: *const u8, buf_len: u32, stats_out: *mut u32) -> i32`: Executes the packed binary command buffer onto `target`.
- `vexart_paint_upload_image(ctx: u64, rgba_ptr: *const u8, rgba_len: u32, width: u32, height: u32, flags: u32, out_handle: *mut u64) -> i32`: Uploads host RGBA pixels to a GPU texture.
- `vexart_paint_remove_image(ctx: u64, image: u64) -> i32`: Frees a GPU texture image handle.

### §1.3 Composite & Render Targets (12 Functions)
- `vexart_composite_target_create(ctx: u64, width: u32, height: u32, out_target: *mut u64) -> i32`: Allocates a new offscreen render target texture.
- `vexart_composite_target_destroy(ctx: u64, target: u64) -> i32`: Deallocates an offscreen render target.
- `vexart_composite_target_begin_layer(ctx: u64, target: u64, clear_color: u32, flags: u32) -> i32`: Begins rendering passes on `target`.
- `vexart_composite_target_end_layer(ctx: u64, target: u64) -> i32`: Finalizes rendering passes on `target`.
- `vexart_composite_render_image_layer(ctx: u64, target: u64, image: u64, x: f32, y: f32, w: f32, h: f32, flags: u32, opacity_u32: u32) -> i32`: Blits an image layer onto `target`.
- `vexart_composite_render_image_transform_layer(ctx: u64, target: u64, image: u64, matrix_ptr: *const f32, flags: u32) -> i32`: Renders an image using a 3x3 projective matrix.
- `vexart_composite_update_uniform(ctx: u64, target: u64, uniform_id: u64, data_ptr: *const u8, data_len: u32) -> i32`: Updates uniform buffer data.
- `vexart_composite_copy_region_to_image(ctx: u64, target: u64, x: u32, y: u32, w: u32, h: u32, out_image: *mut u64) -> i32`: Copies a rectangular subregion of a target into a new image texture.
- `vexart_composite_image_filter_backdrop(ctx: u64, target: u64, params_ptr: *const u8, params_len: u32, stats_out: *mut u32) -> i32`: Applies separable Gaussian backdrop blur or color filters.
- `vexart_composite_image_mask_rounded_rect(ctx: u64, target: u64, rect_ptr: *const f32, radii_ptr: *const f32) -> i32`: Masks a render target with a rounded rectangle.
- `vexart_composite_readback_rgba(ctx: u64, target: u64, out_ptr: *mut u8, out_len: u32, stats_out: *mut u32) -> i32`: Synchronously reads back target RGBA pixels to host memory.
- `vexart_composite_readback_region_rgba(ctx: u64, target: u64, region_ptr: *const u32, out_ptr: *mut u8, out_len: u32, stats_out: *mut u32) -> i32`: Reads back a rectangular subregion to host memory.

### §1.4 Text & MSDF Font Pipeline (4 Functions)
- `vexart_font_init() -> i32`: Initializes dynamic system font discovery (`fontdb`), returning discovered font face count.
- `vexart_font_query(families_ptr: *const u8, families_len: u32, weight: u16, italic: u32, out_handle: *mut u64) -> i32`: Queries matching font face.
- `vexart_font_render_text(ctx: u64, target: u64, text_ptr: *const u8, text_len: u32, params_ptr: *const u8, params_len: u32, stats_out: *mut u32) -> i32`: Dynamically generates and renders MSDF text.
- `vexart_font_measure(text_ptr: *const u8, text_len: u32, families_ptr: *const u8, families_len: u32, font_size: f32, weight: u16, italic: u32, out_w: *mut f32, out_h: *mut f32) -> i32`: Dynamically measures text geometry.

### §1.5 Kitty Transport & Presentation (14 Functions)
- `vexart_kitty_emit_frame(ctx: u64, target: u64, image_id: u32) -> i32`: Emits a complete target as a Kitty graphics frame over stdout.
- `vexart_kitty_set_transport(ctx: u64, mode: u32) -> i32`: Sets active transport (`0 = Direct`, `1 = File`, `2 = POSIX SHM`).
- `vexart_kitty_shm_prepare(name_ptr: *const u8, name_len: u32, data_ptr: *const u8, data_len: u32, mode: u32, out_handle: *mut u64) -> i32`: Prepares POSIX shared memory buffer.
- `vexart_kitty_shm_release(handle: u64, unlink_flag: u32) -> i32`: Releases SHM handle and unlinks segment.
- `vexart_kitty_emit_frame_with_stats(ctx: u64, target: u64, image_id: u32, stats_out: *mut u32) -> i32`: Emits frame and writes presentation telemetry.
- `vexart_kitty_emit_layer(ctx: u64, image_id: u32, rgba_ptr: *const u8, rgba_len: u32, layer_ptr: *const u32, layer_len: u32, stats_out: *mut u32) -> i32`: Emits isolated Kitty layer from host RGBA.
- `vexart_kitty_emit_layer_target(ctx: u64, target: u64, image_id: u32, layer_ptr: *const u32, layer_len: u32, stats_out: *mut u32) -> i32`: Emits isolated Kitty layer directly from GPU target.
- `vexart_kitty_emit_region(ctx: u64, image_id: u32, rgba_ptr: *const u8, rgba_len: u32, region_ptr: *const u32, region_len: u32, stats_out: *mut u32) -> i32`: Emits rectangular dirty region.
- `vexart_kitty_emit_region_target(ctx: u64, target: u64, image_id: u32, region_ptr: *const u32, region_len: u32, stats_out: *mut u32) -> i32`: Emits dirty region directly from GPU target.
- `vexart_kitty_delete_layer(ctx: u64, image_id: u32, stats_out: *mut u32) -> i32`: Transmits Kitty graphics deletion escape sequence.
- `vexart_kitty_emit_placeholder_frame(ctx: u64, target: u64, image_id: u32, cols: u32, rows: u32, stats_out: *mut u32) -> i32`: Emits frame via tmux Unicode placeholder transport.
- `vexart_kitty_delete_placeholder(ctx: u64, image_id: u32) -> i32`: Deletes tmux placeholder image.
- `vexart_kitty_emit_placeholder_shm_frame(ctx: u64, target: u64, params_ptr: *const u8, params_len: u32, out_handle: *mut u64, stats_out: *mut u32) -> i32`: Transmits SHM placeholder frame inside tmux.
- `vexart_kitty_shm_is_consumed(handle: u64) -> i32`: Checks if terminal emulator unlinked SHM segment (`1 = yes`, `0 = no`).

### §1.6 Native Layer Registry (5 Functions)
- `vexart_layer_upsert(ctx: u64, key_ptr: *const u8, key_len: u32, desc_ptr: *const u8, desc_len: u32, out_ptr: *mut u64) -> i32`: Registers or updates retained GPU layer.
- `vexart_layer_reuse(ctx: u64, layer_handle: u64, frame: u64, out_image_id: *mut u32) -> i32`: Reuses clean retained GPU layer.
- `vexart_layer_remove(ctx: u64, layer_handle: u64, out_image_id: *mut u32) -> i32`: Destroys retained GPU layer.
- `vexart_layer_clear(ctx: u64) -> i32`: Clears all retained GPU layers.
- `vexart_layer_present_dirty(ctx: u64, layer_handle: u64, frame: u64, out_image_id: *mut u32) -> i32`: Re-presents updated layer.

### §1.7 Resource Manager & Assets (5 Functions)
- `vexart_resource_get_stats(ctx: u64, buf_ptr: *mut u8, buf_len: u32, stats_out: *mut u32) -> i32`: Serializes GPU memory usage statistics.
- `vexart_resource_set_budget(ctx: u64, budget_mb: u32) -> i32`: Adjusts GPU memory allocation cap.
- `vexart_image_asset_register(ctx: u64, scene: u64, handle: u64, key_ptr: *const u8, key_len: u32, bytes_ptr: *const u8, bytes_len: u32, out_w: *mut u32, out_h: *mut u32) -> i32`: Registers image asset.
- `vexart_image_asset_touch(frame: u64, handle: u64) -> i32`: Updates LRU priority for image asset.
- `vexart_image_asset_release(handle: u64) -> i32`: Releases image asset.

### §1.8 Error Retrieval (2 Functions)
- `vexart_get_last_error_length() -> u32`: Returns byte length of calling thread's last error message.
- `vexart_copy_last_error(dst: *mut u8, cap: u32) -> u32`: Copies last error string into destination buffer.

---

## 2. Panic Safety & Error Handling Architecture

### Panic Guard (`ffi_guard!`)
Rust panics unwinding across `extern "C"` boundaries trigger undefined behavior. Every FFI export body is enclosed by `ffi_guard!`:

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

### Poison-Resistant Mutex Recovery (`lock_or_recover`)
Shared static singletons (`SHARED_PAINT`, `SHARED_RESOURCE`, `SHARED_LAYER_REGISTRY`) use `lock_or_recover`:
```rust
fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
```
If a previous operation panicked while holding a lock, the mutex poison is cleared automatically so subsequent frames continue rendering rather than permanently crashing the process.

### Error Codes
- `OK` (`0`): Successful operation.
- `ERR_PANIC` (`-1`): Internal Rust panic trapped by `ffi_guard!`.
- `ERR_INVALID_HANDLE` (`-2`): Specified context, target, layer, or image handle does not exist.
- `ERR_OUT_OF_BUDGET` (`-3`): Allocation exceeds GPU memory budget.
- `ERR_GPU_DEVICE_LOST` (`-4`): WGPU device lost or unrecoverable backend crash.
- `ERR_LAYOUT_FAILED` (`-5`): Buffer layout or memory alignment validation error.
- `ERR_SHADER_COMPILE` (`-6`): WGSL shader compilation or pipeline initialization error.
- `ERR_KITTY_TRANSPORT` (`-7`): Failed writing Kitty graphics escape codes or SHM memory map.
- `ERR_INVALID_FONT` (`-8`): Invalid font data or glyph atlas generation failure.
- `ERR_INVALID_ARG` (`-9`): Null pointer, zero size, or out-of-bounds parameter.

### Thread-Local State
- `LAST_ERROR` (`thread_local! { RefCell<Option<Vec<u8>>> }`): Stores diagnostic error strings populated when errors or panics occur.
- `TRANSPORT_MODE` (`thread_local! { Cell<u32> }`): Stores active transport selection (`0 = direct`, `1 = POSIX SHM`).

---

## 3. Packed Binary Command Buffer

To minimize FFI serialization overhead, frame command graphs are encoded into a contiguous 64KB `ArrayBuffer` (`graphBuffer` in TypeScript) passed directly by pointer to `vexart_paint_dispatch`.

### 16-Byte Header Layout
```
Bytes 00..03: Magic         = 0x56584152 ("VXAR" in Little-Endian)
Bytes 04..07: Version       = 0x00020000 (Phase 2.0)
Bytes 08..11: Command Count = u32 LE
Bytes 12..15: Payload Bytes = u32 LE
```

### 8-Byte Command Prefix Layout
Every command record begins with an 8-byte prefix:
```
Bytes 00..01: cmd_kind      = u16 LE (0=Rect, 1=ShapeRect, 2=Corners, ..., 20=Shadow)
Bytes 02..03: flags         = u16 LE (bit 0: hasTransform, bit 1: hasScissor, bit 2: layerOverride)
Bytes 04..07: payload_bytes = u32 LE (Length of instance data following prefix)
```

### Instance Strides & Memory Layouts
All instances are packed into little-endian floats and u32 color channels:
- `ShapeRect` (**80 bytes**, 20 floats):
  `x, y, w, h, fill[4], stroke[4], radius, strokeWidth, hasFill, hasStroke, boxW, boxH, pad, pad`
- `ShapeRectCorners` (**96 bytes**, 24 floats):
  `x, y, w, h, fill[4], stroke[4], radii.tl, radii.tr, radii.br, radii.bl, strokeWidth, hasFill, hasStroke, boxW, boxH, pad, pad, pad`
- `Glow` (**48 bytes**, 12 floats):
  `x, y, w, h, color[4], intensity, pad, pad, pad`
- `LinearGradient` (**80 bytes**, 20 floats):
  `x, y, w, h, boxW, boxH, radius, pad, from[4], to[4], dirX, dirY, pad, pad`
- `RadialGradient` (**80 bytes**, 20 floats):
  `x, y, w, h, boxW, boxH, radius, pad, from[4], to[4], pad, pad, pad, pad`
- `Shadow` (**80 bytes**, 20 floats):
  `x, y, w, h, color[4], radii.tl, radii.tr, radii.br, radii.bl, boxW, boxH, offsetX, offsetY, blur, pad, pad, pad`
- `MsdfGlyph` (**64 bytes**, 16 floats):
  `pos[4], uv[4], color[4], atlasIndex, pxRange, pad, pad`

---

## 4. Headless WGPU Architecture

### Shared Context Singleton (`SHARED_PAINT`)
WGPU device initialization takes 200–300ms (adapter discovery, driver handshake, pipeline compilation). Re-creating it per frame would limit throughput to 3–5 FPS. The `SHARED_PAINT` singleton lazily initializes `PaintContext` once and reuses it for the lifetime of the process.

### Hardware Downlevel Limits
WGPU is initialized with `wgpu::Limits::downlevel_defaults()`, ensuring broad portability across Metal, Vulkan, DirectX 12, and software fallbacks (LLVMpipe).

### 22 Render Pipelines in `PipelineRegistry`
Pipelines are compiled from **21 `.wgsl` shader files** in `src/paint/shaders/` into 22 GPU pipelines in `PipelineRegistry`. The `image_transform` shader is compiled twice: once for standard straight-alpha projective blitting (`image_transform`) and once with premultiplied blend state (`image_transform_premultiplied`).

Pipelines are indexed by `cmd_kind`:
0. `rect`: Solid colored flat rectangles.
1. `shape_rect`: Rounded rectangles with uniform radius and borders.
2. `shape_rect_corners`: Rounded rectangles with per-corner radii ($r_{tl}, r_{tr}, r_{br}, r_{bl}$).
3. `circle`: Anti-aliased circles and ellipses.
4. `polygon`: Convex/concave 2D polygons.
5. `bezier`: Quadratic/cubic Bézier curve strokes.
6. `glow`: Radial glow halos with intensity decay.
7. `nebula`: Procedural multi-frequency nebula noise.
8. `starfield`: Procedural parallax starfield generator.
9. `image`: Hardware-accelerated textured quads.
10. `image_transform`: Projective perspective image blitting.
11. *(Reserved legacy glyph slot)*.
12. `gradient_linear`: Multi-stop linear color gradients.
13. `gradient_radial`: Multi-stop radial color gradients.
14. `gradient_conic`: Angular sweep conic gradients.
15. `backdrop_blur`: Separable two-pass Gaussian backdrop blur.
16. `backdrop_filter`: Color grading filters (brightness, contrast, saturate, invert).
17. `image_mask`: Alpha masking with rounded rectangular masks.
18. `glyph`: MSDF font rendering.
19. `self_filter`: Color transformations applied directly to render targets.
20. `shadow`: Analytic box shadow with Gaussian decay.
21. `image_transform_premultiplied`: Premultiplied texture blit helper (reusing `image_transform.wgsl`).
22. `image_unpremultiply`: Readback conversion helper.

### Persistent On-Disk Shader Cache
Pipeline compilation is cached on disk to achieve instantaneous warm-start times:
- Location: `~/.cache/vexart/pipeline.{platform}-{version}.bin` (no `pipelines/` subfolder)
- File Magic: `0x56585043` (`"VXPC"`)
- Invalidation: Automatically invalidated when platform architecture or crate version changes.
- Safety: Written atomically using temp file renaming. Corrupted caches are deleted and rebuilt automatically.

---

## 5. Visual Effects Shader Algorithms

### Per-Corner Radius SDF (`rect_corners.wgsl`)
Computes an analytic Signed Distance Field with quadrant-specific radius selection:
1. Translates UV coordinates relative to rectangle center.
2. Identifies quadrant:
   - Top-Left ($x < 0, y < 0$): uses $r_{tl}$
   - Top-Right ($x \ge 0, y < 0$): uses $r_{tr}$
   - Bottom-Right ($x \ge 0, y \ge 0$): uses $r_{br}$
   - Bottom-Left ($x < 0, y \ge 0$): uses $r_{bl}$
3. Calculates distance $d = \|\max(|p| - (size - r), 0)\| - r$.
4. Anti-aliases edge using `1.0 - smoothstep(-0.5, 0.5, d / fwidth(d))`.

### Analytic Box Shadow & Multi-Shadow (`shadow.wgsl`)
Computes box shadow attenuation analytically using the true SDF Gaussian decay formula from `shadow.wgsl`:
$$\sigma = \max(blur \cdot 0.5, 0.75)$$
$$dist = \max(sd\_round\_rect\_corners(p, size \cdot 0.5, radii), 0.0)$$
$$\alpha = \exp\left(-\frac{dist^2}{2\sigma^2}\right)$$
with early fragment discard when $\alpha \le 0.001$.
Supports multiple shadow definitions rendered in back-to-front order without allocating intermediate offscreen blur buffers.

### Two-Pass Separable Gaussian Backdrop Blur (`backdrop_blur.wgsl`)
1. **Downsample & Horizontal Pass**: Reads background texture, computes 1D horizontal Gaussian weights across kernel radius, and writes into intermediate render target.
2. **Vertical Pass & Accumulation**: Executes vertical 1D Gaussian blur, converting samples from straight alpha to premultiplied alpha.
3. **Alpha De-Fringing**: Prevents dark borders around transparent elements by normalizing color channels by accumulated alpha weights.

### Radial Glow Halo (`glow.wgsl`)
Evaluates radial decay from the center of the bounding box:
$$\alpha = \text{clamp}\left(1.0 - \frac{d}{radius}, 0.0, 1.0\right)^{decay} \cdot intensity$$

---

## 6. Text Rendering Pipeline

Vexart provides a dynamic system typography architecture based on runtime MSDF generation:

### Dynamic MSDF Font Engine (`src/font/`)
- **Font Discovery & Ingestion (`fontdb`)**: Scans operating system directories (`/System/Library/Fonts`, `/usr/share/fonts`, etc.) to build an in-memory database of TrueType/OpenType faces. Supports querying by family name, weight (`100`..`900`), and italic style via `vexart_font_query`.
- **Multi-Channel Signed Distance Field (MSDF) Generation (`fdsm` + `ttf-parser`)**:
  - Decomposes vector glyph contours into line segments and Bézier curves.
  - Edge Coloring: Segments are assigned Red, Green, or Blue colors based on corner angles.
  - Distance Calculation: Computes distance fields per channel and stores them into dynamic 1024×1024 RGBA atlas pages.
  - Disk Cache: Pre-generated glyph MSDFs are cached under `~/.cache/vexart/msdf/`.
- **Fragment Evaluation (`msdf_text.wgsl`)**:
  ```wgsl
  let sample = textureSample(atlas_texture, atlas_sampler, in.uv).rgb;
  let sd = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
  let screen_px_dist = screen_px_range * (sd - 0.5);
  let opacity = clamp(screen_px_dist + 0.5, 0.0, 1.0);
  ```
  Produces crisp, vector-grade text from 8pt to 120pt without rasterization artifacts or blurriness. Dispatched via `vexart_font_render_text` and measured via `vexart_font_measure`.

---

## 7. GPU Resource Management & Eviction

### Budget Allocation (`ResourceManager`)
- **Default Memory Cap**: **128MB** (`DEFAULT_BUDGET_BYTES`).
- **Minimum Memory Cap**: **32MB** (`MIN_BUDGET_BYTES`).

### Priority Tiers
Resources (render targets, image textures, font atlases, canvas display lists) are tagged with three priority tiers:
1. `Visible`: Referenced in the current frame graph (`last_used_frame == current_frame`). Immune from eviction.
2. `Recent`: Not referenced in current frame, but used within the last 5 seconds (`idle_seconds < SECONDS_BEFORE_COLD`). Transition from `Visible` to `Recent` occurs after 1 frame (`FRAMES_BEFORE_RECENT = 1`).
3. `Cold`: Idle for >5 seconds (`SECONDS_BEFORE_COLD = 5.0`). First candidates selected for eviction.

### LRU Eviction Loop
When an allocation causes total memory to exceed `budget_bytes`:
1. Scans `Cold` resources ordered by least-recently-used timestamp.
2. Evicts GPU textures until `current_usage <= budget_bytes` (100% of budget).
3. If still above budget after evicting all `Cold` resources, evicts `Recent` resources until `current_usage <= budget_bytes`. `Visible` resources are never evicted.

### Native Asset Registries
The native runtime maintains dedicated registries for retained assets:
- **`ImageAssetRegistry`**: Tracks host-uploaded RGBA image sprites. Maps string keys to numeric 64-bit handles, registers pixel memory under `ResourceKind::ImageSprite`, and tracks per-frame LRU touches (`touch(handle, frame)`).

---

## 8. Alpha Compositing Rules

- **GPU Render Targets**: Must strictly maintain **premultiplied alpha** ($[R\cdot A, G\cdot A, B\cdot A, A]$). Blend equations operate with `src_factor: One, dst_factor: OneMinusSrcAlpha`.
- **Image Assets**: Stored in host memory and uploaded as **straight alpha** ($[R, G, B, A]$).
- **Readback Unpremultiply**: When reading back GPU render targets to CPU memory (`vexart_composite_readback_rgba`), the `image_unpremultiply` pipeline converts pixels back to straight RGBA:
  $$R_{straight} = \frac{R_{premul}}{A}, \quad G_{straight} = \frac{G_{premul}}{A}, \quad B_{straight} = \frac{B_{premul}}{A}$$

---

## 9. Kitty Transport Protocols

Presentation to terminal emulators supports three distinct physical transports:

### 1. Direct Base64 Transport
Used for standard terminal emulators (Kitty, Ghostty, WezTerm) outside multiplexers:
- Encodes RGBA frames with zlib compression (`flate2`).
- Splits base64 stream into **4096-byte chunks**.
- Transmits chunks via Kitty APC escapes:
  `\x1b_Gf=32,s=width,v=height,m=1;chunk\x1b\` ... `\x1b_Gm=0;final_chunk\x1b\`

### 2. POSIX Shared Memory (SHM) Transport
Zero-copy high-performance transport for local terminals supporting Kitty SHM:
- Creates named shared memory segment (`/vexart-kitty-{pid}-{image_id}`, or `/vexart-kitty-r-{pid}-{image_id}` for partial region updates) via `shm_open()` and `mmap()`.
- Copies rendered frame directly into shared memory.
- Transmits lightweight metadata pointer (`\x1b_Gt=s,s=width,v=height;shm_name\x1b\`).
- Tracks segment consumption via `vexart_kitty_shm_is_consumed`.

### 3. tmux Unicode Placeholder Transport
Enables graphics rendering inside tmux without graphical corruption:
- Graphics commands are wrapped inside tmux DCS passthrough: `\x1bPtmux;\x1b<kitty-command>\x1b\\`.
- Visible cells are rendered using Unicode private use placeholder `U+10EEEE`.
- Row and column offsets are encoded using combining diacritics attached to the placeholder character:
  - Row / Column combining characters designate exact terminal cell coordinates.
  - tmux redraws the text grid normally, while the outer terminal emulator maps image textures over the placeholder cells.

### tmux Prerequisites & Operational Constraints
Running Vexart inside tmux is supported via the Unicode placeholder + local SHM transport route, subject to strict operational prerequisites (from `docs/tmux.md`):

- **Required `.tmux.conf` Directives**:
  Users must configure tmux to enable passthrough and fullcolor rendering:
  ```tmux
  set -g allow-passthrough all
  set -g default-terminal "tmux-256color"
  set -as terminal-features ",*:RGB"
  set -g mouse on
  set -s focus-events on
  set -s extended-keys on
  ```
  `allow-passthrough all` is required for Kitty graphics to cross the tmux server from hidden/active panes. `RGB` is required so truecolor image pixels are not quantized.
- **Minimum tmux Version**: Requires **tmux 3.4+** running within **Kitty or Ghostty** outer terminal emulators. Older tmux versions or unsupported outer terminals are rejected during startup capability probing.
- **SSH Rejection**: POSIX SHM transport strictly rejects sessions running over SSH (`SSH_CONNECTION`, `SSH_CLIENT`, or `SSH_TTY`). Because shared memory relies on local IPC address-space isolation between the host process and the outer terminal emulator, SHM cannot cross network boundaries.
- **Grid Limits**: Bounded to a maximum grid of **297 rows × 297 columns**. The Kitty diacritic combining character coordinate table supports cell indices up to 297; pane dimensions exceeding 297×297 cells are rejected rather than corrupted by coordinate wrapping.
- **Pane Queries**: Terminal pixel dimensions and cell sizes are queried dynamically via CSI `14t` (window pixel size) and CSI `16t` (cell pixel size) scoped to the **active pane**, not the outer terminal window. This guarantees correct aspect ratio, hit-testing, and layout across split panes.

### 4. Native Frame Strategy Planner (`frame.rs`)
Before transmitting pixels, the native frame coordinator analyzes frame geometry using `NativeFramePlanInput` (a packed 76-byte binary struct passed across FFI):
- **Metrics Evaluated**: `dirty_layer_count`, `dirty_pixel_area`, `total_pixel_area`, `overlap_pixel_area`, `overlap_ratio`, `full_repaint`, `has_subtree_transforms`, `has_active_interaction`, `transmission_mode`, `last_strategy`, `estimated_layered_bytes`, `estimated_final_bytes`.
- **Selected Strategies (`NativeFrameStrategy`)**:
  - `SkipPresent` (`0`): Scene is clean; terminal presentation is completely bypassed.
  - `LayeredDirty` (`1`): Emits only dirty retained layers as independent Kitty graphic objects.
  - `LayeredRegion` (`2`): Emits bounded rectangular subregions within individual layers to minimize I/O.
  - `FinalFrame` (`3`): Flattens composite layers into a single frame emission when overlap or repaint costs exceed layered transport thresholds.
