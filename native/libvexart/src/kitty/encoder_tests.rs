use super::*;
use flate2::read::ZlibDecoder;
use std::io::Read;

#[test]
fn payload_encoding_should_match_bytes_even_when_compression_expands() {
    let rgba = [1, 2, 3, 4];
    let raw = PixelPayload::encode(&rgba, false);
    assert_eq!(raw.parameter(), "");
    assert_eq!(raw.bytes(), rgba);
    let encoded = PixelPayload::encode(&rgba, true);
    assert!(encoded.bytes().len() > rgba.len());
    assert_eq!(encoded.parameter(), ",o=z");
    assert_eq!(zlib_decompress(encoded.bytes()), rgba);
}

#[test]
fn animation_continuations_should_keep_the_frame_action() {
    let mut seed = 7u32;
    let rgba = (0..64 * 64 * 4).map(|_| {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (seed >> 24) as u8
    }).collect::<Vec<_>>();
    let encoded = String::from_utf8(encode_animation_frame_direct(&rgba, 64, 64, 19, 2, 1, false)).unwrap();
    let chunks = encoded.split("\x1b_G").filter(|sequence| sequence.contains(";"))
        .filter(|sequence| !sequence.starts_with("a=a,"))
        .collect::<Vec<_>>();
    assert!(chunks.len() > 1);
    for chunk in chunks {
        assert!(chunk.starts_with("a=f,"));
        let payload = chunk.split_once(';').unwrap().1.trim_end_matches("\x1b\\");
        assert!(payload.len() <= CHUNK_SIZE);
    }
}

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
    let compressed = compress_rgba(&original).unwrap();
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
    let compressed = compress_rgba(&rgba).unwrap();
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
        rgba[i * 4] = 0xff; // R
        rgba[i * 4 + 1] = 0x00; // G
        rgba[i * 4 + 2] = 0x00; // B
        rgba[i * 4 + 3] = 0xff; // A
    }

    let out = encode_frame_direct(&rgba, 64, 64, 1);
    assert!(!out.is_empty(), "encode output must not be empty");
    // Must start with Kitty APC introducer.
    assert!(out.starts_with(b"\x1b_G"), "output must start with \\x1b_G");
    // Must end with ST terminator.
    assert!(out.ends_with(b"\x1b\\"), "output must end with \\x1b\\");
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
        "output must include a=T (initial frame)"
    );
    assert!(
        text.contains("p=1"),
        "output must include an explicit placement"
    );
    assert!(
        text.contains("C=1"),
        "output must include C=1 to prevent terminal cursor movement/scroll"
    );
    assert!(text.contains("s=64"), "output must include s=64 (width)");
    assert!(text.contains("v=64"), "output must include v=64 (height)");
}

#[test]
fn test_encode_frame_direct_single_chunk_no_continuation() {
    // A tiny 4×4 frame should produce a single chunk (m=0, no m=1).
    let rgba = vec![0xffu8; 4 * 4 * 4];
    let out = encode_frame_direct(&rgba, 4, 4, 42);
    let text = std::str::from_utf8(&out).expect("valid utf8");
    // Single-chunk transmission includes the initial placement.
    let esc_count = text.matches("\x1b_G").count();
    assert_eq!(
        esc_count, 1,
        "tiny frame should produce one complete command"
    );
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
    // The final transmission chunk must use m=0.
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

#[test]
fn test_encode_animation_frame_direct_initial_append() {
    let rgba = [0xff, 0x00, 0x00, 0xff];
    let out = encode_animation_frame_direct(&rgba, 1, 1, 42, 2, 1, false);
    let text = std::str::from_utf8(&out).expect("valid utf8");
    assert!(text.contains("c=1"), "must compose from frame 1");
    assert!(!text.contains("r="), "initial append must not specify r=");
    assert!(
        text.contains("\x1b_Ga=a,i=42,c=2,q=2;\x1b\\"),
        "must atomically switch to target frame 2"
    );
}

#[test]
fn test_encode_animation_frame_direct_replacement_frame1() {
    let rgba = [0x00, 0xff, 0x00, 0xff];
    let out = encode_animation_frame_direct(&rgba, 1, 1, 42, 1, 2, true);
    let text = std::str::from_utf8(&out).expect("valid utf8");
    assert!(
        text.contains("r=1,c=2"),
        "replacement must specify r=1,c=2"
    );
    assert!(
        text.contains("\x1b_Ga=a,i=42,c=1,q=2;\x1b\\"),
        "must atomically switch to target frame 1"
    );
}

#[test]
fn test_encode_animation_frame_direct_replacement_frame2() {
    let rgba = [0x00, 0x00, 0xff, 0xff];
    let out = encode_animation_frame_direct(&rgba, 1, 1, 42, 2, 1, true);
    let text = std::str::from_utf8(&out).expect("valid utf8");
    assert!(
        text.contains("r=2,c=1"),
        "replacement must specify r=2,c=1"
    );
    assert!(
        text.contains("\x1b_Ga=a,i=42,c=2,q=2;\x1b\\"),
        "must atomically switch to target frame 2"
    );
}

#[test]
fn test_encode_frame_direct_empty_rgba() {
    let out = encode_frame_direct(&[], 0, 0, 10);
    let text = std::str::from_utf8(&out).expect("valid utf8");
    assert!(text.starts_with("\x1b_G"));
    assert!(text.ends_with("\x1b\\"));
    assert!(text.contains("m=0;"));
}

#[test]
fn test_encode_frame_direct_streamed_chunks_reassemble_to_original() {
    // Generate 128x128 pseudo-random pixels (enough to span multiple 3072-byte chunks after zlib)
    let mut seed = 42u32;
    let original: Vec<u8> = (0..128 * 128 * 4)
        .map(|_| {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (seed >> 24) as u8
        })
        .collect();
    let out = encode_frame_direct(&original, 128, 128, 99);
    let text = std::str::from_utf8(&out).expect("valid utf8");

    let mut reassembled_b64 = String::new();
    let mut chunk_count = 0;
    for part in text.split("\x1b_G").skip(1) {
        if let Some(semi) = part.find(';') {
            let payload_and_rest = &part[semi + 1..];
            if let Some(end) = payload_and_rest.find("\x1b\\") {
                let b64_chunk = &payload_and_rest[..end];
                assert!(b64_chunk.len() <= CHUNK_SIZE);
                reassembled_b64.push_str(b64_chunk);
                chunk_count += 1;
            }
        }
    }
    assert!(chunk_count > 1, "128x128 random pixels should produce multiple chunks");

    let compressed = B64.decode(reassembled_b64.as_bytes()).expect("valid base64");
    let decompressed = zlib_decompress(&compressed);
    assert_eq!(decompressed, original, "reassembled base64 must decompress to original RGBA");
}

#[test]
fn test_encode_animation_frame_direct_streamed_chunks_reassemble_to_original() {
    let mut seed = 99u32;
    let original: Vec<u8> = (0..128 * 128 * 4)
        .map(|_| {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (seed >> 24) as u8
        })
        .collect();
    let out = encode_animation_frame_direct(&original, 128, 128, 101, 2, 1, true);
    let text = std::str::from_utf8(&out).expect("valid utf8");

    let mut reassembled_b64 = String::new();
    let mut chunk_count = 0;
    for part in text.split("\x1b_G").skip(1) {
        if part.starts_with("a=a,") {
            continue;
        }
        if let Some(semi) = part.find(';') {
            let payload_and_rest = &part[semi + 1..];
            if let Some(end) = payload_and_rest.find("\x1b\\") {
                let b64_chunk = &payload_and_rest[..end];
                assert!(b64_chunk.len() <= CHUNK_SIZE);
                reassembled_b64.push_str(b64_chunk);
                chunk_count += 1;
            }
        }
    }
    assert!(chunk_count > 1);

    let compressed = B64.decode(reassembled_b64.as_bytes()).expect("valid base64");
    let decompressed = zlib_decompress(&compressed);
    assert_eq!(decompressed, original);
    assert!(text.contains("\x1b_Ga=a,i=101,c=2,q=2;\x1b\\"));
}
