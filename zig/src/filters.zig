///! Per-pixel color filters for backdrop effects.
///!
///! Each filter operates IN-PLACE on a rectangular region of the buffer.
///! O(n) per pixel — no neighbor sampling needed (unlike blur).
///!
///! Used for: backdrop-brightness, backdrop-saturate, backdrop-contrast,
///!           backdrop-grayscale, backdrop-invert, backdrop-sepia.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;

fn min_u(a: u32, b: u32) u32 {
    return @min(a, b);
}

fn clamp_u8(v: f32) u8 {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return @intFromFloat(@round(v));
}

/// Adjust brightness of a region. factor: 0.0=black, 1.0=unchanged, 2.0=2x bright.
pub fn brightness(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, factor_pct: u32) void {
    const factor: f32 = @as(f32, @floatFromInt(factor_pct)) / 100.0;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            d[i] = clamp_u8(@as(f32, @floatFromInt(d[i])) * factor);
            d[i + 1] = clamp_u8(@as(f32, @floatFromInt(d[i + 1])) * factor);
            d[i + 2] = clamp_u8(@as(f32, @floatFromInt(d[i + 2])) * factor);
        }
    }
}

/// Adjust contrast of a region. factor: 0.0=grey, 1.0=unchanged, 2.0=high contrast.
pub fn contrast(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, factor_pct: u32) void {
    const factor: f32 = @as(f32, @floatFromInt(factor_pct)) / 100.0;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            d[i] = clamp_u8((@as(f32, @floatFromInt(d[i])) - 128.0) * factor + 128.0);
            d[i + 1] = clamp_u8((@as(f32, @floatFromInt(d[i + 1])) - 128.0) * factor + 128.0);
            d[i + 2] = clamp_u8((@as(f32, @floatFromInt(d[i + 2])) - 128.0) * factor + 128.0);
        }
    }
}

/// Adjust saturation of a region. factor: 0.0=grayscale, 1.0=unchanged, 2.0=hyper-saturated.
pub fn saturate(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, factor_pct: u32) void {
    const factor: f32 = @as(f32, @floatFromInt(factor_pct)) / 100.0;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            const fr: f32 = @floatFromInt(d[i]);
            const fg: f32 = @floatFromInt(d[i + 1]);
            const fb: f32 = @floatFromInt(d[i + 2]);
            // ITU-R BT.601 luma
            const luma = 0.299 * fr + 0.587 * fg + 0.114 * fb;
            d[i] = clamp_u8(luma + (fr - luma) * factor);
            d[i + 1] = clamp_u8(luma + (fg - luma) * factor);
            d[i + 2] = clamp_u8(luma + (fb - luma) * factor);
        }
    }
}

/// Convert a region to grayscale. amount: 0=unchanged, 100=full grayscale.
pub fn grayscale(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, amount_pct: u32) void {
    const amt: f32 = @min(@as(f32, @floatFromInt(amount_pct)) / 100.0, 1.0);
    const inv = 1.0 - amt;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            const fr: f32 = @floatFromInt(d[i]);
            const fg: f32 = @floatFromInt(d[i + 1]);
            const fb: f32 = @floatFromInt(d[i + 2]);
            const luma = 0.299 * fr + 0.587 * fg + 0.114 * fb;
            d[i] = clamp_u8(fr * inv + luma * amt);
            d[i + 1] = clamp_u8(fg * inv + luma * amt);
            d[i + 2] = clamp_u8(fb * inv + luma * amt);
        }
    }
}

/// Invert colors of a region. amount: 0=unchanged, 100=fully inverted.
pub fn invert(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, amount_pct: u32) void {
    const amt: f32 = @min(@as(f32, @floatFromInt(amount_pct)) / 100.0, 1.0);
    const inv = 1.0 - amt;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            const fr: f32 = @floatFromInt(d[i]);
            const fg: f32 = @floatFromInt(d[i + 1]);
            const fb: f32 = @floatFromInt(d[i + 2]);
            d[i] = clamp_u8(fr * inv + (255.0 - fr) * amt);
            d[i + 1] = clamp_u8(fg * inv + (255.0 - fg) * amt);
            d[i + 2] = clamp_u8(fb * inv + (255.0 - fb) * amt);
        }
    }
}

/// Apply sepia tone to a region. amount: 0=unchanged, 100=full sepia.
pub fn sepia(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, amount_pct: u32) void {
    const amt: f32 = @min(@as(f32, @floatFromInt(amount_pct)) / 100.0, 1.0);
    const inv = 1.0 - amt;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            const fr: f32 = @floatFromInt(d[i]);
            const fg: f32 = @floatFromInt(d[i + 1]);
            const fb: f32 = @floatFromInt(d[i + 2]);
            // Standard sepia matrix
            const sr = @min(0.393 * fr + 0.769 * fg + 0.189 * fb, 255.0);
            const sg = @min(0.349 * fr + 0.686 * fg + 0.168 * fb, 255.0);
            const sb = @min(0.272 * fr + 0.534 * fg + 0.131 * fb, 255.0);
            d[i] = clamp_u8(fr * inv + sr * amt);
            d[i + 1] = clamp_u8(fg * inv + sg * amt);
            d[i + 2] = clamp_u8(fb * inv + sb * amt);
        }
    }
}

/// Rotate hue of a region. angle in degrees (0-360). 0/360 = unchanged.
pub fn hue_rotate(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, angle_deg: u32) void {
    if (angle_deg == 0 or angle_deg == 360) return;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    // Precompute rotation matrix from CSS spec (operates on linear RGB)
    const rad: f32 = @as(f32, @floatFromInt(angle_deg)) * std.math.pi / 180.0;
    const cos_h = @cos(rad);
    const sin_h = @sin(rad);

    // Hue rotation matrix (CSS Filter Effects spec, simplified)
    // Based on rotating around the (1,1,1) axis in RGB space
    const a00 = 0.213 + cos_h * 0.787 - sin_h * 0.213;
    const a01 = 0.715 - cos_h * 0.715 - sin_h * 0.715;
    const a02 = 0.072 - cos_h * 0.072 + sin_h * 0.928;
    const a10 = 0.213 - cos_h * 0.213 + sin_h * 0.143;
    const a11 = 0.715 + cos_h * 0.285 + sin_h * 0.140;
    const a12 = 0.072 - cos_h * 0.072 - sin_h * 0.283;
    const a20 = 0.213 - cos_h * 0.213 - sin_h * 0.787;
    const a21 = 0.715 - cos_h * 0.715 + sin_h * 0.715;
    const a22 = 0.072 + cos_h * 0.928 + sin_h * 0.072;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            const fr: f32 = @floatFromInt(d[i]);
            const fg: f32 = @floatFromInt(d[i + 1]);
            const fb: f32 = @floatFromInt(d[i + 2]);
            d[i] = clamp_u8(a00 * fr + a01 * fg + a02 * fb);
            d[i + 1] = clamp_u8(a10 * fr + a11 * fg + a12 * fb);
            d[i + 2] = clamp_u8(a20 * fr + a21 * fg + a22 * fb);
        }
    }
}

// ── Tests ──

test "brightness increases pixel values" {
    var pixels = [_]u8{ 100, 100, 100, 255, 100, 100, 100, 255 }; // 2x1
    var pb = PixelBuffer{ .data = &pixels, .width = 2, .height = 1, .stride = 8 };
    brightness(&pb, 0, 0, 2, 1, 200); // 2x brightness
    try std.testing.expect(pixels[0] > 150); // brighter
}

test "grayscale removes color" {
    var pixels = [_]u8{ 255, 0, 0, 255 }; // pure red
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    grayscale(&pb, 0, 0, 1, 1, 100);
    // After full grayscale, R == G == B (approximately)
    const diff = @as(i32, pixels[0]) - @as(i32, pixels[1]);
    try std.testing.expect(@abs(diff) < 5);
}

test "invert flips values" {
    var pixels = [_]u8{ 0, 255, 128, 255 };
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    invert(&pb, 0, 0, 1, 1, 100);
    try std.testing.expectEqual(@as(u8, 255), pixels[0]); // 0 → 255
    try std.testing.expectEqual(@as(u8, 0), pixels[1]); // 255 → 0
}

test "sepia warms colors" {
    var pixels = [_]u8{ 128, 128, 128, 255 }; // neutral gray
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    sepia(&pb, 0, 0, 1, 1, 100);
    // Sepia should make R > G > B
    try std.testing.expect(pixels[0] >= pixels[1]);
    try std.testing.expect(pixels[1] >= pixels[2]);
}

test "hue_rotate 180 shifts colors" {
    var pixels = [_]u8{ 255, 0, 0, 255 }; // pure red
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    hue_rotate(&pb, 0, 0, 1, 1, 180);
    // 180° rotation of pure red should produce cyan-ish (low R, high G+B)
    try std.testing.expect(pixels[0] < 100); // R dropped
    try std.testing.expect(pixels[1] > 100 or pixels[2] > 100); // G or B rose
}
