// native/libvexart/src/ffi/kitty.rs
// Kitty graphics protocol transport, SHM buffers, and frame emission FFI exports.

use crate::ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, OK};
use crate::ffi_guard;
use crate::kitty;
use crate::types;
use crate::advance_presentation_frame;

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
        let mut guard = crate::get_or_init_paint();
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
        let mut guard = crate::get_or_init_paint();
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
        let mut guard = crate::get_or_init_paint();
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
        let mut guard = crate::get_or_init_paint();
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
        let mut guard = crate::get_or_init_paint();
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

