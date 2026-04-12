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
const rect_mod = @import("rect.zig");

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

// ── Multi-stop gradient support ──
//
// Stops are passed as a packed buffer: [color_u32, position_f32] × N
// Each stop = 8 bytes: 4 bytes u32 RGBA color + 4 bytes f32 position (0.0–1.0).
// Stops MUST be sorted by position. At least 2 stops required.

const GradientStop = struct {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
    pos: f32,
};

/// Parse packed stop buffer into array of GradientStop.
/// Returns number of stops parsed (up to max_stops).
fn parse_stops(stops_ptr: [*]const u8, stop_count: u32, out: []GradientStop) u32 {
    const count = @min(stop_count, @as(u32, @intCast(out.len)));
    for (0..count) |i| {
        const base = i * 8;
        // Read u32 color (big-endian RGBA packed: 0xRRGGBBAA)
        const color: u32 = @as(u32, stops_ptr[base]) << 24 |
            @as(u32, stops_ptr[base + 1]) << 16 |
            @as(u32, stops_ptr[base + 2]) << 8 |
            @as(u32, stops_ptr[base + 3]);
        // Read f32 position (little-endian, as written by Float32Array on JS side)
        const pos_bytes = [4]u8{ stops_ptr[base + 4], stops_ptr[base + 5], stops_ptr[base + 6], stops_ptr[base + 7] };
        const pos: f32 = @bitCast(pos_bytes);

        out[i] = .{
            .r = @intCast((color >> 24) & 0xff),
            .g = @intCast((color >> 16) & 0xff),
            .b = @intCast((color >> 8) & 0xff),
            .a = @intCast(color & 0xff),
            .pos = pos,
        };
    }
    return count;
}

/// Sample a color from a multi-stop gradient at position t (0.0–1.0).
fn sample_stops(stops: []const GradientStop, count: u32, t: f32) struct { r: u8, g: u8, b: u8, a: u8 } {
    if (count == 0) return .{ .r = 0, .g = 0, .b = 0, .a = 0 };
    if (count == 1 or t <= stops[0].pos) return .{ .r = stops[0].r, .g = stops[0].g, .b = stops[0].b, .a = stops[0].a };
    const last = count - 1;
    if (t >= stops[last].pos) return .{ .r = stops[last].r, .g = stops[last].g, .b = stops[last].b, .a = stops[last].a };

    // Find the two stops that bracket t
    var i: u32 = 0;
    while (i < last) : (i += 1) {
        if (t >= stops[i].pos and t <= stops[i + 1].pos) {
            const range = stops[i + 1].pos - stops[i].pos;
            if (range < 0.0001) return .{ .r = stops[i].r, .g = stops[i].g, .b = stops[i].b, .a = stops[i].a };
            const local_t = (t - stops[i].pos) / range;
            return .{
                .r = lerp_u8(stops[i].r, stops[i + 1].r, local_t),
                .g = lerp_u8(stops[i].g, stops[i + 1].g, local_t),
                .b = lerp_u8(stops[i].b, stops[i + 1].b, local_t),
                .a = lerp_u8(stops[i].a, stops[i + 1].a, local_t),
            };
        }
    }
    return .{ .r = stops[last].r, .g = stops[last].g, .b = stops[last].b, .a = stops[last].a };
}

/// Fill a rectangle with a multi-stop linear gradient.
/// stops_ptr: packed buffer of [u32_color, f32_position] × stop_count
pub fn linear_multi(
    b_: *PixelBuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    stops_ptr: [*]const u8,
    stop_count: u32,
    angle_deg: u32,
) void {
    if (w == 0 or h == 0 or stop_count < 2) return;

    var stops_buf: [32]GradientStop = undefined;
    const count = parse_stops(stops_ptr, stop_count, &stops_buf);
    if (count < 2) return;
    const stops = stops_buf[0..count];

    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);

    const fa: f32 = @as(f32, @floatFromInt(angle_deg)) * std.math.pi / 180.0;
    const cos_a = @cos(fa);
    const sin_a = @sin(fa);

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
            const dx = fpx - fx;
            const dy = fpy - fy;
            const proj = dx * cos_a + dy * sin_a;
            const t = clamp_f(proj / proj_len, 0, 1);

            const c = sample_stops(stops, count, t);
            if (c.a == 0) continue;
            blend(b_, px, py, c.r, c.g, c.b, c.a);
        }
    }
}

/// Fill a rectangle with a multi-stop radial gradient.
/// stops_ptr: packed buffer of [u32_color, f32_position] × stop_count
pub fn radial_multi(
    b_: *PixelBuffer,
    cx: u32,
    cy: u32,
    radius: u32,
    stops_ptr: [*]const u8,
    stop_count: u32,
) void {
    if (radius == 0 or stop_count < 2) return;

    var stops_buf: [32]GradientStop = undefined;
    const count = parse_stops(stops_ptr, stop_count, &stops_buf);
    if (count < 2) return;
    const stops = stops_buf[0..count];

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
            const ddx = fpx - fcx;
            const ddy = fpy - fcy;
            const dist = sqrt(ddx * ddx + ddy * ddy);
            if (dist >= frad) continue;
            const t = dist / frad;

            const c = sample_stops(stops, count, t);
            if (c.a == 0) continue;
            blend(b_, px, py, c.r, c.g, c.b, c.a);
        }
    }
}

/// Fill a rectangle with a conic (angular/sweep) gradient.
/// Angle sweeps from start_angle clockwise. t=0 at start_angle, t=1 at start_angle+360.
pub fn conic(
    b_: *PixelBuffer,
    cx: u32,
    cy: u32,
    w: u32,
    h: u32,
    stops_ptr: [*]const u8,
    stop_count: u32,
    start_angle_deg: u32,
) void {
    if (w == 0 or h == 0 or stop_count < 2) return;

    var stops_buf: [32]GradientStop = undefined;
    const count = parse_stops(stops_ptr, stop_count, &stops_buf);
    if (count < 2) return;
    const stops = stops_buf[0..count];

    const fcx: f32 = @floatFromInt(cx);
    const fcy: f32 = @floatFromInt(cy);
    const start_rad: f32 = @as(f32, @floatFromInt(start_angle_deg)) * std.math.pi / 180.0;

    // Render region: cx-w/2 to cx+w/2, cy-h/2 to cy+h/2
    const hw: i32 = @intCast(w / 2);
    const hh: i32 = @intCast(h / 2);
    const icx: i32 = @intCast(cx);
    const icy: i32 = @intCast(cy);

    const px0_i = icx - hw;
    const py0_i = icy - hh;
    const px1_i = icx + hw;
    const py1_i = icy + hh;

    const px0: u32 = if (px0_i < 0) 0 else min_u(@intCast(px0_i), b_.width);
    const py0: u32 = if (py0_i < 0) 0 else min_u(@intCast(py0_i), b_.height);
    const px1 = min_u(if (px1_i < 0) 0 else @intCast(px1_i), b_.width);
    const py1 = min_u(if (py1_i < 0) 0 else @intCast(py1_i), b_.height);

    const two_pi = 2.0 * std.math.pi;

    var py = py0;
    while (py < py1) : (py += 1) {
        var px = px0;
        while (px < px1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);
            // atan2 gives angle from center, offset by start angle
            var angle = std.math.atan2(fpy - fcy, fpx - fcx) - start_rad;
            // Normalize to [0, 2π)
            while (angle < 0) angle += two_pi;
            while (angle >= two_pi) angle -= two_pi;
            const t = angle / two_pi;

            const c = sample_stops(stops, count, t);
            if (c.a == 0) continue;
            blend(b_, px, py, c.r, c.g, c.b, c.a);
        }
    }
}

// ── Gradient border ──

/// Stroke a rounded rectangle with a multi-stop linear gradient.
/// Combines SDF stroke coverage with gradient color sampling.
/// params_ptr: [x:i32][y:i32][w:u32][h:u32][radius:u32][stroke_width:u32][angle_deg:u32] = 28 bytes
pub fn gradient_stroke(
    b_: *PixelBuffer,
    stops_ptr: [*]const u8,
    stop_count: u32,
    params_ptr: [*]const u8,
) void {
    if (stop_count < 2) return;

    // Read params from packed buffer (little-endian)
    const x: i32 = @bitCast([4]u8{ params_ptr[0], params_ptr[1], params_ptr[2], params_ptr[3] });
    const y: i32 = @bitCast([4]u8{ params_ptr[4], params_ptr[5], params_ptr[6], params_ptr[7] });
    const w: u32 = @bitCast([4]u8{ params_ptr[8], params_ptr[9], params_ptr[10], params_ptr[11] });
    const h: u32 = @bitCast([4]u8{ params_ptr[12], params_ptr[13], params_ptr[14], params_ptr[15] });
    const radius: u32 = @bitCast([4]u8{ params_ptr[16], params_ptr[17], params_ptr[18], params_ptr[19] });
    const sw: u32 = @bitCast([4]u8{ params_ptr[20], params_ptr[21], params_ptr[22], params_ptr[23] });
    const angle_deg: u32 = @bitCast([4]u8{ params_ptr[24], params_ptr[25], params_ptr[26], params_ptr[27] });

    if (w == 0 or h == 0 or sw == 0) return;

    var stops_buf: [32]GradientStop = undefined;
    const count = parse_stops(stops_ptr, stop_count, &stops_buf);
    if (count < 2) return;
    const stops = stops_buf[0..count];

    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);
    const fsw: f32 = @floatFromInt(sw);
    const max_rad = @min(fw / 2.0, fh / 2.0);
    const rad = @min(@as(f32, @floatFromInt(radius)), max_rad);

    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const hw = fw / 2.0;
    const hh = fh / 2.0;
    const mx = fx + hw;
    const my = fy + hh;

    // Gradient direction
    const fa: f32 = @as(f32, @floatFromInt(angle_deg)) * std.math.pi / 180.0;
    const cos_a = @cos(fa);
    const sin_a = @sin(fa);
    const proj_len = @abs(fw * cos_a) + @abs(fh * sin_a);

    const x0 = rect_mod.clamp_u_pub(x, 0, b_.width);
    const y0 = rect_mod.clamp_u_pub(y, 0, b_.height);
    const x1 = rect_mod.clamp_u_pub(x + @as(i32, @intCast(w)), 0, b_.width);
    const y1 = rect_mod.clamp_u_pub(y + @as(i32, @intCast(h)), 0, b_.height);

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const fpx: f32 = @floatFromInt(px);
            const fpy: f32 = @floatFromInt(py);

            // SDF stroke coverage
            const d = rect_mod.sdf_pub(fpx, fpy, mx, my, hw, hh, rad);
            const band = @abs(d) - fsw / 2.0;
            if (band > 0.5) continue;
            const cov: f32 = if (band < -0.5) 1.0 else 0.5 - band;

            // Gradient t from position
            const dx = fpx - fx;
            const dy = fpy - fy;
            const proj = if (proj_len > 0.001) clamp_f(((dx * cos_a + dy * sin_a) / proj_len), 0, 1) else 0.5;

            const c = sample_stops(stops, count, proj);
            if (c.a == 0) continue;
            const final_a: u32 = @intFromFloat(@round(@as(f32, @floatFromInt(c.a)) * cov));
            if (final_a == 0) continue;
            blend(b_, px, py, c.r, c.g, c.b, @intCast(@min(final_a, 255)));
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

test "multi-stop linear gradient 3 stops" {
    var pixels = [_]u8{0} ** (30 * 1 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 30, .height = 1, .stride = 120 };
    // 3 stops: red@0.0, green@0.5, blue@1.0
    // Pack: [R,G,B,A bytes of color] [4 bytes f32 position LE]
    const pos_0 = @as([4]u8, @bitCast(@as(f32, 0.0)));
    const pos_half = @as([4]u8, @bitCast(@as(f32, 0.5)));
    const pos_1 = @as([4]u8, @bitCast(@as(f32, 1.0)));
    const stops = [_]u8{
        // Stop 0: red (0xff0000ff) at 0.0
        0xff, 0x00, 0x00, 0xff, pos_0[0],    pos_0[1],    pos_0[2],    pos_0[3],
        // Stop 1: green (0x00ff00ff) at 0.5
        0x00, 0xff, 0x00, 0xff, pos_half[0], pos_half[1], pos_half[2], pos_half[3],
        // Stop 2: blue (0x0000ffff) at 1.0
        0x00, 0x00, 0xff, 0xff, pos_1[0],    pos_1[1],    pos_1[2],    pos_1[3],
    };
    linear_multi(&pb, 0, 0, 30, 1, &stops, 3, 0);
    // Leftmost pixel should be red
    try std.testing.expect(pixels[0] > 200); // R high
    try std.testing.expect(pixels[1] < 50); // G low
    // Middle pixel (~15) should be greenish
    const mid = 15 * 4;
    try std.testing.expect(pixels[mid + 1] > 100); // G significant
    // Rightmost pixel should be blue
    const right = 29 * 4;
    try std.testing.expect(pixels[right + 2] > 200); // B high
    try std.testing.expect(pixels[right + 0] < 50); // R low
}

test "multi-stop radial gradient" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    const pos_0 = @as([4]u8, @bitCast(@as(f32, 0.0)));
    const pos_1 = @as([4]u8, @bitCast(@as(f32, 1.0)));
    const stops = [_]u8{
        0xff, 0x00, 0x00, 0xff, pos_0[0], pos_0[1], pos_0[2], pos_0[3],
        0x00, 0x00, 0xff, 0xff, pos_1[0], pos_1[1], pos_1[2], pos_1[3],
    };
    radial_multi(&pb, 10, 10, 8, &stops, 2);
    // Center should be red-ish
    const center = 10 * 80 + 10 * 4;
    try std.testing.expect(pixels[center + 0] > 200);
    try std.testing.expect(pixels[center + 3] > 200);
}

test "conic gradient paints pixels" {
    var pixels = [_]u8{0} ** (20 * 20 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 20, .height = 20, .stride = 80 };
    const pos_0 = @as([4]u8, @bitCast(@as(f32, 0.0)));
    const pos_1 = @as([4]u8, @bitCast(@as(f32, 1.0)));
    const stops = [_]u8{
        0xff, 0x00, 0x00, 0xff, pos_0[0], pos_0[1], pos_0[2], pos_0[3],
        0x00, 0x00, 0xff, 0xff, pos_1[0], pos_1[1], pos_1[2], pos_1[3],
    };
    conic(&pb, 10, 10, 20, 20, &stops, 2, 0);
    // Some pixels should be painted
    var painted: u32 = 0;
    for (0..20 * 20) |i| {
        if (pixels[i * 4 + 3] > 0) painted += 1;
    }
    try std.testing.expect(painted > 100);
}

test "gradient stroke paints border pixels" {
    var pixels = [_]u8{0} ** (30 * 30 * 4);
    var pb = PixelBuffer{ .data = &pixels, .width = 30, .height = 30, .stride = 120 };
    const pos_0 = @as([4]u8, @bitCast(@as(f32, 0.0)));
    const pos_1 = @as([4]u8, @bitCast(@as(f32, 1.0)));
    const stops = [_]u8{
        0xff, 0x00, 0x00, 0xff, pos_0[0], pos_0[1], pos_0[2], pos_0[3],
        0x00, 0x00, 0xff, 0xff, pos_1[0], pos_1[1], pos_1[2], pos_1[3],
    };
    // Pack params: x=2, y=2, w=26, h=26, radius=4, stroke_width=2, angle=0
    const params = @as([28]u8, @bitCast([7]u32{ 2, 2, 26, 26, 4, 2, 0 }));
    gradient_stroke(&pb, &stops, 2, &params);

    // Edge pixel should have paint (on the border)
    var border_painted: u32 = 0;
    var center_painted: u32 = 0;
    for (0..30 * 30) |i| {
        if (pixels[i * 4 + 3] > 0) {
            const py = i / 30;
            const px = i % 30;
            if (px > 6 and px < 24 and py > 6 and py < 24) {
                center_painted += 1;
            } else {
                border_painted += 1;
            }
        }
    }
    // Border should have paint, center should be empty (it's a stroke, not fill)
    try std.testing.expect(border_painted > 20);
    try std.testing.expectEqual(@as(u32, 0), center_painted);
}
