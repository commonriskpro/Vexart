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

use ffi::panic::{ERR_INVALID_ARG, OK};
use types::FrameStats;

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
#[no_mangle]
pub extern "C" fn vexart_context_resize(ctx: u64, width: u32, height: u32) -> i32 {
    ffi_guard!({
        let _ = (ctx, width, height);
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
            let mut lctx = layout::LayoutContext::new();
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
        let lctx = layout::LayoutContext::new();
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
        let mut lctx = layout::LayoutContext::new();
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
        let mut pctx = paint::PaintContext::new();
        pctx.dispatch(target, graph, stats_out)
    })
}

/// RGBA/BGRA → GPU texture; returns handle in `out_image`. Phase 2 stub.
///
/// # Safety
/// `image_ptr` must be valid for `image_len` bytes; `out_image` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_paint_upload_image(
    ctx: u64,
    image_ptr: *const u8,
    image_len: u32,
    width: u32,
    height: u32,
    format: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        let _ = (ctx, image_ptr, image_len, width, height, format);
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        *out_image = 0;
        OK
    })
}

/// Free GPU texture. Phase 2 stub.
#[no_mangle]
pub extern "C" fn vexart_paint_remove_image(ctx: u64, image: u64) -> i32 {
    ffi_guard!({
        let _ = (ctx, image);
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
