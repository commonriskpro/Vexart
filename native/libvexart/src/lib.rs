// native/libvexart/src/lib.rs
// All #[no_mangle] pub extern "C" FFI exports for libvexart (48 functions in lib.rs, 51 total).
// Every export wraps its body in ffi_guard! for panic safety.
// Per design §5, REQ-NB-003.

pub mod composite;
pub mod ffi;
pub mod font;
pub mod kitty;
pub mod paint;
pub mod text;
pub mod types;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard};

use ffi::panic::{
    ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, ERR_INVALID_HANDLE, ERR_OUT_OF_BUDGET,
    OK,
};

/// Lock a mutex, recovering from poison instead of panicking.
/// If a previous panic poisoned the mutex, the guard is recovered
/// so the renderer can continue operating instead of permanently failing.
fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
use types::FrameStats;

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

fn get_or_init_paint() -> MutexGuard<'static, Option<paint::PaintContext>> {
    let mut guard = lock_or_recover(&SHARED_PAINT);
    if guard.is_none() {
        *guard = Some(paint::PaintContext::new());
    }
    guard
}

fn upload_image_record(
    pctx: &mut paint::PaintContext,
    handle: u64,
    rgba: &[u8],
    width: u32,
    height: u32,
) -> bool {
    let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
    if width == 0 || height == 0 || width > max_dim || height > max_dim {
        return false;
    }
    let expected_bytes = match (width as usize).checked_mul(height as usize).and_then(|px| px.checked_mul(4)) {
        Some(b) => b,
        None => return false,
    };
    if rgba.len() < expected_bytes {
        return false;
    }
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
            width,
            height,
            references: 1,
        },
    );
    true
}

/// Default memory budget: 512MB (per ARCHITECTURE §8.3).
pub const DEFAULT_BUDGET_BYTES: u64 = 512 * 1024 * 1024;
/// Minimum allowed budget: 32MB (per ARCHITECTURE §8.3).
pub const MIN_BUDGET_BYTES: u64 = 32 * 1024 * 1024;

static BUDGET_BYTES: AtomicU64 = AtomicU64::new(DEFAULT_BUDGET_BYTES);
static HIGH_WATER_MARK: AtomicU64 = AtomicU64::new(0);

static FRAME_COUNT: AtomicU64 = AtomicU64::new(1);

pub fn current_frame() -> u64 {
    FRAME_COUNT.load(Ordering::Relaxed)
}

fn advance_presentation_frame() -> u64 {
    FRAME_COUNT.fetch_add(1, Ordering::Relaxed)
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
        *out_ctx = 1;
        OK
    })
}

/// Releases a Vexart rendering context.
///
/// Ensures complete native teardown: drains SHARED_PAINT (releasing WGPU device,
/// queue, pipelines, and targets), symmetrically resets associated registries,
/// and unlinks active POSIX SHM mappings.
#[no_mangle]
pub extern "C" fn vexart_context_destroy(ctx: u64) -> i32 {
    ffi_guard!({
        let _ = ctx;
        // 1. Drain SHARED_PAINT (releases WGPU device, queue, pipeline caches, render targets + scissor state, images, atlases, texture pool)
        {
            let mut guard = lock_or_recover(&SHARED_PAINT);
            if let Some(pctx) = guard.as_mut() {
                pctx.texture_pool.clear();
            }
            let _ = guard.take();
        }
        // 2. Symmetrically reset/drain SHARED_MSDF_ATLAS
        {
            let mut guard = lock_or_recover(&SHARED_MSDF_ATLAS);
            *guard = font::msdf_atlas::MsdfAtlasManager::new();
        }
        // 3. Symmetrically reset frame counter and budget stats
        FRAME_COUNT.store(1, Ordering::Relaxed);
        BUDGET_BYTES.store(DEFAULT_BUDGET_BYTES, Ordering::Relaxed);
        HIGH_WATER_MARK.store(0, Ordering::Relaxed);
        // 4. Release any active SHM mappings
        kitty::transport::cleanup_shm_on_shutdown();
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
        let bytes = match (width as u64)
            .checked_mul(height as u64)
            .and_then(|px| px.checked_mul(4))
        {
            Some(b) => b,
            None => {
                *out_image = 0;
                return ERR_OUT_OF_BUDGET;
            }
        };

        if (image_len as u64) < bytes {
            *out_image = 0;
            return ERR_INVALID_ARG;
        }

        let rgba = std::slice::from_raw_parts(image_ptr, image_len as usize);

        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
        if width > max_dim || height > max_dim {
            return ERR_INVALID_ARG;
        }
        let handle = paint::alloc_image_handle();
        if !upload_image_record(pctx, handle, rgba, width, height) {
            return ERR_INVALID_ARG;
        }

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
            if let Some(img) = pctx.images.remove(&image) {
                let size = img.texture.size();
                let required_usage = wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_SRC
                    | wgpu::TextureUsages::COPY_DST;
                if img.texture.format() == wgpu::TextureFormat::Rgba8Unorm
                    && img.texture.usage().contains(required_usage)
                    && size.depth_or_array_layers == 1
                {
                    drop(img.bind_group);
                    let current_frame = FRAME_COUNT.load(Ordering::Relaxed);
                    pctx.texture_pool.release(
                        img.texture,
                        img.view,
                        size.width,
                        size.height,
                        current_frame,
                    );
                }
            }
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

/// Set hardware scissor rectangle on an offscreen render target.
#[no_mangle]
pub extern "C" fn vexart_composite_target_set_scissor(
    _ctx: u64,
    target: u64,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_set_scissor(pctx, target, x, y, width, height)
    })
}

/// Reset/clear hardware scissor rectangle on an offscreen render target.
#[no_mangle]
pub extern "C" fn vexart_composite_target_reset_scissor(_ctx: u64, target: u64) -> i32 {
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_reset_scissor(pctx, target)
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
        if target == 0 || w == 0 || h == 0 {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let (tw, th) = match pctx.targets.get(target) {
            Some(r) => (r.width, r.height),
            None => return ERR_INVALID_HANDLE,
        };
        let cx = x.min(tw);
        let cy = y.min(th);
        let cw = w.min(tw.saturating_sub(cx));
        let ch = h.min(th.saturating_sub(cy));
        if cw == 0 || ch == 0 {
            return ERR_INVALID_ARG;
        }
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
        if params_ptr.is_null() || params_len < 32 {
            return ERR_INVALID_ARG;
        }
        let params: &[f32] = std::slice::from_raw_parts(params_ptr as *const f32, 8);
        let blur_raw = params[0];
        let brightness_raw = params[1];
        let contrast_raw = params[2];
        let saturate_raw = params[3];
        let grayscale_raw = params[4];
        let invert_raw = params[5];
        let sepia_raw = params[6];
        let hue_rotate_deg_raw = params[7];

        let blur = if blur_raw.is_nan() { 0.0 } else { blur_raw.max(0.0) };
        let brightness = if brightness_raw.is_nan() { 100.0 } else { brightness_raw };
        let contrast = if contrast_raw.is_nan() { 100.0 } else { contrast_raw };
        let saturate = if saturate_raw.is_nan() { 100.0 } else { saturate_raw };
        let grayscale = if grayscale_raw.is_nan() { 0.0 } else { grayscale_raw };
        let invert = if invert_raw.is_nan() { 0.0 } else { invert_raw };
        let sepia = if sepia_raw.is_nan() { 0.0 } else { sepia_raw };
        let hue_rotate_deg = if hue_rotate_deg_raw.is_nan() { 0.0 } else { hue_rotate_deg_raw };

        let has_blur = blur > 0.0;
        let has_color = (brightness - 100.0).abs() > f32::EPSILON
            || (contrast - 100.0).abs() > f32::EPSILON
            || (saturate - 100.0).abs() > f32::EPSILON
            || grayscale.abs() > f32::EPSILON
            || invert.abs() > f32::EPSILON
            || sepia.abs() > f32::EPSILON
            || hue_rotate_deg.abs() > f32::EPSILON;

        let passes: u64 = match (has_blur, has_color) {
            (true, true) => 3,
            (true, false) => 2,
            (false, true) => 1,
            (false, false) => {
                *out_image = 0;
                return ERR_INVALID_ARG;
            }
        };
        let _ = passes;

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
        if out_image.is_null() || rect_ptr.is_null() {
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

/// Apply a rounded-rect SDF mask with an explicit source-box region.
/// `rect_ptr` = 10 × f32: six radius/mode values followed by mask_x, mask_y,
/// mask_w, mask_h in output NDC. This internal companion keeps radius
/// geometry in the original image box when the source has been cropped.
///
/// # Safety
/// `rect_ptr` must be valid for 40 bytes; `out_image` must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_image_mask_rounded_rect_region(
    _ctx: u64,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() || rect_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::image_mask_rounded_rect_region(pctx, image, rect_ptr, out_image)
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

// ─── §5.6 Kitty transport ────────────────────────────────────────────────

/// Emit a complete frame with native presentation stats.
///
/// Writes timing and byte-count stats to `*stats_out`.
/// Pass null for `stats_out` if stats are not needed.
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
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let rc = kitty::transport::emit_frame_with_stats(pctx, target, image_id, stats_out);
        if rc == OK {
            let frame = advance_presentation_frame();
            pctx.texture_pool.trim_unused(frame);
        }
        rc
    })
}

/// Emit a regular Kitty SHM frame and transfer its lifetime to the caller.
/// # Safety
/// out_handle must be writable; stats_out must be writable when non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_frame_shm_owned(
    _ctx: u64,
    target: u64,
    image_id: u32,
    out_handle: *mut u64,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if out_handle.is_null() || image_id == 0 {
            return ERR_INVALID_ARG;
        }
        *out_handle = 0;
        let mut guard = get_or_init_paint();
        let Some(pctx) = guard.as_mut() else {
            return ERR_GPU_DEVICE_LOST;
        };
        let rc = kitty::transport::emit_frame_shm_owned(pctx, target, image_id, &mut *out_handle, stats_out);
        if rc == OK {
            let frame = advance_presentation_frame();
            pctx.texture_pool.trim_unused(frame);
        }
        rc
    })
}

/// Emit a complete frame using the fixed POSIX SHM ring buffer with backpressure.
/// # Safety
/// stats_out must be writable when non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_frame_shm_ring(
    _ctx: u64,
    target: u64,
    image_id: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    ffi_guard!({
        if image_id == 0 {
            return ERR_INVALID_ARG;
        }
        let mut guard = get_or_init_paint();
        let Some(pctx) = guard.as_mut() else {
            return ERR_GPU_DEVICE_LOST;
        };
        let rc = kitty::transport::emit_frame_shm_ring(pctx, target, image_id, stats_out);
        if rc == OK {
            let frame = advance_presentation_frame();
            pctx.texture_pool.trim_unused(frame);
        }
        rc
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
    ffi_guard!({ kitty::transport::delete_layer_native(image_id, stats_out) })
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

/// Emit a full target through tmux using a native POSIX-SHM Kitty upload.
/// `params_len` is measured in bytes and must be 20 (`image_id`,
/// `placement_id`, `cols`, `rows`, `emit_grid`).
///
/// # Safety
/// `params` must point to 20 readable bytes, `out_handle` must be writable,
/// and `stats_out` must be writable when non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_placeholder_shm_frame(
    ctx: u64,
    target: u64,
    params: *const u32,
    params_len: u32,
    out_handle: *mut u64,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    let _ = ctx;
    let rc = ffi_guard!({
        if !out_handle.is_null() {
            // SAFETY: a non-null output pointer is required to be writable by
            // this FFI contract.
            *out_handle = 0;
        }
        let mut guard = get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(context) => context,
            None => return ERR_GPU_DEVICE_LOST,
        };
        kitty::placeholder::emit_placeholder_shm_frame(
            pctx,
            target,
            params,
            params_len,
            out_handle,
            stats_out,
        )
    });
    if rc != OK && !out_handle.is_null() {
        // SAFETY: the pointer was checked above and remains part of the FFI
        // contract on every non-null error path.
        *out_handle = 0;
    }
    rc
}

/// Emit a full target through tmux using the fixed POSIX SHM ring buffer with backpressure.
/// # Safety
/// params must point to 20 readable bytes, stats_out must be writable when non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_placeholder_shm_ring(
    ctx: u64,
    target: u64,
    params: *const u32,
    params_len: u32,
    stats_out: *mut types::NativePresentationStats,
) -> i32 {
    let _ = ctx;
    ffi_guard!({
        let mut guard = get_or_init_paint();
        let Some(pctx) = guard.as_mut() else {
            return ERR_GPU_DEVICE_LOST;
        };
        let rc = kitty::placeholder::emit_placeholder_shm_ring(
            pctx,
            target,
            params,
            params_len,
            stats_out,
        );
        if rc == OK {
            let frame = advance_presentation_frame();
            pctx.texture_pool.trim_unused(frame);
        }
        rc
    })
}

/// Report whether the terminal has unlinked a native Kitty SHM object.
#[no_mangle]
pub extern "C" fn vexart_kitty_shm_is_consumed(handle: u64) -> i32 {
    ffi_guard!({ kitty::shm::shm_is_consumed(handle) })
}

/// Report whether all slots in the fixed SHM ring buffer are drained.
#[no_mangle]
pub extern "C" fn vexart_kitty_shm_is_drained() -> i32 {
    ffi_guard!({
        if kitty::shm::shm_ring_is_drained() { 1 } else { 0 }
    })
}

/// Unlink all active Kitty SHM objects and close their descriptors.
#[no_mangle]
pub extern "C" fn vexart_kitty_shm_cleanup_all() -> i32 {
    ffi_guard!({
        kitty::transport::cleanup_shm_on_shutdown();
        OK
    })
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

        let mut image_count: u32 = 0;
        let mut image_bytes: u64 = 0;
        let mut target_count: u32 = 0;
        let mut target_bytes: u64 = 0;

        {
            let guard = get_or_init_paint();
            if let Some(pctx) = guard.as_ref() {
                image_count = pctx.images.len() as u32;
                for img in pctx.images.values() {
                    image_bytes += img.size_bytes();
                }
                let (tc, tb) = pctx.targets.stats();
                target_count = tc;
                target_bytes = tb;
            }
        }

        let current_usage = image_bytes + target_bytes;
        let _ = HIGH_WATER_MARK.fetch_max(current_usage, Ordering::Relaxed);
        let high_water_mark = HIGH_WATER_MARK.load(Ordering::Relaxed).max(current_usage);
        let budget_bytes = BUDGET_BYTES.load(Ordering::Relaxed);

        let mut kinds = Vec::new();
        if image_count > 0 {
            kinds.push(format!(
                "\"ImageSprite\":{{\"count\":{},\"bytes\":{}}}",
                image_count, image_bytes
            ));
        }
        if target_count > 0 {
            kinds.push(format!(
                "\"LayerTarget\":{{\"count\":{},\"bytes\":{}}}",
                target_count, target_bytes
            ));
        }
        let kind_json = kinds.join(",");

        let json = format!(
            "{{\"budgetBytes\":{},\"currentUsage\":{},\"highWaterMark\":{},\"resourcesByKind\":{{{}}},\"evictionsLastFrame\":0,\"evictionsTotal\":0}}",
            budget_bytes, current_usage, high_water_mark, kind_json,
        );
        let bytes = json.as_bytes();

        let write_len = bytes.len().min(out_cap as usize);
        let out_slice = std::slice::from_raw_parts_mut(out_ptr, write_len);
        out_slice.copy_from_slice(&bytes[..write_len]);
        *out_used = write_len as u32;
        OK
    })
}

/// Set the GPU memory budget.
#[no_mangle]
pub extern "C" fn vexart_resource_set_budget(_ctx: u64, budget_mb: u32) -> i32 {
    ffi_guard!({
        let budget_bytes = ((budget_mb as u64) * 1024 * 1024).max(MIN_BUDGET_BYTES);
        BUDGET_BYTES.store(budget_bytes, Ordering::Relaxed);
        OK
    })
}

/// Register or update a native image asset from decoded RGBA bytes.
#[no_mangle]
pub unsafe extern "C" fn vexart_image_asset_register(
    _current_frame: u64,
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
        let meta = std::slice::from_raw_parts(meta_ptr, 8);
        let width = u32::from_le_bytes(meta[0..4].try_into().unwrap_or([0; 4]));
        let height = u32::from_le_bytes(meta[4..8].try_into().unwrap_or([0; 4]));

        let bytes = match (width as u64)
            .checked_mul(height as u64)
            .and_then(|px| px.checked_mul(4))
        {
            Some(b) => b,
            None => {
                *out_handle = 0;
                return ERR_OUT_OF_BUDGET;
            }
        };

        if rgba_len as u64 != bytes {
            *out_handle = 0;
            return ERR_INVALID_ARG;
        }

        let rgba = std::slice::from_raw_parts(rgba_ptr, rgba_len as usize);

        let mut paint_guard = get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };

        let handle = paint::alloc_image_handle();
        if !upload_image_record(pctx, handle, rgba, width, height) {
            *out_handle = 0;
            return ERR_INVALID_ARG;
        }
        *out_handle = handle;
        OK
    })
}

#[no_mangle]
pub extern "C" fn vexart_image_asset_touch(_current_frame: u64, handle: u64) -> i32 {
    ffi_guard!({
        if handle == 0 {
            return ERR_INVALID_ARG;
        }
        let guard = get_or_init_paint();
        let pctx = match guard.as_ref() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        if pctx.images.contains_key(&handle) {
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

/// Acquire an additional image owner; release it with vexart_image_asset_release.
#[no_mangle]
pub extern "C" fn vexart_image_asset_retain(handle: u64) -> i32 {
    ffi_guard!({
        if handle == 0 {
            return ERR_INVALID_ARG;
        }
        let mut paint_guard = get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        if let Some(img) = pctx.images.get_mut(&handle) {
            img.references = img.references.saturating_add(1);
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

#[no_mangle]
pub extern "C" fn vexart_image_asset_release(handle: u64) -> i32 {
    ffi_guard!({
        if handle == 0 {
            return ERR_INVALID_ARG;
        }
        let mut paint_guard = get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        if let Some(img) = pctx.images.get_mut(&handle) {
            if img.references > 1 {
                img.references -= 1;
                return OK;
            }
        } else {
            return ERR_INVALID_ARG;
        }
        pctx.images.remove(&handle);
        OK
    })
}

// ─── §5.9 Font system — MSDF text pipeline (Phase 2b / DEC-008) ─────────

static SHARED_FONT_SYSTEM: LazyLock<Mutex<font::system::FontSystem>> =
    LazyLock::new(|| Mutex::new(font::system::FontSystem::new()));

static SHARED_MSDF_ATLAS: LazyLock<Mutex<font::msdf_atlas::MsdfAtlasManager>> =
    LazyLock::new(|| Mutex::new(font::msdf_atlas::MsdfAtlasManager::new()));

/// Initialize the font system by scanning system fonts.
/// Returns the number of font faces discovered, or negative on error.
#[no_mangle]
pub extern "C" fn vexart_font_init() -> i32 {
    ffi_guard!({
        let guard = lock_or_recover(&SHARED_FONT_SYSTEM);
        guard.face_count() as i32
    })
}

/// Query a font face by family name and return an opaque font handle.
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
        let str_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
        let families_str = match std::str::from_utf8(str_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };
        let families: Vec<&str> = families_str.split('\0').collect();
        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let face = match system.query_face(&families, weight, italic != 0) {
            Some(f) => f,
            None => {
                ffi::error::set_last_error(format!(
                    "no font found for families={families_str} weight={weight}"
                ));
                return ffi::panic::ERR_INVALID_FONT;
            }
        };
        let handle = std::sync::Arc::as_ptr(&face.data) as u64;
        *out_handle = handle;
        OK
    })
}

/// Render text using the MSDF pipeline.
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
            if !stats_out.is_null() {
                *stats_out = FrameStats::default();
            }
            return OK;
        }

        let text_bytes = std::slice::from_raw_parts(text_ptr, text_len as usize);
        let text = match std::str::from_utf8(text_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };

        let params = std::slice::from_raw_parts(params_ptr, params_len as usize);
        let x = f32::from_le_bytes([params[0], params[1], params[2], params[3]]);
        let y = f32::from_le_bytes([params[4], params[5], params[6], params[7]]);
        let font_size = f32::from_le_bytes([params[8], params[9], params[10], params[11]]);
        let line_height = f32::from_le_bytes([params[12], params[13], params[14], params[15]]);
        let max_width = f32::from_le_bytes([params[16], params[17], params[18], params[19]]);
        let color_rgba = u32::from_le_bytes([params[20], params[21], params[22], params[23]]);
        let weight = u16::from_le_bytes([params[24], params[25]]);
        let flags = u16::from_le_bytes([params[26], params[27]]);
        let italic = (flags & 1) != 0;

        let families_owned: Vec<&str>;
        let families: &[&str] = if params_len > 28 {
            let str_bytes = &params[28..params_len as usize];
            if let Ok(s) = std::str::from_utf8(str_bytes) {
                families_owned = s.split('\0').collect();
                &families_owned
            } else {
                &["sans-serif"]
            }
        } else {
            &["sans-serif"]
        };

        let color_r = ((color_rgba >> 24) & 0xFF) as f32 / 255.0;
        let color_g = ((color_rgba >> 16) & 0xFF) as f32 / 255.0;
        let color_b = ((color_rgba >> 8) & 0xFF) as f32 / 255.0;
        let color_a = (color_rgba & 0xFF) as f32 / 255.0;

        let mut font_system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match font_system.query_face(families, weight, italic) {
            Some(f) => f,
            None => {
                if !stats_out.is_null() {
                    *stats_out = FrameStats::default();
                }
                return OK;
            }
        };

        let mut pctx_guard = get_or_init_paint();
        let pctx = match pctx_guard.as_mut() {
            Some(p) => p,
            None => return ERR_GPU_DEVICE_LOST,
        };

        let (target_w, target_h) = if target != 0 {
            pctx.targets
                .get(target)
                .map(|t| (t.width as f32, t.height as f32))
                .unwrap_or((1920.0, 1080.0))
        } else {
            (1920.0, 1080.0)
        };

        let face_data = resolved.data.clone();
        let face_index = resolved.face_index;
        let face = match resolved.parse() {
            Some(f) => f,
            None => return ERR_INVALID_ARG,
        };

        let units_per_em = face.units_per_em() as f32;
        let scale = font_size / units_per_em;

        // Ascender in font units → pixels. This is the baseline offset from line top.
        let ascender = face.ascender() as f32;

        let text_layout = font::layout::layout_text(
            text,
            &face_data,
            face_index,
            font_size,
            line_height,
            max_width,
        );

        let mut atlas_mgr = lock_or_recover(&SHARED_MSDF_ATLAS);
        let mut instances: Vec<paint::instances::MsdfGlyphInstance> = Vec::new();

        for (line_idx, line) in text_layout.lines.iter().enumerate() {
            // pen_y is the TOP of the line box. The baseline sits at ascender below.
            let baseline_y = y + line_idx as f32 * line_height + ascender * scale;
            let mut pen_x = x;

            for ch in line.text.chars() {
                let entry: Option<MsdfGlyphEntry> =
                    atlas_mgr.get_or_generate(&face_data, face_index, ch);

                let (entry, _) = if entry.is_some() {
                    (entry, false)
                } else {
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
                        pen_x += font_size * 0.5;
                        continue;
                    }
                };

                let advance = entry.advance * scale;

                if entry.bbox_w > 0.0 && entry.bbox_h > 0.0 {
                    let glyph_w = entry.quad_w(scale);
                    let glyph_h = entry.quad_h(scale);
                    let glyph_x = pen_x + entry.quad_offset_x(scale);
                    let glyph_y = baseline_y + entry.quad_offset_y(scale);

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
                        atlas_id: (entry.page as u32) + 2,
                        msdf_flag: 1,
                        _pad1: 0,
                        _pad2: 0,
                    });
                }
                pen_x += advance;
            }
        }

        let page_size = atlas_mgr.page_size();
        let stride = page_size * 4;
        for (page_idx, page) in atlas_mgr.pages.iter_mut().enumerate() {
            if page.dirty {
                let msdf_atlas_id = (page_idx as u32) + 2;
                if msdf_atlas_id <= 15 {
                    if !pctx.atlases.contains(msdf_atlas_id) || page.dirty_subregions.is_empty() {
                        // Initial upload if not loaded yet, or in-place full update if no specific subregions recorded.
                        let _ = pctx.atlases.load_atlas_raw(
                            &pctx.wgpu.device,
                            &pctx.wgpu.queue,
                            &pctx.wgpu.image_bind_group_layout,
                            msdf_atlas_id,
                            &page.rgba,
                            page_size,
                            page_size,
                        );
                    } else {
                        for sub in page.dirty_subregions.drain(..) {
                            let offset = (sub.y as u64 * stride as u64) + (sub.x as u64 * 4);
                            let _ = pctx.atlases.update_subregion(
                                &pctx.wgpu.queue,
                                msdf_atlas_id,
                                sub.x,
                                sub.y,
                                sub.width,
                                sub.height,
                                &page.rgba,
                                stride,
                                offset,
                            );
                        }
                    }
                }
                page.dirty = false;
                page.dirty_subregions.clear();
            }
        }

        if instances.is_empty() {
            if !stats_out.is_null() {
                *stats_out = FrameStats::default();
            }
            return OK;
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

/// Measure text width and height using font system metrics.
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
        let text =
            match std::str::from_utf8(std::slice::from_raw_parts(text_ptr, text_len as usize)) {
                Ok(s) => s,
                Err(_) => {
                    *out_w = 0.0;
                    *out_h = 0.0;
                    return OK;
                }
            };
        let families_owned: Vec<&str>;
        let families: &[&str] = if !families_ptr.is_null() && families_len > 0 {
            let str_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
            if let Ok(s) = std::str::from_utf8(str_bytes) {
                families_owned = s.split('\0').collect();
                &families_owned
            } else {
                &["sans-serif"]
            }
        } else {
            &["sans-serif"]
        };
        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match system.query_face(families, weight, italic != 0) {
            Some(f) => f,
            None => {
                *out_w = 0.0;
                *out_h = 0.0;
                return OK;
            }
        };
        let face = match resolved.parse() {
            Some(f) => f,
            None => {
                *out_w = 0.0;
                *out_h = 0.0;
                return OK;
            }
        };
        let units_per_em = face.units_per_em() as f32;
        let scale = font_size / units_per_em;
        let mut width = 0.0f32;
        let mut lines = 1u32;
        for ch in text.chars() {
            if ch == '\n' {
                lines += 1;
                continue;
            }
            if let Some(glyph_id) = face.glyph_index(ch) {
                width += face.glyph_hor_advance(glyph_id).unwrap_or(0) as f32 * scale;
            } else {
                width += font_size * 0.5;
            }
        }
        *out_w = width;
        *out_h = lines as f32 * font_size * 1.2;
        OK
    })
}

// ─── §5.7 Error retrieval (re-exported from ffi::error) ──────────────────
// vexart_get_last_error_length and vexart_copy_last_error are defined in
// native/libvexart/src/ffi/error.rs with #[no_mangle] — they are exported
// directly from that module, no wrapper needed here.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::panic::ERR_INVALID_HANDLE;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_context_destroy_cleans_all_registries() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let _ = vexart_context_destroy(1);

        // Register an image asset
        let rgba = [255u8; 16];
        let meta = [2u32, 2u32];
        let mut handle = 0u64;
        let rc = unsafe {
            vexart_image_asset_register(
                1,
                "test.png".as_ptr(),
                8,
                rgba.as_ptr(),
                16,
                meta.as_ptr() as *const u8,
                &mut handle,
            )
        };
        assert_eq!(rc, OK);
        assert_ne!(handle, 0);

        // Create a target and set scissor to verify teardown drains it
        {
            let mut target = 0u64;
            let rc = unsafe { vexart_composite_target_create(1, 32, 32, &mut target) };
            assert_eq!(rc, OK);
            assert_ne!(target, 0);
            let rc = vexart_composite_target_set_scissor(1, target, 5, 5, 10, 10);
            assert_eq!(rc, OK);
        }

        // Destroy context
        let rc = vexart_context_destroy(1);
        assert_eq!(rc, OK);

        // Verify SHARED_PAINT was drained
        {
            let paint_guard = lock_or_recover(&SHARED_PAINT);
            assert!(paint_guard.is_none());
        }

        // Verify frame counter and stats were reset
        assert_eq!(FRAME_COUNT.load(Ordering::Relaxed), 1);
        assert_eq!(BUDGET_BYTES.load(Ordering::Relaxed), DEFAULT_BUDGET_BYTES);
        assert_eq!(HIGH_WATER_MARK.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn test_target_scissor_invalid_args() {
        let _lock = lock_or_recover(&TEST_LOCK);
        assert_eq!(
            vexart_composite_target_set_scissor(1, 0, 10, 10, 50, 50),
            ERR_INVALID_ARG
        );
        assert_eq!(
            vexart_composite_target_reset_scissor(1, 0),
            ERR_INVALID_ARG
        );
        assert_eq!(
            vexart_composite_target_set_scissor(1, 999999, 10, 10, 50, 50),
            ERR_INVALID_HANDLE
        );
        assert_eq!(
            vexart_composite_target_reset_scissor(1, 999999),
            ERR_INVALID_HANDLE
        );
    }

    #[test]
    fn test_target_scissor_lifecycle() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 100, 100, &mut target) };
        assert_eq!(rc, OK);
        assert_ne!(target, 0);

        // Initial target has no scissor
        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            let rec = pctx.targets.get(target).unwrap();
            assert_eq!(rec.scissor, None);
        }

        // Set scissor
        let rc = vexart_composite_target_set_scissor(1, target, 10, 20, 30, 40);
        assert_eq!(rc, OK);

        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            let rec = pctx.targets.get(target).unwrap();
            assert_eq!(rec.scissor, Some([10, 20, 30, 40]));
        }

        // Begin layer — active layer inherits scissor
        let rc = vexart_composite_target_begin_layer(1, target, 0, 0);
        assert_eq!(rc, OK);

        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            let rec = pctx.targets.get(target).unwrap();
            let layer = rec.active_layer.as_ref().unwrap();
            assert_eq!(layer.scissor, Some([10, 20, 30, 40]));
        }

        // Update scissor while layer is active
        let rc = vexart_composite_target_set_scissor(1, target, 5, 5, 50, 50);
        assert_eq!(rc, OK);

        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            let rec = pctx.targets.get(target).unwrap();
            assert_eq!(rec.scissor, Some([5, 5, 50, 50]));
            let layer = rec.active_layer.as_ref().unwrap();
            assert_eq!(layer.scissor, Some([5, 5, 50, 50]));
        }

        // Reset scissor while layer is active
        let rc = vexart_composite_target_reset_scissor(1, target);
        assert_eq!(rc, OK);

        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            let rec = pctx.targets.get(target).unwrap();
            assert_eq!(rec.scissor, None);
            let layer = rec.active_layer.as_ref().unwrap();
            assert_eq!(layer.scissor, None);
        }

        // End layer
        let rc = vexart_composite_target_end_layer(1, target);
        assert_eq!(rc, OK);

        // Destroy target
        let rc = vexart_composite_target_destroy(1, target);
        assert_eq!(rc, OK);
    }

    #[test]
    fn test_allocation_exceeding_budget_warns_and_succeeds() {
        let _lock = lock_or_recover(&TEST_LOCK);
        // Set budget to 32MB (the minimum allowed)
        let rc = vexart_resource_set_budget(1, 32);
        assert_eq!(rc, OK);

        // Attempt to create a target exceeding 32MB (4000 × 3000 × 4 = 48,000,000 bytes ≈ 45.7MB)
        // With eviction disarmed, this succeeds without error.
        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 4000, 3000, &mut target) };
        assert_eq!(rc, OK);
        assert_ne!(target, 0);

        // Symmetrically release target
        let rc = vexart_composite_target_destroy(1, target);
        assert_eq!(rc, OK);

        // Reset context to default state
        let rc = vexart_context_destroy(1);
        assert_eq!(rc, OK);
    }

    #[test]
    fn test_copy_region_to_image_clamps_vram_reservation() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let _ = vexart_context_destroy(1);

        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 100, 100, &mut target) };
        assert_eq!(rc, OK);

        let mut out_image = 0u64;
        // Request x=50, y=50, w=2000, h=2000 -> clamped cw=50, ch=50 -> bytes = 10,000
        let rc = unsafe {
            vexart_composite_copy_region_to_image(1, target, 50, 50, 2000, 2000, &mut out_image)
        };
        assert_eq!(rc, OK);
        assert_ne!(out_image, 0);

        // Verify image size in PaintContext is exactly 10,000 bytes (not 16MB)
        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            let img = &pctx.images[&out_image];
            assert_eq!(img.width, 50);
            assert_eq!(img.height, 50);
            assert_eq!(img.size_bytes(), 10_000);
        }

        let _ = vexart_context_destroy(1);
    }

    #[test]
    fn test_image_asset_lifecycle_in_paint_context() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let _ = vexart_context_destroy(1);

        let rgba = [255u8; 16];
        let meta = [2u32, 2u32];
        let mut handle = 0u64;
        let rc = unsafe {
            vexart_image_asset_register(
                1,
                "asset.png".as_ptr(),
                9,
                rgba.as_ptr(),
                16,
                meta.as_ptr() as *const u8,
                &mut handle,
            )
        };
        assert_eq!(rc, OK);
        assert_ne!(handle, 0);

        // Verify touch
        assert_eq!(vexart_image_asset_touch(1, handle), OK);
        assert_eq!(vexart_image_asset_touch(1, 999999), ERR_INVALID_ARG);

        // Retain increments refcount
        assert_eq!(vexart_image_asset_retain(handle), OK);
        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            assert_eq!(pctx.images[&handle].references, 2);
        }

        // Release decrements refcount, image still exists
        assert_eq!(vexart_image_asset_release(handle), OK);
        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            assert_eq!(pctx.images[&handle].references, 1);
        }

        // Second release frees image
        assert_eq!(vexart_image_asset_release(handle), OK);
        {
            let guard = lock_or_recover(&SHARED_PAINT);
            let pctx = guard.as_ref().unwrap();
            assert!(!pctx.images.contains_key(&handle));
        }

        // Third release returns ERR_INVALID_ARG
        assert_eq!(vexart_image_asset_release(handle), ERR_INVALID_ARG);
        assert_eq!(vexart_image_asset_retain(handle), ERR_INVALID_ARG);

        let _ = vexart_context_destroy(1);
    }

    #[test]
    fn test_resource_stats_reports_images_and_targets() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let _ = vexart_context_destroy(1);

        let rgba = [255u8; 16];
        let meta = [2u32, 2u32];
        let mut img_handle = 0u64;
        let rc = unsafe {
            vexart_image_asset_register(
                1,
                "asset.png".as_ptr(),
                9,
                rgba.as_ptr(),
                16,
                meta.as_ptr() as *const u8,
                &mut img_handle,
            )
        };
        assert_eq!(rc, OK);

        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 10, 10, &mut target) };
        assert_eq!(rc, OK);

        let mut buf = [0u8; 1024];
        let mut used = 0u32;
        let rc = unsafe {
            vexart_resource_get_stats(1, buf.as_mut_ptr(), buf.len() as u32, &mut used)
        };
        assert_eq!(rc, OK);
        let json_str = std::str::from_utf8(&buf[..used as usize]).unwrap();
        assert!(json_str.contains("\"ImageSprite\":{\"count\":1,\"bytes\":16}"));
        assert!(json_str.contains("\"LayerTarget\":{\"count\":1,\"bytes\":400}"));
        assert!(json_str.contains("\"currentUsage\":416"));

        let _ = vexart_composite_target_destroy(1, target);
        let _ = vexart_image_asset_release(img_handle);
        let _ = vexart_context_destroy(1);
    }

    #[test]
    fn test_frame_presentation_advances_frame_counter() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let _ = vexart_context_destroy(1);

        let initial_frame = FRAME_COUNT.load(Ordering::Relaxed);
        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 10, 10, &mut target) };
        assert_eq!(rc, OK);

        // Advance presentation
        let advanced = advance_presentation_frame();
        assert_eq!(advanced, initial_frame);
        assert_eq!(FRAME_COUNT.load(Ordering::Relaxed), initial_frame + 1);

        let _ = vexart_context_destroy(1);
        assert_eq!(FRAME_COUNT.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn test_shm_ring_ffi_emit_and_drain_lifecycle() {
        let _lock = lock_or_recover(&TEST_LOCK);
        let _ = vexart_context_destroy(1);

        assert_eq!(vexart_kitty_shm_is_drained(), 1);

        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 8, 8, &mut target) };
        assert_eq!(rc, OK);

        let mut stats = types::NativePresentationStats::default();
        let rc = unsafe { vexart_kitty_emit_frame_shm_ring(1, target, 77771, &mut stats) };
        assert_eq!(rc, OK);
        assert_eq!(stats.transport, types::NativePresentationStats::TRANSPORT_SHM);
        assert_eq!(stats.kitty_bytes_emitted, 8 * 8 * 4);
        assert_ne!(stats.total_us, 0);
        assert_eq!(vexart_kitty_shm_is_drained(), 0);

        // Placeholder ring emit
        let params: [u32; 5] = [77772, 1, 5, 5, 1];
        let mut placeholder_stats = types::NativePresentationStats::default();
        let rc = unsafe {
            vexart_kitty_emit_placeholder_shm_ring(
                1,
                target,
                params.as_ptr(),
                20,
                &mut placeholder_stats,
            )
        };
        assert_eq!(rc, OK);
        assert_eq!(placeholder_stats.transport, types::NativePresentationStats::TRANSPORT_SHM);
        assert_eq!(vexart_kitty_shm_is_drained(), 0);

        // Cleanup drains everything
        assert_eq!(vexart_kitty_shm_cleanup_all(), OK);
        assert_eq!(vexart_kitty_shm_is_drained(), 1);

        let _ = vexart_context_destroy(1);
    }
}
