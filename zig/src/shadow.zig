///! Box blur for shadow effects.
///!
///! Three passes of box blur approximate a Gaussian blur.
///! Separable: horizontal pass + vertical pass = 2D blur.
///!
///! Used to create soft drop shadows:
///!   1. Paint the shape in shadow color at an offset
///!   2. Box-blur the region
///!   3. Paint the actual shape on top
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;

fn max_u(a: u32, b: u32) u32 {
    return @max(a, b);
}

fn min_u(a: u32, b: u32) u32 {
    return @min(a, b);
}

/// Box blur a rectangular region of the buffer.
/// `passes` controls blur quality: 1 = box, 3 ≈ gaussian.
pub fn blur(b_: *PixelBuffer, x: u32, y: u32, w: u32, h: u32, radius: u32, passes: u32) void {
    if (radius == 0 or w == 0 or h == 0) return;

    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw == 0 or rh == 0) return;

    // Temp buffer for one row/column
    // We need max(rw, rh) * 4 bytes
    const tmp_size = max_u(rw, rh) * 4;
    var tmp_buf: [4096]u8 = undefined;
    // If tmp_size fits in stack, use stack. Otherwise skip blur (safety limit).
    if (tmp_size > tmp_buf.len) return;
    const tmp = tmp_buf[0..tmp_size];

    var p: u32 = 0;
    while (p < passes) : (p += 1) {
        blur_h(b_, x0, y0, x1, y1, radius, tmp);
        blur_v(b_, x0, y0, x1, y1, radius, tmp);
    }
}

fn blur_h(b_: *PixelBuffer, x0: u32, y0: u32, x1: u32, y1: u32, r: u32, tmp: []u8) void {
    const d = b_.data;
    const stride = b_.stride;
    const w = x1 - x0;

    var py = y0;
    while (py < y1) : (py += 1) {
        const row = py * stride;

        // Running sum with sliding window
        var sr: u32 = 0;
        var sg: u32 = 0;
        var sb: u32 = 0;
        var sa: u32 = 0;
        var cnt: u32 = 0;

        // Seed the window
        var dx: i32 = -@as(i32, @intCast(r));
        while (dx <= @as(i32, @intCast(r))) : (dx += 1) {
            const px_i = @as(i32, @intCast(x0)) + dx;
            if (px_i >= @as(i32, @intCast(x0)) and px_i < @as(i32, @intCast(x1))) {
                const px: u32 = @intCast(px_i);
                const off = row + px * 4;
                sr += d[off];
                sg += d[off + 1];
                sb += d[off + 2];
                sa += d[off + 3];
                cnt += 1;
            }
        }

        // Slide and record
        var px = x0;
        while (px < x1) : (px += 1) {
            const ti = (px - x0) * 4;
            if (cnt > 0) {
                tmp[ti] = @intCast(sr / cnt);
                tmp[ti + 1] = @intCast(sg / cnt);
                tmp[ti + 2] = @intCast(sb / cnt);
                tmp[ti + 3] = @intCast(sa / cnt);
            }

            // Add right edge
            const add_i = @as(i32, @intCast(px)) + @as(i32, @intCast(r)) + 1;
            if (add_i >= @as(i32, @intCast(x0)) and add_i < @as(i32, @intCast(x1))) {
                const add: u32 = @intCast(add_i);
                const off = row + add * 4;
                sr += d[off];
                sg += d[off + 1];
                sb += d[off + 2];
                sa += d[off + 3];
                cnt += 1;
            }

            // Remove left edge
            const rem_i = @as(i32, @intCast(px)) - @as(i32, @intCast(r));
            if (rem_i >= @as(i32, @intCast(x0)) and rem_i < @as(i32, @intCast(x1))) {
                const rem: u32 = @intCast(rem_i);
                const off = row + rem * 4;
                sr -= d[off];
                sg -= d[off + 1];
                sb -= d[off + 2];
                sa -= d[off + 3];
                cnt -= 1;
            }
        }

        // Write back
        px = x0;
        while (px < x1) : (px += 1) {
            const off = row + px * 4;
            const ti = (px - x0) * 4;
            d[off] = tmp[ti];
            d[off + 1] = tmp[ti + 1];
            d[off + 2] = tmp[ti + 2];
            d[off + 3] = tmp[ti + 3];
        }
        _ = w;
    }
}

fn blur_v(b_: *PixelBuffer, x0: u32, y0: u32, x1: u32, y1: u32, r: u32, tmp: []u8) void {
    const d = b_.data;
    const stride = b_.stride;
    const h = y1 - y0;

    var px = x0;
    while (px < x1) : (px += 1) {
        var sr: u32 = 0;
        var sg: u32 = 0;
        var sb: u32 = 0;
        var sa: u32 = 0;
        var cnt: u32 = 0;

        // Seed
        var dy: i32 = -@as(i32, @intCast(r));
        while (dy <= @as(i32, @intCast(r))) : (dy += 1) {
            const py_i = @as(i32, @intCast(y0)) + dy;
            if (py_i >= @as(i32, @intCast(y0)) and py_i < @as(i32, @intCast(y1))) {
                const py: u32 = @intCast(py_i);
                const off = py * stride + px * 4;
                sr += d[off];
                sg += d[off + 1];
                sb += d[off + 2];
                sa += d[off + 3];
                cnt += 1;
            }
        }

        // Slide
        var py = y0;
        while (py < y1) : (py += 1) {
            const ti = (py - y0) * 4;
            if (cnt > 0) {
                tmp[ti] = @intCast(sr / cnt);
                tmp[ti + 1] = @intCast(sg / cnt);
                tmp[ti + 2] = @intCast(sb / cnt);
                tmp[ti + 3] = @intCast(sa / cnt);
            }

            const add_i = @as(i32, @intCast(py)) + @as(i32, @intCast(r)) + 1;
            if (add_i >= @as(i32, @intCast(y0)) and add_i < @as(i32, @intCast(y1))) {
                const add: u32 = @intCast(add_i);
                const off = add * stride + px * 4;
                sr += d[off];
                sg += d[off + 1];
                sb += d[off + 2];
                sa += d[off + 3];
                cnt += 1;
            }

            const rem_i = @as(i32, @intCast(py)) - @as(i32, @intCast(r));
            if (rem_i >= @as(i32, @intCast(y0)) and rem_i < @as(i32, @intCast(y1))) {
                const rem: u32 = @intCast(rem_i);
                const off = rem * stride + px * 4;
                sr -= d[off];
                sg -= d[off + 1];
                sb -= d[off + 2];
                sa -= d[off + 3];
                cnt -= 1;
            }
        }

        // Write back
        py = y0;
        while (py < y1) : (py += 1) {
            const off = py * stride + px * 4;
            const ti = (py - y0) * 4;
            d[off] = tmp[ti];
            d[off + 1] = tmp[ti + 1];
            d[off + 2] = tmp[ti + 2];
            d[off + 3] = tmp[ti + 3];
        }
        _ = h;
    }
}

// ── Inset shadow ──

const rect = @import("rect.zig");

/// Paint an inset shadow inside a rounded rectangle.
///
/// Algorithm:
///   1. For each pixel INSIDE the rect (SDF < 0):
///      compute distance from the NEAREST EDGE of the rect
///   2. The closer to the edge, the more shadow.
///      Shadow intensity = clamp(1.0 - |dist| / spread, 0, 1)
///   3. Offset shifts which edges produce more shadow (simulating light direction).
///
/// This is a pure SDF approach — no blur pass needed, anti-aliased by default.
pub fn inset(
    b_: *PixelBuffer,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    radius: u32,
    ox: i32,
    oy: i32,
    spread: u32,
    sr: u8,
    sg: u8,
    sb: u8,
    sa: u8,
) void {
    if (sa == 0 or spread == 0 or w == 0 or h == 0) return;

    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);
    const max_rad = @min(fw / 2.0, fh / 2.0);
    const rad = @min(@as(f32, @floatFromInt(radius)), max_rad);
    const fspread: f32 = @floatFromInt(spread);
    const fox: f32 = @floatFromInt(ox);
    const foy: f32 = @floatFromInt(oy);

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const hw = fw / 2.0;
    const hh = fh / 2.0;
    const mx = fx + hw;
    const my = fy + hh;

    const clamp_u = rect.clamp_u_pub;

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

            // SDF of the outer rect — negative = inside
            const dist = rect.sdf_pub(fpx, fpy, mx, my, hw, hh, rad);
            if (dist > 0.5) continue; // outside the rect

            // Distance from the edge = -dist (positive inside).
            // Offset shifts the "virtual edge" — as if the shadow source is shifted.
            const edge_dist = -dist;
            // Apply offset: reduce effective distance on the offset side
            const offset_dist = edge_dist + fox * (fpx - mx) / hw + foy * (fpy - my) / hh;
            const t = 1.0 - @min(@max(offset_dist / fspread, 0.0), 1.0);

            if (t < 0.01) continue;

            // Modulate alpha by t (closer to edge = more shadow)
            const final_a: u32 = @intFromFloat(@round(@as(f32, @floatFromInt(sa)) * t));
            if (final_a == 0) continue;
            buf.blend(b_, px, py, sr, sg, sb, @intCast(@min(final_a, 255)));
        }
    }
}

// ── Tests ──

test "blur smooths sharp edges" {
    var pixels = [_]u8{0} ** (10 * 10 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 10, .height = 10, .stride = 40 };
    // Paint a solid white pixel at center
    const center = 5 * 40 + 5 * 4;
    pixels[center] = 255;
    pixels[center + 1] = 255;
    pixels[center + 2] = 255;
    pixels[center + 3] = 255;

    blur(&pb, 3, 3, 5, 5, 1, 1);

    // After blur, center should be dimmer (spread to neighbors)
    try std.testing.expect(pixels[center + 3] < 255);
    // And neighbors should have some alpha
    const neighbor = 5 * 40 + 6 * 4;
    try std.testing.expect(pixels[neighbor + 3] > 0);
}

test "inset shadow paints inside rect" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    // Inset shadow: rect at (2,2) 16x16, radius 3, spread 6, black shadow
    inset(&pb, 2, 2, 16, 16, 3, 0, 0, 6, 0, 0, 0, 200);

    // Edge pixel (3,10) should have shadow (near border)
    const edge = 10 * 80 + 3 * 4;
    try std.testing.expect(pixels[edge + 3] > 50);

    // Center pixel (10,10) should have less or no shadow
    const center = 10 * 80 + 10 * 4;
    try std.testing.expect(pixels[edge + 3] > pixels[center + 3]);

    // Outside pixel (0,0) should be empty
    try std.testing.expectEqual(@as(u8, 0), pixels[0 + 3]);
}
