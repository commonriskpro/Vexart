///! Ellipse/circle SDF — filled and stroked, with anti-aliasing.
///!
///! The ellipse SDF normalizes coordinates to circle space:
///!   nx = (px - cx) / rx,  ny = (py - cy) / ry
///!   dist = sqrt(nx² + ny²) * rx - rx
///!
///! When ry == rx, this is a circle. When ry != rx, it's an ellipse.
///! Pass ry = rx * (cellW / cellH) to compensate for non-square terminal cells.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

fn sqrt(x: f32) f32 {
    return @sqrt(x);
}

fn abs_f(x: f32) f32 {
    return @abs(x);
}

fn max_i(a: i32, b: i32) i32 {
    return @max(a, b);
}

fn min_i(a: i32, b: i32) i32 {
    return @min(a, b);
}

fn clamp_u(val: i32, lo: u32, hi: u32) u32 {
    if (val < @as(i32, @intCast(lo))) return lo;
    if (val > @as(i32, @intCast(hi))) return hi;
    return @intCast(val);
}

fn cov_alpha(dist: f32, base: u8) u8 {
    if (dist > 0.5) return 0;
    if (dist < -0.5) return base;
    const c = 0.5 - dist;
    const result = @as(f32, @floatFromInt(base)) * c;
    const v: u32 = @intFromFloat(@round(result));
    return if (v > 255) 255 else @intCast(v);
}

/// Draw a filled ellipse (circle when ry == rx).
pub fn filled(b_: *PixelBuffer, cx: i32, cy: i32, rx: u32, ry: u32, r: u8, g: u8, b: u8, a: u8) void {
    if (a == 0 or rx == 0 or ry == 0) return;

    const frx: f32 = @floatFromInt(rx);
    const fry: f32 = @floatFromInt(ry);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);

    const x0 = clamp_u(cx - @as(i32, @intCast(rx)) - 1, 0, b_.width);
    const y0 = clamp_u(cy - @as(i32, @intCast(ry)) - 1, 0, b_.height);
    const x1 = clamp_u(cx + @as(i32, @intCast(rx)) + 1, 0, b_.width);
    const y1 = clamp_u(cy + @as(i32, @intCast(ry)) + 1, 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const nx = (fpx - fcx) / frx;
            const ny = (fpy - fcy) / fry;
            const dist = sqrt(nx * nx + ny * ny) * frx - frx;
            const ca = cov_alpha(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

/// Draw a stroked ellipse (ring).
pub fn stroked(b_: *PixelBuffer, cx: i32, cy: i32, rx: u32, ry: u32, r: u8, g: u8, b: u8, a: u8, sw: u32) void {
    if (a == 0 or rx == 0 or ry == 0 or sw == 0) return;

    const frx: f32 = @floatFromInt(rx);
    const fry: f32 = @floatFromInt(ry);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);
    const fsw: f32 = @floatFromInt(sw);
    const half = fsw / 2.0;

    const x0 = clamp_u(cx - @as(i32, @intCast(rx)) - @as(i32, @intCast(sw)) - 1, 0, b_.width);
    const y0 = clamp_u(cy - @as(i32, @intCast(ry)) - @as(i32, @intCast(sw)) - 1, 0, b_.height);
    const x1 = clamp_u(cx + @as(i32, @intCast(rx)) + @as(i32, @intCast(sw)) + 1, 0, b_.width);
    const y1 = clamp_u(cy + @as(i32, @intCast(ry)) + @as(i32, @intCast(sw)) + 1, 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const nx = (fpx - fcx) / frx;
            const ny = (fpy - fcy) / fry;
            const d = sqrt(nx * nx + ny * ny) * frx;
            const dist = abs_f(d - frx) - half;
            const ca = cov_alpha(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

// ── Tests ──

test "filled circle center pixel" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    filled(&pb, 10, 10, 5, 5, 255, 0, 0, 255);
    // Center (10,10) should be fully filled
    const i = 10 * 80 + 10 * 4;
    try std.testing.expectEqual(@as(u8, 255), pixels[i]);
    try std.testing.expectEqual(@as(u8, 255), pixels[i + 3]);
}

test "filled circle outside pixel is empty" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    filled(&pb, 10, 10, 3, 3, 255, 0, 0, 255);
    // (0,0) is far outside
    try std.testing.expectEqual(@as(u8, 0), pixels[3]);
}

test "stroked ring has hollow center" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    stroked(&pb, 10, 10, 8, 8, 0, 255, 0, 255, 1);
    // Center should be empty
    const center = 10 * 80 + 10 * 4;
    try std.testing.expectEqual(@as(u8, 0), pixels[center + 3]);
}
