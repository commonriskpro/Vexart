///! Procedural nebula painter using domain-warped value noise.
///!
///! Designed for reusable atmospheric backgrounds. For best performance in apps,
///! bake once into an offscreen PixelBuffer and reuse via drawImage.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;

const GradientStop = struct {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
    pos: f32,
};

fn clamp_f(v: f32, lo: f32, hi: f32) f32 {
    return @max(lo, @min(hi, v));
}

fn lerp_f(a: f32, b: f32, t: f32) f32 {
    return a + (b - a) * t;
}

fn lerp_u8(a: u8, b: u8, t: f32) u8 {
    const fa: f32 = @floatFromInt(a);
    const fb: f32 = @floatFromInt(b);
    const out = fa + (fb - fa) * t;
    const clamped: u32 = @intFromFloat(@round(@max(0, @min(255, out))));
    return @intCast(clamped);
}

fn smoothstep(a: f32, b: f32, x: f32) f32 {
    if (a == b) return if (x < a) 0 else 1;
    const t = clamp_f((x - a) / (b - a), 0, 1);
    return t * t * (3.0 - 2.0 * t);
}

fn fade(t: f32) f32 {
    return t * t * (3.0 - 2.0 * t);
}

fn hash2(ix: i32, iy: i32, seed: u32) u32 {
    var h: u32 = seed ^ @as(u32, @bitCast(ix *% 374761393));
    h ^= @as(u32, @bitCast(iy *% 668265263));
    h ^= h >> 13;
    h *%= 1274126177;
    h ^= h >> 16;
    return h;
}

fn rand01(ix: i32, iy: i32, seed: u32) f32 {
    const h = hash2(ix, iy, seed);
    return @as(f32, @floatFromInt(h & 0xffff)) / 65535.0;
}

fn value_noise(x: f32, y: f32, seed: u32) f32 {
    const x0: i32 = @intFromFloat(@floor(x));
    const y0: i32 = @intFromFloat(@floor(y));
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const fx = x - @as(f32, @floatFromInt(x0));
    const fy = y - @as(f32, @floatFromInt(y0));
    const u = fade(fx);
    const v = fade(fy);

    const n00 = rand01(x0, y0, seed);
    const n10 = rand01(x1, y0, seed);
    const n01 = rand01(x0, y1, seed);
    const n11 = rand01(x1, y1, seed);
    const nx0 = lerp_f(n00, n10, u);
    const nx1 = lerp_f(n01, n11, u);
    return lerp_f(nx0, nx1, v);
}

fn fbm(x: f32, y: f32, seed: u32, octaves: u32, lacunarity: f32, gain: f32) f32 {
    var amp: f32 = 0.5;
    var freq: f32 = 1.0;
    var sum: f32 = 0.0;
    var norm: f32 = 0.0;
    var i: u32 = 0;
    while (i < octaves) : (i += 1) {
        sum += value_noise(x * freq, y * freq, seed + i * 977) * amp;
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    if (norm < 0.0001) return 0;
    return sum / norm;
}

fn parse_stops(stops_ptr: [*]const u8, stop_count: u32, out: []GradientStop) u32 {
    const count = @min(stop_count, @as(u32, @intCast(out.len)));
    for (0..count) |i| {
        const base = i * 8;
        const color: u32 = @as(u32, stops_ptr[base]) << 24 |
            @as(u32, stops_ptr[base + 1]) << 16 |
            @as(u32, stops_ptr[base + 2]) << 8 |
            @as(u32, stops_ptr[base + 3]);
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

fn sample_stops(stops: []const GradientStop, count: u32, t: f32) struct { r: u8, g: u8, b: u8, a: u8 } {
    if (count == 0) return .{ .r = 0, .g = 0, .b = 0, .a = 0 };
    if (count == 1 or t <= stops[0].pos) return .{ .r = stops[0].r, .g = stops[0].g, .b = stops[0].b, .a = stops[0].a };
    const last = count - 1;
    if (t >= stops[last].pos) return .{ .r = stops[last].r, .g = stops[last].g, .b = stops[last].b, .a = stops[last].a };

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

pub fn paint(
    b_: *PixelBuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    stops_ptr: [*]const u8,
    stop_count: u32,
    seed: u32,
    scale_px: u32,
    octaves_in: u32,
    gain_pct: u32,
    lacunarity_pct: u32,
    warp_pct: u32,
    detail_pct: u32,
    dust_pct: u32,
) void {
    if (w == 0 or h == 0 or stop_count < 2) return;

    var stops_buf: [16]GradientStop = undefined;
    const count = parse_stops(stops_ptr, stop_count, &stops_buf);
    if (count < 2) return;
    const stops = stops_buf[0..count];

    const x0 = @min(x, b_.width);
    const y0 = @min(y, b_.height);
    const x1 = @min(x + w, b_.width);
    const y1 = @min(y + h, b_.height);
    if (x1 <= x0 or y1 <= y0) return;

    const scale = @max(@as(f32, 24), @as(f32, @floatFromInt(scale_px)));
    const octaves = @max(@as(u32, 1), @min(octaves_in, 6));
    const gain = clamp_f(@as(f32, @floatFromInt(gain_pct)) / 100.0, 0.2, 0.85);
    const lac = clamp_f(@as(f32, @floatFromInt(lacunarity_pct)) / 100.0, 1.4, 3.2);
    const warp = clamp_f(@as(f32, @floatFromInt(warp_pct)) / 100.0, 0.0, 1.5) * 3.0;
    const detail = clamp_f(@as(f32, @floatFromInt(detail_pct)) / 100.0, 0.0, 1.4);
    const dust = clamp_f(@as(f32, @floatFromInt(dust_pct)) / 100.0, 0.0, 1.1);
    const fw = @as(f32, @floatFromInt(w));
    const fh = @as(f32, @floatFromInt(h));

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const lx = @as(f32, @floatFromInt(px - x));
            const ly = @as(f32, @floatFromInt(py - y));
            const nx = lx / scale;
            const ny = ly / scale;

            const wa = fbm(nx * 0.85 + 13.1, ny * 0.85 - 2.7, seed + 17, 3, 2.0, 0.5);
            const wb = fbm(nx * 0.85 - 5.3, ny * 0.85 + 9.2, seed + 53, 3, 2.0, 0.5);
            const wx = nx + (wa - 0.5) * warp;
            const wy = ny + (wb - 0.5) * warp;

            const coarse = fbm(wx, wy, seed, octaves, lac, gain);
            const medium = fbm(wx * 1.85, wy * 1.85, seed + 101, @min(octaves + 1, 6), lac, gain * 0.84);
            const fine = fbm(wx * 4.5, wy * 4.5, seed + 211, 3, 2.2, 0.48);
            const dust_noise = fbm(wx * 3.2 - 9.0, wy * 3.2 + 4.0, seed + 307, 4, 2.1, 0.52);
            const ridge = 1.0 - @abs(medium * 2.0 - 1.0);
            const filaments = smoothstep(0.42, 0.9, ridge * 0.64 + fine * 0.36);
            const knots = smoothstep(0.74, 0.95, medium * 0.68 + fine * 0.32);
            const dust_mask = smoothstep(0.44, 0.78, dust_noise);

            var cloud = coarse * 0.42 + medium * 0.15 + fine * (0.05 + 0.08 * detail) + filaments * (0.2 + 0.18 * detail) + knots * (0.08 + 0.2 * detail);
            cloud -= dust_mask * dust * (0.52 + 0.24 * (1.0 - ridge));
            cloud = smoothstep(0.2, 0.84, cloud);

            const u = if (fw <= 1) 0.5 else lx / (fw - 1.0);
            const v = if (fh <= 1) 0.5 else ly / (fh - 1.0);
            const edge_dist = @min(@min(u, 1.0 - u), @min(v, 1.0 - v));
            const edge = smoothstep(0.0, 0.11, edge_dist);
            const alpha_f = cloud * edge;
            if (alpha_f <= 0.01) continue;

            const tint_t = clamp_f(coarse * 0.45 + filaments * 0.32 + knots * 0.23, 0, 1);
            const col = sample_stops(stops, count, tint_t);
            const a = @as(u8, @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(alpha_f * @as(f32, @floatFromInt(col.a))))))));
            if (a == 0) continue;
            blend(b_, px, py, col.r, col.g, col.b, a);
        }
    }
}

test "nebula paints visible pixels" {
    var data: [64 * 64 * 4]u8 = [_]u8{0} ** (64 * 64 * 4);
    var px = PixelBuffer{ .data = &data, .width = 64, .height = 64, .stride = 64 * 4 };
    const stops = [_]u8{
        0x10, 0x20, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x30, 0x90, 0xc0, 0x70, 0x00, 0x00, 0x00, 0x3f,
        0xf3, 0xbf, 0x6b, 0xaa, 0x00, 0x00, 0x80, 0x3f,
    };
    paint(&px, 0, 0, 64, 64, &stops, 3, 1337, 42, 4, 55, 210, 50, 72, 48);

    var lit: usize = 0;
    for (data, 0..) |_, i| {
        if ((i % 4) == 3 and data[i] > 0) lit += 1;
    }
    try std.testing.expect(lit > 0);
}
