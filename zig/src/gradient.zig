///! Linear and radial gradient fills.
///!
///! Gradients are applied to a rectangular region of the buffer.
///! Two-stop gradients (start color → end color) with linear interpolation.
///!
///! Linear: interpolates along a direction vector.
///! Radial: interpolates from center outward.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

fn sqrt(x: f32) f32 {
    return @sqrt(x);
}

fn min_u(a: u32, b: u32) u32 {
    return @min(a, b);
}

fn clamp_f(v: f32, lo: f32, hi: f32) f32 {
    return @max(lo, @min(hi, v));
}

fn lerp_u8(a: u8, b_val: u8, t: f32) u8 {
    const fa: f32 = @floatFromInt(a);
    const fb: f32 = @floatFromInt(b_val);
    const result = fa + (fb - fa) * t;
    const clamped: u32 = @intFromFloat(@round(@max(0, @min(255, result))));
    return @intCast(clamped);
}

/// Fill a rectangle with a linear gradient.
/// Direction: from (x,y) toward (x+w, y) for angle=0 (horizontal).
/// angle_deg: 0=left→right, 90=top→bottom, etc.
pub fn linear(
    b_: *PixelBuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    r0: u8,
    g0: u8,
    b0: u8,
    a0: u8,
    r1: u8,
    g1: u8,
    b1: u8,
    a1: u8,
    angle_deg: u32,
) void {
    if (w == 0 or h == 0) return;
    if (a0 == 0 and a1 == 0) return;

    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);

    // Angle to direction cosines
    const fa: f32 = @as(f32, @floatFromInt(angle_deg)) * std.math.pi / 180.0;
    const cos_a = @cos(fa);
    const sin_a = @sin(fa);

    // Length of projection along gradient direction
    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);
    const proj_len = @abs(fw * cos_a) + @abs(fh * sin_a);
    if (proj_len < 0.001) return;

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            // Project pixel position onto gradient direction
            const dx = fpx - fx;
            const dy = fpy - fy;
            const proj = dx * cos_a + dy * sin_a;
            const t = clamp_f(proj / proj_len, 0, 1);

            const r = lerp_u8(r0, r1, t);
            const g = lerp_u8(g0, g1, t);
            const b = lerp_u8(b0, b1, t);
            const a = lerp_u8(a0, a1, t);
            if (a == 0) continue;
            blend(b_, px, py, r, g, b, a);
        }
    }
}

/// Fill a rectangle with a radial gradient.
/// Center of gradient is at (cx, cy). Radius determines the outer edge.
pub fn radial(
    b_: *PixelBuffer,
    cx: u32,
    cy: u32,
    radius: u32,
    r0: u8,
    g0: u8,
    b0: u8,
    a0: u8,
    r1: u8,
    g1: u8,
    b1: u8,
    a1: u8,
) void {
    if (radius == 0) return;
    if (a0 == 0 and a1 == 0) return;

    const frad: f32 = @floatFromInt(radius);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);

    const x0_i = @as(i32, @intCast(cx)) - @as(i32, @intCast(radius));
    const y0_i = @as(i32, @intCast(cy)) - @as(i32, @intCast(radius));
    const x1_i = @as(i32, @intCast(cx)) + @as(i32, @intCast(radius));
    const y1_i = @as(i32, @intCast(cy)) + @as(i32, @intCast(radius));

    const x0: u32 = if (x0_i < 0) 0 else min_u(@intCast(x0_i), b_.width);
    const y0: u32 = if (y0_i < 0) 0 else min_u(@intCast(y0_i), b_.height);
    const x1 = min_u(if (x1_i < 0) 0 else @intCast(x1_i), b_.width);
    const y1 = min_u(if (y1_i < 0) 0 else @intCast(y1_i), b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const dx = fpx - fcx;
            const dy = fpy - fcy;
            const dist = sqrt(dx * dx + dy * dy);
            if (dist >= frad) continue;
            const t = dist / frad;

            const r = lerp_u8(r0, r1, t);
            const g = lerp_u8(g0, g1, t);
            const b = lerp_u8(b0, b1, t);
            const a = lerp_u8(a0, a1, t);
            if (a == 0) continue;
            blend(b_, px, py, r, g, b, a);
        }
    }
}

// ── Tests ──

test "linear gradient horizontal" {
    var pixels = [_]u8{0} ** (20 * 1 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 1, .stride = 80 };
    linear(&pb, 0, 0, 20, 1, 0, 0, 0, 255, 255, 255, 255, 255, 0);
    // Left pixel should be dark, right pixel should be bright
    try std.testing.expect(pixels[0] < pixels[19 * 4]);
}

test "radial gradient center vs edge" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    radial(&pb, 10, 10, 8, 255, 0, 0, 255, 0, 0, 0, 0);
    // Center should have high alpha
    const center = 10 * 80 + 10 * 4;
    try std.testing.expect(pixels[center + 3] > 200);
    // Near edge should have lower values or zero
    const edge = 10 * 80 + 17 * 4;
    try std.testing.expect(pixels[center + 3] > pixels[edge + 3]);
}
