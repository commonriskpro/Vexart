//! Kitty graphics APC command formatting and zlib compression integration.

use std::ffi::CStr;
use std::time::Instant;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;

use crate::kitty::encoder::compress_rgba;
use crate::kitty::placeholder::placeholder_grid::encode_grid;
use crate::kitty::writer::wrap_tmux_apc;

pub const CHUNK_SIZE: usize = 4096;

#[derive(Debug)]
pub struct PreparedFrame {
    pub output: Vec<u8>,
    pub raw_bytes: u64,
    pub payload_bytes: u64,
    pub compress_us: u64,
}

pub fn make_apc(header: &str, payload: &[u8]) -> Vec<u8> {
    let mut apc = Vec::with_capacity(header.len() + payload.len() + 2);
    apc.extend_from_slice(header.as_bytes());
    apc.extend_from_slice(payload);
    apc.extend_from_slice(b"\x1b\\");
    apc
}

pub fn encode_upload_apcs(
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

pub fn delete_apc(image_id: u32) -> Vec<u8> {
    make_apc(&format!("\x1b_Ga=d,d=I,i={image_id},q=2;"), &[])
}

pub fn encode_shm_upload_apc(
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

pub fn assemble_shm_output(upload_apc: &[u8], grid: Option<&[u8]>) -> Vec<u8> {
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

pub fn assemble_output_for_image(upload_apcs: &[Vec<u8>], grid: &[u8]) -> Vec<u8> {
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

pub fn prepare_frame(
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
