// native/libvexart/src/kitty/encoder.rs
// zlib compress → base64 encode → Kitty escape-sequence assembly.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-101/103.
//
// Kitty direct-mode chunking (4096-byte base64 chunks):
//   First frame:   \x1b_Ga=T,f=32,s={w},v={h},i={id},p=1,C=1,o=z,m=1;{b64}\x1b\\
//   Middle chunks: \x1b_Gm=1;{b64}\x1b\\
//   Last chunk:   \x1b_Gm=0;{b64}\x1b\\
//   Updates use animation frames (`a=f` + `a=a`) so the visible frame stays
//   on screen while a new payload is uploaded.
//
// The first frame is a complete transmit-and-place command. Subsequent updates
// use the animation protocol so the previous frame remains visible during upload.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::io::Write;

const CHUNK_SIZE: usize = 4096;
const RAW_CHUNK_SIZE: usize = 3072;

/// Compress RGBA bytes with zlib (deflate) and return the compressed bytes.
pub fn compress_rgba(rgba: &[u8]) -> Result<Vec<u8>, std::io::Error> {
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::fast());
    enc.write_all(rgba)?;
    enc.finish()
}

/// The wire encoding travels with its bytes; headers never infer it from size.
pub(crate) enum PixelPayload<'a> {
    Raw(&'a [u8]),
    Zlib(Vec<u8>),
}

impl<'a> PixelPayload<'a> {
    pub(crate) fn encode(rgba: &'a [u8], compress: bool) -> Self {
        if !compress {
            return Self::Raw(rgba);
        }
        match compress_rgba(rgba) {
            Ok(bytes) => Self::Zlib(bytes),
            // Compression is optional; the raw representation remains valid.
            Err(_) => Self::Raw(rgba),
        }
    }

    pub(crate) fn bytes(&self) -> &[u8] {
        match self {
            Self::Raw(bytes) => bytes,
            Self::Zlib(bytes) => bytes,
        }
    }

    pub(crate) fn parameter(&self) -> &'static str {
        match self {
            Self::Raw(_) => "",
            Self::Zlib(_) => ",o=z",
        }
    }

    pub(crate) fn compressed(&self) -> bool {
        matches!(self, Self::Zlib(_))
    }
}

/// Encode a complete frame for direct Kitty transmission.
///
/// Returns the full byte sequence to be written to stdout, consisting of one
/// or more APC escape sequences (`\x1b_G…\x1b\\`).
///
/// # Arguments
/// * `rgba`     — raw RGBA pixel data (width × height × 4 bytes)
/// * `width`    — frame width in pixels
/// * `height`   — frame height in pixels
/// * `image_id` — Kitty image ID (must be > 0)
pub fn encode_frame_direct(rgba: &[u8], width: u32, height: u32, image_id: u32) -> Vec<u8> {
    let payload = PixelPayload::encode(rgba, true);
    let compression = payload.parameter();
    let raw = payload.bytes();
    let raw_len = raw.len();
    let b64_len = if raw_len == 0 {
        0
    } else {
        raw_len.div_ceil(3) * 4
    };
    let num_chunks = if raw_len == 0 {
        0
    } else {
        raw_len.div_ceil(RAW_CHUNK_SIZE)
    };

    let mut out = Vec::with_capacity(b64_len + num_chunks.max(1) * 32 + 64);
    let mut b64_buf = [0u8; CHUNK_SIZE];
    let mut raw_chunks = raw.chunks(RAW_CHUNK_SIZE);

    if let Some(first) = raw_chunks.next() {
        let is_single = raw_chunks.len() == 0;
        let m = if is_single { "0" } else { "1" };
        let _ = write!(
            out,
            "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},p=1,C=1{compression},m={m};"
        );
        let written = B64.encode_slice(first, &mut b64_buf).expect("encode slice");
        out.extend_from_slice(&b64_buf[..written]);
        out.extend_from_slice(b"\x1b\\");

        while let Some(chunk) = raw_chunks.next() {
            let is_last = raw_chunks.len() == 0;
            let prefix = if is_last {
                b"\x1b_Gm=0;"
            } else {
                b"\x1b_Gm=1;"
            };
            out.extend_from_slice(prefix);
            let written = B64.encode_slice(chunk, &mut b64_buf).expect("encode slice");
            out.extend_from_slice(&b64_buf[..written]);
            out.extend_from_slice(b"\x1b\\");
        }
    } else {
        let _ = write!(
            out,
            "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},p=1,C=1{compression},m=0;\x1b\\"
        );
    }

    out
}

/// Encode a complete update as a Kitty animation frame using ping-pong double
/// buffering. The visible frame remains displayed while the payload uploads to
/// `target_frame` composed with `compose_frame`. If `is_replacement` is true,
/// `r={target_frame}` replaces the target frame in-place.
/// The trailing animation-control command atomically displays `target_frame`.
pub fn encode_animation_frame_direct(
    rgba: &[u8],
    width: u32,
    height: u32,
    image_id: u32,
    target_frame: u32,
    compose_frame: u32,
    is_replacement: bool,
) -> Vec<u8> {
    let payload = PixelPayload::encode(rgba, true);
    let compression = payload.parameter();
    let raw = payload.bytes();
    let raw_len = raw.len();
    let b64_len = if raw_len == 0 {
        0
    } else {
        raw_len.div_ceil(3) * 4
    };
    let num_chunks = if raw_len == 0 {
        0
    } else {
        raw_len.div_ceil(RAW_CHUNK_SIZE)
    };

    let mut out = Vec::with_capacity(b64_len + num_chunks.max(1) * 48 + 64);
    let mut b64_buf = [0u8; CHUNK_SIZE];
    let mut raw_chunks = raw.chunks(RAW_CHUNK_SIZE);

    if let Some(first) = raw_chunks.next() {
        let is_single = raw_chunks.len() == 0;
        let m = if is_single { "0" } else { "1" };
        if is_replacement {
            let _ = write!(
                out,
                "\x1b_Ga=f,i={image_id},r={target_frame},c={compose_frame},f=32,s={width},v={height},C=1{compression},m={m};"
            );
        } else {
            let _ = write!(
                out,
                "\x1b_Ga=f,i={image_id},c={compose_frame},f=32,s={width},v={height},C=1{compression},m={m};"
            );
        }
        let written = B64.encode_slice(first, &mut b64_buf).expect("encode slice");
        out.extend_from_slice(&b64_buf[..written]);
        out.extend_from_slice(b"\x1b\\");

        while let Some(chunk) = raw_chunks.next() {
            let is_last = raw_chunks.len() == 0;
            let prefix = if is_last {
                b"\x1b_Ga=f,m=0;"
            } else {
                b"\x1b_Ga=f,m=1;"
            };
            out.extend_from_slice(prefix);
            let written = B64.encode_slice(chunk, &mut b64_buf).expect("encode slice");
            out.extend_from_slice(&b64_buf[..written]);
            out.extend_from_slice(b"\x1b\\");
        }
    } else if is_replacement {
        let _ = write!(
            out,
            "\x1b_Ga=f,i={image_id},r={target_frame},c={compose_frame},f=32,s={width},v={height},C=1{compression},m=0;\x1b\\"
        );
    } else {
        let _ = write!(
            out,
            "\x1b_Ga=f,i={image_id},c={compose_frame},f=32,s={width},v={height},C=1{compression},m=0;\x1b\\"
        );
    }
    let _ = write!(out, "\x1b_Ga=a,i={image_id},c={target_frame},q=2;\x1b\\");
    out
}

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
#[path = "encoder_tests.rs"]
mod tests;
