//! Unicode diacritics grid generation, cell calculations, and placement offset math.

use crate::kitty::diacritics::ROW_COLUMN_DIACRITICS;

pub const PLACEHOLDER: u32 = 0x10_EEEE;

/// The official Kitty table contains 297 marks, so each placeholder axis can
/// encode values 0..=296. Dimensions, rather than indices, therefore have a
/// maximum of 297 cells. Keeping this bound explicit avoids silently wrapping
/// large coordinates to a different image cell.
pub fn validate_dimensions(width: u32, height: u32, cols: u32, rows: u32) -> Result<usize, String> {
    if width == 0 || height == 0 {
        return Err("placeholder target dimensions must be non-zero".to_string());
    }
    if cols == 0 || rows == 0 {
        return Err("placeholder grid dimensions must be non-zero".to_string());
    }
    let max = ROW_COLUMN_DIACRITICS.len() as u32;
    if cols > max || rows > max {
        return Err(format!(
            "placeholder grid dimensions {cols}x{rows} exceed the Kitty diacritic bound {max}x{max}"
        ));
    }
    (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "placeholder target dimensions overflow RGBA byte count".to_string())
}

pub fn push_codepoint(output: &mut Vec<u8>, codepoint: u32) -> Result<(), String> {
    let character = char::from_u32(codepoint)
        .ok_or_else(|| format!("invalid placeholder codepoint U+{codepoint:06X}"))?;
    let mut bytes = [0u8; 4];
    output.extend_from_slice(character.encode_utf8(&mut bytes).as_bytes());
    Ok(())
}

pub fn encode_grid(image_id: u32, cols: u32, rows: u32) -> Result<Vec<u8>, String> {
    let cell_count = (cols as usize)
        .checked_mul(rows as usize)
        .ok_or_else(|| "placeholder grid cell count overflow".to_string())?;
    let mut grid = Vec::with_capacity(cell_count.saturating_mul(16) + rows as usize * 12 + 32);
    let red = (image_id >> 16) & 0xff;
    let green = (image_id >> 8) & 0xff;
    let blue = image_id & 0xff;
    grid.extend_from_slice(format!("\x1b[38;2;{red};{green};{blue}m").as_bytes());

    for row in 0..rows {
        // Position each row directly. No newline is emitted, so a bottom-right
        // cell cannot trigger a scroll even in terminals with unusual wrapping.
        grid.extend_from_slice(format!("\x1b[{};1H", row + 1).as_bytes());
        let row_mark = ROW_COLUMN_DIACRITICS[row as usize];
        for col in 0..cols {
            push_codepoint(&mut grid, PLACEHOLDER)?;
            push_codepoint(&mut grid, row_mark)?;
            push_codepoint(&mut grid, ROW_COLUMN_DIACRITICS[col as usize])?;
            // Always include the high byte. Omitting it relies on the cell to
            // the left and breaks when tmux horizontally clips or redraws text.
            push_codepoint(
                &mut grid,
                ROW_COLUMN_DIACRITICS[(image_id >> 24) as usize & 0xff],
            )?;
        }
    }
    grid.extend_from_slice(b"\x1b[39m");
    Ok(grid)
}
