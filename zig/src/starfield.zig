const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;
const blend = buf.blend;
const std = @import("std");

fn clamp_f(v: f32, lo: f32, hi: f32) f32 {
    return @max(lo, @min(hi, v));
}

fn lerp_f(a: f32, b: f32, t: f32) f32 {
    return a + (b - a) * t;
}

fn next(state: *u32) u32 {
    state.* = state.* *% 1664525 +% 1013904223;
    return state.*;
}

fn rand01(state: *u32) f32 {
    return @as(f32, @floatFromInt(next(state) & 0x00ffffff)) / 16777215.0;
}

fn tri_rand(state: *u32) f32 {
    return (rand01(state) + rand01(state) + rand01(state)) / 3.0;
}

fn with_alpha(color: u32, alpha: u8) u32 {
    return (color & 0xffffff00) | @as(u32, alpha);
}

fn mix_color(a: u32, b: u32, t: f32) u32 {
    const ar: f32 = @floatFromInt((a >> 24) & 0xff);
    const ag: f32 = @floatFromInt((a >> 16) & 0xff);
    const ab: f32 = @floatFromInt((a >> 8) & 0xff);
    const aa: f32 = @floatFromInt(a & 0xff);
    const br: f32 = @floatFromInt((b >> 24) & 0xff);
    const bg: f32 = @floatFromInt((b >> 16) & 0xff);
    const bb: f32 = @floatFromInt((b >> 8) & 0xff);
    const ba: f32 = @floatFromInt(b & 0xff);
    const r: u32 = @intFromFloat(@round(lerp_f(ar, br, t)));
    const g: u32 = @intFromFloat(@round(lerp_f(ag, bg, t)));
    const bl: u32 = @intFromFloat(@round(lerp_f(ab, bb, t)));
    const al: u32 = @intFromFloat(@round(lerp_f(aa, ba, t)));
    return (r << 24) | (g << 16) | (bl << 8) | al;
}

fn draw_disc(b: *PixelBuffer, cx: f32, cy: f32, radius: f32, color: u32, alpha_mul: f32) void {
    if (radius <= 0.01) return;
    const rr = radius * radius;
    const min_x: i32 = @intFromFloat(@floor(cx - radius - 1));
    const max_x: i32 = @intFromFloat(@ceil(cx + radius + 1));
    const min_y: i32 = @intFromFloat(@floor(cy - radius - 1));
    const max_y: i32 = @intFromFloat(@ceil(cy + radius + 1));
    const r: u8 = @intCast((color >> 24) & 0xff);
    const g: u8 = @intCast((color >> 16) & 0xff);
    const bl: u8 = @intCast((color >> 8) & 0xff);
    const a0: f32 = @floatFromInt(color & 0xff);

    var py = min_y;
    while (py <= max_y) : (py += 1) {
        if (py < 0 or py >= b.height) continue;
        var px = min_x;
        while (px <= max_x) : (px += 1) {
            if (px < 0 or px >= b.width) continue;
            const dx = (@as(f32, @floatFromInt(px)) + 0.5) - cx;
            const dy = (@as(f32, @floatFromInt(py)) + 0.5) - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 > rr) continue;
            const dist = @sqrt(d2) / radius;
            const falloff = 1.0 - clamp_f(dist, 0, 1);
            const alpha_f = falloff * falloff * alpha_mul * a0;
            if (alpha_f <= 0.5) continue;
            const a: u8 = @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(alpha_f)))));
            blend(b, @intCast(px), @intCast(py), r, g, bl, a);
        }
    }
}

fn draw_spike(b: *PixelBuffer, cx: i32, cy: i32, len: i32, color: u32) void {
    const r: u8 = @intCast((color >> 24) & 0xff);
    const g: u8 = @intCast((color >> 16) & 0xff);
    const bl: u8 = @intCast((color >> 8) & 0xff);
    const a0: f32 = @floatFromInt(color & 0xff);
    var i: i32 = -len;
    while (i <= len) : (i += 1) {
        const falloff = 1.0 - clamp_f(@abs(@as(f32, @floatFromInt(i))) / @max(1.0, @as(f32, @floatFromInt(len))), 0, 1);
        const a: u8 = @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(a0 * falloff * 0.55)))));
        if (a == 0) continue;
        if (cx + i >= 0 and cx + i < b.width and cy >= 0 and cy < b.height) blend(b, @intCast(cx + i), @intCast(cy), r, g, bl, a);
        if (cy + i >= 0 and cy + i < b.height and cx >= 0 and cx < b.width) blend(b, @intCast(cx), @intCast(cy + i), r, g, bl, a);
    }
}

fn paint_star(b: *PixelBuffer, x: f32, y: f32, radius: f32, color: u32, bright: bool) void {
    const halo_mul: f32 = if (bright) @as(f32, 3.4) else @as(f32, 1.9);
    const halo_alpha: u8 = @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(@as(f32, @floatFromInt(color & 0xff)) * 0.12)))));
    draw_disc(b, x, y, radius * halo_mul, with_alpha(color, halo_alpha), 1.0);
    draw_disc(b, x, y, radius, color, 1.0);
    if (bright) {
        const bloom_alpha: u8 = @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(@as(f32, @floatFromInt(color & 0xff)) * 0.34)))));
        const spike_alpha: u8 = @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(@as(f32, @floatFromInt(color & 0xff)) * 0.16)))));
        draw_disc(b, x, y, radius * @as(f32, 1.35), with_alpha(color, bloom_alpha), 0.85);
        draw_spike(b, @intFromFloat(@round(x)), @intFromFloat(@round(y)), @intFromFloat(@round(radius * @as(f32, 4.2))), with_alpha(color, spike_alpha));
    }
}

pub fn paint(
    b: *PixelBuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    seed: u32,
    count: u32,
    cluster_count: u32,
    cluster_stars: u32,
    warm: u32,
    neutral: u32,
    cool: u32,
) void {
    if (w == 0 or h == 0) return;
    var state = seed ^ 0xa53c9e5d;
    const fx: f32 = @floatFromInt(x);
    const fy: f32 = @floatFromInt(y);
    const fw: f32 = @floatFromInt(w);
    const fh: f32 = @floatFromInt(h);

    var i: u32 = 0;
    while (i < count) : (i += 1) {
        const t = rand01(&state);
        const base = if (t < 0.18) warm else if (t < 0.62) neutral else cool;
        const bright = rand01(&state) > 0.984;
        const radius = if (bright) lerp_f(0.8, 1.55, rand01(&state)) else lerp_f(0.12, 0.38, rand01(&state));
        const alpha = if (bright) lerp_f(140, 220, rand01(&state)) else lerp_f(8, 60, rand01(&state));
        const tint = mix_color(base, neutral, rand01(&state) * 0.35);
        paint_star(b, fx + rand01(&state) * fw, fy + rand01(&state) * fh, radius, with_alpha(tint, @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(alpha)))))), bright);
    }

    i = 0;
    const micro_count = count * 6;
    while (i < micro_count) : (i += 1) {
        const base = if (rand01(&state) > 0.75) cool else neutral;
        const radius = lerp_f(0.05, 0.16, rand01(&state));
        const alpha = lerp_f(6, 34, rand01(&state));
        draw_disc(b, fx + rand01(&state) * fw, fy + rand01(&state) * fh, radius, with_alpha(base, @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(alpha)))))), 1.0);
    }

    i = 0;
    while (i < cluster_count) : (i += 1) {
        const cx = fx + lerp_f(fw * 0.14, fw * 0.86, rand01(&state));
        const cy = fy + lerp_f(fh * 0.14, fh * 0.86, rand01(&state));
        const spread_x = lerp_f(fw * 0.04, fw * 0.11, rand01(&state));
        const spread_y = lerp_f(fh * 0.04, fh * 0.1, rand01(&state));
        const cluster_base = if (rand01(&state) > 0.5) cool else warm;

        var j: u32 = 0;
        while (j < cluster_stars) : (j += 1) {
            const sx = cx + (tri_rand(&state) - 0.5) * spread_x * 2.6;
            const sy = cy + (tri_rand(&state) - 0.5) * spread_y * 2.6;
            if (sx < fx or sx >= fx + fw or sy < fy or sy >= fy + fh) continue;
            const bright = rand01(&state) > 0.955;
            const radius = if (bright) lerp_f(0.68, 1.3, rand01(&state)) else lerp_f(0.1, 0.34, rand01(&state));
            const alpha = if (bright) lerp_f(120, 205, rand01(&state)) else lerp_f(8, 58, rand01(&state));
            const tint = mix_color(cluster_base, neutral, rand01(&state) * 0.45);
            paint_star(b, sx, sy, radius, with_alpha(tint, @intCast(@min(@as(u32, 255), @as(u32, @intFromFloat(@round(alpha)))))), bright);
        }
    }
}

test "starfield paints visible pixels" {
    var data: [64 * 64 * 4]u8 = [_]u8{0} ** (64 * 64 * 4);
    var px = PixelBuffer{ .data = &data, .width = 64, .height = 64, .stride = 64 * 4 };
    paint(&px, 0, 0, 64, 64, 1337, 32, 2, 10, 0xf3d7a1d0, 0xffffffd0, 0xbfd8ffe0);

    var lit: usize = 0;
    for (data, 0..) |_, i| {
        if ((i % 4) == 3 and data[i] > 0) lit += 1;
    }
    try std.testing.expect(lit > 0);
}
