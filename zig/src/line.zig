///! Anti-aliased line and bezier curve rendering using SDF.
///!
///! Uses distance-to-segment SDF for each pixel — exact per-pixel
///! coverage, no stamps, no overlap artifacts.
///!
///! For bezier curves, the curve is flattened into short line segments,
///! each rendered with the segment SDF.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

fn sqrt(x: f32) f32 {
    return @sqrt(x);
}

fn max_f(a: f32, b: f32) f32 {
    return @max(a, b);
}

fn min_f(a: f32, b: f32) f32 {
    return @min(a, b);
}

fn clamp_f(v: f32, lo: f32, hi: f32) f32 {
    return max_f(lo, min_f(hi, v));
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

/// Euclidean distance from point (px,py) to line segment (sx,sy)→(sx+dx,sy+dy).
fn seg_dist(px: f32, py: f32, sx: f32, sy: f32, dx: f32, dy: f32, len2: f32) f32 {
    if (len2 < 0.001) return sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy));
    const t = clamp_f(((px - sx) * dx + (py - sy) * dy) / len2, 0, 1);
    const cx = sx + t * dx;
    const cy = sy + t * dy;
    return sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

/// Draw an anti-aliased line segment with the given width.
pub fn line(b_: *PixelBuffer, x0: i32, y0: i32, x1: i32, y1: i32, r: u8, g: u8, b: u8, a: u8, width: u32) void {
    if (a == 0 or width == 0) return;

    const fx0: f32 = @floatFromInt(x0);
    const fy0: f32 = @floatFromInt(y0);
    const fx1: f32 = @floatFromInt(x1);
    const fy1: f32 = @floatFromInt(y1);
    const half: f32 = @as(f32, @floatFromInt(width)) / 2.0;

    const dx = fx1 - fx0;
    const dy = fy1 - fy0;
    const len2 = dx * dx + dy * dy;

    // Bounding box with padding
    const pad: i32 = @divTrunc(@as(i32, @intCast(width)), 2) + 2;
    const bx0 = clamp_u(@min(x0, x1) - pad, 0, b_.width);
    const by0 = clamp_u(@min(y0, y1) - pad, 0, b_.height);
    const bx1 = clamp_u(@max(x0, x1) + pad, 0, b_.width);
    const by1 = clamp_u(@max(y0, y1) + pad, 0, b_.height);

    var py = by0;
    while (py < by1) : (py += 1) {
        var px = bx0;
        while (px < bx1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const d = seg_dist(fpx, fpy, fx0, fy0, dx, dy, len2);
            const dist = d - half;
            const ca = cov_alpha(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

/// Draw a quadratic Bezier curve as a series of SDF line segments.
/// The curve goes from (x0,y0) through control point (cx,cy) to (x1,y1).
pub fn bezier(b_: *PixelBuffer, x0: i32, y0: i32, cx: i32, cy: i32, x1: i32, y1: i32, r: u8, g: u8, b: u8, a: u8, width: u32) void {
    if (a == 0 or width == 0) return;

    const fx0: f32 = @floatFromInt(x0);
    const fy0: f32 = @floatFromInt(y0);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);
    const fx1: f32 = @floatFromInt(x1);
    const fy1: f32 = @floatFromInt(y1);

    // Estimate arc length for step count
    const d0 = sqrt((fcx - fx0) * (fcx - fx0) + (fcy - fy0) * (fcy - fy0));
    const d1 = sqrt((fx1 - fcx) * (fx1 - fcx) + (fy1 - fcy) * (fy1 - fcy));
    const arc = d0 + d1;
    // Each segment ~4px — short enough for smooth, long enough for perf
    const fsteps = @max(8.0, @ceil(arc / 4.0));
    const steps: u32 = @intFromFloat(fsteps);

    var prev_x = fx0;
    var prev_y = fy0;
    var i: u32 = 1;
    while (i <= steps) : (i += 1) {
        const t: f32 = @as(f32, @floatFromInt(i)) / fsteps;
        const it = 1.0 - t;
        const nx = it * it * fx0 + 2.0 * it * t * fcx + t * t * fx1;
        const ny = it * it * fy0 + 2.0 * it * t * fcy + t * t * fy1;

        // Render this segment
        const half: f32 = @as(f32, @floatFromInt(width)) / 2.0;
        const sdx = nx - prev_x;
        const sdy = ny - prev_y;
        const slen2 = sdx * sdx + sdy * sdy;

        const pad: i32 = @divTrunc(@as(i32, @intCast(width)), 2) + 2;
        const fl = @as(i32, @intFromFloat(@floor(min_f(prev_x, nx))));
        const ft = @as(i32, @intFromFloat(@floor(min_f(prev_y, ny))));
        const fr = @as(i32, @intFromFloat(@ceil(max_f(prev_x, nx))));
        const fb = @as(i32, @intFromFloat(@ceil(max_f(prev_y, ny))));
        const bx0 = clamp_u(fl - pad, 0, b_.width);
        const by0 = clamp_u(ft - pad, 0, b_.height);
        const bx1 = clamp_u(fr + pad, 0, b_.width);
        const by1 = clamp_u(fb + pad, 0, b_.height);

        var py = by0;
        while (py < by1) : (py += 1) {
            var px = bx0;
            while (px < bx1) : (px += 1) {
                const fpx: f32 = @floatFromInt(px);
                const fpy: f32 = @floatFromInt(py);
                const d = seg_dist(fpx, fpy, prev_x, prev_y, sdx, sdy, slen2);
                const dist = d - half;
                const ca = cov_alpha(dist, a);
                if (ca == 0) continue;
                blend(b_, px, py, r, g, b, ca);
            }
        }

        prev_x = nx;
        prev_y = ny;
    }
}

// ── Tests ──

test "horizontal line paints center row" {
    var pixels = [_]u8{0} ** (20 * 10 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 10, .stride = 80 };
    line(&pb, 2, 5, 18, 5, 255, 255, 255, 255, 2);
    // (10,5) should have paint
    const i = 5 * 80 + 10 * 4;
    try std.testing.expect(pixels[i + 3] > 0);
    // (10,0) should be empty (far from line)
    try std.testing.expectEqual(@as(u8, 0), pixels[10 * 4 + 3]);
}

test "bezier paints something" {
    var pixels = [_]u8{0} ** (30 * 30 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 30, .height = 30, .stride = 120 };
    bezier(&pb, 5, 25, 15, 5, 25, 25, 255, 128, 0, 255, 2);
    // At least some pixels should be painted
    var painted: u32 = 0;
    var idx: u32 = 0;
    while (idx < 30 * 30) : (idx += 1) {
        if (pixels[idx * 4 + 3] > 0) painted += 1;
    }
    try std.testing.expect(painted > 10);
}
