/// Text rendering — rasterize glyphs from a pre-rendered grayscale atlas
/// into a pixel buffer with proper alpha blending.
///
/// Supports full Unicode via multi-range atlas lookup.
/// UTF-8 decoding extracts codepoints, then range-based O(1) lookup
/// finds the glyph in the atlas. Unsupported codepoints are skipped.
const std = @import("std");
const atlas = @import("font_atlas.zig");

const PixelBuffer = @import("lib.zig").PixelBuffer;
const blend = @import("lib.zig").blend;

/// Draw a single glyph at (x, y) with the given color.
/// Uses the multi-range atlas lookup. Returns true if glyph was found.
pub fn drawGlyph(buf: *PixelBuffer, x: i32, y: i32, codepoint: u32, r: u8, g: u8, b: u8, a: u8) bool {
    const idx = atlas.lookup(codepoint) orelse return false;
    const glyph_offset = idx * atlas.cell_size;

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
    return true;
}

/// Advance width in hundredths of a pixel (fixed-point).
/// .SF NS Mono at 14px: 8.65px per char = 865 hundredths.
const advance_hundredths: u32 = 865;

/// Decode one UTF-8 codepoint from a byte slice.
/// Returns the codepoint and number of bytes consumed, or null on invalid input.
pub fn decodeUtf8(bytes: [*]const u8, len: u32, pos: u32) ?struct { cp: u32, size: u32 } {
    if (pos >= len) return null;
    const b0 = bytes[pos];

    // 1-byte (ASCII): 0xxxxxxx
    if (b0 < 0x80) {
        return .{ .cp = b0, .size = 1 };
    }

    // 2-byte: 110xxxxx 10xxxxxx
    if (b0 >= 0xC0 and b0 < 0xE0) {
        if (pos + 1 >= len) return null;
        const b1 = bytes[pos + 1];
        if (b1 & 0xC0 != 0x80) return null;
        const cp = (@as(u32, b0 & 0x1F) << 6) | @as(u32, b1 & 0x3F);
        return .{ .cp = cp, .size = 2 };
    }

    // 3-byte: 1110xxxx 10xxxxxx 10xxxxxx
    if (b0 >= 0xE0 and b0 < 0xF0) {
        if (pos + 2 >= len) return null;
        const b1 = bytes[pos + 1];
        const b2 = bytes[pos + 2];
        if (b1 & 0xC0 != 0x80 or b2 & 0xC0 != 0x80) return null;
        const cp = (@as(u32, b0 & 0x0F) << 12) | (@as(u32, b1 & 0x3F) << 6) | @as(u32, b2 & 0x3F);
        return .{ .cp = cp, .size = 3 };
    }

    // 4-byte: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
    if (b0 >= 0xF0 and b0 < 0xF8) {
        if (pos + 3 >= len) return null;
        const b1 = bytes[pos + 1];
        const b2 = bytes[pos + 2];
        const b3 = bytes[pos + 3];
        if (b1 & 0xC0 != 0x80 or b2 & 0xC0 != 0x80 or b3 & 0xC0 != 0x80) return null;
        const cp = (@as(u32, b0 & 0x07) << 18) | (@as(u32, b1 & 0x3F) << 12) | (@as(u32, b2 & 0x3F) << 6) | @as(u32, b3 & 0x3F);
        return .{ .cp = cp, .size = 4 };
    }

    return null; // invalid leading byte
}

/// Count the number of Unicode codepoints in a UTF-8 byte slice.
pub fn countCodepoints(text_ptr: [*]const u8, text_len: u32) u32 {
    var count: u32 = 0;
    var pos: u32 = 0;
    while (pos < text_len) {
        if (decodeUtf8(text_ptr, text_len, pos)) |decoded| {
            count += 1;
            pos += decoded.size;
        } else {
            pos += 1; // skip invalid byte
        }
    }
    return count;
}

/// Draw a UTF-8 string at (x, y).
/// Uses sub-pixel cursor advancement (fixed-point) for precise positioning.
/// Unsupported codepoints are skipped (no placeholder glyph).
/// Returns the total width in pixels.
pub fn drawText(buf: *PixelBuffer, x: i32, y: i32, text_ptr: [*]const u8, text_len: u32, r: u8, g: u8, b: u8, a: u8) u32 {
    var acc: u32 = 0; // accumulated advance in hundredths
    var pos: u32 = 0;
    var rendered: u32 = 0;

    while (pos < text_len) {
        if (decodeUtf8(text_ptr, text_len, pos)) |decoded| {
            const cx: i32 = x + @as(i32, @intCast(acc / 100));
            if (drawGlyph(buf, cx, y, decoded.cp, r, g, b, a)) {
                rendered += 1;
            }
            acc += advance_hundredths;
            pos += decoded.size;
        } else {
            pos += 1; // skip invalid byte
        }
    }
    return (rendered * advance_hundredths + 50) / 100; // rounded total width
}

/// Measure the width of a UTF-8 text string in pixels (no rendering).
/// Counts codepoints (not bytes) for correct width.
pub fn measureText(text_len: u32) u32 {
    return (text_len * advance_hundredths + 50) / 100;
}

/// Measure text width from actual UTF-8 bytes (counts codepoints).
pub fn measureTextUtf8(text_ptr: [*]const u8, text_len: u32) u32 {
    const cp_count = countCodepoints(text_ptr, text_len);
    return (cp_count * advance_hundredths + 50) / 100;
}

// ── Tests ──

test "drawGlyph A renders non-zero pixels" {
    var pixels = [_]u8{0} ** (64 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    const rendered = drawGlyph(&buf, 0, 0, 'A', 255, 255, 255, 255);
    try std.testing.expect(rendered);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0 or pixels[j + 1] != 0 or pixels[j + 2] != 0) count += 1;
    }
    try std.testing.expect(count > 0);
}

test "drawGlyph space renders no pixels" {
    var pixels = [_]u8{0} ** (64 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    const rendered = drawGlyph(&buf, 0, 0, ' ', 255, 255, 255, 255);
    try std.testing.expect(rendered);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0) count += 1;
    }
    try std.testing.expectEqual(@as(u32, 0), count);
}

test "drawGlyph unknown codepoint returns false" {
    var pixels = [_]u8{0} ** (64 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    // U+FFFF is unlikely to be in the atlas
    const rendered = drawGlyph(&buf, 0, 0, 0xFFFF, 255, 255, 255, 255);
    try std.testing.expect(!rendered);
}

test "decodeUtf8 ASCII" {
    const text = "A";
    const result = decodeUtf8(text.ptr, 1, 0);
    try std.testing.expect(result != null);
    try std.testing.expectEqual(@as(u32, 'A'), result.?.cp);
    try std.testing.expectEqual(@as(u32, 1), result.?.size);
}

test "decodeUtf8 2-byte (Latin-1: ñ = U+00F1)" {
    const text = "\xc3\xb1"; // ñ in UTF-8
    const result = decodeUtf8(text.ptr, 2, 0);
    try std.testing.expect(result != null);
    try std.testing.expectEqual(@as(u32, 0xF1), result.?.cp);
    try std.testing.expectEqual(@as(u32, 2), result.?.size);
}

test "decodeUtf8 3-byte (arrow: ← = U+2190)" {
    const text = "\xe2\x86\x90"; // ← in UTF-8
    const result = decodeUtf8(text.ptr, 3, 0);
    try std.testing.expect(result != null);
    try std.testing.expectEqual(@as(u32, 0x2190), result.?.cp);
    try std.testing.expectEqual(@as(u32, 3), result.?.size);
}

test "countCodepoints mixed ASCII and multi-byte" {
    const text = "Hi\xc3\xb1\xe2\x86\x90"; // "Hiñ←" = 4 codepoints, 7 bytes
    const count = countCodepoints(text.ptr, 7);
    try std.testing.expectEqual(@as(u32, 4), count);
}

test "measureText returns correct width" {
    // 5 codepoints at 865 hundredths each = 4325 hundredths = 43.25 → 43 pixels
    try std.testing.expectEqual(@as(u32, 43), measureText(5));
}

test "drawGlyph arrow U+2190 renders non-zero pixels" {
    var pixels = [_]u8{0} ** (64 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    const rendered = drawGlyph(&buf, 0, 0, 0x2190, 255, 255, 255, 255); // ←
    try std.testing.expect(rendered);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0 or pixels[j + 1] != 0 or pixels[j + 2] != 0) count += 1;
    }
    try std.testing.expect(count > 0);
}

test "drawGlyph box drawing U+2500 renders non-zero pixels" {
    var pixels = [_]u8{0} ** (64 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 64, .height = 64, .stride = 64 * 4 };
    const rendered = drawGlyph(&buf, 0, 0, 0x2500, 255, 255, 255, 255); // ─
    try std.testing.expect(rendered);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0 or pixels[j + 1] != 0 or pixels[j + 2] != 0) count += 1;
    }
    try std.testing.expect(count > 0);
}

test "drawText with UTF-8 arrow renders pixels" {
    var pixels = [_]u8{0} ** (128 * 64 * 4);
    var buf = PixelBuffer{ .data = &pixels, .width = 128, .height = 64, .stride = 128 * 4 };
    const text = "A\xe2\x86\x90B"; // "A←B" = 3 codepoints, 5 bytes
    const width = drawText(&buf, 0, 0, text.ptr, 5, 255, 255, 255, 255);
    try std.testing.expect(width > 0);

    var count: u32 = 0;
    var j: u32 = 0;
    while (j < pixels.len) : (j += 4) {
        if (pixels[j] != 0 or pixels[j + 1] != 0 or pixels[j + 2] != 0) count += 1;
    }
    // All 3 glyphs (A, ←, B) should render pixels
    try std.testing.expect(count > 10);
}

test "atlas lookup returns correct offsets for each range" {
    // ASCII: offset 0, so 'A' (65) = 65 - 32 = 33
    try std.testing.expectEqual(@as(?u32, 33), atlas.lookup('A'));
    // Space (32) = first in ASCII range = offset 0
    try std.testing.expectEqual(@as(?u32, 0), atlas.lookup(32));
    // '~' (126) = last in ASCII range = offset 94
    try std.testing.expectEqual(@as(?u32, 94), atlas.lookup(126));
    // Latin-1 Supplement: starts at offset 95, first cp = 0xA0
    try std.testing.expectEqual(@as(?u32, 95), atlas.lookup(0xA0));
    // ñ (0xF1) = offset 95 + (0xF1 - 0xA0) = 95 + 81 = 176
    try std.testing.expectEqual(@as(?u32, 176), atlas.lookup(0xF1));
    // ← (0x2190) = Arrows range, starts after Latin-1 (95 + 96 = 191)
    try std.testing.expectEqual(@as(?u32, 191), atlas.lookup(0x2190));
    // Out of range: 127 (between ASCII and Latin-1)
    try std.testing.expectEqual(@as(?u32, null), atlas.lookup(127));
    // Out of range: U+FFFF
    try std.testing.expectEqual(@as(?u32, null), atlas.lookup(0xFFFF));
}

test "decodeUtf8 4-byte (emoji: 😀 = U+1F600)" {
    const text = "\xf0\x9f\x98\x80"; // 😀 in UTF-8
    const result = decodeUtf8(text.ptr, 4, 0);
    try std.testing.expect(result != null);
    try std.testing.expectEqual(@as(u32, 0x1F600), result.?.cp);
    try std.testing.expectEqual(@as(u32, 4), result.?.size);
}

test "decodeUtf8 invalid continuation byte returns null" {
    const text = "\xc3\x00"; // 2-byte lead but invalid continuation
    const result = decodeUtf8(text.ptr, 2, 0);
    try std.testing.expectEqual(@as(?@TypeOf(result.?), null), result);
}

test "measureTextUtf8 counts codepoints not bytes" {
    const text = "Hi\xc3\xb1\xe2\x86\x90"; // "Hiñ←" = 4 codepoints, 7 bytes
    const width = measureTextUtf8(text.ptr, 7);
    // 4 codepoints × 865 hundredths = 3460 → 35 pixels
    try std.testing.expectEqual(@as(u32, 35), width);
}
