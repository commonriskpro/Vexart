// native/libvexart/src/lib.rs
// All 20 #[no_mangle] pub extern "C" FFI exports for libvexart.
// Every export wraps its body in ffi_guard! for panic safety.
// Per design §5, REQ-NB-003.

pub mod canvas_display_list;
pub mod composite;
pub mod ffi;
pub mod font;
pub mod frame;
pub mod image_asset;
pub mod kitty;
pub mod layer;
pub mod paint;
pub mod resource;
pub mod text;
pub mod types;

use std::sync::{LazyLock, Mutex, MutexGuard};

use ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, OK};
use types::FrameStats;

// LOCK ORDER (always acquire in this order to prevent deadlock):
// 1. SHARED_PAINT
// 2. SHARED_RESOURCE
// 3. SHARED_IMAGE_ASSETS / SHARED_CANVAS_DISPLAY_LISTS
// 4. SHARED_LAYER_REGISTRY

// ─── Single shared PaintContext (lazy-initialized, persisted across all FFI calls) ──
// One PaintContext owns: WgpuContext (Instance/Adapter/Device/Queue + 13 pipelines +
// image bind group layout) + image registry + render target. Initializing wgpu costs
// 200-300ms (adapter request, device, shader compilation, pipeline creation), so we
// MUST persist it across vexart_paint_dispatch / vexart_paint_upload_image /
// vexart_paint_remove_image calls. Recreating per call would cap render rate at 3-5 fps
// and would break image handles (cross-device texture references). Per design §17,
// post-Apply #2a architectural fix.
//
// NEXT_IMAGE_HANDLE is now in paint::NEXT_IMAGE_HANDLE for sharing with composite ops.

static SHARED_PAINT: LazyLock<Mutex<Option<paint::PaintContext>>> =
    LazyLock::new(|| Mutex::new(None));

fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        eprintln!("[vexart] recovering from poisoned mutex");
        poisoned.into_inner()
    })
}

fn get_or_init_paint() -> MutexGuard<'static, Option<paint::PaintContext>> {
    let mut guard = lock_or_recover(&SHARED_PAINT);
    if guard.is_none() {
        match paint::PaintContext::new() {
            Ok(pctx) => *guard = Some(pctx),
            Err(err) => {
                ffi::error::set_last_error(err);
            }
        }
    }
    guard
}

fn upload_image_record(
    pctx: &mut paint::PaintContext,
    handle: u64,
    rgba: &[u8],
    width: u32,
    height: u32,
) {
    let wgpu_ctx = &pctx.wgpu;
    let texture = wgpu_ctx.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vexart-image"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });

    wgpu_ctx.queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        rgba,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = wgpu_ctx.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("vexart-image-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Nearest,
        min_filter: wgpu::FilterMode::Nearest,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        ..Default::default()
    });
    let bind_group = wgpu_ctx
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-image-bind-group"),
            layout: &wgpu_ctx.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
    let _ = sampler;
    pctx.images.insert(
        handle,
        paint::ImageRecord {
            texture,
            view,
            bind_group,
        },
    );
}

// ─── Single shared ResourceManager (lazy-initialized, Phase 2b Slice 6) ──
// Global GPU memory budget manager. Initialized on first stats/budget call.
// Phase 2b: single-context model — one manager for all GPU assets.
// Phase 3: extract into per-context ResourceManager when multi-context lands.

static SHARED_RESOURCE: LazyLock<Mutex<resource::ResourceManager>> =
    LazyLock::new(|| Mutex::new(resource::ResourceManager::new()));

fn get_or_init_resource() -> &'static Mutex<resource::ResourceManager> {
    &SHARED_RESOURCE
}

static SHARED_IMAGE_ASSETS: LazyLock<Mutex<image_asset::ImageAssetRegistry>> =
    LazyLock::new(|| Mutex::new(image_asset::ImageAssetRegistry::new()));

fn get_or_init_image_assets() -> &'static Mutex<image_asset::ImageAssetRegistry> {
    &SHARED_IMAGE_ASSETS
}

static SHARED_CANVAS_DISPLAY_LISTS: LazyLock<
    Mutex<canvas_display_list::CanvasDisplayListRegistry>,
> = LazyLock::new(|| Mutex::new(canvas_display_list::CanvasDisplayListRegistry::new()));

fn get_or_init_canvas_display_lists(
) -> &'static Mutex<canvas_display_list::CanvasDisplayListRegistry> {
    &SHARED_CANVAS_DISPLAY_LISTS
}

// ─── Font system + MSDF atlas (Phase 2b — DEC-008) ─────────────────────────
// FontSystem discovers system fonts on init. MsdfAtlasManager generates MSDF
// glyphs on demand. Both are lazy-initialized on first vexart_font_* call.

static SHARED_FONT_SYSTEM: LazyLock<Mutex<font::system::FontSystem>> =
    LazyLock::new(|| Mutex::new(font::system::FontSystem::new()));

static SHARED_MSDF_ATLAS: LazyLock<Mutex<font::msdf_atlas::MsdfAtlasManager>> =
    LazyLock::new(|| Mutex::new(font::msdf_atlas::MsdfAtlasManager::new()));

// ─── Single shared LayerRegistry (Phase 2c native layer ownership) ──────────

static SHARED_LAYER_REGISTRY: LazyLock<Mutex<layer::LayerRegistry>> =
    LazyLock::new(|| Mutex::new(layer::LayerRegistry::new()));

fn get_or_init_layer_registry() -> &'static Mutex<layer::LayerRegistry> {
    &SHARED_LAYER_REGISTRY
}

fn validate_kitty_image_id(image_id: u32) -> i32 {
    if image_id != 0 {
        return OK;
    }
    ffi::error::set_last_error("image_id 0 is invalid (reserved by Kitty protocol)");
    ERR_INVALID_ARG
}

// ─── §5.1 Version & lifecycle ─────────────────────────────────────────────

/// Returns the Phase 2b version constant (0x00020B00).
/// TS mount path checks this against EXPECTED_BRIDGE_VERSION. Per design §12 rule 2.
/// Phase 2b Slice 1: target registry + compositing + real readback.
#[no_mangle]
pub extern "C" fn vexart_version() -> u32 {
    0x00020B00
}

/// Creates a Vexart rendering context.
///
/// The context handle is an opaque identifier for API symmetry. Actual GPU
/// state is managed internally via a lazy-initialized singleton (`SHARED_PAINT`)
/// because the WGPU device must persist across all paint/composite/text calls.
/// The handle exists so the API can evolve toward per-context isolation in the
/// future without breaking the FFI contract.
///
/// # Safety
/// `out_ctx` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_context_create(
    opts_ptr: *const u8,
    opts_len: u32,
    out_ctx: *mut u64,
) -> i32 {
    ffi_guard!({
        let _ = (opts_ptr, opts_len);
        if out_ctx.is_null() {
            return ERR_INVALID_ARG;
        }
        // Ensure the GPU singleton is initialized eagerly (fail fast on GPU errors).
        let _guard = get_or_init_paint();
        if _guard.is_none() {
            return ERR_GPU_DEVICE_LOST;
        }
        *out_ctx = 1;
        OK
    })
}

/// Releases a Vexart rendering context.
///
/// Currently a no-op because GPU state is singleton-managed. The context handle
/// exists for forward-compatibility with per-context isolation.
#[no_mangle]
pub extern "C" fn vexart_context_destroy(ctx: u64) -> i32 {
    ffi_guard!({
        let _ = ctx;
        OK
    })
}

/// Notifies the context of a terminal resize.
///
/// Currently a no-op because composite targets are created per-size and the
/// GPU device handles any resolution. The engine's TS layer manages target
/// lifecycle via `vexart_composite_target_create` / `_destroy`.
#[no_mangle]
pub extern "C" fn vexart_context_resize(ctx: u64, width: u32, height: u32) -> i32 {
    ffi_guard!({
        let _ = (ctx, width, height);
        OK
    })
}

// ─── §5.3 Paint ──────────────────────────────────────────────────────────

/// Execute paint graph from packed buffer. Phase 2 stub.
///
/// # Safety
/// `graph_ptr` must be valid for `graph_len` bytes; `stats_out` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_paint_dispatch(
    _ctx: u64,
    target: u64,
    graph_ptr: *const u8,
    graph_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let graph = if graph_ptr.is_null() || graph_len == 0 {
            &[][..]
        } else {
            std::slice::from_raw_parts(graph_ptr, graph_len as usize)
        };
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        pctx.dispatch(target, graph, stats_out)
    })
}

/// RGBA/BGRA → GPU texture; returns handle in `out_image`.
/// Per design §5.3, task 5a.17.
///
/// # Safety
/// `image_ptr` must be valid for `image_len` bytes; `out_image` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_paint_upload_image(
    _ctx: u64,
    image_ptr: *const u8,
    image_len: u32,
    width: u32,
    height: u32,
    _format: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        if image_ptr.is_null() || image_len == 0 || width == 0 || height == 0 {
            return ERR_INVALID_ARG;
        }
        let rgba = std::slice::from_raw_parts(image_ptr, image_len as usize);

        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let handle = paint::alloc_image_handle();
        upload_image_record(pctx, handle, rgba, width, height);

        *out_image = handle;
        OK
    })
}

/// Free GPU texture. Per design §5.3, task 5a.17.
#[no_mangle]
pub extern "C" fn vexart_paint_remove_image(_ctx: u64, image: u64) -> i32 {
    ffi_guard!({
        if image == 0 {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        if let Some(pctx) = guard.as_mut() {
            pctx.images.remove(&image);
        }
        OK
    })
}

// ─── §5.4 Composite ──────────────────────────────────────────────────────

// ── Target lifecycle (Phase 2b Slice 1) ──────────────────────────────────

/// Create an offscreen RGBA8 render target. Returns handle in `*out_target`.
/// (REQ-2B-001)
///
/// # Safety
/// `out_target` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_target_create(
    _ctx: u64,
    width: u32,
    height: u32,
    out_target: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_target.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_create(pctx, width, height, out_target)
    })
}

/// Destroy an offscreen render target and release GPU memory.
/// (REQ-2B-001)
#[no_mangle]
pub extern "C" fn vexart_composite_target_destroy(_ctx: u64, target: u64) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_destroy(pctx, target)
    })
}

/// Begin a render layer on the target. `load_mode=0` clears to `clear_rgba`.
/// (REQ-2B-002)
#[no_mangle]
pub extern "C" fn vexart_composite_target_begin_layer(
    _ctx: u64,
    target: u64,
    load_mode: u32,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_begin_layer(pctx, target, load_mode, clear_rgba)
    })
}

/// End the active render layer and submit GPU work.
/// (REQ-2B-002)
#[no_mangle]
pub extern "C" fn vexart_composite_target_end_layer(_ctx: u64, target: u64) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_end_layer(pctx, target)
    })
}

// ── Compositing (Phase 2b Slice 1) ────────────────────────────────────────

/// Composite an image onto a target at (x,y,w,h) with the given z-order.
/// (REQ-2B-003)
#[no_mangle]
pub extern "C" fn vexart_composite_render_image_layer(
    _ctx: u64,
    target: u64,
    image: u64,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    z: u32,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::composite_render_image_layer(pctx, target, image, x, y, w, h, z, clear_rgba)
    })
}

/// Composite an image onto a target using an explicit transformed quad + opacity.
///
/// # Safety
/// `params_ptr` must point to a packed `BridgeImageTransformInstance` buffer (48 bytes).
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_render_image_transform_layer(
    _ctx: u64,
    target: u64,
    image: u64,
    params_ptr: *const u8,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        if params_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let params = std::slice::from_raw_parts(
            params_ptr,
            std::mem::size_of::<paint::instances::BridgeImageTransformInstance>(),
        );
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::composite_render_image_transform_layer(pctx, target, image, params, clear_rgba)
    })
}

/// Composite one retained source target onto another using only transform/opacity params.
///
/// # Safety
/// `params_ptr` must point to a packed `BridgeImageTransformInstance` buffer (48 bytes).
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_update_uniform(
    _ctx: u64,
    target: u64,
    source_target: u64,
    params_ptr: *const u8,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        if params_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let params = std::slice::from_raw_parts(
            params_ptr,
            std::mem::size_of::<paint::instances::BridgeImageTransformInstance>(),
        );
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::composite_update_uniform(pctx, target, source_target, params, clear_rgba)
    })
}

/// Extract a rectangular region from a target into a new image handle.
/// (REQ-2B-004)
///
/// # Safety
/// `out_image` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_copy_region_to_image(
    _ctx: u64,
    target: u64,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::copy_region_to_image(pctx, target, x, y, w, h, out_image)
    })
}

/// Apply backdrop blur + 7-op color filter chain to an image, returning new image handle.
/// `params_ptr` = 8 × f32: blur, brightness, contrast, saturate, grayscale, invert, sepia, hue_rotate_deg.
/// (REQ-2B-006)
///
/// # Safety
/// `params_ptr` must be valid for `params_len` bytes; `out_image` must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_image_filter_backdrop(
    _ctx: u64,
    image: u64,
    params_ptr: *const u8,
    params_len: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::image_filter_backdrop(pctx, image, params_ptr, params_len, out_image)
    })
}

/// Apply rounded-rect SDF mask to an image, returning new image handle.
/// `rect_ptr` = 6 × f32: radius_uniform, tl, tr, br, bl, mode.
/// (REQ-2B-006)
///
/// # Safety
/// `rect_ptr` must be valid for 24 bytes; `out_image` must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_image_mask_rounded_rect(
    _ctx: u64,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::image_mask_rounded_rect(pctx, image, rect_ptr, out_image)
    })
}

// ── Legacy composite stub ─────────────────────────────────────────────────

/// Z-order layer merge to final target. Phase 2 stub.
///
/// # Safety
/// `composite_ptr` must be valid for `composite_len` bytes.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_merge(
    ctx: u64,
    composite_ptr: *const u8,
    composite_len: u32,
    out_target: *mut u64,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let composite = if composite_ptr.is_null() || composite_len == 0 {
            &[][..]
        } else {
            std::slice::from_raw_parts(composite_ptr, composite_len as usize)
        };
        composite::composite_merge(ctx, composite, out_target, stats_out)
    })
}

/// Blocking GPU→CPU readback of full target.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_readback_rgba(
    _ctx: u64,
    target: u64,
    dst: *mut u8,
    dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::readback_rgba(pctx, target, dst, dst_cap, stats_out)
    })
}

/// Region readback; `rect_ptr` = 4×u32 (x,y,w,h).
///
/// # Safety
/// `rect_ptr` must be valid for 16 bytes; `dst` must be valid for `dst_cap` bytes.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_readback_region_rgba(
    _ctx: u64,
    target: u64,
    rect_ptr: *const u8,
    dst: *mut u8,
    dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let rect = if rect_ptr.is_null() {
            &[][..]
        } else {
            std::slice::from_raw_parts(rect_ptr, 16)
        };
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::readback_region_rgba(pctx, target, rect, dst, dst_cap, stats_out)
    })
}

// ─── §5.5 Text — MSDF pipeline (Phase 2b, REQ-2B-202/204) ───────────────

/// Load a pre-generated MSDF atlas PNG + metrics JSON into GPU memory.
///
/// `font_id`: 1-15 (0 and >15 return ERR_INVALID_FONT).
/// Returns ERR_INVALID_FONT (-8) if font_id is already loaded, PNG is invalid,
/// or metrics JSON is malformed (REQ-2B-202).
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_text_load_atlas(
    _ctx: u64,
    font_id: u32,
    png_ptr: *const u8,
    png_len: u32,
    metrics_ptr: *const u8,
    metrics_len: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let code = text::load_atlas(pctx, font_id, png_ptr, png_len, metrics_ptr, metrics_len);
        if code == OK {
            let resources = get_or_init_resource();
            let mut resources_guard = lock_or_recover(resources);
            resources_guard.register(
                font_id as u64,
                resource::ResourceKind::FontAtlas,
                png_len as u64 + metrics_len as u64,
                0,
                resource::WgpuHandle::Id(font_id as u64),
            );
        }
        code
    })
}

/// Dispatch MSDF glyph rendering from a packed MsdfGlyphInstance buffer (cmd_kind=18).
///
/// # Safety
/// `glyphs_ptr` must be valid for `glyphs_len` bytes if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_text_dispatch(
    _ctx: u64,
    target: u64,
    glyphs_ptr: *const u8,
    glyphs_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        text::dispatch(pctx, target, glyphs_ptr, glyphs_len, stats_out)
    })
}

/// Measure a UTF-8 text string using loaded atlas metrics.
/// Returns (0.0, 0.0) if atlas for font_id is not yet loaded (graceful degradation).
///
/// # Safety
/// `out_w` and `out_h` must be valid mutable f32 pointers.
#[no_mangle]
pub unsafe extern "C" fn vexart_text_measure(
    _ctx: u64,
    text_ptr: *const u8,
    text_len: u32,
    font_id: u32,
    font_size: f32,
    out_w: *mut f32,
    out_h: *mut f32,
) -> i32 {
    ffi_guard!({
        if out_w.is_null() || out_h.is_null() {
            return ERR_INVALID_ARG;
        }
        let guard = get_or_init_paint();
        let pctx = match guard.as_ref() {
            Some(c) => c,
            None => {
                *out_w = 0.0;
                *out_h = 0.0;
                return OK;
            }
        };
        text::measure(pctx, text_ptr, text_len, font_id, font_size, out_w, out_h)
    })
}

// ─── §5.6 Kitty transport ────────────────────────────────────────────────

/// Emit a complete frame to the terminal via the Kitty graphics protocol.
///
/// Performs: GPU readback → zlib compress → base64 encode → Kitty escape sequences → stdout.
/// Transport mode is selected via `vexart_kitty_set_transport` (default: direct/base64).
///
/// Returns OK (0) on success, ERR_KITTY_TRANSPORT (-7) on failure.
/// (REQ-2B-101)
#[no_mangle]
pub extern "C" fn vexart_kitty_emit_frame(_ctx: u64, target: u64, image_id: u32) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        kitty::transport::emit_frame(pctx, target, image_id)
    })
}

/// Emit a complete frame with native presentation stats.
///
/// Like `vexart_kitty_emit_frame` but writes timing and byte-count stats to `*stats_out`.
/// Pass null for `stats_out` if stats are not needed (equivalent to the base version).
///
/// # Safety
/// `stats_out` must be a valid mutable pointer to `NativePresentationStats` or null.
/// Phase 2b — native presentation path.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_frame_with_stats(
    _ctx: u64,
    target: u64,
    image_id: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        kitty::transport::emit_frame_with_stats(pctx, target, image_id, stats_out)
    })
}

/// Emit a pre-encoded RGBA layer natively (dirty-layer presentation path).
///
/// `rgba_ptr`/`rgba_len` — raw RGBA pixel data (width × height × 4 bytes).
/// `layer_ptr` — width, height as u32 LE followed by col, row, z as i32 LE.
/// Transport mode is selected via `vexart_kitty_set_transport`.
///
/// # Safety
/// `rgba_ptr` must be valid for `rgba_len` bytes; `stats_out` valid if non-null.
/// Phase 2b — native layer presentation.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_layer(
    _ctx: u64,
    image_id: u32,
    rgba_ptr: *const u8,
    rgba_len: u32,
    layer_ptr: *const u8,
    layer_len: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        if layer_ptr.is_null() || layer_len < 20 {
            return ffi::panic::ERR_INVALID_ARG;
        }
        let bytes = std::slice::from_raw_parts(layer_ptr, 20);
        let width = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let height = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        let col = i32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        let row = i32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]);
        let z = i32::from_le_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        kitty::transport::emit_layer_native(
            image_id, rgba_ptr, rgba_len, width, height, col, row, z, stats_out,
        )
    })
}

/// Emit a painted GPU target as a positioned Kitty layer without returning RGBA to JS.
///
/// `layer_ptr` — col, row, z as i32 LE.
///
/// # Safety
/// `layer_ptr` must be valid for 12 bytes.
/// `stats_out` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_layer_target(
    _ctx: u64,
    target: u64,
    image_id: u32,
    layer_ptr: *const u8,
    layer_len: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        if layer_ptr.is_null() || layer_len < 12 {
            return ffi::panic::ERR_INVALID_ARG;
        }
        let bytes = std::slice::from_raw_parts(layer_ptr, 12);
        let col = i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let row = i32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        let z = i32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        kitty::transport::emit_layer_target_with_stats(
            pctx, target, image_id, col, row, z, stats_out,
        )
    })
}

/// Emit a region patch natively (dirty-region presentation path).
///
/// `rgba_ptr`/`rgba_len` — raw RGBA pixel data for the dirty region (rw × rh × 4 bytes).
/// `region_ptr` — 4 × u32 packed: [rx, ry, rw, rh] (16 bytes).
/// `stats_out` — pointer to `NativePresentationStats` or null.
///
/// Uses a packed params approach to stay within the ≤8 parameter ARM64 FFI limit.
///
/// # Safety
/// `rgba_ptr` must be valid for `rgba_len` bytes.
/// `region_ptr` must be valid for 16 bytes.
/// `stats_out` must be valid if non-null.
/// Phase 2b — native region presentation.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_region(
    _ctx: u64,
    image_id: u32,
    rgba_ptr: *const u8,
    rgba_len: u32,
    region_ptr: *const u8,
    region_len: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        if region_ptr.is_null() || region_len < 16 {
            return ffi::panic::ERR_INVALID_ARG;
        }
        // Read 4 × u32 LE from potentially unaligned byte pointer.
        let bytes = std::slice::from_raw_parts(region_ptr, 16);
        let rx = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let ry = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        let rw = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        let rh = u32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]);
        kitty::transport::emit_region_native(
            image_id, rgba_ptr, rgba_len, rx, ry, rw, rh, stats_out,
        )
    })
}

/// Emit a region patch from a painted GPU target without returning RGBA to JS.
///
/// `region_ptr` — 4 × u32 packed: [rx, ry, rw, rh] (16 bytes), relative to target.
///
/// # Safety
/// `region_ptr` must be valid for 16 bytes.
/// `stats_out` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_region_target(
    _ctx: u64,
    target: u64,
    image_id: u32,
    region_ptr: *const u8,
    region_len: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        if region_ptr.is_null() || region_len < 16 {
            return ffi::panic::ERR_INVALID_ARG;
        }
        let bytes = std::slice::from_raw_parts(region_ptr, 16);
        let rx = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let ry = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        let rw = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        let rh = u32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]);
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        kitty::transport::emit_region_target_with_stats(
            pctx, target, image_id, rx, ry, rw, rh, stats_out,
        )
    })
}

/// Delete a Kitty image by ID natively.
///
/// # Safety
/// `stats_out` must be valid if non-null.
/// Phase 2b — native layer deletion.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_delete_layer(
    _ctx: u64,
    image_id: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if validate_kitty_image_id(image_id) != OK {
            return ERR_INVALID_ARG;
        }
        kitty::transport::delete_layer_native(image_id, stats_out)
    })
}

// ─── Phase 2c Native Layer Registry ───────────────────────────────────────

/// Upsert a native layer record by stable key and descriptor.
///
/// `key_ptr/key_len`: UTF-8 stable layer key.
/// `desc_ptr`: 40-byte packed LayerDescriptor:
///   target:u64, x:f32, y:f32, width:u32, height:u32, z:i32, flags:u32, frame:u64.
/// `out_ptr`: 24-byte LayerUpsertResult:
///   handle:u64, terminal_image_id:u32, flags:u32, bytes:u64.
///
/// # Safety
/// All pointers must be valid for their documented lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_layer_upsert(
    _ctx: u64,
    key_ptr: *const u8,
    key_len: u32,
    desc_ptr: *const u8,
    desc_len: u32,
    out_ptr: *mut u8,
) -> i32 {
    ffi_guard!({
        if key_ptr.is_null()
            || key_len == 0
            || desc_ptr.is_null()
            || desc_len < layer::LayerDescriptor::BYTE_LEN as u32
            || out_ptr.is_null()
        {
            return ERR_INVALID_ARG;
        }
        let key_bytes = std::slice::from_raw_parts(key_ptr, key_len as usize);
        let desc_bytes = std::slice::from_raw_parts(desc_ptr, layer::LayerDescriptor::BYTE_LEN);
        let Some(desc) = layer::LayerDescriptor::from_bytes(desc_bytes) else {
            return ERR_INVALID_ARG;
        };
        let key = layer::LayerKey::from_bytes(key_bytes);
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_layer_registry();
        let mut registry_guard = lock_or_recover(registry);
        let result = registry_guard.upsert(key, desc, &mut resources_guard);
        let out = std::slice::from_raw_parts_mut(out_ptr, layer::LayerUpsertResult::BYTE_LEN);
        if !result.write_to(out) {
            return ERR_INVALID_ARG;
        }
        OK
    })
}

/// Mark a native layer dirty.
#[no_mangle]
pub extern "C" fn vexart_layer_mark_dirty(_ctx: u64, layer_handle: u64) -> i32 {
    ffi_guard!({
        let registry = get_or_init_layer_registry();
        let mut registry_guard = lock_or_recover(registry);
        if registry_guard.mark_dirty(layer_handle) {
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

/// Mark a native layer as reused in `frame` and write its terminal image ID to `out_image_id`.
///
/// # Safety
/// `out_image_id` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_layer_reuse(
    _ctx: u64,
    layer_handle: u64,
    frame: u64,
    out_image_id: *mut u32,
) -> i32 {
    ffi_guard!({
        if out_image_id.is_null() {
            return ERR_INVALID_ARG;
        }
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_layer_registry();
        let mut registry_guard = lock_or_recover(registry);
        let Some(image_id) = registry_guard.reuse(layer_handle, frame, &mut resources_guard) else {
            return ERR_INVALID_ARG;
        };
        *out_image_id = image_id;
        OK
    })
}

/// Remove a native layer and write the terminal image ID that should be deleted.
///
/// # Safety
/// `out_image_id` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_layer_remove(
    _ctx: u64,
    layer_handle: u64,
    out_image_id: *mut u32,
) -> i32 {
    ffi_guard!({
        if out_image_id.is_null() {
            return ERR_INVALID_ARG;
        }
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_layer_registry();
        let mut registry_guard = lock_or_recover(registry);
        let Some(image_id) = registry_guard.remove(layer_handle, &mut resources_guard) else {
            return ERR_INVALID_ARG;
        };
        *out_image_id = image_id;
        OK
    })
}

/// Clear all native layer records and resource accounting.
#[no_mangle]
pub extern "C" fn vexart_layer_clear(_ctx: u64) -> i32 {
    ffi_guard!({
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_layer_registry();
        let mut registry_guard = lock_or_recover(registry);
        registry_guard.clear(&mut resources_guard);
        OK
    })
}

/// Mark a dirty layer as presented and write its terminal image ID.
///
/// # Safety
/// `out_image_id` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_layer_present_dirty(
    _ctx: u64,
    layer_handle: u64,
    frame: u64,
    out_image_id: *mut u32,
) -> i32 {
    ffi_guard!({
        if out_image_id.is_null() {
            return ERR_INVALID_ARG;
        }
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_layer_registry();
        let mut registry_guard = lock_or_recover(registry);
        let Some(image_id) =
            registry_guard.mark_presented(layer_handle, frame, &mut resources_guard)
        else {
            return ERR_INVALID_ARG;
        };
        *out_image_id = image_id;
        OK
    })
}

/// Select the Kitty transport mode for this context.
///
/// `mode`: 0=direct (base64 inline), 1=file (temp file), 2=shm (POSIX shared memory).
/// Default is direct (0). Mode is stored per-thread.
/// (REQ-2B-102)
#[no_mangle]
pub extern "C" fn vexart_kitty_set_transport(_ctx: u64, mode: u32) -> i32 {
    ffi_guard!({ kitty::transport::set_transport_mode(mode) })
}

/// POSIX SHM prepare (shm_open + ftruncate + mmap + memcpy + munmap). Phase 2 Slice 2.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_shm_prepare(
    name_ptr: *const u8,
    name_len: u32,
    data_ptr: *const u8,
    data_len: u32,
    mode: u32,
    out_handle: *mut u64,
) -> i32 {
    ffi_guard!({
        kitty::shm::shm_prepare(name_ptr, name_len, data_ptr, data_len, mode, out_handle)
    })
}

/// POSIX SHM release (close + optional shm_unlink). Phase 2 Slice 2.
#[no_mangle]
pub extern "C" fn vexart_kitty_shm_release(handle: u64, unlink_flag: u32) -> i32 {
    ffi_guard!({ kitty::shm::shm_release(handle, unlink_flag) })
}

// ─── §5.8 Resource manager (Phase 2b Slice 6) ────────────────────────────

/// Retrieve current ResourceManager statistics as a JSON-encoded UTF-8 buffer.
///
/// The buffer is written to `out_ptr` (up to `out_cap` bytes).
/// `out_used` receives the number of bytes written (excluding NUL).
///
/// Returns:
///   OK (0)              — stats written successfully
///   ERR_INVALID_ARG (-9) — out_ptr is null or out_cap is 0
///
/// # Safety
/// `out_ptr` must be valid for `out_cap` bytes; `out_used` must be a valid mutable pointer.
///
/// (REQ-2B-704)
#[no_mangle]
pub unsafe extern "C" fn vexart_resource_get_stats(
    _ctx: u64,
    out_ptr: *mut u8,
    out_cap: u32,
    out_used: *mut u32,
) -> i32 {
    ffi_guard!({
        if out_ptr.is_null() || out_cap == 0 || out_used.is_null() {
            return ERR_INVALID_ARG;
        }

        // Phase 2b: ResourceManager is a static singleton (lazy-initialized).
        // Statistics are collected from the global manager on every call.
        let guard = get_or_init_resource();
        let mgr = lock_or_recover(guard);
        let stats = resource::stats::collect_stats(&mgr);
        let json = stats.to_json();
        let bytes = json.as_bytes();

        let write_len = bytes.len().min(out_cap as usize);
        let out_slice = std::slice::from_raw_parts_mut(out_ptr, write_len);
        out_slice.copy_from_slice(&bytes[..write_len]);
        *out_used = write_len as u32;
        OK
    })
}

/// Set the ResourceManager memory budget.
///
/// `budget_mb`: budget in megabytes (minimum 32MB enforced by ResourceManager).
/// (REQ-2B-703)
#[no_mangle]
pub extern "C" fn vexart_resource_set_budget(_ctx: u64, budget_mb: u32) -> i32 {
    ffi_guard!({
        let budget_bytes = (budget_mb as u64) * 1024 * 1024;
        let guard = get_or_init_resource();
        let mut mgr = lock_or_recover(guard);
        mgr.set_budget(budget_bytes);
        OK
    })
}

/// Register or update a native image asset from decoded RGBA bytes.
///
/// `meta_ptr` is 8 bytes: width:u32, height:u32.
/// `out_handle` receives the stable native image handle.
///
/// # Safety
/// All pointers must be valid for their documented lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_image_asset_register(
    _ctx: u64,
    _scene: u64,
    current_frame: u64,
    key_ptr: *const u8,
    key_len: u32,
    rgba_ptr: *const u8,
    rgba_len: u32,
    meta_ptr: *const u8,
    out_handle: *mut u64,
) -> i32 {
    ffi_guard!({
        if key_ptr.is_null()
            || key_len == 0
            || rgba_ptr.is_null()
            || rgba_len == 0
            || meta_ptr.is_null()
            || out_handle.is_null()
        {
            return ERR_INVALID_ARG;
        }
        let key_bytes = std::slice::from_raw_parts(key_ptr, key_len as usize);
        let key = String::from_utf8_lossy(key_bytes).to_string();
        let rgba = std::slice::from_raw_parts(rgba_ptr, rgba_len as usize);
        let meta = std::slice::from_raw_parts(meta_ptr, 8);
        let width = u32::from_le_bytes(meta[0..4].try_into().unwrap_or([0; 4]));
        let height = u32::from_le_bytes(meta[4..8].try_into().unwrap_or([0; 4]));

        let mut paint_guard = get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_image_assets();
        let mut registry_guard = lock_or_recover(registry);
        let Some(handle) = registry_guard.register(
            key,
            rgba,
            width,
            height,
            current_frame,
            &mut resources_guard,
        ) else {
            return ERR_INVALID_ARG;
        };
        upload_image_record(pctx, handle, rgba, width, height);
        *out_handle = handle;
        OK
    })
}

#[no_mangle]
pub extern "C" fn vexart_image_asset_touch(
    _ctx: u64,
    _scene: u64,
    current_frame: u64,
    handle: u64,
) -> i32 {
    ffi_guard!({
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_image_assets();
        let registry_guard = lock_or_recover(registry);
        if registry_guard.touch(handle, current_frame, &mut resources_guard) {
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

#[no_mangle]
pub extern "C" fn vexart_image_asset_release(_ctx: u64, _scene: u64, handle: u64) -> i32 {
    ffi_guard!({
        let mut paint_guard = get_or_init_paint();
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_image_assets();
        let mut registry_guard = lock_or_recover(registry);
        if registry_guard.release(handle, &mut resources_guard) {
            if let Some(pctx) = paint_guard.as_mut() {
                pctx.images.remove(&handle);
            }
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

/// Register or update a native canvas display list.
///
/// # Safety
/// All pointers must be valid for their documented lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_canvas_display_list_update(
    _ctx: u64,
    _scene: u64,
    current_frame: u64,
    key_ptr: *const u8,
    key_len: u32,
    bytes_ptr: *const u8,
    bytes_len: u32,
    out_handle: *mut u64,
) -> i32 {
    ffi_guard!({
        if key_ptr.is_null()
            || key_len == 0
            || bytes_ptr.is_null()
            || bytes_len == 0
            || out_handle.is_null()
        {
            return ERR_INVALID_ARG;
        }
        let key = String::from_utf8_lossy(std::slice::from_raw_parts(key_ptr, key_len as usize))
            .to_string();
        let bytes = std::slice::from_raw_parts(bytes_ptr, bytes_len as usize);
        let hash = canvas_display_list::hash_display_list(bytes);

        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_canvas_display_lists();
        let mut registry_guard = lock_or_recover(registry);
        let Some(handle) =
            registry_guard.update(key, bytes, hash, current_frame, &mut resources_guard)
        else {
            return ERR_INVALID_ARG;
        };
        *out_handle = handle;
        OK
    })
}

#[no_mangle]
pub extern "C" fn vexart_canvas_display_list_touch(
    _ctx: u64,
    _scene: u64,
    current_frame: u64,
    handle: u64,
) -> i32 {
    ffi_guard!({
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_canvas_display_lists();
        let registry_guard = lock_or_recover(registry);
        if registry_guard.touch(handle, current_frame, &mut resources_guard) {
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

#[no_mangle]
pub extern "C" fn vexart_canvas_display_list_release(_ctx: u64, _scene: u64, handle: u64) -> i32 {
    ffi_guard!({
        let resources = get_or_init_resource();
        let mut resources_guard = lock_or_recover(resources);
        let registry = get_or_init_canvas_display_lists();
        let mut registry_guard = lock_or_recover(registry);
        if registry_guard.release(handle, &mut resources_guard) {
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

// ─── §5.9 Font system — MSDF text pipeline (Phase 2b / DEC-008) ─────────

/// Initialize the font system by scanning system fonts.
/// This is lazy — calling any vexart_font_* function will auto-init.
/// Returns the number of font faces discovered, or negative on error.
///
/// # Safety
/// No pointer args — safe to call from any thread.
#[no_mangle]
pub extern "C" fn vexart_font_init() -> i32 {
    ffi_guard!({
        let guard = lock_or_recover(&SHARED_FONT_SYSTEM);
        guard.face_count() as i32
    })
}

/// Query a font face by family name and return an opaque font handle.
/// The handle is used in subsequent vexart_font_render_text calls.
///
/// `families_ptr` / `families_len`: UTF-8 JSON array of family names,
///   e.g. `["JetBrains Mono", "monospace"]`.
/// `weight`: CSS font-weight (100-900, default 400).
/// `italic`: 0 = normal, 1 = italic.
/// `out_handle`: receives the opaque font handle (u64).
///
/// Returns 0 on success, negative on error.
///
/// # Safety
/// `families_ptr` must be valid for `families_len` bytes.
/// `out_handle` must be a valid mutable u64 pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_query(
    families_ptr: *const u8,
    families_len: u32,
    weight: u16,
    italic: u32,
    out_handle: *mut u64,
) -> i32 {
    ffi_guard!({
        if families_ptr.is_null() || families_len == 0 || out_handle.is_null() {
            return ERR_INVALID_ARG;
        }

        let json_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
        let json_str = match std::str::from_utf8(json_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };

        // Parse JSON array of strings.
        let families: Vec<String> = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(_) => return ERR_INVALID_ARG,
        };

        let family_refs: Vec<&str> = families.iter().map(|s| s.as_str()).collect();
        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let face = match system.query_face(&family_refs, weight, italic != 0) {
            Some(f) => f,
            None => {
                ffi::error::set_last_error(format!(
                    "no font found for families={json_str} weight={weight}"
                ));
                return ffi::panic::ERR_INVALID_FONT;
            }
        };

        // Use the Arc pointer as an opaque handle — stable as long as face_cache keeps it alive.
        let handle = std::sync::Arc::as_ptr(&face.data) as u64;
        *out_handle = handle;
        OK
    })
}

/// Render text using the MSDF pipeline.
///
/// This is the high-level text rendering FFI: given a text string, font params,
/// position, and target — it resolves the font, generates MSDF glyphs on demand,
/// uploads atlas pages to GPU, builds the glyph instance buffer, and dispatches.
///
/// Parameters (packed in a struct to stay within ARM64 8-param limit):
/// `text_ptr` / `text_len`: UTF-8 text string.
/// `params_ptr`: pointer to a TextRenderParams packed struct (see below).
/// `target`: composite target handle (0 = default).
/// `stats_out`: receives FrameStats.
///
/// TextRenderParams layout (40 bytes, all LE):
///   f32 x, y          — pen position in pixels (top-left of text block)
///   f32 font_size      — requested font size in pixels
///   f32 line_height    — line height in pixels
///   f32 max_width      — max text width for wrapping (0 = no wrap)
///   u32 color_rgba     — text color as packed RGBA (0xRRGGBBAA)
///   u8[8] families_hash — first 8 bytes of family string (for font lookup)
///   u16 weight         — CSS font-weight
///   u16 flags          — bit 0: italic, bits 1-15: reserved
///
/// Returns 0 on success, negative on error.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_render_text(
    _ctx: u64,
    target: u64,
    text_ptr: *const u8,
    text_len: u32,
    params_ptr: *const u8,
    params_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        use font::msdf_atlas::MsdfGlyphEntry;

        if text_ptr.is_null() || text_len == 0 || params_ptr.is_null() || params_len < 28 {
            if !stats_out.is_null() { *stats_out = FrameStats::default(); }
            return OK; // empty text = no-op
        }

        let text_bytes = std::slice::from_raw_parts(text_ptr, text_len as usize);
        let text = match std::str::from_utf8(text_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };

        // Parse params.
        let params = std::slice::from_raw_parts(params_ptr, params_len as usize);
        let x = f32::from_le_bytes([params[0], params[1], params[2], params[3]]);
        let y = f32::from_le_bytes([params[4], params[5], params[6], params[7]]);
        let font_size = f32::from_le_bytes([params[8], params[9], params[10], params[11]]);
        let line_height_param = f32::from_le_bytes([params[12], params[13], params[14], params[15]]);
        let max_width_param = f32::from_le_bytes([params[16], params[17], params[18], params[19]]);
        let color_rgba = u32::from_le_bytes([params[20], params[21], params[22], params[23]]);
        let weight = u16::from_le_bytes([params[24], params[25]]);
        let flags = u16::from_le_bytes([params[26], params[27]]);
        let italic = (flags & 1) != 0;

        // Parse font families from remaining params bytes (JSON string after fixed header).
        let families: Vec<String> = if params_len > 28 {
            let json_bytes = &params[28..params_len as usize];
            match std::str::from_utf8(json_bytes).ok().and_then(|s| serde_json::from_str(s).ok()) {
                Some(v) => v,
                None => vec!["sans-serif".to_string()],
            }
        } else {
            vec!["sans-serif".to_string()]
        };

        let color_r = ((color_rgba >> 24) & 0xFF) as f32 / 255.0;
        let color_g = ((color_rgba >> 16) & 0xFF) as f32 / 255.0;
        let color_b = ((color_rgba >> 8) & 0xFF) as f32 / 255.0;
        let color_a = (color_rgba & 0xFF) as f32 / 255.0;

        // Resolve font.
        let family_refs: Vec<&str> = families.iter().map(|s| s.as_str()).collect();
        let mut font_system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match font_system.query_face(&family_refs, weight, italic) {
            Some(f) => f,
            None => {
                if !stats_out.is_null() { *stats_out = FrameStats::default(); }
                return OK; // No font → skip text silently.
            }
        };

        // Get the target dimensions for NDC conversion.
        let mut pctx_guard = get_or_init_paint();
        let pctx = match pctx_guard.as_mut() {
            Some(p) => p,
            None => return ERR_GPU_DEVICE_LOST,
        };

        let (target_w, target_h) = if target != 0 {
            pctx.targets.get(target)
                .map(|t| (t.width as f32, t.height as f32))
                .unwrap_or((1920.0, 1080.0))
        } else {
            (1920.0, 1080.0) // fallback — shouldn't happen in real usage
        };

        // Get the font face for MSDF generation.
        let face_data = resolved.data.clone();
        let face_index = resolved.face_index;
        let face = match resolved.parse() {
            Some(f) => f,
            None => return ERR_INVALID_ARG,
        };

        // Get units_per_em for scale computation.
        let units_per_em = face.units_per_em() as f32;
        let scale = font_size / units_per_em;
        let line_height = line_height_param;
        let max_width = max_width_param;

        // ── Text layout: greedy word-wrapping with hard break support ──
        let text_layout = font::layout::layout_text(
            text, &face_data, face_index,
            font_size, line_height, max_width,
        );

        // Generate MSDF glyphs and build instance buffer from laid-out lines.
        let mut atlas_mgr = lock_or_recover(&SHARED_MSDF_ATLAS);
        let mut instances: Vec<paint::instances::MsdfGlyphInstance> = Vec::new();

        for (line_idx, line) in text_layout.lines.iter().enumerate() {
            let mut pen_x = x;
            let pen_y = y + line_idx as f32 * line_height;

            for ch in line.text.chars() {
                // Try to generate/lookup the MSDF glyph.
                let entry: Option<MsdfGlyphEntry> = atlas_mgr.get_or_generate(&face_data, face_index, ch);

                // If primary font doesn't have it, try fallback.
                let (entry, _used_fallback) = if entry.is_some() {
                    (entry, false)
                } else {
                    // Drop atlas_mgr to avoid deadlock, then search fallback.
                    drop(atlas_mgr);
                    let fallback_face = font_system.find_face_for_codepoint(ch, weight, !italic);
                    atlas_mgr = lock_or_recover(&SHARED_MSDF_ATLAS);
                    if let Some(fb) = fallback_face {
                        (atlas_mgr.get_or_generate(&fb.data, fb.face_index, ch), true)
                    } else {
                        (None, false)
                    }
                };

                let entry = match entry {
                    Some(e) => e,
                    None => {
                        // No glyph in any font — skip.
                        pen_x += font_size * 0.5;
                        continue;
                    }
                };

                let advance = entry.advance * scale;

                // Skip invisible glyphs (space etc) — they have advance but no visual.
                if entry.bbox_w > 0.0 && entry.bbox_h > 0.0 {
                    let glyph_w = font_size;
                    let glyph_h = font_size;
                    let glyph_x = pen_x;
                    let glyph_y = pen_y;

                    instances.push(paint::instances::MsdfGlyphInstance {
                        x: (glyph_x / target_w) * 2.0 - 1.0,
                        y: 1.0 - (glyph_y / target_h) * 2.0,
                        w: (glyph_w / target_w) * 2.0,
                        h: -((glyph_h / target_h) * 2.0),
                        uv_x: entry.uv_x(),
                        uv_y: entry.uv_y(),
                        uv_w: entry.uv_w(),
                        uv_h: entry.uv_h(),
                        color_r,
                        color_g,
                        color_b,
                        color_a,
                        atlas_id: 1,
                        msdf_flag: 1, // MSDF mode
                        _pad1: 0,
                        _pad2: 0,
                    });
                }

                pen_x += advance;
            }
        }

        // Upload dirty MSDF atlas pages to the Rust atlas registry (NOT the image registry).
        // The glyph pipeline dispatches using atlas_id to look up bind_groups from pctx.atlases.
        // We use atlas_id 2+ for MSDF pages (id 1 is the bitmap atlas loaded by TS).
        let page_size = atlas_mgr.page_size();
        for (page_idx, page) in atlas_mgr.pages.iter_mut().enumerate() {
            if page.dirty {
                let msdf_atlas_id = (page_idx as u32) + 2; // 2, 3, 4, ... (1 is bitmap)
                if msdf_atlas_id <= 15 {
                    let device = &pctx.wgpu.device;
                    let queue = &pctx.wgpu.queue;
                    let bgl = &pctx.wgpu.image_bind_group_layout;
                    let _ = pctx.atlases.load_atlas_raw(
                        device, queue, bgl,
                        msdf_atlas_id,
                        &page.rgba, page_size, page_size,
                    );
                }
                page.dirty = false;
            }
        }

        // Now dispatch via the existing text dispatch path.
        if instances.is_empty() {
            if !stats_out.is_null() { *stats_out = FrameStats::default(); }
            return OK;
        }

        // Set atlas_id on all instances to point at the correct MSDF atlas page.
        for inst in instances.iter_mut() {
            // page 0 → atlas_id 2, page 1 → atlas_id 3, etc.
            // For now all glyphs are on page 0 → atlas_id 2.
            inst.atlas_id = 2;
        }

        drop(atlas_mgr);

        let code = text::dispatch_glyph_instances(pctx, target, &instances);

        if !stats_out.is_null() {
            (*stats_out).primitives = instances.len() as u32;
            (*stats_out).draw_calls = 1;
        }

        code
    })
}

/// Measure text width and height using the MSDF font system metrics.
///
/// `text_ptr` / `text_len`: UTF-8 text string.
/// `families_ptr` / `families_len`: UTF-8 JSON array of font families.
/// `font_size`: requested font size in pixels.
/// `out_w`, `out_h`: receives measured width and height.
///
/// Returns 0 on success.
///
/// # Safety
/// All pointer args must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_measure(
    text_ptr: *const u8,
    text_len: u32,
    families_ptr: *const u8,
    families_len: u32,
    font_size: f32,
    weight: u16,
    italic: u32,
    out_w: *mut f32,
    out_h: *mut f32,
) -> i32 {
    ffi_guard!({
        if out_w.is_null() || out_h.is_null() {
            return ERR_INVALID_ARG;
        }

        if text_ptr.is_null() || text_len == 0 {
            *out_w = 0.0;
            *out_h = 0.0;
            return OK;
        }

        let text = match std::str::from_utf8(std::slice::from_raw_parts(text_ptr, text_len as usize)) {
            Ok(s) => s,
            Err(_) => { *out_w = 0.0; *out_h = 0.0; return OK; }
        };

        let families: Vec<String> = if !families_ptr.is_null() && families_len > 0 {
            let json_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
            std::str::from_utf8(json_bytes)
                .ok()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_else(|| vec!["sans-serif".to_string()])
        } else {
            vec!["sans-serif".to_string()]
        };

        let family_refs: Vec<&str> = families.iter().map(|s| s.as_str()).collect();
        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match system.query_face(&family_refs, weight, italic != 0) {
            Some(f) => f,
            None => { *out_w = 0.0; *out_h = 0.0; return OK; }
        };

        let face = match resolved.parse() {
            Some(f) => f,
            None => { *out_w = 0.0; *out_h = 0.0; return OK; }
        };

        let units_per_em = face.units_per_em() as f32;
        let scale = font_size / units_per_em;

        // Measure by summing horizontal advances.
        let mut width = 0.0f32;
        let mut lines = 1u32;

        for ch in text.chars() {
            if ch == '\n' {
                lines += 1;
                continue;
            }
            if let Some(glyph_id) = face.glyph_index(ch) {
                let adv = face.glyph_hor_advance(glyph_id).unwrap_or(0) as f32;
                width += adv * scale;
            } else {
                width += font_size * 0.5; // fallback advance
            }
        }

        *out_w = width;
        *out_h = lines as f32 * font_size * 1.2; // line height estimate
        OK
    })
}

// ─── §5.7 Error retrieval (re-exported from ffi::error) ──────────────────
// vexart_get_last_error_length and vexart_copy_last_error are defined in
// native/libvexart/src/ffi/error.rs with #[no_mangle] — they are exported
// directly from that module, no wrapper needed here.
