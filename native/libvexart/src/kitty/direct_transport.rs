// Direct stdout Kitty graphics emission (chunked base64 inline escapes).

#[cfg(test)]
use std::cell::Cell;

use crate::kitty::encoder::{encode_animation_frame_direct, encode_frame_direct};
use crate::kitty::writer::write_to_stdout;
use super::frame_cache::{
    image_frame, needs_full_transmit, next_animation_frame, payload_hash, payload_unchanged,
    record_image_frame, record_image_geometry, record_payload,
};
use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_KITTY_TRANSPORT, OK};

thread_local! {
    // Test-only failure injection keeps output-path retry tests independent of
    // the process stdout used by the native transport.
    #[cfg(test)]
    pub static FORCE_WRITE_FAILURE: Cell<bool> = const { Cell::new(false) };
}

#[inline]
pub fn write_transport(data: &[u8]) -> std::io::Result<()> {
    #[cfg(test)]
    if FORCE_WRITE_FAILURE.with(|failure| failure.get()) {
        return Err(std::io::Error::other("forced transport write failure"));
    }
    write_to_stdout(data)
}

/// Emit already-read RGBA data using direct mode (encode → stdout).
pub fn emit_direct_inner(rgba: &[u8], width: u32, height: u32, image_id: u32) -> i32 {
    let existing_frame = image_frame(image_id);
    let animation_frame = existing_frame.filter(|_| !needs_full_transmit(image_id, width, height));
    let full_transmit = animation_frame.is_none();
    let digest = payload_hash(rgba, width, height, 0, 0, 0);
    if payload_unchanged(image_id, digest) {
        return OK;
    }
    let (target_frame, escaped) = if let Some(existing) = animation_frame {
        let (target_frame, compose_frame, is_replacement) =
            next_animation_frame(Some(existing));
        (
            Some(target_frame),
            encode_animation_frame_direct(
                rgba,
                width,
                height,
                image_id,
                target_frame,
                compose_frame,
                is_replacement,
            ),
        )
    } else {
        (None, encode_frame_direct(rgba, width, height, image_id))
    };
    let stale_delete = if full_transmit {
        format!("\x1b_Ga=d,d=i,i={image_id},q=2;\x1b\\")
    } else {
        String::new()
    };
    let positioned = format!(
        "\x1b7\x1b[1;1H{stale_delete}{}\x1b8",
        String::from_utf8_lossy(&escaped)
    );
    match write_transport(positioned.as_bytes()) {
        Ok(()) => {
            record_image_frame(image_id, target_frame);
            record_image_geometry(image_id, width, height);
            record_payload(image_id, digest);
            OK
        }
        Err(e) => {
            set_last_error(format!("emit_direct_inner: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

pub fn emit_direct_rgba_at(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    col: i32,
    row: i32,
    z: i32,
) -> i32 {
    let existing_frame = image_frame(image_id);
    let animation_frame = existing_frame.filter(|_| !needs_full_transmit(image_id, width, height));
    let full_transmit = animation_frame.is_none();
    let digest = payload_hash(rgba, width, height, col, row, z);
    if payload_unchanged(image_id, digest) {
        return OK;
    }
    let (target_frame, escaped) = if let Some(existing) = animation_frame {
        let (target_frame, compose_frame, is_replacement) =
            next_animation_frame(Some(existing));
        (
            Some(target_frame),
            encode_animation_frame_direct(
                rgba,
                width,
                height,
                image_id,
                target_frame,
                compose_frame,
                is_replacement,
            ),
        )
    } else {
        (None, encode_frame_direct(rgba, width, height, image_id))
    };
    let row = row.max(0) + 1;
    let col = col.max(0) + 1;
    let stale_delete = if full_transmit {
        format!("\x1b_Ga=d,d=i,i={image_id},q=2;\x1b\\")
    } else {
        String::new()
    };
    let positioned = format!(
        "\x1b7\x1b[{row};{col}H{stale_delete}{}\x1b8",
        String::from_utf8_lossy(&escaped)
    );
    match write_transport(positioned.as_bytes()) {
        Ok(()) => {
            record_image_frame(image_id, target_frame);
            record_image_geometry(image_id, width, height);
            record_payload(image_id, digest);
            OK
        }
        Err(e) => {
            set_last_error(format!("emit_direct_rgba_at: stdout write failed: {e}"));
            ERR_KITTY_TRANSPORT
        }
    }
}
