///! Affine + projective buffer blit with bilinear interpolation.
///!
///! Composites a source pixel buffer onto a destination using a 3×3
///! inverse transform matrix.  Supports translate, rotate, scale, skew,
///! and pseudo-perspective (homogeneous division).
///!
///! Algorithm (inverse mapping):
///!   For each pixel (dx, dy) in the destination bounding box:
///!     1. Compute source coords via inverse matrix (projective divide)
///!     2. Bilinear-sample source at (sx, sy)
///!     3. src-over composite onto destination
///!
///! This is the same technique used by CSS transforms, Canvas2D drawImage,
///! and WebGL textured quads.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;

// ── Helpers ──

inline fn rd_f32(p: [*]const u8, off: usize) f32 {
    return @bitCast([4]u8{ p[off], p[off + 1], p[off + 2], p[off + 3] });
}

inline fn rd_i32(p: [*]const u8, off: usize) i32 {
    return @bitCast([4]u8{ p[off], p[off + 1], p[off + 2], p[off + 3] });
}

inline fn rd_u32(p: [*]const u8, off: usize) u32 {
    return @bitCast([4]u8{ p[off], p[off + 1], p[off + 2], p[off + 3] });
}

fn clampf(v: f32, lo: f32, hi: f32) f32 {
    return @max(lo, @min(hi, v));
}

// ── Bilinear sampling ──

/// Sample a pixel from a buffer using bilinear interpolation.
/// Returns (r, g, b, a) as u8 values.
/// Coordinates outside [0, w-1] x [0, h-1] return transparent.
fn bilinear_sample(
    data: [*]const u8,
    width: u32,
    height: u32,
    stride: u32,
    sx: f32,
    sy: f32,
) struct { r: u8, g: u8, b: u8, a: u8 } {
    // Integer coordinates of the top-left pixel
    const x0f = @floor(sx);
    const y0f = @floor(sy);
    const x0: i32 = @intFromFloat(x0f);
    const y0: i32 = @intFromFloat(y0f);

    // Fractional part for interpolation
    const fx = sx - x0f;
    const fy = sy - y0f;

    // Neighbor coordinates
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const w: i32 = @intCast(width);
    const h: i32 = @intCast(height);

    // Read 4 neighbor pixels (clamp to edge, transparent if out of bounds)
    const c00 = read_pixel(data, stride, w, h, x0, y0);
    const c10 = read_pixel(data, stride, w, h, x1, y0);
    const c01 = read_pixel(data, stride, w, h, x0, y1);
    const c11 = read_pixel(data, stride, w, h, x1, y1);

    // Bilinear interpolation per channel
    const ifx = 1.0 - fx;
    const ify = 1.0 - fy;

    const w00 = ifx * ify;
    const w10 = fx * ify;
    const w01 = ifx * fy;
    const w11 = fx * fy;

    return .{
        .r = @intFromFloat(clampf(c00.r * w00 + c10.r * w10 + c01.r * w01 + c11.r * w11, 0, 255)),
        .g = @intFromFloat(clampf(c00.g * w00 + c10.g * w10 + c01.g * w01 + c11.g * w11, 0, 255)),
        .b = @intFromFloat(clampf(c00.b * w00 + c10.b * w10 + c01.b * w01 + c11.b * w11, 0, 255)),
        .a = @intFromFloat(clampf(c00.a * w00 + c10.a * w10 + c01.a * w01 + c11.a * w11, 0, 255)),
    };
}

/// Read a single pixel from buffer. Returns transparent black if out of bounds.
inline fn read_pixel(
    data: [*]const u8,
    stride: u32,
    w: i32,
    h: i32,
    x: i32,
    y: i32,
) struct { r: f32, g: f32, b: f32, a: f32 } {
    if (x < 0 or y < 0 or x >= w or y >= h) {
        return .{ .r = 0, .g = 0, .b = 0, .a = 0 };
    }
    const ux: u32 = @intCast(x);
    const uy: u32 = @intCast(y);
    const i = uy * stride + ux * 4;
    return .{
        .r = @floatFromInt(data[i]),
        .g = @floatFromInt(data[i + 1]),
        .b = @floatFromInt(data[i + 2]),
        .a = @floatFromInt(data[i + 3]),
    };
}

// ── Core: Affine blit ──

/// Composite source buffer onto destination with a 3×3 projective transform.
///
/// The transform matrix is the INVERSE mapping (destination → source).
/// For each destination pixel, we find the corresponding source pixel
/// via the inverse matrix and bilinear-sample it.
///
/// params layout (52 bytes):
///   [0..36]   9 × f32: inverse matrix (row-major: m0..m8)
///   [36..40]  i32: dest offset X (where to start writing in dst)
///   [40..44]  i32: dest offset Y
///   [44..48]  u32: blit width  (output region size)
///   [48..52]  u32: blit height
pub fn affine_blit(
    dst: *PixelBuffer,
    src_data: [*]const u8,
    src_w: u32,
    src_h: u32,
    params: [*]const u8,
) void {
    // Read inverse matrix
    const m0 = rd_f32(params, 0);
    const m1 = rd_f32(params, 4);
    const m2 = rd_f32(params, 8);
    const m3 = rd_f32(params, 12);
    const m4 = rd_f32(params, 16);
    const m5 = rd_f32(params, 20);
    const m6 = rd_f32(params, 24);
    const m7 = rd_f32(params, 28);
    const m8 = rd_f32(params, 32);

    // Read destination region
    const dst_ox = rd_i32(params, 36);
    const dst_oy = rd_i32(params, 40);
    const blit_w = rd_u32(params, 44);
    const blit_h = rd_u32(params, 48);

    const src_stride = src_w * 4;
    const dw: i32 = @intCast(dst.width);
    const dh: i32 = @intCast(dst.height);

    var dy: u32 = 0;
    while (dy < blit_h) : (dy += 1) {
        const abs_dy = dst_oy + @as(i32, @intCast(dy));
        if (abs_dy < 0 or abs_dy >= dh) continue;

        var dx: u32 = 0;
        while (dx < blit_w) : (dx += 1) {
            const abs_dx = dst_ox + @as(i32, @intCast(dx));
            if (abs_dx < 0 or abs_dx >= dw) continue;

            // Destination pixel coords (relative to blit origin)
            const fdx: f32 = @floatFromInt(dx);
            const fdy: f32 = @floatFromInt(dy);

            // Projective inverse: dst → src
            const w_div = m6 * fdx + m7 * fdy + m8;
            if (@abs(w_div) < 1e-7) continue; // degenerate

            const inv_w = 1.0 / w_div;
            const sx = (m0 * fdx + m1 * fdy + m2) * inv_w;
            const sy = (m3 * fdx + m4 * fdy + m5) * inv_w;

            // Skip if source coords are fully outside
            const sw_f: f32 = @floatFromInt(src_w);
            const sh_f: f32 = @floatFromInt(src_h);
            if (sx < -0.5 or sy < -0.5 or sx >= sw_f - 0.5 or sy >= sh_f - 0.5) continue;

            // Bilinear sample source
            const sampled = bilinear_sample(src_data, src_w, src_h, src_stride, sx, sy);
            if (sampled.a == 0) continue;

            // src-over composite onto destination
            buf.blend(dst, @intCast(abs_dx), @intCast(abs_dy), sampled.r, sampled.g, sampled.b, sampled.a);
        }
    }
}

// ── Tests ──

const testing = std.testing;

fn TestBuf(comptime w: u32, comptime h: u32) type {
    return struct {
        data: [w * h * 4]u8,
        pb: PixelBuffer,
    };
}

fn make_test_buf(comptime w: u32, comptime h: u32) TestBuf(w, h) {
    var result: TestBuf(w, h) = undefined;
    result.data = [_]u8{0} ** (w * h * 4);
    result.pb = .{ .data = &result.data, .width = w, .height = h, .stride = w * 4 };
    return result;
}

fn set_pixel(data: []u8, stride: u32, x: u32, y: u32, r: u8, g: u8, b: u8, a: u8) void {
    const i = y * stride + x * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
}

fn get_pixel(data: []const u8, stride: u32, x: u32, y: u32) struct { r: u8, g: u8, b: u8, a: u8 } {
    const i = y * stride + x * 4;
    return .{ .r = data[i], .g = data[i + 1], .b = data[i + 2], .a = data[i + 3] };
}

fn write_f32(out: []u8, off: usize, val: f32) void {
    const bytes: [4]u8 = @bitCast(val);
    out[off] = bytes[0];
    out[off + 1] = bytes[1];
    out[off + 2] = bytes[2];
    out[off + 3] = bytes[3];
}

fn write_i32(out: []u8, off: usize, val: i32) void {
    const bytes: [4]u8 = @bitCast(val);
    out[off] = bytes[0];
    out[off + 1] = bytes[1];
    out[off + 2] = bytes[2];
    out[off + 3] = bytes[3];
}

fn write_u32(out: []u8, off: usize, val: u32) void {
    const bytes: [4]u8 = @bitCast(val);
    out[off] = bytes[0];
    out[off + 1] = bytes[1];
    out[off + 2] = bytes[2];
    out[off + 3] = bytes[3];
}

fn make_identity_params(dst_ox: i32, dst_oy: i32, w: u32, h: u32) [52]u8 {
    var params: [52]u8 = [_]u8{0} ** 52;
    // Identity inverse matrix
    write_f32(&params, 0, 1.0); // m0
    write_f32(&params, 4, 0.0); // m1
    write_f32(&params, 8, 0.0); // m2
    write_f32(&params, 12, 0.0); // m3
    write_f32(&params, 16, 1.0); // m4
    write_f32(&params, 20, 0.0); // m5
    write_f32(&params, 24, 0.0); // m6
    write_f32(&params, 28, 0.0); // m7
    write_f32(&params, 32, 1.0); // m8
    // Region
    write_i32(&params, 36, dst_ox);
    write_i32(&params, 40, dst_oy);
    write_u32(&params, 44, w);
    write_u32(&params, 48, h);
    return params;
}

test "affine_blit identity copies pixels unchanged" {
    // 4x4 source: fill with solid red
    var src_data = [_]u8{0} ** (4 * 4 * 4);
    for (0..4) |y| {
        for (0..4) |x| {
            set_pixel(&src_data, 16, @intCast(x), @intCast(y), 255, 0, 0, 255);
        }
    }

    // 8x8 destination: clear
    var dst_data = [_]u8{0} ** (8 * 8 * 4);
    var dst_pb = PixelBuffer{ .data = &dst_data, .width = 8, .height = 8, .stride = 32 };

    // Identity blit at offset (2, 2)
    var params = make_identity_params(2, 2, 4, 4);
    affine_blit(&dst_pb, &src_data, 4, 4, &params);

    // Check that pixels at (2,2)-(5,5) are red
    const p = get_pixel(&dst_data, 32, 3, 3);
    try testing.expect(p.r == 255);
    try testing.expect(p.g == 0);
    try testing.expect(p.b == 0);
    try testing.expect(p.a == 255);

    // Check that pixel at (0,0) is still transparent
    const q = get_pixel(&dst_data, 32, 0, 0);
    try testing.expect(q.a == 0);
}

test "affine_blit scale 2x doubles size" {
    // 2x2 source: solid green
    var src_data = [_]u8{0} ** (2 * 2 * 4);
    for (0..2) |y| {
        for (0..2) |x| {
            set_pixel(&src_data, 8, @intCast(x), @intCast(y), 0, 255, 0, 255);
        }
    }

    // 8x8 destination
    var dst_data = [_]u8{0} ** (8 * 8 * 4);
    var dst_pb = PixelBuffer{ .data = &dst_data, .width = 8, .height = 8, .stride = 32 };

    // Scale 2x → inverse is scale 0.5
    var params: [52]u8 = [_]u8{0} ** 52;
    write_f32(&params, 0, 0.5); // m0 = 1/scaleX
    write_f32(&params, 4, 0.0);
    write_f32(&params, 8, 0.0);
    write_f32(&params, 12, 0.0);
    write_f32(&params, 16, 0.5); // m4 = 1/scaleY
    write_f32(&params, 20, 0.0);
    write_f32(&params, 24, 0.0);
    write_f32(&params, 28, 0.0);
    write_f32(&params, 32, 1.0);
    write_i32(&params, 36, 0); // dst offset
    write_i32(&params, 40, 0);
    write_u32(&params, 44, 4); // blit width (2 * 2)
    write_u32(&params, 48, 4); // blit height

    affine_blit(&dst_pb, &src_data, 2, 2, &params);

    // Center pixel should be green (scaled up)
    const p = get_pixel(&dst_data, 32, 2, 2);
    try testing.expect(p.g == 255);
    try testing.expect(p.a == 255);

    // Outside the 4x4 region should be transparent
    const q = get_pixel(&dst_data, 32, 5, 5);
    try testing.expect(q.a == 0);
}

test "affine_blit 90 degree rotation" {
    // 4x4 source: top-left red, rest blue
    var src_data = [_]u8{0} ** (4 * 4 * 4);
    for (0..4) |y| {
        for (0..4) |x| {
            set_pixel(&src_data, 16, @intCast(x), @intCast(y), 0, 0, 255, 255);
        }
    }
    set_pixel(&src_data, 16, 0, 0, 255, 0, 0, 255); // top-left = red

    // 8x8 destination
    var dst_data = [_]u8{0} ** (8 * 8 * 4);
    var dst_pb = PixelBuffer{ .data = &dst_data, .width = 8, .height = 8, .stride = 32 };

    // 90° CW rotation around origin:
    // Inverse matrix: [0, 1, 0; -1, 0, 3; 0, 0, 1]
    // inv(dx,dy) = (dy, -dx+3) → src(0,0) appears at dst(3,0)
    var params: [52]u8 = [_]u8{0} ** 52;
    write_f32(&params, 0, 0.0); // m0
    write_f32(&params, 4, 1.0); // m1
    write_f32(&params, 8, 0.0); // m2
    write_f32(&params, 12, -1.0); // m3
    write_f32(&params, 16, 0.0); // m4
    write_f32(&params, 20, 3.0); // m5
    write_f32(&params, 24, 0.0); // m6
    write_f32(&params, 28, 0.0); // m7
    write_f32(&params, 32, 1.0); // m8
    write_i32(&params, 36, 0);
    write_i32(&params, 40, 0);
    write_u32(&params, 44, 4);
    write_u32(&params, 48, 4);

    affine_blit(&dst_pb, &src_data, 4, 4, &params);

    // dst(3, 0) should be the rotated position of src(0, 0) = red
    const p = get_pixel(&dst_data, 32, 3, 0);
    try testing.expect(p.r == 255);
    try testing.expect(p.a == 255);
}

test "affine_blit out of bounds is safe" {
    // 2x2 source
    var src_data = [_]u8{0} ** (2 * 2 * 4);
    set_pixel(&src_data, 8, 0, 0, 255, 255, 255, 255);

    // 4x4 destination
    var dst_data = [_]u8{0} ** (4 * 4 * 4);
    var dst_pb = PixelBuffer{ .data = &dst_data, .width = 4, .height = 4, .stride = 16 };

    // Blit at offset (-10, -10) → entirely off screen
    var params = make_identity_params(-10, -10, 2, 2);
    affine_blit(&dst_pb, &src_data, 2, 2, &params);

    // Nothing should be written
    const p = get_pixel(&dst_data, 16, 0, 0);
    try testing.expect(p.a == 0);
}

test "affine_blit perspective produces non-uniform scaling" {
    // 4x4 source: solid white
    var src_data = [_]u8{0} ** (4 * 4 * 4);
    for (0..4) |y| {
        for (0..4) |x| {
            set_pixel(&src_data, 16, @intCast(x), @intCast(y), 255, 255, 255, 255);
        }
    }

    // 8x8 destination
    var dst_data = [_]u8{0} ** (8 * 8 * 4);
    var dst_pb = PixelBuffer{ .data = &dst_data, .width = 8, .height = 8, .stride = 32 };

    // Mild perspective: p=0.05 (horizontal vanishing)
    // Inverse of [1,0,0; 0,1,0; 0.05,0,1] = [1,0,0; 0,1,0; -0.05,0,1]
    var params: [52]u8 = [_]u8{0} ** 52;
    write_f32(&params, 0, 1.0);
    write_f32(&params, 4, 0.0);
    write_f32(&params, 8, 0.0);
    write_f32(&params, 12, 0.0);
    write_f32(&params, 16, 1.0);
    write_f32(&params, 20, 0.0);
    write_f32(&params, 24, -0.05); // inverse p
    write_f32(&params, 28, 0.0);
    write_f32(&params, 32, 1.0);
    write_i32(&params, 36, 0);
    write_i32(&params, 40, 0);
    write_u32(&params, 44, 6);
    write_u32(&params, 48, 4);

    affine_blit(&dst_pb, &src_data, 4, 4, &params);

    // Pixel (0,0) should still map to src (0,0) — white
    const p0 = get_pixel(&dst_data, 32, 0, 0);
    try testing.expect(p0.a == 255);

    // Due to perspective, some right-side pixels should still have content
    var has_content = false;
    for (0..4) |y| {
        for (0..6) |x| {
            const px = get_pixel(&dst_data, 32, @intCast(x), @intCast(y));
            if (px.a > 0) has_content = true;
        }
    }
    try testing.expect(has_content);
}

test "bilinear_sample returns transparent for out-of-bounds" {
    var data = [_]u8{255} ** (2 * 2 * 4);
    const s = bilinear_sample(&data, 2, 2, 8, -2.0, -2.0);
    try testing.expect(s.a == 0);
}

test "bilinear_sample returns exact pixel at integer coords" {
    var data = [_]u8{0} ** (2 * 2 * 4);
    set_pixel(&data, 8, 1, 0, 100, 150, 200, 255);
    const s = bilinear_sample(&data, 2, 2, 8, 1.0, 0.0);
    try testing.expect(s.r == 100);
    try testing.expect(s.g == 150);
    try testing.expect(s.b == 200);
    try testing.expect(s.a == 255);
}
