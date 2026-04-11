/// Text rendering — rasterize glyphs from a pre-rendered grayscale atlas
/// into a pixel buffer with proper alpha blending.
///
/// The atlas is generated from a TTF font (SF Mono) at build time.
/// Each glyph is stored as grayscale alpha values (0-255), giving
/// smooth antialiased text rendering — browser-quality in the terminal.
const std = @import("std");
const atlas = @import("font_atlas.zig");

const PixelBuffer = @import("lib.zig").PixelBuffer;
const blend = @import("lib.zig").blend;

/// Draw a single glyph at (x, y) with the given color.
/// The alpha from the atlas modulates the color's alpha for antialiasing.
pub fn drawGlyph(buf: *PixelBuffer, x: i32, y: i32, codepoint: u32, r: u8, g: u8, b: u8, a: u8) void {
    if (codepoint < atlas.first_cp or codepoint > atlas.last_cp) return;
    const idx = codepoint - atlas.first_cp;
    const glyph_offset = idx * atlas.cell_width * atlas.cell_height;

    for (0..atlas.cell_height) |row_idx| {
        const py = y + @as(i32, @intCast(row_idx));
        if (py < 0) continue;
        if (py >= @as(i32, @intCast(buf.height))) break;

        for (0..atlas.cell_width) |col_idx| {
            const px = x + @as(i32, @intCast(col_idx));
            if (px < 0) continue;
            if (px >= @as(i32, @intCast(buf.width))) break;

            const coverage = atlas.data[glyph_offset + row_idx * atlas.cell_width + col_idx];
            if (coverage == 0) continue;

            // Modulate: final alpha = glyph coverage * text alpha / 255
            const final_a: u32 = (@as(u32, coverage) * @as(u32, a) + 127) / 255;
            blend(buf, @intCast(px), @intCast(py), r, g, b, @intCast(final_a));
        }
    }
}

/// Draw a string of ASCII text at (x, y).
/// Returns the total width in pixels.
pub fn drawText(buf: *PixelBuffer, x: i32, y: i32, text_ptr: [*]const u8, text_len: u32, r: u8, g: u8, b: u8, a: u8) u32 {
    var cx: i32 = x;
    var i: u32 = 0;
    while (i < text_len) : (i += 1) {
        const cp: u32 = text_ptr[i];
        drawGlyph(buf, cx, y, cp, r, g, b, a);
        cx += @intCast(atlas.cell_width);
    }
    return text_len * atlas.cell_width;
}

/// Measure the width of a text string in pixels (no rendering).
pub fn measureText(text_len: u32) u32 {
    return text_len * atlas.cell_width;
}

// ── Tests ──

test "drawGlyph A renders non-zero pixels" {
    var pixels = [_]u8{0} ** (64 * 64 * 4); // 64x64 buffer
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    drawGlyph(&buf, 0, 0, 'A', 255, 255, 255, 255);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0 or pixels[j + 1] != 0 or pixels[j + 2] != 0) count += 1;
    }
    try std.testing.expect(count > 0);
}

test "measureText returns correct width" {
    try std.testing.expectEqual(atlas.cell_width * 5, measureText(5));
}

test "drawGlyph space renders no pixels" {
    var pixels = [_]u8{0} ** (64 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    drawGlyph(&buf, 0, 0, ' ', 255, 255, 255, 255);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0) count += 1;
    }
    try std.testing.expectEqual(@as(u32, 0), count);
}
