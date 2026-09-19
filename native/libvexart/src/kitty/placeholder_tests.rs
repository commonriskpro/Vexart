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
