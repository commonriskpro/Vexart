//! Kitty Unicode-placeholder presentation for tmux passthrough.
//!
//! Graphics APCs are sent through tmux's DCS passthrough one command at a
//! time. The visible part of a frame is ordinary UTF-8 text: U+10EEEE plus
//! row/column/high-image-id combining marks and a true-colour foreground.
//! This lets tmux (and applications inside it) retain and redraw the image
//! cells without understanding the graphics protocol.

#[path = "placeholder_grid.rs"]
pub mod placeholder_grid;
#[path = "placeholder_apc.rs"]
pub mod placeholder_apc;

pub use placeholder_apc::{
    assemble_output_for_image, assemble_shm_output, delete_apc, encode_shm_upload_apc,
    encode_upload_apcs, make_apc, prepare_frame, PreparedFrame, CHUNK_SIZE,
};
pub use placeholder_grid::{encode_grid, push_codepoint, validate_dimensions, PLACEHOLDER};

#[cfg(test)]
pub(super) use crate::kitty::diacritics::ROW_COLUMN_DIACRITICS;
#[cfg(test)]
pub(super) use base64::engine::general_purpose::STANDARD as B64;
#[cfg(test)]
pub(super) use base64::Engine;

use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};
use std::time::Instant;

use super::shm::{
    shm_prepare_native, shm_prepare_ring, shm_release, shm_ring_fail_closed,
    shm_ring_mark_in_flight,
};
use super::transport::{do_readback_with, resolve_target_dims};
use super::writer::{wrap_tmux_apc, write_to_stdout};
use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};
use crate::paint::PaintContext;
use crate::types::NativePresentationStats;

static OWNED_IMAGES: LazyLock<Mutex<HashSet<u32>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

#[derive(Debug, Default)]
struct EmitOutcome {
    rc: i32,
    kitty_bytes: u64,
    readback_us: u64,
    encode_us: u64,
    write_us: u64,
    raw_bytes: u64,
    payload_bytes: u64,
    compress_us: u64,
    compressed: bool,
}

#[derive(Debug, Default)]
struct ShmEmitOutcome {
    rc: i32,
    handle: u64,
    kitty_bytes: u64,
    readback_us: u64,
    encode_us: u64,
    write_us: u64,
    shm_prepare_us: u64,
    raw_bytes: u64,
    payload_bytes: u64,
}

struct ShmPlaceholderParams {
    image_id: u32,
    placement_id: u32,
    cols: u32,
    rows: u32,
    emit_grid: bool,
}

#[derive(Copy, Clone)]
enum ShmBackend {
    Native,
    Ring,
}

fn owned_lock() -> std::sync::MutexGuard<'static, HashSet<u32>> {
    OWNED_IMAGES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn image_is_owned(image_id: u32) -> bool {
    owned_lock().contains(&image_id)
}

fn record_success(image_id: u32) {
    owned_lock().insert(image_id);
}

fn forget_success(image_id: u32) {
    owned_lock().remove(&image_id);
}

fn parse_shm_params(params: *const u32, params_len: u32) -> Result<ShmPlaceholderParams, i32> {
    let expected_params_len = 5 * std::mem::size_of::<u32>() as u32;
    if params.is_null() || params_len != expected_params_len {
        set_last_error(format!(
            "placeholder SHM params must be non-null and exactly {expected_params_len} bytes"
        ));
        return Err(ERR_INVALID_ARG);
    }
    // SAFETY: the pointer and exact byte length were validated above.
    let slice = unsafe { std::slice::from_raw_parts(params, 5) };
    let image_id = slice[0];
    let placement_id = slice[1];
    let cols = slice[2];
    let rows = slice[3];
    let emit_grid = slice[4];
    if image_id == 0 || placement_id == 0 {
        set_last_error("placeholder SHM image and placement IDs must be non-zero");
        return Err(ERR_INVALID_ARG);
    }
    if emit_grid > 1 {
        set_last_error("placeholder SHM grid-emission flag must be 0 or 1");
        return Err(ERR_INVALID_ARG);
    }
    Ok(ShmPlaceholderParams {
        image_id,
        placement_id,
        cols,
        rows,
        emit_grid: emit_grid != 0,
    })
}

fn emit_readback(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    cols: u32,
    rows: u32,
    expected_len: usize,
    readback_us: u64,
) -> EmitOutcome {
    if rgba.len() != expected_len {
        let message = format!(
            "placeholder readback length {} does not match target RGBA size {expected_len}",
            rgba.len()
        );
        set_last_error(message);
        return EmitOutcome {
            rc: ERR_KITTY_TRANSPORT,
            readback_us,
            raw_bytes: rgba.len() as u64,
            ..EmitOutcome::default()
        };
    }

    let t_encode = Instant::now();
    let prepared = match prepare_frame(rgba, width, height, image_id, cols, rows) {
        Ok(prepared) => prepared,
        Err(error) => {
            set_last_error(format!("placeholder frame encoding failed: {error}"));
            return EmitOutcome {
                rc: ERR_KITTY_TRANSPORT,
                readback_us,
                encode_us: t_encode.elapsed().as_micros() as u64,
                raw_bytes: rgba.len() as u64,
                ..EmitOutcome::default()
            };
        }
    };
    let encode_us = t_encode.elapsed().as_micros() as u64;
    let t_write = Instant::now();
    let write_result = write_to_stdout(&prepared.output);
    let write_us = t_write.elapsed().as_micros() as u64;
    match write_result {
        Ok(()) => {
            record_success(image_id);
            EmitOutcome {
                rc: OK,
                kitty_bytes: prepared.output.len() as u64,
                readback_us,
                encode_us,
                write_us,
                raw_bytes: prepared.raw_bytes,
                payload_bytes: prepared.payload_bytes,
                compress_us: prepared.compress_us,
                compressed: true,
            }
        }
        Err(error) => {
            set_last_error(format!("placeholder stdout write failed: {error}"));
            EmitOutcome {
                rc: ERR_KITTY_TRANSPORT,
                readback_us,
                encode_us,
                write_us,
                raw_bytes: prepared.raw_bytes,
                payload_bytes: prepared.payload_bytes,
                compress_us: prepared.compress_us,
                compressed: true,
                ..EmitOutcome::default()
            }
        }
    }
}

fn emit_shm_readback(
    rgba: &[u8],
    width: u32,
    height: u32,
    params: &ShmPlaceholderParams,
    expected_len: usize,
    readback_us: u64,
    backend: ShmBackend,
) -> ShmEmitOutcome {
    let raw_bytes = rgba.len() as u64;
    if rgba.len() != expected_len {
        set_last_error(format!(
            "placeholder SHM readback length {} does not match target RGBA size {expected_len}",
            rgba.len()
        ));
        return ShmEmitOutcome {
            rc: ERR_KITTY_TRANSPORT,
            readback_us,
            raw_bytes,
            ..ShmEmitOutcome::default()
        };
    }

    let t_grid = Instant::now();
    let grid = match params
        .emit_grid
        .then(|| encode_grid(params.image_id, params.cols, params.rows))
        .transpose()
    {
        Ok(grid) => grid,
        Err(error) => {
            set_last_error(format!("placeholder SHM grid encoding failed: {error}"));
            return ShmEmitOutcome {
                rc: ERR_KITTY_TRANSPORT,
                readback_us,
                encode_us: t_grid.elapsed().as_micros() as u64,
                raw_bytes,
                ..ShmEmitOutcome::default()
            };
        }
    };
    let grid_encode_us = t_grid.elapsed().as_micros() as u64;

    let t_prepare = Instant::now();
    let prepared = match backend {
        ShmBackend::Native => shm_prepare_native(rgba).map(|(handle, name)| (handle, name, false)),
        ShmBackend::Ring => {
            shm_prepare_ring(rgba).map(|(slot_index, name)| (slot_index as u64, name, true))
        }
    };
    let (handle, name, is_ring) = match prepared {
        Ok(res) => res,
        Err(rc) => {
            return ShmEmitOutcome {
                rc,
                readback_us,
                encode_us: grid_encode_us,
                shm_prepare_us: t_prepare.elapsed().as_micros() as u64,
                raw_bytes,
                ..ShmEmitOutcome::default()
            };
        }
    };
    let shm_prepare_us = t_prepare.elapsed().as_micros() as u64;

    let t_encode = Instant::now();
    let upload_apc = encode_shm_upload_apc(
        &name,
        rgba.len(),
        width,
        height,
        params.image_id,
        params.placement_id,
        params.cols,
        params.rows,
    );
    let output = assemble_shm_output(&upload_apc, grid.as_deref());
    let encode_us = grid_encode_us + t_encode.elapsed().as_micros() as u64;
    let t_write = Instant::now();
    record_success(params.image_id);
    let write_result = write_to_stdout(&output);
    let write_us = t_write.elapsed().as_micros() as u64;
    match write_result {
        Ok(()) => {
            if is_ring {
                shm_ring_mark_in_flight(handle as usize);
            }
            ShmEmitOutcome {
                rc: OK,
                handle,
                kitty_bytes: output.len() as u64,
                readback_us,
                encode_us,
                write_us,
                shm_prepare_us,
                raw_bytes,
                payload_bytes: rgba.len() as u64,
            }
        }
        Err(error) => {
            let _ = write_to_stdout(&wrap_tmux_apc(&delete_apc(params.image_id)));
            forget_success(params.image_id);
            if is_ring {
                shm_ring_fail_closed(handle as usize);
            } else {
                let _ = shm_release(handle, 1);
            }
            set_last_error(format!("placeholder SHM stdout write failed: {error}"));
            ShmEmitOutcome {
                rc: ERR_KITTY_TRANSPORT,
                readback_us,
                encode_us,
                write_us,
                shm_prepare_us,
                raw_bytes,
                payload_bytes: rgba.len() as u64,
                ..ShmEmitOutcome::default()
            }
        }
    }
}

fn write_stats(stats_out: *mut NativePresentationStats, outcome: &EmitOutcome, total_us: u64) {
    if stats_out.is_null() {
        return;
    }
    // SAFETY: the FFI contract requires stats_out to point to writable storage
    // when non-null. The caller is wrapped in ffi_guard for panic safety.
    unsafe {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_FINAL_FRAME;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = outcome.kitty_bytes;
        stats.readback_us = outcome.readback_us;
        stats.encode_us = outcome.encode_us;
        stats.write_us = outcome.write_us;
        stats.total_us = total_us;
        stats.transport = NativePresentationStats::TRANSPORT_DIRECT;
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
        stats.compress_us = outcome.compress_us;
        stats.shm_prepare_us = 0;
        stats.raw_bytes = outcome.raw_bytes;
        stats.payload_bytes = outcome.payload_bytes;
        if outcome.compressed {
            stats.flags |= NativePresentationStats::FLAG_COMPRESSED;
        }
    }
}

fn write_shm_stats(
    stats_out: *mut NativePresentationStats,
    outcome: &ShmEmitOutcome,
    total_us: u64,
) {
    if stats_out.is_null() {
        return;
    }
    // SAFETY: the FFI contract requires stats_out to point to writable storage
    // when non-null. The caller is wrapped in ffi_guard for panic safety.
    unsafe {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_FINAL_FRAME;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = outcome.kitty_bytes;
        stats.readback_us = outcome.readback_us;
        stats.encode_us = outcome.encode_us;
        stats.write_us = outcome.write_us;
        stats.total_us = total_us;
        stats.transport = NativePresentationStats::TRANSPORT_SHM;
        stats.flags = NativePresentationStats::FLAG_NATIVE_USED;
        if outcome.rc == OK {
            stats.flags |= NativePresentationStats::FLAG_VALID;
        }
        stats.compress_us = 0;
        stats.shm_prepare_us = outcome.shm_prepare_us;
        stats.raw_bytes = outcome.raw_bytes;
        stats.payload_bytes = outcome.payload_bytes;
    }
}

/// Emit one complete GPU target as a tmux-safe Kitty Unicode-placeholder frame.
///
/// `cols` and `rows` are cell dimensions, each in the inclusive range 1..=297
/// dictated by Kitty's official row/column diacritic table. Pixel dimensions
/// are read from the target and must be non-zero and fit a `usize` RGBA buffer.
/// Every invocation retransmits the full frame (Ghostty 1.3.1 does not support
/// Kitty animation). The TypeScript render loop suppresses no-damage calls;
/// this stateless path recreates the image and grid whenever the caller
/// requests a repaint, including after resume.
///
/// # Safety
/// `stats_out` must point to writable `NativePresentationStats` storage or be
/// null. The target is owned by the supplied paint context.
pub unsafe fn emit_placeholder_frame(
    pctx: &mut PaintContext,
    target: u64,
    image_id: u32,
    cols: u32,
    rows: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let total_start = Instant::now();
    if image_id == 0 {
        set_last_error("placeholder image id must be non-zero");
        return ERR_INVALID_ARG;
    }
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(dimensions) => dimensions,
        None => {
            set_last_error(format!("placeholder: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let expected_len = match validate_dimensions(width, height, cols, rows) {
        Ok(length) => length,
        Err(error) => {
            set_last_error(format!("placeholder: {error}"));
            return ERR_INVALID_ARG;
        }
    };

    let readback_start = Instant::now();
    let outcome = do_readback_with(pctx, target, width, height, |rgba| {
        emit_readback(
            rgba,
            width,
            height,
            image_id,
            cols,
            rows,
            expected_len,
            readback_start.elapsed().as_micros() as u64,
        )
    });
    let Some(outcome) = outcome else {
        set_last_error("placeholder: GPU readback returned no bytes");
        return ERR_KITTY_TRANSPORT;
    };
    write_stats(
        stats_out,
        &outcome,
        total_start.elapsed().as_micros() as u64,
    );
    outcome.rc
}

/// Emit a full GPU target through tmux using one Kitty POSIX-SHM upload.
///
/// `params` is exactly 20 bytes containing five native-endian `u32` values:
/// image ID, virtual-placement token, cell columns, cell rows, and a boolean
/// grid-emission flag. The returned handle remains registered until the
/// caller observes `vexart_kitty_shm_is_consumed` and releases it.
pub unsafe fn emit_placeholder_shm_frame(
    pctx: &mut PaintContext,
    target: u64,
    params: *const u32,
    params_len: u32,
    out_handle: *mut u64,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    if !out_handle.is_null() {
        // SAFETY: out_handle was checked non-null and is required writable by
        // the FFI contract.
        unsafe { *out_handle = 0 };
    }
    if out_handle.is_null() {
        set_last_error("placeholder SHM output handle pointer is null");
        return ERR_INVALID_ARG;
    }
    let parsed = match parse_shm_params(params, params_len) {
        Ok(p) => p,
        Err(rc) => return rc,
    };

    let total_start = Instant::now();
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(dimensions) => dimensions,
        None => {
            set_last_error(format!("placeholder SHM: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let expected_len = match validate_dimensions(width, height, parsed.cols, parsed.rows) {
        Ok(length) => length,
        Err(error) => {
            set_last_error(format!("placeholder SHM: {error}"));
            return ERR_INVALID_ARG;
        }
    };

    let readback_start = Instant::now();
    let outcome = do_readback_with(pctx, target, width, height, |rgba| {
        emit_shm_readback(
            rgba,
            width,
            height,
            &parsed,
            expected_len,
            readback_start.elapsed().as_micros() as u64,
            ShmBackend::Native,
        )
    });
    let Some(outcome) = outcome else {
        set_last_error("placeholder SHM: GPU readback returned no bytes");
        let outcome = ShmEmitOutcome {
            rc: ERR_KITTY_TRANSPORT,
            ..ShmEmitOutcome::default()
        };
        write_shm_stats(
            stats_out,
            &outcome,
            total_start.elapsed().as_micros() as u64,
        );
        return outcome.rc;
    };
    if outcome.rc == OK {
        // SAFETY: out_handle is non-null and points to writable storage as
        // required by this FFI boundary.
        unsafe { *out_handle = outcome.handle };
    }
    write_shm_stats(
        stats_out,
        &outcome,
        total_start.elapsed().as_micros() as u64,
    );
    outcome.rc
}

/// Emit a full GPU target through tmux using the fixed SHM ring buffer with backpressure.
pub unsafe fn emit_placeholder_shm_ring(
    pctx: &mut PaintContext,
    target: u64,
    params: *const u32,
    params_len: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let parsed = match parse_shm_params(params, params_len) {
        Ok(p) => p,
        Err(rc) => return rc,
    };

    let total_start = Instant::now();
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(dimensions) => dimensions,
        None => {
            set_last_error(format!("placeholder SHM: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let expected_len = match validate_dimensions(width, height, parsed.cols, parsed.rows) {
        Ok(length) => length,
        Err(error) => {
            set_last_error(format!("placeholder SHM: {error}"));
            return ERR_INVALID_ARG;
        }
    };

    let readback_start = Instant::now();
    let outcome = do_readback_with(pctx, target, width, height, |rgba| {
        emit_shm_readback(
            rgba,
            width,
            height,
            &parsed,
            expected_len,
            readback_start.elapsed().as_micros() as u64,
            ShmBackend::Ring,
        )
    });
    let Some(outcome) = outcome else {
        set_last_error("placeholder SHM: GPU readback returned no bytes");
        let outcome = ShmEmitOutcome {
            rc: ERR_KITTY_TRANSPORT,
            ..ShmEmitOutcome::default()
        };
        write_shm_stats(
            stats_out,
            &outcome,
            total_start.elapsed().as_micros() as u64,
        );
        return outcome.rc;
    };
    write_shm_stats(
        stats_out,
        &outcome,
        total_start.elapsed().as_micros() as u64,
    );
    outcome.rc
}

/// Delete only a placeholder image successfully owned by this process.
///
/// The uppercase `d=I` action removes the image data as well as its virtual
/// placement. Unknown IDs are a no-op so another Kitty client cannot be
/// accidentally deleted. Ownership is removed only after the write succeeds.
pub fn delete_placeholder(image_id: u32) -> i32 {
    if image_id == 0 {
        set_last_error("placeholder image id must be non-zero");
        return ERR_INVALID_ARG;
    }
    if !image_is_owned(image_id) {
        return OK;
    }
    let escaped = wrap_tmux_apc(&delete_apc(image_id));
    match write_to_stdout(&escaped) {
        Ok(()) => {
            forget_success(image_id);
            OK
        }
        Err(error) => {
            set_last_error(format!("placeholder delete stdout write failed: {error}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

/// FFI entry point for deleting an owned tmux placeholder image.
#[no_mangle]
pub extern "C" fn vexart_kitty_delete_placeholder(ctx: u64, image_id: u32) -> i32 {
    let _ = ctx;
    crate::ffi_guard!({ delete_placeholder(image_id) })
}

#[cfg(test)]
#[path = "placeholder_tests.rs"]
mod tests;
