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
