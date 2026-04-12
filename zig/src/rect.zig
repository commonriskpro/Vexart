///! Rounded rectangle SDF — fill, stroke, and shadow-ready primitives.
///!
///! Uses signed distance fields for anti-aliased corners.
///! The SDF for a rounded rect with center (mx,my), half-extents (hw,hh),
///! and corner radius r is:
///!   d = length(max(|p - center| - half + r, 0)) + min(max(dx,dy), 0) - r
///! where dx = |px-mx| - hw + r, dy = |py-my| - hh + r.
///!
///! Coverage is computed from distance:
///!   dist < -0.5  → fully inside  (coverage = 1.0)
///!   dist >  0.5  → fully outside (coverage = 0.0)
///!   otherwise    → linear interpolation (anti-aliased edge)
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

// ── Helpers ──

fn sqrt(x: f32) f32 {
    return @sqrt(x);
}

fn max_f(a: f32, b: f32) f32 {
    return @max(a, b);
}

fn min_f(a: f32, b: f32) f32 {
    return @min(a, b);
}

fn abs_f(x: f32) f32 {
    return @abs(x);
}

fn clamp_u(val: i32, lo: u32, hi: u32) u32 {
    if (val < @as(i32, @intCast(lo))) return lo;
    if (val > @as(i32, @intCast(hi))) return hi;
    return @intCast(val);
}

/// Public alias for cross-module use (shadow.zig needs this).
pub const clamp_u_pub = clamp_u;

/// Rounded rect SDF distance at point (px, py).
/// Center (mx, my), half-extents (hw, hh), corner radius r.
fn sdf(px: f32, py: f32, mx: f32, my: f32, hw: f32, hh: f32, r: f32) f32 {
    const dx = abs_f(px - mx) - hw + r;
    const dy = abs_f(py - my) - hh + r;
    const outside = sqrt(max_f(dx, 0) * max_f(dx, 0) + max_f(dy, 0) * max_f(dy, 0));
    return outside + min_f(max_f(dx, dy), 0) - r;
}

/// Public alias for cross-module use (shadow.zig needs this).
pub const sdf_pub = sdf;

/// Convert SDF distance to alpha coverage (0..255).
fn coverage(dist: f32, base_alpha: u8) u8 {
    if (dist > 0.5) return 0;
    if (dist < -0.5) return base_alpha;
    const cov = 0.5 - dist;
    const result = @as(f32, @floatFromInt(base_alpha)) * cov;
    const clamped: u32 = @intFromFloat(@round(result));
    return if (clamped > 255) 255 else @intCast(clamped);
}

// ── Public API ──

/// Fill a solid rectangle (no radius). Fast path — no SDF needed.
pub fn fill(b_: *PixelBuffer, x: i32, y: i32, w: u32, h: u32, r: u8, g: u8, b: u8, a: u8) void {
    if (a == 0) return;
    const x0 = clamp_u(x, 0, b_.width);
    const y0 = clamp_u(y, 0, b_.height);
    const x1 = clamp_u(x + @as(i32, @intCast(w)), 0, b_.width);
    const y1 = clamp_u(y + @as(i32, @intCast(h)), 0, b_.height);

    if (a == 0xff) {
        // Opaque fast path — direct write, no blending
        var py = y0;
        while (py < y1) : (py += 1) {
            var px = x0;
            while (px < x1) : (px += 1) {
                const i = py * b_.stride + px * 4;
                b_.data[i] = r;
                b_.data[i + 1] = g;
                b_.data[i + 2] = b;
                b_.data[i + 3] = 0xff;
            }
        }
        return;
    }

    // Semi-transparent — blend each pixel
    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            blend(b_, px, py, r, g, b, a);
        }
    }
}

/// Fill a rounded rectangle using SDF for anti-aliased corners.
pub fn rounded(b_: *PixelBuffer, x: i32, y: i32, w: u32, h: u32, r: u8, g: u8, b: u8, a: u8, radius: u32) void {
    if (a == 0) return;
    if (radius == 0) return fill(b_, x, y, w, h, r, g, b, a);

    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);

    // Clamp radius to half of smallest dimension
    const max_rad = min_f(fw / 2.0, fh / 2.0);
    const rad = min_f(@as(f32, @floatFromInt(radius)), max_rad);

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const hw = fw / 2.0;
    const hh = fh / 2.0;
    const mx = fx + hw;
    const my = fy + hh;

    const x0 = clamp_u(x, 0, b_.width);
    const y0 = clamp_u(y, 0, b_.height);
    const x1 = clamp_u(x + @as(i32, @intCast(w)), 0, b_.width);
    const y1 = clamp_u(y + @as(i32, @intCast(h)), 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const dist = sdf(fpx, fpy, mx, my, hw, hh, rad);
            const ca = coverage(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

/// Stroke (outline) a rounded rectangle using SDF.
/// The stroke is a band of width `sw` centered on the SDF boundary.
pub fn stroke(b_: *PixelBuffer, x: i32, y: i32, w: u32, h: u32, r: u8, g: u8, b: u8, a: u8, radius: u32, sw: u32) void {
    if (a == 0 or sw == 0) return;

    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);
    const fsw: f32 = @floatFromInt(sw);

    const max_rad = min_f(fw / 2.0, fh / 2.0);
    const rad = min_f(@as(f32, @floatFromInt(radius)), max_rad);

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const hw = fw / 2.0;
    const hh = fh / 2.0;
    const mx = fx + hw;
    const my = fy + hh;

    const x0 = clamp_u(x, 0, b_.width);
    const y0 = clamp_u(y, 0, b_.height);
    const x1 = clamp_u(x + @as(i32, @intCast(w)), 0, b_.width);
    const y1 = clamp_u(y + @as(i32, @intCast(h)), 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const d = sdf(fpx, fpy, mx, my, hw, hh, rad);
            // Stroke band: |d| < sw/2
            const band = abs_f(d) - fsw / 2.0;
            const ca = coverage(band, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

// ── Per-corner radius ──

/// SDF for a rounded rect with per-corner radii.
/// Selects the corner radius based on the quadrant of (px, py) relative to center (mx, my).
/// radii: [top-left, top-right, bottom-right, bottom-left]
fn sdf_corners(px: f32, py: f32, mx: f32, my: f32, hw: f32, hh: f32, r_tl: f32, r_tr: f32, r_br: f32, r_bl: f32) f32 {
    // Select corner radius by quadrant
    const r = if (px < mx)
        (if (py < my) r_tl else r_bl)
    else
        (if (py < my) r_tr else r_br);
    const dx = abs_f(px - mx) - hw + r;
    const dy = abs_f(py - my) - hh + r;
    const outside = sqrt(max_f(dx, 0) * max_f(dx, 0) + max_f(dy, 0) * max_f(dy, 0));
    return outside + min_f(max_f(dx, dy), 0) - r;
}

/// Fill a rounded rectangle with per-corner radii.
/// radii packed as u32: top-left in bits 24-31, top-right 16-23, bottom-right 8-15, bottom-left 0-7.
pub fn rounded_corners(b_: *PixelBuffer, x: i32, y: i32, w: u32, h: u32, r: u8, g: u8, b: u8, a: u8, radii: u32) void {
    if (a == 0) return;

    const r_tl: u32 = (radii >> 24) & 0xff;
    const r_tr: u32 = (radii >> 16) & 0xff;
    const r_br: u32 = (radii >> 8) & 0xff;
    const r_bl: u32 = radii & 0xff;

    // If all radii are 0, fast path
    if (r_tl == 0 and r_tr == 0 and r_br == 0 and r_bl == 0) return fill(b_, x, y, w, h, r, g, b, a);
    // If all same, use uniform path
    if (r_tl == r_tr and r_tr == r_br and r_br == r_bl) return rounded(b_, x, y, w, h, r, g, b, a, r_tl);

    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);
    const max_rad = min_f(fw / 2.0, fh / 2.0);

    const ftl = min_f(@as(f32, @floatFromInt(r_tl)), max_rad);
    const ftr = min_f(@as(f32, @floatFromInt(r_tr)), max_rad);
    const fbr = min_f(@as(f32, @floatFromInt(r_br)), max_rad);
    const fbl = min_f(@as(f32, @floatFromInt(r_bl)), max_rad);

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const hw = fw / 2.0;
    const hh = fh / 2.0;
    const mx = fx + hw;
    const my = fy + hh;

    const x0 = clamp_u(x, 0, b_.width);
    const y0 = clamp_u(y, 0, b_.height);
    const x1 = clamp_u(x + @as(i32, @intCast(w)), 0, b_.width);
    const y1 = clamp_u(y + @as(i32, @intCast(h)), 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const dist = sdf_corners(fpx, fpy, mx, my, hw, hh, ftl, ftr, fbr, fbl);
            const ca = coverage(dist, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

/// Stroke a rounded rectangle with per-corner radii.
pub fn stroke_corners(b_: *PixelBuffer, x: i32, y: i32, w: u32, h: u32, r: u8, g: u8, b: u8, a: u8, radii: u32, sw: u32) void {
    if (a == 0 or sw == 0) return;

    const r_tl: u32 = (radii >> 24) & 0xff;
    const r_tr: u32 = (radii >> 16) & 0xff;
    const r_br: u32 = (radii >> 8) & 0xff;
    const r_bl: u32 = radii & 0xff;

    if (r_tl == 0 and r_tr == 0 and r_br == 0 and r_bl == 0) return stroke(b_, x, y, w, h, r, g, b, a, 0, sw);
    if (r_tl == r_tr and r_tr == r_br and r_br == r_bl) return stroke(b_, x, y, w, h, r, g, b, a, r_tl, sw);

    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);
    const fsw: f32 = @floatFromInt(sw);
    const max_rad = min_f(fw / 2.0, fh / 2.0);

    const ftl = min_f(@as(f32, @floatFromInt(r_tl)), max_rad);
    const ftr = min_f(@as(f32, @floatFromInt(r_tr)), max_rad);
    const fbr = min_f(@as(f32, @floatFromInt(r_br)), max_rad);
    const fbl = min_f(@as(f32, @floatFromInt(r_bl)), max_rad);

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const hw = fw / 2.0;
    const hh = fh / 2.0;
    const mx = fx + hw;
    const my = fy + hh;

    const x0 = clamp_u(x, 0, b_.width);
    const y0 = clamp_u(y, 0, b_.height);
    const x1 = clamp_u(x + @as(i32, @intCast(w)), 0, b_.width);
    const y1 = clamp_u(y + @as(i32, @intCast(h)), 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            const d = sdf_corners(fpx, fpy, mx, my, hw, hh, ftl, ftr, fbr, fbl);
            const band = abs_f(d) - fsw / 2.0;
            const ca = coverage(band, a);
            if (ca == 0) continue;
            blend(b_, px, py, r, g, b, ca);
        }
    }
}

// ── Tests ──

test "fill opaque rect" {
    var pixels = [_]u8{0} ** (4 * 4 * 4); // 4x4
    var pb = PixelBuffer{ .data = &pixels, .width = 4, .height = 4, .stride = 16 };
    fill(&pb, 1, 1, 2, 2, 255, 128, 0, 255);
    // (1,1) should be filled
    const i = 1 * 16 + 1 * 4;
    try std.testing.expectEqual(@as(u8, 255), pixels[i]);
    try std.testing.expectEqual(@as(u8, 128), pixels[i + 1]);
    try std.testing.expectEqual(@as(u8, 0), pixels[i + 2]);
    try std.testing.expectEqual(@as(u8, 255), pixels[i + 3]);
    // (0,0) should be empty
    try std.testing.expectEqual(@as(u8, 0), pixels[0]);
}

test "rounded rect clips correctly" {
    var pixels = [_]u8{0} ** (8 * 8 * 4); // 8x8
    var pb = PixelBuffer{ .data = &pixels, .width = 8, .height = 8, .stride = 32 };
    rounded(&pb, 1, 1, 6, 6, 255, 0, 0, 255, 2);
    // Center pixel (4,4) should be fully filled
    const i = 4 * 32 + 4 * 4;
    try std.testing.expectEqual(@as(u8, 255), pixels[i]);
    try std.testing.expectEqual(@as(u8, 255), pixels[i + 3]);
    // (0,0) should be empty (outside rect)
    try std.testing.expectEqual(@as(u8, 0), pixels[0]);
}

test "stroke produces hollow rect" {
    var pixels = [_]u8{0} ** (12 * 12 * 4); // 12x12
    var pb = PixelBuffer{ .data = &pixels, .width = 12, .height = 12, .stride = 48 };
    stroke(&pb, 1, 1, 10, 10, 0, 255, 0, 255, 0, 1);
    // Center (6,6) should be empty (hollow)
    const center = 6 * 48 + 6 * 4;
    try std.testing.expectEqual(@as(u8, 0), pixels[center + 3]);
    // Edge (1,5) should have paint
    const edge = 5 * 48 + 1 * 4;
    try std.testing.expect(pixels[edge + 3] > 0);
}

test "per-corner radius fills correctly" {
    var pixels = [_]u8{0} ** (20 * 20 * 4); // 20x20
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    // TL=5, TR=0, BR=0, BL=0 — only top-left is rounded
    const radii: u32 = (5 << 24) | (0 << 16) | (0 << 8) | 0;
    rounded_corners(&pb, 2, 2, 16, 16, 255, 0, 0, 255, radii);
    // Center should be filled
    const center = 10 * 80 + 10 * 4;
    try std.testing.expectEqual(@as(u8, 255), pixels[center]);
    try std.testing.expectEqual(@as(u8, 255), pixels[center + 3]);
    // Bottom-right corner (17,17) should be filled (no radius)
    const br = 17 * 80 + 17 * 4;
    try std.testing.expectEqual(@as(u8, 255), pixels[br + 3]);
}

test "per-corner all-same delegates to uniform" {
    var pixels1 = [_]u8{0} ** (12 * 12 * 4);
    var pixels2 = [_]u8{0} ** (12 * 12 * 4);
    var pb1 = PixelBuffer{ .data = &pixels1, .width = 12, .height = 12, .stride = 48 };
    var pb2 = PixelBuffer{ .data = &pixels2, .width = 12, .height = 12, .stride = 48 };
    // All corners = 3
    const radii: u32 = (3 << 24) | (3 << 16) | (3 << 8) | 3;
    rounded_corners(&pb1, 1, 1, 10, 10, 255, 0, 0, 255, radii);
    rounded(&pb2, 1, 1, 10, 10, 255, 0, 0, 255, 3);
    // Both should produce identical output
    for (0..pixels1.len) |i| {
        try std.testing.expectEqual(pixels1[i], pixels2[i]);
    }
}
