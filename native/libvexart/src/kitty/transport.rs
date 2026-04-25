// native/libvexart/src/kitty/transport.rs
// Transport mode selection and routing for Kitty frame emission.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-102.
// Phase 2b Native Presentation: extended with stats-bearing variants and
// layer/region/delete presentation exports.
//
// Modes (match vexart_kitty_set_transport param):
//   0 = direct  — base64-chunked inline in escape sequences (default)
//   1 = file    — temp file (not yet implemented; falls back to direct)
//   2 = shm     — POSIX shared memory via existing shm.rs
//
// Thread-local transport mode so each FFI call context is independent.

use std::cell::Cell;
use std::time::Instant;

use super::encoder::encode_frame_direct;
use super::writer::write_to_stdout;
use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};
use crate::paint::PaintContext;
use crate::types::NativePresentationStats;

// Active transport mode for the current thread. 0=direct (default), 1=file, 2=shm.
thread_local! {
    static TRANSPORT_MODE: Cell<u32> = const { Cell::new(0) };
}

#[derive(Clone, Copy, Debug, Default)]
struct ShmTransferStats {
    compress_us: u64,
    shm_prepare_us: u64,
    write_us: u64,
    raw_bytes: u64,
    payload_bytes: u64,
    compressed: bool,
}

fn shm_compression_enabled() -> bool {
    shm_compression_enabled_value(std::env::var("VEXART_KITTY_SHM_COMPRESSION").ok())
}

fn shm_compression_enabled_value(value: Option<String>) -> bool {
    match value {
        Some(value) => {
            value == "1" || value.to_lowercase() == "true" || value.to_lowercase() == "on"
        }
        None => false,
    }
}

fn write_transfer_stats(stats: &mut NativePresentationStats, transfer: ShmTransferStats) {
    stats.compress_us = transfer.compress_us;
    stats.shm_prepare_us = transfer.shm_prepare_us;
    stats.write_us = transfer.write_us;
    stats.raw_bytes = transfer.raw_bytes;
    stats.payload_bytes = transfer.payload_bytes;
    if transfer.compressed {
        stats.flags |= NativePresentationStats::FLAG_COMPRESSED;
    }
}

/// Set the transport mode for this thread. Called from `vexart_kitty_set_transport`.
///
/// `mode`: 0=direct, 1=file, 2=shm.
pub fn set_transport_mode(mode: u32) -> i32 {
    if mode > 2 {
        set_last_error(format!(
            "invalid transport mode: {mode} (expected 0=direct, 1=file, 2=shm)"
        ));
        return ERR_INVALID_ARG;
    }
    TRANSPORT_MODE.with(|cell| cell.set(mode));
    OK
}

/// Emit a complete frame to the terminal using the active transport mode.
///
/// Reads back the GPU target, encodes, and writes to stdout. On error,
/// sets the last error message and returns `ERR_KITTY_TRANSPORT`.
///
/// # Arguments
/// * `pctx`     — paint context (owns target registry + device/queue)
/// * `target`   — target handle (0 = use default singleton target)
/// * `image_id` — Kitty image ID to assign
pub fn emit_frame(pctx: &mut PaintContext, target: u64, image_id: u32) -> i32 {
    let mode = TRANSPORT_MODE.with(|c| c.get());

    match mode {
        0 => emit_direct(pctx, target, image_id),
        1 => {
            // File mode: not yet implemented in Slice 3 — fall back to direct.
            emit_direct(pctx, target, image_id)
        }
        2 => emit_shm(pctx, target, image_id),
        _ => {
            set_last_error(format!("unknown transport mode: {mode}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

/// Direct mode: readback → zlib → base64 → chunked Kitty escapes → stdout.
fn emit_direct(pctx: &mut PaintContext, target: u64, image_id: u32) -> i32 {
    // 1. Resolve target dimensions.
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(d) => d,
        None => {
            set_last_error(format!("emit_direct: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };

    // 2. Allocate CPU buffer and perform GPU readback.
    let pixel_count = (width as usize) * (height as usize) * 4;
    let mut rgba = vec![0u8; pixel_count];
    let written = do_readback(pctx, target, width, height, &mut rgba);
    if written == 0 {
        set_last_error("emit_direct: GPU readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

    // 3. Encode to Kitty escape sequences.
    let escaped = encode_frame_direct(&rgba[..written as usize], width, height, image_id);

    // 4. Write to stdout.
    match write_to_stdout(&escaped) {
        Ok(()) => OK,
        Err(e) => {
            set_last_error(format!("emit_direct: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

/// SHM mode: readback → shm_prepare → Kitty SHM escape → stdout.
fn emit_shm(pctx: &mut PaintContext, target: u64, image_id: u32) -> i32 {
    use super::shm::{shm_prepare, shm_release};
    use crate::kitty::encoder::compress_rgba;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;

    // 1. Resolve target dimensions.
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(d) => d,
        None => {
            set_last_error(format!("emit_shm: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };

    // 2. GPU readback.
    let pixel_count = (width as usize) * (height as usize) * 4;
    let mut rgba = vec![0u8; pixel_count];
    let written = do_readback(pctx, target, width, height, &mut rgba);
    if written == 0 {
        set_last_error("emit_shm: GPU readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

    // 3. zlib compress.
    let compressed = compress_rgba(&rgba[..written as usize]);

    // 4. Create SHM segment with compressed data.
    let shm_name = format!("/vexart-kitty-{}-{}", std::process::id(), image_id);
    let mut handle: u64 = 0;
    let rc = unsafe {
        shm_prepare(
            shm_name.as_ptr(),
            shm_name.len() as u32,
            compressed.as_ptr(),
            compressed.len() as u32,
            0o600,
            &mut handle,
        )
    };
    if rc != OK {
        // shm_prepare already set last error.
        return ERR_KITTY_TRANSPORT;
    }

    // 5. Build Kitty SHM escape and write to stdout.
    let name_b64 = B64.encode(shm_name.as_bytes());
    let escape = format!(
        "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},C=1,t=s,o=z,q=2;{name_b64}\x1b\\"
    );
    let write_result = write_to_stdout(escape.as_bytes());

    // 6. Schedule SHM cleanup (TTL: the terminal reads it and unlinks it per spec).
    // We retain the handle; the terminal will unlink after reading.
    // Release the fd here — the segment name keeps it accessible to the terminal.
    shm_release(handle, 0); // close fd, do not unlink (terminal does that)

    match write_result {
        Ok(()) => OK,
        Err(e) => {
            set_last_error(format!("emit_shm: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

/// Resolve (width, height) from a target handle.
///
/// Returns `None` if the handle is invalid (not in registry).
fn resolve_target_dims(pctx: &PaintContext, target: u64) -> Option<(u32, u32)> {
    if target == 0 {
        // Default singleton target: use the wgpu surface size.
        // Phase 2b: return the singleton target's dimensions if available.
        // For now return None (caller must pass a valid non-zero handle).
        return None;
    }
    let rec = pctx.targets.get(target)?;
    Some((rec.width, rec.height))
}

/// Perform a full GPU→CPU readback of the target into `dst`.
///
/// Returns the number of bytes written (= width × height × 4) or 0 on failure.
fn do_readback(
    pctx: &mut PaintContext,
    target: u64,
    width: u32,
    height: u32,
    dst: &mut Vec<u8>,
) -> u32 {
    use crate::composite::readback::readback_full;

    let rec = match pctx.targets.get(target) {
        Some(r) => r,
        None => return 0,
    };

    // We need simultaneous immutable access to device/queue and target record.
    // Extract raw pointers to device, queue, texture, readback_buffer, and padded_bytes_per_row
    // before taking a mutable borrow of dst. All pointed-to values live in pctx.wgpu and
    // pctx.targets, which are stable for the duration of this call.
    let device_ptr: *const wgpu::Device = &pctx.wgpu.device;
    let queue_ptr: *const wgpu::Queue = &pctx.wgpu.queue;
    let texture_ptr: *const wgpu::Texture = &rec.texture;
    let rb_buf_ptr: *const wgpu::Buffer = &rec.readback_buffer;
    let padded = rec.padded_bytes_per_row;

    // SAFETY: device, queue, texture, readback_buffer are all owned by pctx and
    // are stable (not moved/dropped) during this call. We hold pctx mutably, which
    // ensures exclusive access. The raw pointers are valid for the duration of
    // readback_full (a synchronous blocking call).
    unsafe {
        readback_full(
            &*device_ptr,
            &*queue_ptr,
            &*texture_ptr,
            width,
            height,
            padded,
            &*rb_buf_ptr,
            dst.as_mut_ptr(),
            dst.len() as u32,
        )
    }
}

// ─── Native Presentation exports (Phase 2b) ────────────────────────────────

/// Emit a complete frame with native stats output.
///
/// Like `emit_frame` but populates `*stats_out` on success.
/// Returns OK on success, ERR_KITTY_TRANSPORT on failure.
///
/// # Safety
/// `stats_out` must be a valid mutable pointer to `NativePresentationStats` if non-null.
pub unsafe fn emit_frame_with_stats(
    pctx: &mut PaintContext,
    target: u64,
    image_id: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let t0 = Instant::now();
    let mode = TRANSPORT_MODE.with(|c| c.get());
    let transport_id = mode;

    // Resolve target dimensions.
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(d) => d,
        None => {
            set_last_error(format!(
                "emit_frame_with_stats: invalid target handle {target}"
            ));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let pixel_count = (width as usize) * (height as usize) * 4;

    // GPU readback — timed.
    let t_rb = Instant::now();
    let mut rgba = vec![0u8; pixel_count];
    let written = do_readback(pctx, target, width, height, &mut rgba);
    let readback_us = t_rb.elapsed().as_micros() as u64;
    if written == 0 {
        set_last_error("emit_frame_with_stats: GPU readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

    // Encode + write — timed.
    let t_enc = Instant::now();
    let mut transfer = ShmTransferStats::default();
    let rc = match mode {
        2 => {
            let result = emit_shm_inner_with_stats(
                pctx,
                target,
                image_id,
                &rgba[..written as usize],
                width,
                height,
            );
            transfer = result.1;
            result.0
        }
        _ => emit_direct_inner(&rgba[..written as usize], width, height, image_id),
    };
    let encode_us = t_enc.elapsed().as_micros() as u64;
    let write_us = 0u64; // write is included in encode_us for now
    let total_us = t0.elapsed().as_micros() as u64;
    let kitty_bytes = pixel_count as u64; // approximation

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_FINAL_FRAME;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = kitty_bytes;
        stats.readback_us = readback_us;
        stats.encode_us = encode_us;
        stats.write_us = write_us;
        stats.total_us = total_us;
        stats.transport = transport_id;
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
        write_transfer_stats(stats, transfer);
    }
    rc
}

/// Emit a pre-encoded RGBA layer over SHM (native presentation path).
///
/// Used by dirty-layer presentation. Accepts a packed params buffer:
///   params[0..4] = u32 image_id
///   params[4..8] = u32 width
///   params[8..12] = u32 height
/// rgba_ptr/rgba_len = raw RGBA pixel data for this layer.
///
/// # Safety
/// `rgba_ptr` must be valid for `rgba_len` bytes; `stats_out` valid if non-null.
pub unsafe fn emit_layer_native(
    image_id: u32,
    rgba_ptr: *const u8,
    rgba_len: u32,
    width: u32,
    height: u32,
    col: i32,
    row: i32,
    z: i32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let t0 = Instant::now();
    if rgba_ptr.is_null() || rgba_len == 0 || width == 0 || height == 0 {
        set_last_error("emit_layer_native: invalid arguments");
        return ERR_KITTY_TRANSPORT;
    }
    let rgba = std::slice::from_raw_parts(rgba_ptr, rgba_len as usize);
    let mode = TRANSPORT_MODE.with(|c| c.get());

    let t_enc = Instant::now();
    let mut transfer = ShmTransferStats::default();
    let rc = match mode {
        2 => {
            let result = emit_shm_rgba_at_with_stats(rgba, width, height, image_id, col, row, z);
            transfer = result.1;
            result.0
        }
        _ => emit_direct_rgba_at(rgba, width, height, image_id, col, row, z),
    };
    let encode_us = t_enc.elapsed().as_micros() as u64;
    let total_us = t0.elapsed().as_micros() as u64;

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_LAYER;
        stats.rgba_bytes_read = rgba_len as u64;
        stats.kitty_bytes_emitted = rgba_len as u64;
        stats.readback_us = 0;
        stats.encode_us = encode_us;
        stats.write_us = 0;
        stats.total_us = total_us;
        stats.transport = mode;
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
        write_transfer_stats(stats, transfer);
    }
    rc
}

/// Emit an already-painted target as a positioned Kitty layer with native stats.
///
/// # Safety
/// `stats_out` must be a valid mutable pointer to `NativePresentationStats` if non-null.
pub unsafe fn emit_layer_target_with_stats(
    pctx: &mut PaintContext,
    target: u64,
    image_id: u32,
    col: i32,
    row: i32,
    z: i32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let t0 = Instant::now();
    let mode = TRANSPORT_MODE.with(|c| c.get());
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(d) => d,
        None => {
            set_last_error(format!(
                "emit_layer_target_with_stats: invalid target handle {target}"
            ));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let pixel_count = (width as usize) * (height as usize) * 4;
    let t_rb = Instant::now();
    let mut rgba = vec![0u8; pixel_count];
    let written = do_readback(pctx, target, width, height, &mut rgba);
    let readback_us = t_rb.elapsed().as_micros() as u64;
    if written == 0 {
        set_last_error("emit_layer_target_with_stats: GPU readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

    let t_enc = Instant::now();
    let mut transfer = ShmTransferStats::default();
    let rc = match mode {
        2 => {
            let result = emit_shm_rgba_at_with_stats(
                &rgba[..written as usize],
                width,
                height,
                image_id,
                col,
                row,
                z,
            );
            transfer = result.1;
            result.0
        }
        _ => emit_direct_rgba_at(
            &rgba[..written as usize],
            width,
            height,
            image_id,
            col,
            row,
            z,
        ),
    };
    let encode_us = t_enc.elapsed().as_micros() as u64;
    let total_us = t0.elapsed().as_micros() as u64;

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_LAYER;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = written as u64;
        stats.readback_us = readback_us;
        stats.encode_us = encode_us;
        stats.write_us = 0;
        stats.total_us = total_us;
        stats.transport = mode;
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
        write_transfer_stats(stats, transfer);
    }
    rc
}

/// Emit a region update (patch) over SHM for native presentation.
///
/// # Safety
/// `rgba_ptr` must be valid for `rgba_len` bytes; `stats_out` valid if non-null.
pub unsafe fn emit_region_native(
    image_id: u32,
    rgba_ptr: *const u8,
    rgba_len: u32,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let t0 = Instant::now();
    if rgba_ptr.is_null() || rgba_len == 0 || rw == 0 || rh == 0 {
        set_last_error("emit_region_native: invalid arguments");
        return ERR_KITTY_TRANSPORT;
    }
    let rgba = std::slice::from_raw_parts(rgba_ptr, rgba_len as usize);
    let mode = TRANSPORT_MODE.with(|c| c.get());

    let t_enc = Instant::now();
    let result = emit_region_rgba_with_stats(rgba, image_id, rx, ry, rw, rh, mode);
    let rc = result.0;
    let transfer = result.1;
    let encode_us = t_enc.elapsed().as_micros() as u64;
    let total_us = t0.elapsed().as_micros() as u64;

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_REGION;
        stats.rgba_bytes_read = rgba_len as u64;
        stats.kitty_bytes_emitted = rgba_len as u64;
        stats.readback_us = 0;
        stats.encode_us = encode_us;
        stats.write_us = 0;
        stats.total_us = total_us;
        stats.transport = mode;
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
        write_transfer_stats(stats, transfer);
    }
    rc
}

/// Emit a dirty region from an already-painted target with native stats.
///
/// # Safety
/// `stats_out` must be a valid mutable pointer to `NativePresentationStats` if non-null.
pub unsafe fn emit_region_target_with_stats(
    pctx: &mut PaintContext,
    target: u64,
    image_id: u32,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let t0 = Instant::now();
    if rw == 0 || rh == 0 {
        set_last_error("emit_region_target_with_stats: invalid region");
        return ERR_KITTY_TRANSPORT;
    }
    let mode = TRANSPORT_MODE.with(|c| c.get());
    let (width, height, texture_ptr) = match pctx.targets.get(target) {
        Some(rec) => (rec.width, rec.height, &rec.texture as *const wgpu::Texture),
        None => {
            set_last_error(format!(
                "emit_region_target_with_stats: invalid target handle {target}"
            ));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let x = rx.min(width);
    let y = ry.min(height);
    let w = rw.min(width.saturating_sub(x));
    let h = rh.min(height.saturating_sub(y));
    if w == 0 || h == 0 {
        set_last_error("emit_region_target_with_stats: empty clipped region");
        return ERR_KITTY_TRANSPORT;
    }

    let t_rb = Instant::now();
    let mut rgba = vec![0u8; (w as usize) * (h as usize) * 4];
    let written = crate::composite::readback::readback_region(
        &pctx.wgpu.device,
        &pctx.wgpu.queue,
        unsafe { &*texture_ptr },
        width,
        height,
        x,
        y,
        w,
        h,
        rgba.as_mut_ptr(),
        rgba.len() as u32,
    );
    let readback_us = t_rb.elapsed().as_micros() as u64;
    if written == 0 {
        set_last_error("emit_region_target_with_stats: GPU region readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

    let t_enc = Instant::now();
    let result = emit_region_rgba_with_stats(&rgba[..written as usize], image_id, x, y, w, h, mode);
    let rc = result.0;
    let transfer = result.1;
    let encode_us = t_enc.elapsed().as_micros() as u64;
    let total_us = t0.elapsed().as_micros() as u64;

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_REGION;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = written as u64;
        stats.readback_us = readback_us;
        stats.encode_us = encode_us;
        stats.write_us = 0;
        stats.total_us = total_us;
        stats.transport = mode;
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
        write_transfer_stats(stats, transfer);
    }
    rc
}

/// Delete a Kitty image by ID natively.
///
/// # Safety
/// `stats_out` must be valid if non-null.
pub unsafe fn delete_layer_native(image_id: u32, stats_out: *mut NativePresentationStats) -> i32 {
    let t0 = Instant::now();
    let escape = format!("\x1b_Ga=d,d=i,i={image_id},q=2;\x1b\\");
    let rc = match write_to_stdout(escape.as_bytes()) {
        Ok(()) => OK,
        Err(e) => {
            set_last_error(format!("delete_layer_native: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    };
    let total_us = t0.elapsed().as_micros() as u64;
    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_DELETE;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = escape.len() as u64;
        stats.readback_us = 0;
        stats.encode_us = 0;
        stats.write_us = total_us;
        stats.total_us = total_us;
        stats.transport = TRANSPORT_MODE.with(|c| c.get());
        stats.flags =
            NativePresentationStats::FLAG_NATIVE_USED | NativePresentationStats::FLAG_VALID;
    }
    rc
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/// Emit already-read RGBA data using direct mode (encode → stdout).
fn emit_direct_inner(rgba: &[u8], width: u32, height: u32, image_id: u32) -> i32 {
    let escaped = encode_frame_direct(rgba, width, height, image_id);
    match write_to_stdout(&escaped) {
        Ok(()) => OK,
        Err(e) => {
            set_last_error(format!("emit_direct_inner: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

/// Emit already-read RGBA data using SHM mode.
#[allow(dead_code)]
fn emit_shm_inner(
    _pctx: &mut PaintContext,
    _target: u64,
    image_id: u32,
    rgba: &[u8],
    width: u32,
    height: u32,
) -> i32 {
    emit_shm_rgba(rgba, width, height, image_id)
}

fn emit_shm_inner_with_stats(
    _pctx: &mut PaintContext,
    _target: u64,
    image_id: u32,
    rgba: &[u8],
    width: u32,
    height: u32,
) -> (i32, ShmTransferStats) {
    emit_shm_rgba_with_stats(rgba, width, height, image_id)
}

/// Write RGBA layer to SHM and emit Kitty escape.
#[allow(dead_code)]
fn emit_shm_rgba(rgba: &[u8], width: u32, height: u32, image_id: u32) -> i32 {
    emit_shm_rgba_at(rgba, width, height, image_id, 0, 0, 0)
}

fn emit_shm_rgba_with_stats(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
) -> (i32, ShmTransferStats) {
    emit_shm_rgba_at_with_stats(rgba, width, height, image_id, 0, 0, 0)
}

#[allow(dead_code)]
fn emit_shm_rgba_at(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    col: i32,
    row: i32,
    z: i32,
) -> i32 {
    emit_shm_rgba_at_with_stats(rgba, width, height, image_id, col, row, z).0
}

fn emit_shm_rgba_at_with_stats(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    col: i32,
    row: i32,
    z: i32,
) -> (i32, ShmTransferStats) {
    use super::shm::{shm_prepare, shm_release};
    use crate::kitty::encoder::compress_rgba;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;

    let mut stats = ShmTransferStats {
        raw_bytes: rgba.len() as u64,
        ..ShmTransferStats::default()
    };
    let compression = shm_compression_enabled();
    let compressed_storage;
    let payload: &[u8];
    let compression_param;
    if compression {
        let t_compress = Instant::now();
        compressed_storage = compress_rgba(rgba);
        stats.compress_us = t_compress.elapsed().as_micros() as u64;
        stats.compressed = true;
        stats.payload_bytes = compressed_storage.len() as u64;
        payload = &compressed_storage;
        compression_param = ",o=z";
    } else {
        stats.payload_bytes = rgba.len() as u64;
        payload = rgba;
        compression_param = "";
    }
    let shm_name = format!("/vexart-kitty-{}-{}", std::process::id(), image_id);
    let mut handle: u64 = 0;
    let t_shm = Instant::now();
    let rc = unsafe {
        shm_prepare(
            shm_name.as_ptr(),
            shm_name.len() as u32,
            payload.as_ptr(),
            payload.len() as u32,
            0o600,
            &mut handle,
        )
    };
    stats.shm_prepare_us = t_shm.elapsed().as_micros() as u64;
    if rc != OK {
        return (ERR_KITTY_TRANSPORT, stats);
    }
    let name_b64 = B64.encode(shm_name.as_bytes());
    let escape = format!(
        "\x1b7\x1b[{};{}H\x1b_Ga=T,f=32,s={width},v={height},i={image_id},C=1,t=s{compression_param},z={z},p={image_id},q=2;{name_b64}\x1b\\\x1b8",
        row.max(0) + 1,
        col.max(0) + 1,
    );
    let t_write = Instant::now();
    let write_result = write_to_stdout(escape.as_bytes());
    stats.write_us = t_write.elapsed().as_micros() as u64;
    shm_release(handle, 0);
    match write_result {
        Ok(()) => (OK, stats),
        Err(e) => {
            set_last_error(format!("emit_shm_rgba: stdout write failed: {e}"));
            (ERR_KITTY_TRANSPORT, stats)
        }
    }
}

fn emit_direct_rgba_at(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    col: i32,
    row: i32,
    z: i32,
) -> i32 {
    let escaped = encode_frame_direct(rgba, width, height, image_id);
    let row = row.max(0) + 1;
    let col = col.max(0) + 1;
    let positioned = format!(
        "\x1b7\x1b[{row};{col}H{}\x1b8",
        String::from_utf8_lossy(&escaped)
    );
    let _ = z;
    match write_to_stdout(positioned.as_bytes()) {
        Ok(()) => OK,
        Err(e) => {
            set_last_error(format!("emit_direct_rgba_at: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

/// Emit a region patch via direct mode (Kitty animation frame protocol a=f).
#[allow(dead_code)]
fn emit_region_rgba(
    rgba: &[u8],
    image_id: u32,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    mode: u32,
) -> i32 {
    emit_region_rgba_with_stats(rgba, image_id, rx, ry, rw, rh, mode).0
}

fn emit_region_rgba_with_stats(
    rgba: &[u8],
    image_id: u32,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    mode: u32,
) -> (i32, ShmTransferStats) {
    use crate::kitty::encoder::compress_rgba;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;

    let mut stats = ShmTransferStats {
        raw_bytes: rgba.len() as u64,
        ..ShmTransferStats::default()
    };
    let compression = mode != 2 || shm_compression_enabled();
    let compressed_storage;
    let payload: &[u8];
    let compression_param;
    if compression {
        let t_compress = Instant::now();
        compressed_storage = compress_rgba(rgba);
        stats.compress_us = t_compress.elapsed().as_micros() as u64;
        stats.compressed = true;
        stats.payload_bytes = compressed_storage.len() as u64;
        payload = &compressed_storage;
        compression_param = ",o=z";
    } else {
        stats.payload_bytes = rgba.len() as u64;
        payload = rgba;
        compression_param = "";
    }
    let meta =
        format!("a=f,i={image_id},r=1,x={rx},y={ry},s={rw},v={rh},f=32,X=1{compression_param},q=2");

    let escape = if mode == 2 {
        // SHM mode for region patch
        let shm_name = format!("/vexart-kitty-r-{}-{}", std::process::id(), image_id);
        let mut handle: u64 = 0;
        let t_shm = Instant::now();
        let rc = unsafe {
            use super::shm::{shm_prepare, shm_release};
            let r = shm_prepare(
                shm_name.as_ptr(),
                shm_name.len() as u32,
                payload.as_ptr(),
                payload.len() as u32,
                0o600,
                &mut handle,
            );
            let _ = shm_release(handle, 0);
            r
        };
        stats.shm_prepare_us = t_shm.elapsed().as_micros() as u64;
        if rc != OK {
            return (ERR_KITTY_TRANSPORT, stats);
        }
        let name_b64 = B64.encode(shm_name.as_bytes());
        format!("\x1b_G{meta},t=s;{name_b64}\x1b\\")
    } else {
        // Direct mode
        let b64 = B64.encode(payload);
        format!("\x1b_G{meta};{b64}\x1b\\")
    };

    let t_write = Instant::now();
    match write_to_stdout(escape.as_bytes()) {
        Ok(()) => {
            stats.write_us = t_write.elapsed().as_micros() as u64;
            (OK, stats)
        }
        Err(e) => {
            stats.write_us = t_write.elapsed().as_micros() as u64;
            set_last_error(format!("emit_region_rgba: stdout write failed: {e}"));
            (ERR_KITTY_TRANSPORT, stats)
        }
    }
}

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::mem;

    #[test]
    fn test_set_transport_mode_valid() {
        assert_eq!(set_transport_mode(0), OK);
        assert_eq!(set_transport_mode(1), OK);
        assert_eq!(set_transport_mode(2), OK);
    }

    #[test]
    fn test_set_transport_mode_invalid() {
        assert_eq!(set_transport_mode(3), ERR_INVALID_ARG);
        assert_eq!(set_transport_mode(99), ERR_INVALID_ARG);
    }

    #[test]
    fn test_transport_mode_thread_local() {
        // Set to shm (2), verify it reads back correctly.
        set_transport_mode(2);
        let mode = TRANSPORT_MODE.with(|c| c.get());
        assert_eq!(mode, 2);
        // Reset to direct.
        set_transport_mode(0);
        let mode = TRANSPORT_MODE.with(|c| c.get());
        assert_eq!(mode, 0);
    }

    #[test]
    fn test_shm_compression_defaults_to_raw() {
        assert!(!shm_compression_enabled_value(None));
    }

    #[test]
    fn test_shm_compression_can_be_forced() {
        assert!(shm_compression_enabled_value(Some("1".to_string())));
        assert!(shm_compression_enabled_value(Some("true".to_string())));
        assert!(shm_compression_enabled_value(Some("on".to_string())));
    }

    #[test]
    fn test_shm_compression_rejects_disabled_values() {
        assert!(!shm_compression_enabled_value(Some("0".to_string())));
        assert!(!shm_compression_enabled_value(Some("false".to_string())));
        assert!(!shm_compression_enabled_value(Some("off".to_string())));
    }

    // ── NativePresentationStats struct tests (task 1.3) ────────────────────

    /// Stats struct must be exactly 96 bytes for stable FFI across versions.
    /// Layout: v1 64 bytes + phase-10 4×u64 native transfer metrics.
    #[test]
    fn test_native_presentation_stats_size() {
        assert_eq!(
            mem::size_of::<NativePresentationStats>(),
            96,
            "NativePresentationStats must be exactly 96 bytes"
        );
    }

    /// Stats struct must be C-repr (no padding holes that break alignment).
    #[test]
    fn test_native_presentation_stats_alignment() {
        // repr(C) + u32/u64 fields: align must be 8 (largest field is u64)
        assert_eq!(
            mem::align_of::<NativePresentationStats>(),
            8,
            "NativePresentationStats must have alignment 8"
        );
    }

    /// VERSION constant must be 2 after adding Phase 10 native transfer metrics.
    #[test]
    fn test_native_presentation_stats_version_constant() {
        assert_eq!(NativePresentationStats::VERSION, 2);
    }

    /// Mode constants have distinct values.
    #[test]
    fn test_native_presentation_stats_mode_constants() {
        assert_eq!(NativePresentationStats::MODE_UNKNOWN, 0);
        assert_eq!(NativePresentationStats::MODE_FINAL_FRAME, 1);
        assert_eq!(NativePresentationStats::MODE_LAYER, 2);
        assert_eq!(NativePresentationStats::MODE_REGION, 3);
        assert_eq!(NativePresentationStats::MODE_DELETE, 4);
    }

    /// Transport constants have distinct values matching set_transport_mode.
    #[test]
    fn test_native_presentation_stats_transport_constants() {
        assert_eq!(NativePresentationStats::TRANSPORT_DIRECT, 0);
        assert_eq!(NativePresentationStats::TRANSPORT_FILE, 1);
        assert_eq!(NativePresentationStats::TRANSPORT_SHM, 2);
    }

    /// Flag constants are distinct bit positions.
    #[test]
    fn test_native_presentation_stats_flag_constants() {
        assert_eq!(NativePresentationStats::FLAG_NATIVE_USED, 1);
        assert_eq!(NativePresentationStats::FLAG_FALLBACK, 2);
        assert_eq!(NativePresentationStats::FLAG_VALID, 4);
        assert_eq!(NativePresentationStats::FLAG_COMPRESSED, 8);
    }

    /// Default stats have version=0 (uninitialized sentinel).
    #[test]
    fn test_native_presentation_stats_default() {
        let stats = NativePresentationStats::default();
        assert_eq!(stats.version, 0);
        assert_eq!(stats.rgba_bytes_read, 0);
        assert_eq!(stats.flags, 0);
    }

    /// delete_layer_native with null stats_out succeeds without crash.
    #[test]
    fn test_delete_layer_native_null_stats() {
        // Resetting transport to direct mode first.
        set_transport_mode(0);
        // delete_layer_native writes to stdout — in test env stdout may not exist.
        // We only verify it doesn't panic/segfault with null stats_out.
        // (Actual write may fail — that's OK in test.)
        let _ = unsafe { delete_layer_native(1, std::ptr::null_mut()) };
    }

    /// emit_layer_native with null rgba returns ERR_KITTY_TRANSPORT.
    #[test]
    fn test_emit_layer_native_null_rgba() {
        let rc = unsafe {
            emit_layer_native(1, std::ptr::null(), 0, 0, 0, 0, 0, 0, std::ptr::null_mut())
        };
        assert_eq!(rc, ERR_KITTY_TRANSPORT);
    }

    /// emit_region_native with null rgba returns ERR_KITTY_TRANSPORT.
    #[test]
    fn test_emit_region_native_null_rgba() {
        let rc =
            unsafe { emit_region_native(1, std::ptr::null(), 0, 0, 0, 0, 0, std::ptr::null_mut()) };
        assert_eq!(rc, ERR_KITTY_TRANSPORT);
    }
}
