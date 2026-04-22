// native/libvexart/src/kitty/transport.rs
// Transport mode selection and routing for Kitty frame emission.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-102.
//
// Modes (match vexart_kitty_set_transport param):
//   0 = direct  — base64-chunked inline in escape sequences (default)
//   1 = file    — temp file (not yet implemented; falls back to direct)
//   2 = shm     — POSIX shared memory via existing shm.rs
//
// Thread-local transport mode so each FFI call context is independent.

use std::cell::Cell;

use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};
use crate::paint::PaintContext;
use super::encoder::encode_frame_direct;
use super::writer::write_to_stdout;

// Active transport mode for the current thread. 0=direct (default), 1=file, 2=shm.
thread_local! {
    static TRANSPORT_MODE: Cell<u32> = const { Cell::new(0) };
}

/// Set the transport mode for this thread. Called from `vexart_kitty_set_transport`.
///
/// `mode`: 0=direct, 1=file, 2=shm.
pub fn set_transport_mode(mode: u32) -> i32 {
    if mode > 2 {
        set_last_error(format!("invalid transport mode: {mode} (expected 0=direct, 1=file, 2=shm)"));
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
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD as B64;

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
        "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},t=s,o=z,q=2;{name_b64}\x1b\\"
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

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

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
}
