// native/libvexart/src/kitty/encoder.rs
// zlib compress → base64 encode → Kitty escape-sequence assembly.
// Phase 2b Slice 3, task 3.1. Per REQ-2B-101/103.
//
// Kitty direct-mode chunking (4096-byte base64 chunks):
//   First chunk:  \x1b_Ga=T,f=32,s={w},v={h},i={id},C=1,o=z,m=1;{b64}\x1b\\
//   Middle chunks: \x1b_Gm=1;{b64}\x1b\\
//   Last chunk:   \x1b_Gm=0;{b64}\x1b\\
//   Single chunk: \x1b_Ga=T,f=32,s={w},v={h},i={id},C=1,o=z,m=0;{b64}\x1b\\

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use flate2::Compression;
use flate2::write::ZlibEncoder;
use std::io::Write;

const CHUNK_SIZE: usize = 4096;

/// Compress RGBA bytes with zlib (deflate) and return the compressed bytes.
pub fn compress_rgba(rgba: &[u8]) -> Vec<u8> {
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
    enc.write_all(rgba).expect("zlib write failed");
    enc.finish().expect("zlib finish failed")
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
    // 1. zlib compress.
    let compressed = compress_rgba(rgba);

    // 2. base64 encode.
    let b64 = B64.encode(&compressed);

    // 3. Split into 4096-byte chunks.
    let chunks: Vec<&str> = b64
        .as_bytes()
        .chunks(CHUNK_SIZE)
        .map(|c| std::str::from_utf8(c).expect("base64 is always valid utf8"))
        .collect();

    let mut out = Vec::with_capacity(b64.len() + chunks.len() * 32);

    if chunks.is_empty() {
        // Empty frame — emit a minimal escape with m=0 and no data.
        let header = format!(
            "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},C=1,o=z,m=0;\x1b\\"
        );
        out.extend_from_slice(header.as_bytes());
        return out;
    }

    if chunks.len() == 1 {
        // Single chunk: no continuation.
        let seq = format!(
            "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},C=1,o=z,m=0;{}\x1b\\",
            chunks[0]
        );
        out.extend_from_slice(seq.as_bytes());
        return out;
    }

    // Multiple chunks.
    // First chunk: carries all metadata, m=1 (more follows).
    let first = format!(
        "\x1b_Ga=T,f=32,s={width},v={height},i={image_id},C=1,o=z,m=1;{}\x1b\\",
        chunks[0]
    );
    out.extend_from_slice(first.as_bytes());

    // Middle chunks: m=1.
    for chunk in &chunks[1..chunks.len() - 1] {
        let mid = format!("\x1b_Gm=1;{chunk}\x1b\\");
        out.extend_from_slice(mid.as_bytes());
    }

    // Last chunk: m=0.
    let last = format!("\x1b_Gm=0;{}\x1b\\", chunks[chunks.len() - 1]);
    out.extend_from_slice(last.as_bytes());

    out
}

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    /// Decompress zlib bytes.
    fn zlib_decompress(data: &[u8]) -> Vec<u8> {
        let mut dec = ZlibDecoder::new(data);
        let mut out = Vec::new();
        dec.read_to_end(&mut out).expect("decompress failed");
        out
    }

    #[test]
    fn test_compress_roundtrip() {
        // REQ-2B-103: zlib compress+decompress matches original.
        let original: Vec<u8> = (0u8..=255).cycle().take(64 * 64 * 4).collect();
        let compressed = compress_rgba(&original);
        let decompressed = zlib_decompress(&compressed);
        assert_eq!(
            decompressed, original,
            "zlib roundtrip must recover original bytes"
        );
    }

    #[test]
    fn test_compress_is_smaller_than_raw() {
        // REQ-2B-103: compressed output is smaller than raw base64.
        // Use a 200×200 frame filled with typical UI color (mostly one color = high compressibility).
        let mut rgba = vec![0u8; 200 * 200 * 4];
        // Fill with near-solid background (high repetition → good compression).
        for i in 0..rgba.len() / 4 {
            rgba[i * 4] = 0x1e;
            rgba[i * 4 + 1] = 0x1e;
            rgba[i * 4 + 2] = 0x2e;
            rgba[i * 4 + 3] = 0xff;
        }
        let compressed = compress_rgba(&rgba);
        assert!(
            compressed.len() < rgba.len(),
            "compressed ({}) should be smaller than raw ({})",
            compressed.len(),
            rgba.len()
        );
    }

    #[test]
    fn test_encode_frame_direct_starts_with_kitty_escape() {
        // REQ-2B-101: encode a 64×64 red frame, verify output starts with \x1b_G.
        let mut rgba = vec![0u8; 64 * 64 * 4];
        // Fill with solid red.
        for i in 0..64 * 64 {
            rgba[i * 4] = 0xff;     // R
            rgba[i * 4 + 1] = 0x00; // G
            rgba[i * 4 + 2] = 0x00; // B
            rgba[i * 4 + 3] = 0xff; // A
        }

        let out = encode_frame_direct(&rgba, 64, 64, 1);
        assert!(
            !out.is_empty(),
            "encode output must not be empty"
        );
        // Must start with Kitty APC introducer.
        assert!(
            out.starts_with(b"\x1b_G"),
            "output must start with \\x1b_G"
        );
        // Must end with ST terminator.
        assert!(
            out.ends_with(b"\x1b\\"),
            "output must end with \\x1b\\"
        );
        // Must contain base64 characters.
        let text = std::str::from_utf8(&out).expect("output must be valid utf8");
        assert!(
            text.contains("o=z"),
            "direct mode must include o=z compression flag"
        );
        assert!(
            text.contains("f=32"),
            "output must include f=32 (RGBA format)"
        );
        assert!(
            text.contains("a=T"),
            "output must include a=T (transmit+display)"
        );
        assert!(
            text.contains("C=1"),
            "output must include C=1 to prevent terminal cursor movement/scroll"
        );
        assert!(
            text.contains("s=64"),
            "output must include s=64 (width)"
        );
        assert!(
            text.contains("v=64"),
            "output must include v=64 (height)"
        );
    }

    #[test]
    fn test_encode_frame_direct_single_chunk_no_continuation() {
        // A tiny 4×4 frame should produce a single chunk (m=0, no m=1).
        let rgba = vec![0xffu8; 4 * 4 * 4];
        let out = encode_frame_direct(&rgba, 4, 4, 42);
        let text = std::str::from_utf8(&out).expect("valid utf8");
        // Single-chunk: contains exactly one escape sequence.
        let esc_count = text.matches("\x1b_G").count();
        assert_eq!(esc_count, 1, "tiny frame should produce exactly 1 escape");
        assert!(text.contains("m=0"), "single chunk must use m=0");
        assert!(!text.contains("m=1"), "single chunk must NOT use m=1");
    }

    #[test]
    fn test_encode_frame_direct_multi_chunk_has_continuation() {
        // A large frame (1920×1080) must produce multiple chunks with m=1/m=0.
        let rgba = vec![0xabu8; 1920 * 1080 * 4];
        let out = encode_frame_direct(&rgba, 1920, 1080, 7);
        let text = std::str::from_utf8(&out).expect("valid utf8");
        assert!(
            text.contains("m=1"),
            "large frame must use m=1 for continuation chunks"
        );
        // Last escape must use m=0.
        let last_escape_idx = text.rfind("\x1b_G").expect("must have escape");
        let last_escape = &text[last_escape_idx..];
        assert!(
            last_escape.starts_with("\x1b_Gm=0;"),
            "last chunk must use m=0"
        );
    }

    #[test]
    fn test_chunk_size_boundary() {
        // Verify chunks are at most CHUNK_SIZE bytes of base64.
        let rgba = vec![0x7fu8; 1920 * 1080 * 4];
        let out = encode_frame_direct(&rgba, 1920, 1080, 3);
        let text = std::str::from_utf8(&out).expect("valid utf8");

        // Extract base64 payload from each escape sequence.
        for part in text.split("\x1b_G").skip(1) {
            // part is: "params;b64data\x1b\\"
            if let Some(semi) = part.find(';') {
                let payload_and_rest = &part[semi + 1..];
                if let Some(end) = payload_and_rest.find("\x1b\\") {
                    let b64_chunk = &payload_and_rest[..end];
                    assert!(
                        b64_chunk.len() <= CHUNK_SIZE,
                        "chunk ({}) exceeds CHUNK_SIZE ({})",
                        b64_chunk.len(),
                        CHUNK_SIZE
                    );
                }
            }
        }
    }
}
