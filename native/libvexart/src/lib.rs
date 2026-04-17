// native/libvexart/src/lib.rs
// All 20 #[no_mangle] pub extern "C" FFI exports for libvexart.
// Every export wraps its body in ffi_guard! for panic safety.
// Per design §5, REQ-NB-003.

pub mod composite;
pub mod ffi;
pub mod kitty;
pub mod layout;
pub mod paint;
pub mod text;
pub mod types;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard};

use ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, OK};
use types::FrameStats;

// ─── Single shared PaintContext (lazy-initialized, persisted across all FFI calls) ──
// One PaintContext owns: WgpuContext (Instance/Adapter/Device/Queue + 13 pipelines +
// image bind group layout) + image registry + render target. Initializing wgpu costs
// 200-300ms (adapter request, device, shader compilation, pipeline creation), so we
// MUST persist it across vexart_paint_dispatch / vexart_paint_upload_image /
// vexart_paint_remove_image calls. Recreating per call would cap render rate at 3-5 fps
// and would break image handles (cross-device texture references). Per design §17,
// post-Apply #2a architectural fix.

static NEXT_IMAGE_HANDLE: AtomicU64 = AtomicU64::new(1);

static SHARED_PAINT: LazyLock<Mutex<Option<paint::PaintContext>>> =
    LazyLock::new(|| Mutex::new(None));

fn get_or_init_paint() -> MutexGuard<'static, Option<paint::PaintContext>> {
    let mut guard = SHARED_PAINT.lock().unwrap();
    if guard.is_none() {
        *guard = Some(paint::PaintContext::new());
    }
    guard
}

// ─── Single shared LayoutContext (lazy-initialized, persisted across all layout FFI calls) ──
// Mirrors the SHARED_PAINT pattern from commit cd4297f. One LayoutContext owns a TaffyTree
// and stable ID map (HashMap<u64, NodeId>) that MUST be retained across frames so that
// incremental node updates work correctly (set_style on existing nodes rather than recreating).
// The `ctx: u64` parameter is accepted but ignored in Phase 2 (TODO Phase 3: per-context
// isolation). vexart_context_resize updates the viewport on this singleton.
//
// SendableLayoutContext wraps LayoutContext to mark it Send + Sync.
// SAFETY: Bun's JS runtime is single-threaded. All FFI calls arrive on the same OS thread.
// The Mutex ensures exclusive access. TaffyTree's CompactLength contains a *const () for
// CSS calc() expressions (unused in Vexart Phase 2); the pointer never crosses thread
// boundaries. This is the same pattern used for SHARED_PAINT (wgpu NonNull pointers).
struct SendableLayoutContext(Option<layout::LayoutContext>);
// SAFETY: See comment above.
unsafe impl Send for SendableLayoutContext {}
unsafe impl Sync for SendableLayoutContext {}

static SHARED_LAYOUT: LazyLock<Mutex<SendableLayoutContext>> =
    LazyLock::new(|| Mutex::new(SendableLayoutContext(None)));

fn get_or_init_layout() -> MutexGuard<'static, SendableLayoutContext> {
    let mut guard = SHARED_LAYOUT.lock().unwrap();
    if guard.0.is_none() {
        guard.0 = Some(layout::LayoutContext::new());
    }
    guard
}

// ─── §5.1 Version & lifecycle ─────────────────────────────────────────────

/// Returns the Phase 2.0 bridge version constant (0x00020000).
/// TS mount path checks this against EXPECTED_BRIDGE_VERSION. Per design §12 rule 2.
#[no_mangle]
pub extern "C" fn vexart_version() -> u32 {
    0x00020000
}

/// Allocates PaintContext + LayoutContext; returns opaque handle in `out_ctx`.
///
/// # Safety
/// `opts_ptr` must be valid for `opts_len` bytes; `out_ctx` must be a valid mutable pointer.
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
        // Phase 2 stub: return a dummy non-zero handle.
        *out_ctx = 1;
        OK
    })
}

/// Drops all GPU resources + Taffy tree associated with `ctx`.
#[no_mangle]
pub extern "C" fn vexart_context_destroy(ctx: u64) -> i32 {
    ffi_guard!({
        let _ = ctx;
        OK
    })
}

/// Resizes surface + invalidates size-dependent resources.
///
/// Updates the SHARED_LAYOUT viewport so that subsequent `vexart_layout_compute` calls
/// use the correct terminal dimensions.
///
/// TODO Phase 3: The `ctx: u64` parameter will select a per-context layout instance.
/// Currently all contexts share SHARED_LAYOUT (Phase 2 single-context model).
#[no_mangle]
pub extern "C" fn vexart_context_resize(ctx: u64, width: u32, height: u32) -> i32 {
    ffi_guard!({
        let _ = ctx; // Phase 2: single context; ctx parameter ignored.
        if width > 0 && height > 0 {
            let mut guard = get_or_init_layout();
            if let Some(lctx) = guard.0.as_mut() {
                lctx.set_viewport(width as f32, height as f32);
            }
        }
        OK
    })
}

// ─── §5.2 Layout ─────────────────────────────────────────────────────────

/// Build Taffy tree from flat command buffer, compute layout, write PositionedCommand[] to out.
///
/// # Safety
/// `cmds_ptr` must be valid for `cmds_len` bytes; `out_ptr` must be valid for `out_cap` bytes;
/// `out_used` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_layout_compute(
    ctx: u64,
    cmds_ptr: *const u8,
    cmds_len: u32,
    out_ptr: *mut u8,
    out_cap: u32,
    out_used: *mut u32,
) -> i32 {
    ffi_guard!({
        let _ = ctx;
        if out_used.is_null() {
            return ERR_INVALID_ARG;
        }
        let cmds = if cmds_ptr.is_null() || cmds_len == 0 {
            &[][..]
        } else {
            std::slice::from_raw_parts(cmds_ptr, cmds_len as usize)
        };
        let out = if out_ptr.is_null() || out_cap == 0 {
            &mut [][..]
        } else {
            std::slice::from_raw_parts_mut(out_ptr, out_cap as usize)
        };
        let mut used = 0u32;
        let code = {
            let mut guard = get_or_init_layout();
            let lctx = guard.0.as_mut().unwrap();
            lctx.compute(cmds, out, &mut used)
        };
        *out_used = used;
        code
    })
}

/// Phase 2: writes `0.0`, `0.0` (DEC-011 text measure stub).
///
/// # Safety
/// All pointer args must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_layout_measure(
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
        let text = if text_ptr.is_null() || text_len == 0 {
            &[][..]
        } else {
            std::slice::from_raw_parts(text_ptr, text_len as usize)
        };
        // DEC-011: measure returns (0.0, 0.0) per Phase 2 text stub.
        // Routed through SHARED_LAYOUT singleton for consistency.
        let guard = get_or_init_layout();
        let lctx = guard.0.as_ref().unwrap();
        lctx.measure(text, font_id, font_size, &mut *out_w, &mut *out_h)
    })
}

/// Back-channel for node handle updates (e.g. scroll offsets).
///
/// # Safety
/// `writeback_ptr` must be valid for `writeback_len` bytes.
#[no_mangle]
pub unsafe extern "C" fn vexart_layout_writeback(
    _ctx: u64,
    writeback_ptr: *const u8,
    writeback_len: u32,
) -> i32 {
    ffi_guard!({
        let wb = if writeback_ptr.is_null() || writeback_len == 0 {
            &[][..]
        } else {
            std::slice::from_raw_parts(writeback_ptr, writeback_len as usize)
        };
        // Parse writeback buffer (scroll offsets). Currently a validation no-op
        // until Slice 9 wires scroll offsets into the paint layer.
        let mut guard = get_or_init_layout();
        let lctx = guard.0.as_mut().unwrap();
        lctx.writeback(wb)
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

        // Sampler is held alive internally by bind_group's Arc — drop here is OK.
        let _ = sampler;

        let handle = NEXT_IMAGE_HANDLE.fetch_add(1, Ordering::Relaxed);
        pctx.images.insert(
            handle,
            paint::ImageRecord {
                texture,
                view,
                bind_group,
            },
        );

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

/// Blocking GPU→CPU readback of full target. Phase 2 stub.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_readback_rgba(
    ctx: u64,
    target: u64,
    dst: *mut u8,
    dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({ composite::readback_rgba(ctx, target, dst, dst_cap, stats_out) })
}

/// Region readback; `rect_ptr` = 4×u32 (x,y,w,h). Phase 2 stub.
///
/// # Safety
/// `rect_ptr` must be valid for 16 bytes; `dst` must be valid for `dst_cap` bytes.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_readback_region_rgba(
    ctx: u64,
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
        composite::readback_region_rgba(ctx, target, rect, dst, dst_cap, stats_out)
    })
}

// ─── §5.5 Text stubs (DEC-011 / REQ-NB-005) ─────────────────────────────

/// Success no-op atlas load. Phase 2 stub.
///
/// # Safety
/// `atlas_ptr` must be valid for `atlas_len` bytes if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_text_load_atlas(
    ctx: u64,
    atlas_ptr: *const u8,
    atlas_len: u32,
    font_id: u32,
) -> i32 {
    ffi_guard!({ text::load_atlas(ctx, atlas_ptr, atlas_len, font_id) })
}

/// Success no-op. First call emits DEC-011 warning. Phase 2 stub.
///
/// # Safety
/// `glyphs_ptr` must be valid for `glyphs_len` bytes if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_text_dispatch(
    ctx: u64,
    glyphs_ptr: *const u8,
    glyphs_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({ text::dispatch(ctx, glyphs_ptr, glyphs_len, stats_out) })
}

/// Writes `*out_w = 0.0; *out_h = 0.0`. Phase 2 stub per DEC-011.
///
/// # Safety
/// `out_w` and `out_h` must be valid mutable f32 pointers.
#[no_mangle]
pub unsafe extern "C" fn vexart_text_measure(
    ctx: u64,
    text_ptr: *const u8,
    text_len: u32,
    font_id: u32,
    font_size: f32,
    out_w: *mut f32,
    out_h: *mut f32,
) -> i32 {
    ffi_guard!({ text::measure(ctx, text_ptr, text_len, font_id, font_size, out_w, out_h) })
}

// ─── §5.6 Kitty SHM transport ────────────────────────────────────────────

/// POSIX SHM prepare (shm_open + ftruncate + mmap + memcpy + munmap). Phase 2 Slice 2 stub.
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

/// POSIX SHM release (close + optional shm_unlink). Phase 2 Slice 2 stub.
#[no_mangle]
pub extern "C" fn vexart_kitty_shm_release(handle: u64, unlink_flag: u32) -> i32 {
    ffi_guard!({ kitty::shm::shm_release(handle, unlink_flag) })
}

// ─── §5.7 Error retrieval (re-exported from ffi::error) ──────────────────
// vexart_get_last_error_length and vexart_copy_last_error are defined in
// native/libvexart/src/ffi/error.rs with #[no_mangle] — they are exported
// directly from that module, no wrapper needed here.
