/// Text rendering — rasterize bitmap font glyphs into a pixel buffer.
///
/// Uses the embedded 8x8 VGA font (font.zig). Each glyph is blended
/// onto the pixel buffer with the specified color and alpha.
/// Supports optional 2x scaling for better readability on HiDPI.
const std = @import("std");
const font = @import("font.zig");

const PixelBuffer = @import("lib.zig").PixelBuffer;
const blend = @import("lib.zig").blend;

/// Draw a single glyph at (x, y) with the given color.
/// scale_x and scale_y control pixel doubling (1 = native, 2 = doubled).
pub fn drawGlyph(buf: *PixelBuffer, x: i32, y: i32, codepoint: u32, r: u8, g: u8, b: u8, a: u8, scale: u32) void {
    if (codepoint < font.first_cp or codepoint > font.last_cp) return;
    const idx = codepoint - font.first_cp;
    const glyph = font.data[idx];
    const s = if (scale == 0) 1 else scale;

    for (0..font.height) |row_idx| {
        const row: u8 = glyph[row_idx];
        for (0..font.width) |col_idx| {
            // font8x8 uses LSB = leftmost pixel
            const bit = (row >> @intCast(col_idx)) & 1;
            if (bit == 0) continue;

            // Draw scaled pixel
            const bx: i32 = x + @as(i32, @intCast(col_idx)) * @as(i32, @intCast(s));
            const by: i32 = y + @as(i32, @intCast(row_idx)) * @as(i32, @intCast(s));
            for (0..s) |sy| {
                for (0..s) |sx| {
                    const px = bx + @as(i32, @intCast(sx));
                    const py = by + @as(i32, @intCast(sy));
                    if (px < 0 or py < 0) continue;
                    blend(buf, @intCast(px), @intCast(py), r, g, b, a);
                }
            }
        }
    }
}

/// Draw a string of ASCII text at (x, y).
/// Returns the number of pixels advanced (total width drawn).
pub fn drawText(buf: *PixelBuffer, x: i32, y: i32, text_ptr: [*]const u8, text_len: u32, r: u8, g: u8, b: u8, a: u8, scale: u32) u32 {
    const s = if (scale == 0) 1 else scale;
    const gw: i32 = @intCast(font.width * s);
    var cx: i32 = x;
    var i: u32 = 0;
    while (i < text_len) : (i += 1) {
        const cp: u32 = text_ptr[i];
        drawGlyph(buf, cx, y, cp, r, g, b, a, s);
        cx += gw;
    }
    return text_len * font.width * s;
}

/// Measure the width of a text string in pixels (no rendering).
pub fn measureText(text_len: u32, scale: u32) u32 {
    const s = if (scale == 0) 1 else scale;
    return text_len * font.width * s;
}

// ── Tests ──

test "drawGlyph A renders non-zero pixels" {
    var pixels = [_]u8{0} ** (16 * 16 * 4); // 16x16 buffer
    var buf = PixelBuffer{ .data = &pixels, .width = 16, .height = 16, .stride = 16 * 4 };
    drawGlyph(&buf, 0, 0, 'A', 255, 255, 255, 255, 1);

    // Count non-zero pixels
    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0 or pixels[j + 1] != 0 or pixels[j + 2] != 0) count += 1;
    }
    try std.testing.expect(count > 0);
}

test "measureText returns correct width" {
    try std.testing.expectEqual(@as(u32, 40), measureText(5, 1)); // 5 chars * 8px
    try std.testing.expectEqual(@as(u32, 80), measureText(5, 2)); // 5 chars * 8px * 2
}

test "drawGlyph space renders no pixels" {
    var pixels = [_]u8{0} ** (16 * 16 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 16, .height = 16, .stride = 16 * 4 };
    drawGlyph(&buf, 0, 0, ' ', 255, 255, 255, 255, 1);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0) count += 1;
    }
    try std.testing.expectEqual(@as(u32, 0), count);
}
