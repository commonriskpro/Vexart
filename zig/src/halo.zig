///! Radial halo/glow effect.
///!
///! A soft radial gradient around a center point with a
///! plateau-then-drop falloff curve:
///!   - Inner 40% of radius: full intensity
///!   - Outer 60%: quadratic falloff to zero
///!
///! This ensures the glow survives the downsample pipeline.
///! Pass ry != rx for elliptical halos (terminal cell compensation).
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

fn sqrt(x: f32) f32 {
    return @sqrt(x);
}

fn clamp_u(val: i32, lo: u32, hi: u32) u32 {
    if (val < @as(i32, @intCast(lo))) return lo;
    if (val > @as(i32, @intCast(hi))) return hi;
    return @intCast(val);
}

/// Draw a soft radial halo glow (elliptical when ry != rx).
pub fn halo(b_: *PixelBuffer, cx: i32, cy: i32, rx: u32, ry: u32, r: u8, g: u8, b: u8, a: u8, intensity_pct: u32) void {
    if (a == 0 or rx == 0 or ry == 0 or intensity_pct == 0) return;

    const frx: f32 = @floatFromInt(rx);
    const fry: f32 = @floatFromInt(ry);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);
    const intensity: f32 = @as(f32, @floatFromInt(intensity_pct)) / 100.0;

    const x0 = clamp_u(cx - @as(i32, @intCast(rx)), 0, b_.width);
    const y0 = clamp_u(cy - @as(i32, @intCast(ry)), 0, b_.height);
    const x1 = clamp_u(cx + @as(i32, @intCast(rx)), 0, b_.width);
    const y1 = clamp_u(cy + @as(i32, @intCast(ry)), 0, b_.height);

    // Inner 40% is full intensity, then quadratic falloff
    const inner = frx * 0.4;
    const outer = frx - inner;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            // Normalize to circle space for elliptical distance
            const nx = (fpx - fcx) / frx;
            const ny = (fpy - fcy) / fry;
            const dist = sqrt(nx * nx + ny * ny) * frx;
            if (dist >= frx) continue;
            const falloff = if (dist <= inner) 1.0 else blk: {
                const t = (dist - inner) / outer;
                break :blk 1.0 - t * t;
            };
            const fa = @as(f32, @floatFromInt(a)) * falloff * intensity;
            const ca_f = @round(fa);
            if (ca_f <= 0) continue;
            const ca: u8 = if (ca_f > 255) 255 else @intFromFloat(ca_f);
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

// ── Tests ──

test "halo paints center" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    halo(&pb, 10, 10, 8, 8, 255, 100, 50, 200, 100);
    // Center should have paint
    const i = 10 * 80 + 10 * 4;
    try std.testing.expect(pixels[i + 3] > 0);
}

test "halo fades at edges" {
    var pixels = [_]u8{0} ** (30 * 30 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 30, .height = 30, .stride = 120 };
    halo(&pb, 15, 15, 10, 10, 255, 255, 255, 255, 100);
    // Center alpha should be higher than edge alpha
    const center_a = pixels[15 * 120 + 15 * 4 + 3];
    const edge_a = pixels[15 * 120 + 23 * 4 + 3]; // near the edge
    try std.testing.expect(center_a >= edge_a);
}
