///! Regular polygon SDF — filled and stroked, with anti-aliasing.
///!
///! Based on Inigo Quilez's polygon SDF (shadertoy.com/view/7dSGWK).
///! The key insight: fold the point into one angular sector, then
///! measure distance to the edge segment in that sector.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

const PI: f32 = 3.14159265358979323846;
const TWO_PI: f32 = 2.0 * PI;

fn sqrt(x: f32) f32 {
    return @sqrt(x);
}

fn cos_f(x: f32) f32 {
    return @cos(x);
}

fn sin_f(x: f32) f32 {
    return @sin(x);
}

fn atan2_f(y: f32, x: f32) f32 {
    return std.math.atan2(y, x);
}

fn abs_f(x: f32) f32 {
    return @abs(x);
}

fn clamp_f(v: f32, lo: f32, hi: f32) f32 {
    return @max(lo, @min(hi, v));
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

/// Signed distance from point (px,py) to a regular polygon centered at origin.
/// Returns negative inside, positive outside.
///
/// Algorithm (Inigo Quilez):
///   1. Compute angle of point, fold into one sector [-halfAngle, +halfAngle]
///   2. In that sector, the closest edge is the line segment between two vertices
///   3. Compute distance to that segment
fn polygon_sdf(px: f32, py: f32, rad: f32, sides: u32, rotation_rad: f32) f32 {
    const n: f32 = @floatFromInt(sides);
    const an = PI / n; // half-angle of each sector

    // Rotate point by -rotation to apply polygon rotation
    const cr = cos_f(-rotation_rad);
    const sr = sin_f(-rotation_rad);
    const qx = px * cr - py * sr;
    const qy = px * sr + py * cr;

    // Angle of the point
    var a = atan2_f(qy, qx);
    // Normalize to [0, 2*PI)
    a = a - @floor(a / TWO_PI) * TWO_PI;

    // Fold into one sector: map angle to [-an, an]
    a = @mod(a + an, 2.0 * an) - an;

    // In folded coordinates, the point is at:
    const d = sqrt(qx * qx + qy * qy);
    const fx = d * cos_f(a);
    const fy = abs_f(d * sin_f(a));

    // The edge in this sector goes from the sector center on the polygon
    // The apothem (distance from center to edge midpoint) = rad * cos(an)
    // The edge half-length = rad * sin(an)
    const apothem = rad * cos_f(an);
    const half_edge = rad * sin_f(an);

    // Closest point on edge segment to (fx, fy):
    // Edge segment: from (apothem, 0) extending up to (apothem, half_edge) — but really
    // the edge is the line x = apothem, clamped in y to [-half_edge, half_edge]
    // After abs(fy), we're in [0, half_edge] range

    // Simple: signed distance to the edge LINE is just (fx - apothem).
    // But near the vertices we need to account for distance to the vertex.
    // If fy > half_edge, we're past the vertex and need point-to-vertex distance.

    if (fy <= half_edge) {
        // Inside the edge span — distance is just horizontal to the edge
        return fx - apothem;
    } else {
        // Past the vertex — distance to the vertex at (apothem, half_edge)
        const dvx = fx - apothem;
        const dvy = fy - half_edge;
        const vertex_dist = sqrt(dvx * dvx + dvy * dvy);
        // Sign: inside if fx < apothem AND we're "within" the polygon
        return if (fx < apothem) -vertex_dist else vertex_dist;
    }
}

/// Draw a filled regular polygon.
pub fn filled(b_: *PixelBuffer, cx: i32, cy: i32, radius: u32, sides: u32, rotation_deg: u32, r: u8, g: u8, b: u8, a: u8) void {
    if (a == 0 or radius == 0 or sides < 3) return;

    const frad: f32 = @floatFromInt(radius);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);
    const rot_rad: f32 = @as(f32, @floatFromInt(rotation_deg)) * PI / 180.0;

    const irad: i32 = @intCast(radius);
    const x0 = clamp_u(cx - irad - 2, 0, b_.width);
    const y0 = clamp_u(cy - irad - 2, 0, b_.height);
    const x1 = clamp_u(cx + irad + 2, 0, b_.width);
    const y1 = clamp_u(cy + irad + 2, 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @as(f32, @floatFromInt(px)) - fcx;
            const fpy: f32 = @as(f32, @floatFromInt(py)) - fcy;
            const dist = polygon_sdf(fpx, fpy, frad, sides, rot_rad);
            const ca = cov_alpha(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

/// Draw a stroked regular polygon.
pub fn stroked(b_: *PixelBuffer, cx: i32, cy: i32, radius: u32, sides: u32, rotation_deg: u32, r: u8, g: u8, b: u8, a: u8, stroke_width: u32) void {
    if (a == 0 or radius == 0 or sides < 3 or stroke_width == 0) return;

    const frad: f32 = @floatFromInt(radius);
    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);
    const fsw: f32 = @floatFromInt(stroke_width);
    const half = fsw / 2.0;
    const rot_rad: f32 = @as(f32, @floatFromInt(rotation_deg)) * PI / 180.0;

    const irad: i32 = @intCast(radius);
    const isw: i32 = @intCast(stroke_width);
    const x0 = clamp_u(cx - irad - isw - 2, 0, b_.width);
    const y0 = clamp_u(cy - irad - isw - 2, 0, b_.height);
    const x1 = clamp_u(cx + irad + isw + 2, 0, b_.width);
    const y1 = clamp_u(cy + irad + isw + 2, 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @as(f32, @floatFromInt(px)) - fcx;
            const fpy: f32 = @as(f32, @floatFromInt(py)) - fcy;
            const d = polygon_sdf(fpx, fpy, frad, sides, rot_rad);
            const dist = abs_f(d) - half;
            const ca = cov_alpha(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

// ── Tests ──

test "filled hexagon center pixel" {
    var pixels = [_]u8{0} ** (60 * 60 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 60, .height = 60, .stride = 240 };
    filled(&pb, 30, 30, 20, 6, 0, 255, 0, 0, 255);
    const i = 30 * 240 + 30 * 4;
    try std.testing.expectEqual(@as(u8, 255), pixels[i]);
    try std.testing.expectEqual(@as(u8, 255), pixels[i + 3]);
}

test "filled hexagon outside pixel is empty" {
    var pixels = [_]u8{0} ** (60 * 60 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 60, .height = 60, .stride = 240 };
    filled(&pb, 30, 30, 15, 6, 0, 255, 0, 0, 255);
    try std.testing.expectEqual(@as(u8, 0), pixels[3]);
}

test "stroked hexagon has hollow center" {
    var pixels = [_]u8{0} ** (60 * 60 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 60, .height = 60, .stride = 240 };
    stroked(&pb, 30, 30, 20, 6, 0, 0, 255, 0, 255, 2);
    const center = 30 * 240 + 30 * 4;
    try std.testing.expectEqual(@as(u8, 0), pixels[center + 3]);
}

test "filled triangle paints center" {
    var pixels = [_]u8{0} ** (60 * 60 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 60, .height = 60, .stride = 240 };
    filled(&pb, 30, 30, 20, 3, 0, 255, 128, 0, 255);
    const center = 30 * 240 + 30 * 4;
    try std.testing.expect(pixels[center + 3] > 0);
}

test "rotation changes pixel pattern" {
    var pixels_a = [_]u8{0} ** (60 * 60 * 4);
    var pb_a = PixelBuffer{ .data = &pixels_a, .width = 60, .height = 60, .stride = 240 };
    filled(&pb_a, 30, 30, 20, 6, 0, 255, 0, 0, 255);

    var pixels_b = [_]u8{0} ** (60 * 60 * 4);
    var pb_b = PixelBuffer{ .data = &pixels_b, .width = 60, .height = 60, .stride = 240 };
    filled(&pb_b, 30, 30, 20, 6, 30, 255, 0, 0, 255);

    var diffs: u32 = 0;
    var idx: u32 = 0;
    while (idx < 60 * 60) : (idx += 1) {
        if (pixels_a[idx * 4 + 3] != pixels_b[idx * 4 + 3]) diffs += 1;
    }
    try std.testing.expect(diffs > 0);
}

test "filled hexagon edge coverage" {
    var pixels = [_]u8{0} ** (60 * 60 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 60, .height = 60, .stride = 240 };
    filled(&pb, 30, 30, 20, 6, 0, 255, 0, 0, 255);
    // Inside apothem (~17.3px for r=20): should be fully filled
    const inside = 30 * 240 + 47 * 4;
    try std.testing.expect(pixels[inside + 3] > 200);
    // Past circumradius (r=20): should be empty or very faint
    const outside = 30 * 240 + 51 * 4;
    try std.testing.expect(pixels[outside + 3] < 50);
}

test "stroked hexagon has paint on edge" {
    var pixels = [_]u8{0} ** (60 * 60 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 60, .height = 60, .stride = 240 };
    stroked(&pb, 30, 30, 20, 6, 0, 255, 255, 255, 255, 2);
    // Right edge at x≈47 (apothem for r=20 is ~17.3 → cx+17 = 47)
    const edge_px = 30 * 240 + 47 * 4;
    try std.testing.expect(pixels[edge_px + 3] > 100);
}
