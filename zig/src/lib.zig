///! TGE Pixel Engine — Zig native library.
///!
///! High-performance pixel painting primitives for the TGE terminal renderer.
///! Called from TypeScript via bun:ffi.
///!
///! Modules:
///!   buffer  — PixelBuffer operations (blend, set, clear, composite)
///!   rect    — Rounded rectangle SDF (fill, stroke, shadow)
///!   circle  — Ellipse SDF (filled, stroked)
///!   line    — Segment-distance SDF, bezier flattening
///!   shadow  — Box shadow with gaussian blur
///!   grad    — Linear and radial gradients
const std = @import("std");

// ── Pixel Buffer ──

/// RGBA pixel buffer stored as a flat byte array.
/// Layout: [R, G, B, A, R, G, B, A, ...] row-major, top-left origin.
pub const PixelBuffer = struct {
    data: [*]u8,
    width: u32,
    height: u32,
    stride: u32, // bytes per row (width * 4)
};

/// Alpha-blend src over dst at (x, y).
pub fn blend(buf: *PixelBuffer, x: u32, y: u32, r: u8, g: u8, b: u8, a: u8) void {
    if (x >= buf.width or y >= buf.height) return;
    if (a == 0) return;
    const i = y * buf.stride + x * 4;
    const d = buf.data;
    if (a == 0xff) {
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 0xff;
        return;
    }
    const da = d[i + 3];
    const inv = 255 - a;
    const oa: u16 = @as(u16, a) + (@as(u16, da) * inv + 127) / 255;
    if (oa == 0) return;
    d[i] = @intCast((@as(u16, r) * a + @as(u16, d[i]) * @as(u16, da) * inv / 255 + @as(u16, @intCast(oa)) / 2) / @as(u16, @intCast(oa)));
    d[i + 1] = @intCast((@as(u16, g) * a + @as(u16, d[i + 1]) * @as(u16, da) * inv / 255 + @as(u16, @intCast(oa)) / 2) / @as(u16, @intCast(oa)));
    d[i + 2] = @intCast((@as(u16, b) * a + @as(u16, d[i + 2]) * @as(u16, da) * inv / 255 + @as(u16, @intCast(oa)) / 2) / @as(u16, @intCast(oa)));
    d[i + 3] = if (oa > 255) 255 else @intCast(oa);
}

// ── FFI Exports ──

export fn tge_blend(data: [*]u8, width: u32, height: u32, x: u32, y: u32, r: u8, g: u8, b: u8, a: u8) void {
    var buf = PixelBuffer{
        .data = data,
        .width = width,
        .height = height,
        .stride = width * 4,
    };
    blend(&buf, x, y, r, g, b, a);
}

// TODO: Phase 1 — add SDF rect, circle, line, shadow, gradient exports

test "blend opaque onto empty" {
    var pixels = [_]u8{0} ** 16; // 2x2
    var buf = PixelBuffer{ .data = &pixels, .width = 2, .height = 2, .stride = 8 };
    blend(&buf, 0, 0, 255, 0, 0, 255);
    try std.testing.expectEqual(@as(u8, 255), pixels[0]); // R
    try std.testing.expectEqual(@as(u8, 0), pixels[1]); // G
    try std.testing.expectEqual(@as(u8, 0), pixels[2]); // B
    try std.testing.expectEqual(@as(u8, 255), pixels[3]); // A
}
