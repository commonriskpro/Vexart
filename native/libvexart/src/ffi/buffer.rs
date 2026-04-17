// native/libvexart/src/ffi/buffer.rs
// Packed ArrayBuffer decoder — mirrors the TS encoder in vexart-buffer.ts.
// See design §8 and REQ-NB-003.

pub const GRAPH_MAGIC: u32 = 0x56584152; // "VXAR" — cheap corruption check
pub const GRAPH_VERSION: u32 = 0x00020000; // Phase 2.0

/// Header of every paint/composite call buffer (first 16 bytes).
#[repr(C)]
pub struct GraphHeader {
    pub magic: u32,
    pub version: u32,
    pub cmd_count: u32,
    pub payload_bytes: u32,
}

/// Parse the 16-byte graph buffer header from a byte slice.
/// Returns Err with a static message on any validation failure.
pub fn parse_header(bytes: &[u8]) -> Result<GraphHeader, &'static str> {
    if bytes.len() < 16 {
        return Err("graph buffer too small");
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != GRAPH_MAGIC {
        return Err("graph magic mismatch");
    }
    let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    if version != GRAPH_VERSION {
        return Err("graph version mismatch");
    }
    Ok(GraphHeader {
        magic,
        version,
        cmd_count: u32::from_le_bytes(bytes[8..12].try_into().unwrap()),
        payload_bytes: u32::from_le_bytes(bytes[12..16].try_into().unwrap()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_valid_header(cmd_count: u32, payload_bytes: u32) -> [u8; 16] {
        let mut buf = [0u8; 16];
        buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&cmd_count.to_le_bytes());
        buf[12..16].copy_from_slice(&payload_bytes.to_le_bytes());
        buf
    }

    #[test]
    fn test_parse_valid_header() {
        let buf = make_valid_header(3, 128);
        let h = parse_header(&buf).expect("valid header should parse");
        assert_eq!(h.magic, GRAPH_MAGIC);
        assert_eq!(h.version, GRAPH_VERSION);
        assert_eq!(h.cmd_count, 3);
        assert_eq!(h.payload_bytes, 128);
    }

    #[test]
    fn test_parse_header_too_small() {
        let buf = [0u8; 8];
        let err = parse_header(&buf).unwrap_err();
        assert_eq!(err, "graph buffer too small");
    }

    #[test]
    fn test_parse_header_bad_magic() {
        let mut buf = make_valid_header(1, 0);
        buf[0] = 0xFF; // corrupt magic
        let err = parse_header(&buf).unwrap_err();
        assert_eq!(err, "graph magic mismatch");
    }

    #[test]
    fn test_parse_header_bad_version() {
        let mut buf = make_valid_header(1, 0);
        buf[4..8].copy_from_slice(&0x00010000u32.to_le_bytes()); // wrong version
        let err = parse_header(&buf).unwrap_err();
        assert_eq!(err, "graph version mismatch");
    }

    #[test]
    fn test_parse_header_exact_16_bytes() {
        let buf = make_valid_header(0, 0);
        let h = parse_header(&buf).expect("exactly 16 bytes is valid");
        assert_eq!(h.cmd_count, 0);
    }
}
