// native/libvexart/src/kitty/transport.rs
// Transport mode selection and routing for Kitty frame emission.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-102.
// Phase 2b Native Presentation: extended with stats-bearing variants and
// layer/region/delete presentation exports.
//
// Modes (match vexart_kitty_set_transport param):
//   0 = direct  — base64-chunked inline in escape sequences (default)
//   2 = shm     — POSIX shared memory via existing shm.rs
//
// Thread-local transport mode so each FFI call context is independent.

use std::cell::Cell;
use std::time::Instant;

use super::writer::write_to_stdout;
use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};
use crate::paint::PaintContext;
use crate::types::NativePresentationStats;

#[path = "frame_cache.rs"]
pub mod frame_cache;
#[path = "direct_transport.rs"]
pub mod direct_transport;

pub use direct_transport::{emit_direct_inner, emit_direct_rgba_at, write_transport};
pub use frame_cache::{
    animation_supported, animation_supported_from_env, clear_frame_caches, forget_image_frame,
    image_frame, image_geometry, needs_full_transmit, next_animation_frame, payload_hash,
    payload_unchanged, record_image_frame, record_image_geometry, record_payload, rgba_hash,
};

#[cfg(test)]
pub use direct_transport::FORCE_WRITE_FAILURE;
#[cfg(test)]
pub use frame_cache::{FORCE_ANIMATION_SUPPORT, RGBA_HASH_SCANS};

// Active transport mode for the current thread. 0=direct (default), 2=shm.
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

/// The emitter either hands an owned transfer to its async caller or leaves
/// it in the bounded legacy ring. Both representations retain their names.
enum ShmLease {
    Ring(usize),
    Owned(u64),
}

impl ShmLease {
    fn prepare(bytes: &[u8], owned: bool) -> Result<(Self, std::ffi::CString), i32> {
        if owned {
            super::shm::shm_prepare_native(bytes).map(|(handle, name)| (Self::Owned(handle), name))
        } else {
            super::shm::shm_prepare_ring(bytes).map(|(slot, name)| (Self::Ring(slot), name))
        }
    }

    fn publish(self, owner: Option<&mut u64>) {
        match self {
            Self::Ring(slot) => super::shm::shm_ring_mark_in_flight(slot),
            Self::Owned(handle) => {
                if let Some(owner) = owner { *owner = handle; }
            }
        }
    }

    fn cancel(self) {
        match self {
            Self::Ring(slot) => super::shm::shm_ring_fail_closed(slot),
            Self::Owned(handle) => { super::shm::shm_release(handle, 1); }
        }
    }
}

/// Set the transport mode for this thread. Called from `vexart_kitty_set_transport`.
///
/// `mode`: 0=direct, 2=shm.
pub fn set_transport_mode(mode: u32) -> i32 {
    if mode != 0 && mode != 2 {
        set_last_error(format!(
            "invalid transport mode: {mode} (expected 0=direct, 2=shm)"
        ));
        return ERR_INVALID_ARG;
    }
    TRANSPORT_MODE.with(|cell| cell.set(mode));
    OK
}

/// Clean up any active SHM mappings on engine shutdown and reset transport caches.
pub fn cleanup_shm_on_shutdown() {
    crate::kitty::shm::cleanup_all_shm_handles();
    clear_frame_caches();
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

    // 2. Perform GPU readback into persistent scratch buffer.
    let pixel_count = (width as usize) * (height as usize) * 4;
    let mut scratch = std::mem::take(&mut pctx.readback_scratch);
    scratch.resize(pixel_count, 0);
    let written = do_readback(pctx, target, width, height, &mut scratch);
    if written == 0 {
        pctx.readback_scratch = scratch;
        set_last_error("emit_direct: GPU readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

    // 3. Encode and write through the same animation-aware path used by the
    // native stats variant. This also coalesces unchanged frames.
    let res = emit_direct_inner(&scratch[..written as usize], width, height, image_id);
    pctx.readback_scratch = scratch;
    res
}

/// SHM mode: readback → shm_prepare_ring → Kitty SHM escape → stdout.
fn emit_shm(pctx: &mut PaintContext, target: u64, image_id: u32) -> i32 {
    // 1. Resolve target dimensions.
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(d) => d,
        None => {
            set_last_error(format!("emit_shm: invalid target handle {target}"));
            return ERR_KITTY_TRANSPORT;
        }
    };

    // 2. GPU readback into persistent scratch buffer.
    let pixel_count = (width as usize) * (height as usize) * 4;
    let mut scratch = std::mem::take(&mut pctx.readback_scratch);
    scratch.resize(pixel_count, 0);
    let written = do_readback(pctx, target, width, height, &mut scratch);
    if written == 0 {
        pctx.readback_scratch = scratch;
        set_last_error("emit_shm: GPU readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }
    let res = emit_shm_rgba_with_stats(&scratch[..written as usize], width, height, image_id).0;
    pctx.readback_scratch = scratch;
    res
}

/// Resolve (width, height) from a target handle.
///
/// Returns `None` if the handle is invalid (not in registry).
pub(super) fn resolve_target_dims(pctx: &PaintContext, target: u64) -> Option<(u32, u32)> {
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
    let needed = match (width as usize).checked_mul(height as usize).and_then(|px| px.checked_mul(4)) {
        Some(size) => size,
        None => return 0,
    };
    dst.resize(needed, 0);

    let written = do_readback_with(pctx, target, width, height, |bytes| {
        dst[..needed].copy_from_slice(bytes);
        needed as u32
    });
    written.unwrap_or(0)
}

/// Read a full target and consume packed RGBA bytes while the GPU readback
/// buffer is mapped.
pub(super) fn do_readback_with<R, F>(
    pctx: &mut PaintContext,
    target: u64,
    width: u32,
    height: u32,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    use crate::composite::readback::{consume_staging_slot, submit_readback_gpu_pass};

    let device_ptr: *const wgpu::Device = &pctx.wgpu.device;
    let queue_ptr: *const wgpu::Queue = &pctx.wgpu.queue;
    let pipeline_ptr: *const wgpu::ComputePipeline = &pctx.wgpu.pipelines.unpremultiply_pack;
    let bgl_ptr: *const wgpu::BindGroupLayout = &pctx.wgpu.pipelines.unpremultiply_bgl;

    let rec = pctx.targets.get_mut(target)?;
    let slot = rec.advance_staging_slot();
    let (storage_buf, staging_buf, bind_group) =
        rec.ensure_readback_buffers(unsafe { &*device_ptr }, unsafe { &*bgl_ptr })?;
    let storage_ptr: *const wgpu::Buffer = storage_buf;
    let staging_ptr: *const wgpu::Buffer = staging_buf;
    let bg_ptr: *const wgpu::BindGroup = bind_group;

    let needed = (width as usize).checked_mul(height as usize)?.checked_mul(4)?;

    let rx = unsafe {
        submit_readback_gpu_pass(
            &*device_ptr,
            &*queue_ptr,
            &*pipeline_ptr,
            &*bg_ptr,
            &*storage_ptr,
            &*staging_ptr,
            width,
            height,
        )?
    };

    rec.staging_mapped[slot] = true;
    let res = unsafe {
        consume_staging_slot(
            &*device_ptr,
            &*staging_ptr,
            rx,
            needed,
            callback,
        )
    };
    rec.staging_mapped[slot] = false;
    res
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
    emit_frame_with_owner(pctx, target, image_id, stats_out, None)
}

/// The caller owns out_handle until terminal consumption, then releases it.
pub unsafe fn emit_frame_shm_owned(
    pctx: &mut PaintContext, target: u64, image_id: u32,
    out_handle: &mut u64, stats_out: *mut NativePresentationStats,
) -> i32 {
    *out_handle = 0;
    emit_frame_with_owner(pctx, target, image_id, stats_out, Some(out_handle))
}

/// Emit a frame using the fixed SHM ring buffer with backpressure.
pub unsafe fn emit_frame_shm_ring(
    pctx: &mut PaintContext,
    target: u64,
    image_id: u32,
    stats_out: *mut NativePresentationStats,
) -> i32 {
    let t0 = Instant::now();
    let (width, height) = match resolve_target_dims(pctx, target) {
        Some(d) => d,
        None => {
            set_last_error(format!(
                "emit_frame_shm_ring: invalid target handle {target}"
            ));
            return ERR_KITTY_TRANSPORT;
        }
    };
    let pixel_count = (width as usize) * (height as usize) * 4;

    let t_rb = Instant::now();
    let mut readback_us = 0u64;
    let mut encode_us = 0u64;
    let result = do_readback_with(pctx, target, width, height, |rgba| {
        readback_us = t_rb.elapsed().as_micros() as u64;
        let t_enc = Instant::now();
        let res = emit_shm_rgba_with_owner(rgba, width, height, image_id, 0, 0, 0, None);
        encode_us = t_enc.elapsed().as_micros() as u64;
        res
    });
    let (rc, transfer) = match result {
        Some(result) => result,
        None => {
            set_last_error("emit_frame_shm_ring: GPU readback returned 0 bytes");
            return ERR_KITTY_TRANSPORT;
        }
    };
    let total_us = t0.elapsed().as_micros() as u64;

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_FINAL_FRAME;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = pixel_count as u64;
        stats.readback_us = readback_us;
        stats.encode_us = encode_us;
        stats.write_us = transfer.write_us;
        stats.total_us = total_us;
        stats.transport = NativePresentationStats::TRANSPORT_SHM;
        stats.flags = NativePresentationStats::FLAG_NATIVE_USED;
        if rc == OK {
            stats.flags |= NativePresentationStats::FLAG_VALID;
        }
        write_transfer_stats(stats, transfer);
    }
    rc
}

unsafe fn emit_frame_with_owner(
    pctx: &mut PaintContext, target: u64, image_id: u32,
    stats_out: *mut NativePresentationStats, owner: Option<&mut u64>,
) -> i32 {
    let t0 = Instant::now();
    let mode = if owner.is_some() { 2 } else { TRANSPORT_MODE.with(|c| c.get()) };
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

    // GPU readback — timed. The callback starts encode/hash timing only after
    // the mapped bytes are ready, so readback_us stays independent.
    let t_rb = Instant::now();
    let mut readback_us = 0u64;
    let mut encode_us = 0u64;
    let result = do_readback_with(pctx, target, width, height, |rgba| {
        readback_us = t_rb.elapsed().as_micros() as u64;
        let t_enc = Instant::now();
        let result = match mode {
            2 => emit_shm_rgba_with_owner(rgba, width, height, image_id, 0, 0, 0, owner),
            _ => (
                emit_direct_inner(rgba, width, height, image_id),
                ShmTransferStats::default(),
            ),
        };
        encode_us = t_enc.elapsed().as_micros() as u64;
        result
    });
    let (rc, transfer) = match result {
        Some(result) => result,
        None => {
            set_last_error("emit_frame_with_stats: GPU readback returned 0 bytes");
            return ERR_KITTY_TRANSPORT;
        }
    };
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
    let mut readback_us = 0u64;
    let mut encode_us = 0u64;
    let result = do_readback_with(pctx, target, width, height, |rgba| {
        readback_us = t_rb.elapsed().as_micros() as u64;
        let t_enc = Instant::now();
        let result = match mode {
            2 => emit_shm_rgba_at_with_stats(rgba, width, height, image_id, col, row, z),
            _ => (
                emit_direct_rgba_at(rgba, width, height, image_id, col, row, z),
                ShmTransferStats::default(),
            ),
        };
        encode_us = t_enc.elapsed().as_micros() as u64;
        result
    });
    let (rc, transfer) = match result {
        Some(result) => result,
        None => {
            set_last_error("emit_layer_target_with_stats: GPU readback returned 0 bytes");
            return ERR_KITTY_TRANSPORT;
        }
    };
    let total_us = t0.elapsed().as_micros() as u64;

    if !stats_out.is_null() {
        let stats = &mut *stats_out;
        stats.version = NativePresentationStats::VERSION;
        stats.mode = NativePresentationStats::MODE_LAYER;
        stats.rgba_bytes_read = 0;
        stats.kitty_bytes_emitted = pixel_count as u64;
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
    let (width, height, view_ptr) = match pctx.targets.get(target) {
        Some(rec) => (rec.width, rec.height, &rec.view as *const wgpu::TextureView),
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
    let pool = pctx.ensure_regional_pool() as *mut crate::composite::readback::RegionalReadbackPool;
    let view = unsafe { &*view_ptr };

    let mut readback_us = 0u64;
    let mut encode_us = 0u64;
    let mut transfer = ShmTransferStats::default();
    let mut written = 0u32;
    let mut rc = OK;

    let res = crate::composite::readback::readback_region_with(
        unsafe { &mut *pool },
        &pctx.wgpu.device,
        &pctx.wgpu.queue,
        &pctx.wgpu.pipelines.unpremultiply_pack,
        &pctx.wgpu.pipelines.unpremultiply_bgl,
        view,
        width,
        height,
        x,
        y,
        w,
        h,
        |mapped| {
            readback_us = t_rb.elapsed().as_micros() as u64;
            let t_enc = Instant::now();
            let result = emit_region_rgba_with_stats(mapped, image_id, x, y, w, h, mode);
            encode_us = t_enc.elapsed().as_micros() as u64;
            rc = result.0;
            transfer = result.1;
            written = mapped.len() as u32;
        },
    );

    if res.is_none() || written == 0 {
        set_last_error("emit_region_target_with_stats: GPU region readback returned 0 bytes");
        return ERR_KITTY_TRANSPORT;
    }

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
    forget_image_frame(image_id);
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
    emit_shm_rgba_with_owner(rgba, width, height, image_id, col, row, z, None)
}

fn emit_shm_rgba_with_owner(
    rgba: &[u8], width: u32, height: u32, image_id: u32,
    col: i32, row: i32, _z: i32, owner: Option<&mut u64>,
) -> (i32, ShmTransferStats) {
    use crate::kitty::encoder::PixelPayload;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;

    let mut stats = ShmTransferStats {
        raw_bytes: rgba.len() as u64,
        ..ShmTransferStats::default()
    };
    let existing_frame = image_frame(image_id);
    let animation_frame = existing_frame.filter(|_| !needs_full_transmit(image_id, width, height));
    let compression = shm_compression_enabled();
    let t_compress = Instant::now();
    let encoded = PixelPayload::encode(rgba, compression);
    stats.compress_us = if compression {
        t_compress.elapsed().as_micros() as u64
    } else {
        0
    };
    stats.compressed = encoded.compressed();
    let payload = encoded.bytes();
    stats.payload_bytes = payload.len() as u64;
    let compression_param = encoded.parameter();
    let t_shm = Instant::now();
    let (lease, shm_name) = match ShmLease::prepare(payload, owner.is_some()) {
        Ok(res) => res,
        Err(rc) => return (rc, stats),
    };
    stats.shm_prepare_us = t_shm.elapsed().as_micros() as u64;
    let name_b64 = B64.encode(shm_name.as_bytes());
    let data_len = payload.len();
    let quiet = if owner.is_some() { 1 } else { 2 };
    let (target_frame, escape) = if let Some(existing) = animation_frame {
        let (target_frame, compose_frame, is_replacement) =
            next_animation_frame(Some(existing));
        let frame_params = if is_replacement {
            format!("r={target_frame},c={compose_frame}")
        } else {
            format!("c={compose_frame}")
        };
        (
            Some(target_frame),
            format!(
                "\x1b7\x1b[{};{}H\x1b_Ga=f,i={image_id},{frame_params},f=32,s={width},v={height},C=1,t=s{compression_param},S={data_len},q={quiet};{name_b64}\x1b\\\x1b_Ga=a,i={image_id},c={target_frame},q=2;\x1b\\\x1b8",
                row.max(0) + 1,
                col.max(0) + 1,
            ),
        )
    } else {
        (
            None,
            format!(
                "\x1b7\x1b[{};{}H\x1b_Ga=d,d=i,i={image_id},q=2;\x1b\\\x1b_Ga=t,f=32,s={width},v={height},i={image_id},C=1,t=s{compression_param},S={data_len},q={quiet};{name_b64}\x1b\\\x1b_Ga=p,i={image_id},p=1,C=1,q=2;\x1b\\\x1b8",
                row.max(0) + 1,
                col.max(0) + 1,
            ),
        )
    };
    let t_write = Instant::now();
    let write_result = write_transport(escape.as_bytes());
    stats.write_us = t_write.elapsed().as_micros() as u64;
    match write_result {
        Ok(()) => {
            lease.publish(owner);
            record_image_frame(image_id, target_frame);
            record_image_geometry(image_id, width, height);
            (OK, stats)
        }
        Err(e) => {
            lease.cancel();
            set_last_error(format!("emit_shm_rgba: stdout write failed: {e}"));
            (ERR_KITTY_TRANSPORT, stats)
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
    use super::shm::{shm_prepare_ring, shm_ring_fail_closed, shm_ring_mark_in_flight};
    use crate::kitty::encoder::PixelPayload;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine as _;

    let mut stats = ShmTransferStats {
        raw_bytes: rgba.len() as u64,
        ..ShmTransferStats::default()
    };
    let existing_frame = image_frame(image_id);
    let frame_id = existing_frame.unwrap_or(2);
    let compression = mode != 2 || shm_compression_enabled();
    let t_compress = Instant::now();
    let encoded = PixelPayload::encode(rgba, compression);
    stats.compress_us = if compression {
        t_compress.elapsed().as_micros() as u64
    } else {
        0
    };
    stats.compressed = encoded.compressed();
    let payload = encoded.bytes();
    stats.payload_bytes = payload.len() as u64;
    let compression_param = encoded.parameter();
    let previous_frame = frame_id.saturating_sub(1);
    let meta = format!(
        "a=f,i={image_id},r={frame_id},c={previous_frame},x={rx},y={ry},s={rw},v={rh},f=32,X=1{compression_param},q=2"
    );
    let control = format!("\x1b_Ga=a,i={image_id},c={frame_id},q=2;\x1b\\");

    let (escape, shm_slot) = if mode == 2 {
        // SHM mode for region patch
        let t_shm = Instant::now();
        let (slot_index, shm_name) = match shm_prepare_ring(payload) {
            Ok(res) => res,
            Err(_) => return (ERR_KITTY_TRANSPORT, stats),
        };
        stats.shm_prepare_us = t_shm.elapsed().as_micros() as u64;
        let name_b64 = B64.encode(shm_name.as_bytes());
        let prefix = if existing_frame.is_none() {
            format!("\x1b_Ga=d,d=i,i={image_id},q=2;\x1b\\")
        } else {
            String::new()
        };
        let data_len = payload.len();
        (
            format!("{prefix}\x1b_G{meta},t=s,S={data_len};{name_b64}\x1b\\{control}"),
            Some(slot_index),
        )
    } else {
        // Direct mode
        let b64 = B64.encode(payload);
        let prefix = if existing_frame.is_none() {
            format!("\x1b_Ga=d,d=i,i={image_id},q=2;\x1b\\")
        } else {
            String::new()
        };
        (format!("{prefix}\x1b_G{meta};{b64}\x1b\\{control}"), None)
    };

    let t_write = Instant::now();
    match write_transport(escape.as_bytes()) {
        Ok(()) => {
            if let Some(slot_index) = shm_slot {
                shm_ring_mark_in_flight(slot_index);
            }
            record_image_frame(image_id, Some(frame_id));
            stats.write_us = t_write.elapsed().as_micros() as u64;
            (OK, stats)
        }
        Err(e) => {
            if let Some(slot_index) = shm_slot {
                shm_ring_fail_closed(slot_index);
            }
            stats.write_us = t_write.elapsed().as_micros() as u64;
            set_last_error(format!("emit_region_rgba: stdout write failed: {e}"));
            (ERR_KITTY_TRANSPORT, stats)
        }
    }
}

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
#[path = "transport_tests.rs"]
mod tests;
