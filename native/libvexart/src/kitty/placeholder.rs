//! Kitty Unicode-placeholder presentation for tmux passthrough.
//!
//! Graphics APCs are sent through tmux's DCS passthrough one command at a
//! time. The visible part of a frame is ordinary UTF-8 text: U+10EEEE plus
//! row/column/high-image-id combining marks and a true-colour foreground.
//! This lets tmux (and applications inside it) retain and redraw the image
//! cells without understanding the graphics protocol.

use std::collections::HashSet;
use std::ffi::CStr;
use std::sync::{LazyLock, Mutex};
use std::time::Instant;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;

use super::diacritics::ROW_COLUMN_DIACRITICS;
use super::encoder::compress_rgba;
use super::shm::{shm_prepare_native, shm_release};
use super::transport::{do_readback_with, resolve_target_dims};
use super::writer::{wrap_tmux_apc, write_to_stdout};
use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};
use crate::paint::PaintContext;
use crate::types::NativePresentationStats;

const CHUNK_SIZE: usize = 4096;
const PLACEHOLDER: u32 = 0x10_EEEE;

static OWNED_IMAGES: LazyLock<Mutex<HashSet<u32>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

#[derive(Debug)]
struct PreparedFrame {
    output: Vec<u8>,
    raw_bytes: u64,
    payload_bytes: u64,
    compress_us: u64,
}

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

/// The official Kitty table contains 297 marks, so each placeholder axis can
/// encode values 0..=296. Dimensions, rather than indices, therefore have a
/// maximum of 297 cells. Keeping this bound explicit avoids silently wrapping
/// large coordinates to a different image cell.
fn validate_dimensions(width: u32, height: u32, cols: u32, rows: u32) -> Result<usize, String> {
    if width == 0 || height == 0 {
        return Err("placeholder target dimensions must be non-zero".to_string());
    }
    if cols == 0 || rows == 0 {
        return Err("placeholder grid dimensions must be non-zero".to_string());
    }
    let max = ROW_COLUMN_DIACRITICS.len() as u32;
    if cols > max || rows > max {
        return Err(format!(
            "placeholder grid dimensions {cols}x{rows} exceed the Kitty diacritic bound {max}x{max}"
        ));
    }
    (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "placeholder target dimensions overflow RGBA byte count".to_string())
}

fn push_codepoint(output: &mut Vec<u8>, codepoint: u32) -> Result<(), String> {
    let character = char::from_u32(codepoint)
        .ok_or_else(|| format!("invalid placeholder codepoint U+{codepoint:06X}"))?;
    let mut bytes = [0u8; 4];
    output.extend_from_slice(character.encode_utf8(&mut bytes).as_bytes());
    Ok(())
}

fn encode_grid(image_id: u32, cols: u32, rows: u32) -> Result<Vec<u8>, String> {
    let cell_count = (cols as usize)
        .checked_mul(rows as usize)
        .ok_or_else(|| "placeholder grid cell count overflow".to_string())?;
    let mut grid = Vec::with_capacity(cell_count.saturating_mul(16) + rows as usize * 12 + 32);
    let red = (image_id >> 16) & 0xff;
    let green = (image_id >> 8) & 0xff;
    let blue = image_id & 0xff;
    grid.extend_from_slice(format!("\x1b[38;2;{red};{green};{blue}m").as_bytes());

    for row in 0..rows {
        // Position each row directly. No newline is emitted, so a bottom-right
        // cell cannot trigger a scroll even in terminals with unusual wrapping.
        grid.extend_from_slice(format!("\x1b[{};1H", row + 1).as_bytes());
        let row_mark = ROW_COLUMN_DIACRITICS[row as usize];
        for col in 0..cols {
            push_codepoint(&mut grid, PLACEHOLDER)?;
            push_codepoint(&mut grid, row_mark)?;
            push_codepoint(&mut grid, ROW_COLUMN_DIACRITICS[col as usize])?;
            // Always include the high byte. Omitting it relies on the cell to
            // the left and breaks when tmux horizontally clips or redraws text.
            push_codepoint(
                &mut grid,
                ROW_COLUMN_DIACRITICS[(image_id >> 24) as usize & 0xff],
            )?;
        }
    }
    grid.extend_from_slice(b"\x1b[39m");
    Ok(grid)
}

fn make_apc(header: &str, payload: &[u8]) -> Vec<u8> {
    let mut apc = Vec::with_capacity(header.len() + payload.len() + 2);
    apc.extend_from_slice(header.as_bytes());
    apc.extend_from_slice(payload);
    apc.extend_from_slice(b"\x1b\\");
    apc
}

fn encode_upload_apcs(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    cols: u32,
    rows: u32,
) -> Result<(Vec<Vec<u8>>, u64, u64, bool), String> {
    let t_compress = Instant::now();
    let compressed =
        compress_rgba(rgba).map_err(|error| format!("zlib compression failed: {error}"))?;
    let compress_us = t_compress.elapsed().as_micros() as u64;
    let encoded = B64.encode(&compressed);
    let chunks: Vec<&[u8]> = encoded.as_bytes().chunks(CHUNK_SIZE).collect();
    if chunks.is_empty() {
        return Err("zlib produced an empty payload".to_string());
    }

    let mut apcs = Vec::with_capacity(chunks.len());
    chunks.iter().enumerate().for_each(|(index, chunk)| {
        let first = index == 0;
        let last = index + 1 == chunks.len();
        let header = if first {
            format!(
                "\x1b_Ga=T,U=1,f=32,s={width},v={height},i={image_id},p=1,c={cols},r={rows},C=1,q=2,o=z,m={};",
                if last { 0 } else { 1 }
            )
        } else {
            format!("\x1b_Gm={};", if last { 0 } else { 1 })
        };
        apcs.push(make_apc(&header, chunk));
    });
    Ok((apcs, compressed.len() as u64, compress_us, true))
}

fn delete_apc(image_id: u32) -> Vec<u8> {
    make_apc(&format!("\x1b_Ga=d,d=I,i={image_id},q=2;"), &[])
}

fn encode_shm_upload_apc(
    name: &CStr,
    payload_len: usize,
    width: u32,
    height: u32,
    image_id: u32,
    placement_id: u32,
    cols: u32,
    rows: u32,
) -> Vec<u8> {
    let name_b64 = B64.encode(name.to_bytes());
    let header = format!(
        "\x1b_Ga=T,t=s,f=32,U=1,s={width},v={height},i={image_id},p={placement_id},q=1,c={cols},r={rows},S={payload_len};"
    );
    make_apc(&header, name_b64.as_bytes())
}

fn assemble_shm_output(upload_apc: &[u8], grid: Option<&[u8]>) -> Vec<u8> {
    let grid_len = grid.map_or(0, <[u8]>::len);
    let mut output = Vec::with_capacity(upload_apc.len() + grid_len + 32);
    output.extend_from_slice(b"\x1b7\x1b[?7l");
    // The APC is wrapped independently so tmux cannot reinterpret a later
    // command or raw cursor sequence as part of the Kitty payload.
    output.extend(wrap_tmux_apc(upload_apc));
    if let Some(grid) = grid {
        output.extend_from_slice(grid);
        // Clear the selector state after the grid. A cached grid can then be
        // redrawn independently of the upload's virtual placement token.
        output.extend_from_slice(b"\x1b[59m");
    }
    output.extend_from_slice(b"\x1b[?7h\x1b8");
    output
}

fn assemble_output_for_image(upload_apcs: &[Vec<u8>], grid: &[u8]) -> Vec<u8> {
    let mut output =
        Vec::with_capacity(grid.len() + upload_apcs.iter().map(Vec::len).sum::<usize>());
    output.extend_from_slice(b"\x1b7\x1b[?7l");
    upload_apcs
        .iter()
        .for_each(|apc| output.extend(wrap_tmux_apc(apc)));
    output.extend_from_slice(grid);
    output.extend_from_slice(b"\x1b[?7h\x1b8");
    output
}

fn prepare_frame(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    cols: u32,
    rows: u32,
) -> Result<PreparedFrame, String> {
    let (upload_apcs, payload_bytes, compress_us, _) =
        encode_upload_apcs(rgba, width, height, image_id, cols, rows)?;
    let grid = encode_grid(image_id, cols, rows)?;
    let output = assemble_output_for_image(&upload_apcs, &grid);
    Ok(PreparedFrame {
        output,
        raw_bytes: rgba.len() as u64,
        payload_bytes,
        compress_us,
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

fn emit_shm_readback(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    placement_id: u32,
    cols: u32,
    rows: u32,
    emit_grid: bool,
    expected_len: usize,
    readback_us: u64,
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
    let grid = match emit_grid
        .then(|| encode_grid(image_id, cols, rows))
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
    let (handle, name) = match shm_prepare_native(rgba) {
        Ok(prepared) => prepared,
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
        image_id,
        placement_id,
        cols,
        rows,
    );
    let output = assemble_shm_output(&upload_apc, grid.as_deref());
    let encode_us = grid_encode_us + t_encode.elapsed().as_micros() as u64;
    let t_write = Instant::now();
    // Consider this image owned before writing so a short write can be
    // followed by a best-effort `d=I` cleanup for the partially delivered ID.
    record_success(image_id);
    let write_result = write_to_stdout(&output);
    let write_us = t_write.elapsed().as_micros() as u64;
    match write_result {
        Ok(()) => ShmEmitOutcome {
            rc: OK,
            handle,
            kitty_bytes: output.len() as u64,
            readback_us,
            encode_us,
            write_us,
            shm_prepare_us,
            raw_bytes,
            payload_bytes: rgba.len() as u64,
        },
        Err(error) => {
            // A short write may already have delivered a valid image, so
            // best-effort delete our image ID before unlinking the segment.
            let _ = write_to_stdout(&wrap_tmux_apc(&delete_apc(image_id)));
            forget_success(image_id);
            let _ = shm_release(handle, 1);
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
    let expected_params_len = 5 * std::mem::size_of::<u32>() as u32;
    if params.is_null() || params_len != expected_params_len {
        set_last_error(format!(
            "placeholder SHM params must be non-null and exactly {expected_params_len} bytes"
        ));
        return ERR_INVALID_ARG;
    }
    // SAFETY: the pointer and exact byte length were validated above.
    let params = unsafe { std::slice::from_raw_parts(params, 5) };
    let image_id = params[0];
    let placement_id = params[1];
    let cols = params[2];
    let rows = params[3];
    let emit_grid = params[4];
    if image_id == 0 || placement_id == 0 {
        set_last_error("placeholder SHM image and placement IDs must be non-zero");
        return ERR_INVALID_ARG;
    }
    if emit_grid > 1 {
        set_last_error("placeholder SHM grid-emission flag must be 0 or 1");
        return ERR_INVALID_ARG;
    }

    let total_start = Instant::now();
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(dimensions) => dimensions,
        None => {
            set_last_error(format!("placeholder SHM: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let expected_len = match validate_dimensions(width, height, cols, rows) {
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
            image_id,
            placement_id,
            cols,
            rows,
            emit_grid != 0,
            expected_len,
            readback_start.elapsed().as_micros() as u64,
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

/// FFI entry point for tmux-safe placeholder presentation.
#[no_mangle]
pub unsafe extern "C" fn vexart_kitty_emit_placeholder_frame(
    ctx: u64,
    target: u64,
    image_id: u32,
    cols: u32,
    rows: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let _ = ctx;
    crate::ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(context) => context,
            None => return ERR_GPU_DEVICE_LOST,
        };
        emit_placeholder_frame(pctx, target, image_id, cols, rows, stats_out)
    })
}

/// FFI entry point for deleting an owned tmux placeholder image.
#[no_mangle]
pub extern "C" fn vexart_kitty_delete_placeholder(ctx: u64, image_id: u32) -> i32 {
    let _ = ctx;
    crate::ffi_guard!({ delete_placeholder(image_id) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    fn upload_payload(apc: &[u8]) -> Vec<u8> {
        let body = apc.split(|byte| *byte == b';').nth(1).expect("APC body");
        let body = body.strip_suffix(b"\x1b\\").expect("APC terminator");
        B64.decode(body).expect("base64 payload")
    }

    #[test]
    fn dimensions_reject_zero_and_large_grid() {
        assert!(validate_dimensions(1, 1, 0, 1).is_err());
        assert!(validate_dimensions(1, 1, 1, 0).is_err());
        assert!(validate_dimensions(1, 1, 298, 1).is_err());
        assert!(validate_dimensions(1, 1, 1, 298).is_err());
        assert!(validate_dimensions(1, 1, 297, 297).is_ok());
    }

    #[test]
    fn upload_is_zlib_roundtrip_and_4096_chunked() {
        let mut state = 0x1234_5678u32;
        let rgba: Vec<u8> = (0usize..100_000)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                (state >> 24) as u8
            })
            .collect();
        let (apcs, payload_bytes, _, compressed) =
            encode_upload_apcs(&rgba, 200, 100, 0x4000002a, 2, 2).unwrap();
        assert!(compressed);
        assert!(payload_bytes > 0);
        assert!(apcs.len() > 1);
        assert!(String::from_utf8_lossy(&apcs[0]).contains("a=T,U=1"));
        assert!(String::from_utf8_lossy(&apcs[0]).contains("p=1,c=2,r=2"));
        assert!(apcs.iter().skip(1).all(|apc| apc.starts_with(b"\x1b_Gm=")));
        assert!(apcs.iter().all(|apc| apc.len() > 2));
        assert!(apcs[..apcs.len() - 1]
            .iter()
            .all(|apc| apc.windows(4).any(|window| window == b"m=1;")));
        let compressed: Vec<u8> = apcs.iter().flat_map(|apc| upload_payload(apc)).collect();
        let mut decoder = ZlibDecoder::new(compressed.as_slice());
        let mut decoded = Vec::new();
        decoder.read_to_end(&mut decoded).unwrap();
        assert_eq!(decoded, rgba);
    }

    #[test]
    fn grid_encodes_all_coordinates_and_full_image_id() {
        let grid = encode_grid(0xAABBCCDD, 2, 2).unwrap();
        let row_zero = char::from_u32(ROW_COLUMN_DIACRITICS[0])
            .unwrap()
            .to_string();
        let row_one = char::from_u32(ROW_COLUMN_DIACRITICS[1])
            .unwrap()
            .to_string();
        let high = char::from_u32(ROW_COLUMN_DIACRITICS[0xAA])
            .unwrap()
            .to_string();
        assert_eq!(grid.iter().filter(|byte| **byte == 0xF4).count(), 4);
        assert!(std::str::from_utf8(&grid).unwrap().contains(&row_zero));
        assert!(std::str::from_utf8(&grid).unwrap().contains(&row_one));
        assert!(std::str::from_utf8(&grid).unwrap().contains(&high));
        assert!(std::str::from_utf8(&grid)
            .unwrap()
            .contains("38;2;187;204;221m"));
    }

    #[test]
    fn output_keeps_cursor_raw_and_wraps_each_apc() {
        let rgba = [0u8, 1, 2, 3];
        let (apcs, _, _, _) = encode_upload_apcs(&rgba, 1, 1, 1, 1, 1).unwrap();
        let grid = encode_grid(1, 1, 1).unwrap();
        let output = assemble_output_for_image(&apcs, &grid);
        assert!(output.starts_with(b"\x1b7\x1b[?7l"));
        assert!(output
            .windows(b"\x1bPtmux;".len())
            .any(|w| w == b"\x1bPtmux;"));
        assert!(output
            .windows(b"\x1b\x1b_G".len())
            .any(|w| w == b"\x1b\x1b_G"));
        assert!(output
            .windows(b"\x1b[1;1H".len())
            .any(|w| w == b"\x1b[1;1H"));
        assert!(output
            .windows(b"\x1b[?7h\x1b8".len())
            .any(|w| w == b"\x1b[?7h\x1b8"));
        assert!(!output
            .windows(b"d=I,i=1".len())
            .any(|window| window == b"d=I,i=1"));
    }

    #[test]
    fn delete_apc_is_owned_image_only() {
        let apc = delete_apc(0x4000002a);
        let text = String::from_utf8(apc).unwrap();
        assert!(text.contains("a=d,d=I,i=1073741866,q=2;"));
        assert!(!text.contains("d=a"));
    }

    #[test]
    fn shm_upload_uses_raw_rgba_metadata_and_base64_name() {
        let name = std::ffi::CString::new("/vx-1234-abcd").unwrap();
        let apc = encode_shm_upload_apc(&name, 16, 2, 3, 0x4000002a, 7, 4, 5);
        let text = String::from_utf8(apc.clone()).unwrap();
        assert!(text.contains("a=T,t=s,f=32,U=1,s=2,v=3"));
        assert!(text.contains("i=1073741866,p=7,q=1,c=4,r=5,S=16;"));
        assert!(!text.contains("o=z"));
        let body = apc.split(|byte| *byte == b';').nth(1).unwrap();
        let body = body.strip_suffix(b"\x1b\\").unwrap();
        assert_eq!(B64.decode(body).unwrap(), name.as_bytes());
    }

    #[test]
    fn shm_output_wraps_one_apc_and_can_omit_grid() {
        let name = std::ffi::CString::new("/vx-1-1").unwrap();
        let apc = encode_shm_upload_apc(&name, 4, 1, 1, 1, 1, 1, 1);
        let output = assemble_shm_output(&apc, None);
        assert_eq!(
            output
                .windows(b"\x1bPtmux;".len())
                .filter(|w| *w == b"\x1bPtmux;")
                .count(),
            1
        );
        assert!(!output
            .windows(b"\x1b[1;1H".len())
            .any(|w| w == b"\x1b[1;1H"));

        let grid = encode_grid(1, 1, 1).unwrap();
        let output = assemble_shm_output(&apc, Some(&grid));
        assert!(output
            .windows(b"\x1b[1;1H".len())
            .any(|w| w == b"\x1b[1;1H"));
        assert!(output.windows(b"\x1b[59m".len()).any(|w| w == b"\x1b[59m"));
    }
}
