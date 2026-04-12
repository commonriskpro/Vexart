///! CSS blend modes — per-pixel compositing operations.
///!
///! Blends a source color (RGBA) onto an existing pixel in the buffer
///! using the specified blend mode formula.
///!
///! All 16 CSS blend modes from the Compositing and Blending Level 1 spec:
///! https://www.w3.org/TR/compositing-1/#blending
///!
///! Usage: blend a source RGBA region onto the buffer using a specific mode.
///! The source is packed as u32 RGBA, applied to a rectangular region.
const std = @import("std");
const buf = @import("lib.zig");
const PixelBuffer = buf.PixelBuffer;

fn min_u(a: u32, b: u32) u32 {
    return @min(a, b);
}

fn clamp_u8(v: f32) u8 {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return @intFromFloat(@round(v));
}

/// Blend mode identifier (matches CSS spec order).
pub const BlendMode = enum(u8) {
    normal = 0,
    multiply = 1,
    screen = 2,
    overlay = 3,
    darken = 4,
    lighten = 5,
    color_dodge = 6,
    color_burn = 7,
    hard_light = 8,
    soft_light = 9,
    difference = 10,
    exclusion = 11,
    hue = 12,
    saturation = 13,
    color = 14,
    luminosity = 15,
};

// ── Per-channel blend formulas ──
// All operate on normalized [0,1] values.

fn blend_multiply(b: f32, s: f32) f32 {
    return b * s;
}

fn blend_screen(b: f32, s: f32) f32 {
    return b + s - b * s;
}

fn blend_overlay(b: f32, s: f32) f32 {
    if (b <= 0.5) return 2.0 * b * s;
    return 1.0 - 2.0 * (1.0 - b) * (1.0 - s);
}

fn blend_darken(b: f32, s: f32) f32 {
    return @min(b, s);
}

fn blend_lighten(b: f32, s: f32) f32 {
    return @max(b, s);
}

fn blend_color_dodge(b: f32, s: f32) f32 {
    if (b == 0) return 0;
    if (s >= 1.0) return 1.0;
    return @min(1.0, b / (1.0 - s));
}

fn blend_color_burn(b: f32, s: f32) f32 {
    if (b >= 1.0) return 1.0;
    if (s == 0) return 0;
    return 1.0 - @min(1.0, (1.0 - b) / s);
}

fn blend_hard_light(b: f32, s: f32) f32 {
    // Same as overlay but with s and b swapped
    if (s <= 0.5) return 2.0 * b * s;
    return 1.0 - 2.0 * (1.0 - b) * (1.0 - s);
}

fn blend_soft_light(b: f32, s: f32) f32 {
    // W3C formula
    if (s <= 0.5) {
        return b - (1.0 - 2.0 * s) * b * (1.0 - b);
    }
    const d = if (b <= 0.25)
        ((16.0 * b - 12.0) * b + 4.0) * b
    else
        @sqrt(b);
    return b + (2.0 * s - 1.0) * (d - b);
}

fn blend_difference(b: f32, s: f32) f32 {
    return @abs(b - s);
}

fn blend_exclusion(b: f32, s: f32) f32 {
    return b + s - 2.0 * b * s;
}

// ── HSL-based blend modes (hue, saturation, color, luminosity) ──

fn lum(r: f32, g: f32, b: f32) f32 {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

fn sat(r: f32, g: f32, b: f32) f32 {
    return @max(r, @max(g, b)) - @min(r, @min(g, b));
}

fn clip_color(r: *f32, g: *f32, b: *f32) void {
    const l = lum(r.*, g.*, b.*);
    const n = @min(r.*, @min(g.*, b.*));
    const mx = @max(r.*, @max(g.*, b.*));
    if (n < 0) {
        const d = l - n;
        if (d > 0.0001) {
            r.* = l + (r.* - l) * l / d;
            g.* = l + (g.* - l) * l / d;
            b.* = l + (b.* - l) * l / d;
        }
    }
    if (mx > 1.0) {
        const d = mx - l;
        if (d > 0.0001) {
            r.* = l + (r.* - l) * (1.0 - l) / d;
            g.* = l + (g.* - l) * (1.0 - l) / d;
            b.* = l + (b.* - l) * (1.0 - l) / d;
        }
    }
}

fn set_lum(r: *f32, g: *f32, b: *f32, l: f32) void {
    const dl = l - lum(r.*, g.*, b.*);
    r.* += dl;
    g.* += dl;
    b.* += dl;
    clip_color(r, g, b);
}

fn set_sat_impl(r: *f32, g: *f32, b: *f32, s_val: f32) void {
    // Sort channels, apply saturation to the range
    var min_v = r;
    var mid_v = g;
    var max_v = b;
    if (min_v.* > mid_v.*) {
        const tmp = min_v;
        min_v = mid_v;
        mid_v = tmp;
    }
    if (min_v.* > max_v.*) {
        const tmp = min_v;
        min_v = max_v;
        max_v = tmp;
    }
    if (mid_v.* > max_v.*) {
        const tmp = mid_v;
        mid_v = max_v;
        max_v = tmp;
    }

    if (max_v.* > min_v.*) {
        mid_v.* = (mid_v.* - min_v.*) * s_val / (max_v.* - min_v.*);
        max_v.* = s_val;
    } else {
        mid_v.* = 0;
        max_v.* = 0;
    }
    min_v.* = 0;
}

/// Apply a blend mode to a rectangular region, blending a solid color onto existing pixels.
pub fn blend_rect(
    b_: *PixelBuffer,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    sr: u8,
    sg: u8,
    sb: u8,
    sa: u8,
    mode: BlendMode,
) void {
    if (sa == 0) return;
    const x0 = min_u(x, b_.width);
    const y0 = min_u(y, b_.height);
    const x1 = min_u(x + w, b_.width);
    const y1 = min_u(y + h, b_.height);
    const d = b_.data;
    const stride = b_.stride;

    const fs_r: f32 = @as(f32, @floatFromInt(sr)) / 255.0;
    const fs_g: f32 = @as(f32, @floatFromInt(sg)) / 255.0;
    const fs_b: f32 = @as(f32, @floatFromInt(sb)) / 255.0;
    const fs_a: f32 = @as(f32, @floatFromInt(sa)) / 255.0;

    var py = y0;
    while (py < y1) : (py += 1) {
        var px = x0;
        while (px < x1) : (px += 1) {
            const i = py * stride + px * 4;
            const bd_r: f32 = @as(f32, @floatFromInt(d[i])) / 255.0;
            const bd_g: f32 = @as(f32, @floatFromInt(d[i + 1])) / 255.0;
            const bd_b: f32 = @as(f32, @floatFromInt(d[i + 2])) / 255.0;

            var cr: f32 = undefined;
            var cg: f32 = undefined;
            var cb: f32 = undefined;

            switch (mode) {
                .normal => {
                    cr = fs_r;
                    cg = fs_g;
                    cb = fs_b;
                },
                .multiply => {
                    cr = blend_multiply(bd_r, fs_r);
                    cg = blend_multiply(bd_g, fs_g);
                    cb = blend_multiply(bd_b, fs_b);
                },
                .screen => {
                    cr = blend_screen(bd_r, fs_r);
                    cg = blend_screen(bd_g, fs_g);
                    cb = blend_screen(bd_b, fs_b);
                },
                .overlay => {
                    cr = blend_overlay(bd_r, fs_r);
                    cg = blend_overlay(bd_g, fs_g);
                    cb = blend_overlay(bd_b, fs_b);
                },
                .darken => {
                    cr = blend_darken(bd_r, fs_r);
                    cg = blend_darken(bd_g, fs_g);
                    cb = blend_darken(bd_b, fs_b);
                },
                .lighten => {
                    cr = blend_lighten(bd_r, fs_r);
                    cg = blend_lighten(bd_g, fs_g);
                    cb = blend_lighten(bd_b, fs_b);
                },
                .color_dodge => {
                    cr = blend_color_dodge(bd_r, fs_r);
                    cg = blend_color_dodge(bd_g, fs_g);
                    cb = blend_color_dodge(bd_b, fs_b);
                },
                .color_burn => {
                    cr = blend_color_burn(bd_r, fs_r);
                    cg = blend_color_burn(bd_g, fs_g);
                    cb = blend_color_burn(bd_b, fs_b);
                },
                .hard_light => {
                    cr = blend_hard_light(bd_r, fs_r);
                    cg = blend_hard_light(bd_g, fs_g);
                    cb = blend_hard_light(bd_b, fs_b);
                },
                .soft_light => {
                    cr = blend_soft_light(bd_r, fs_r);
                    cg = blend_soft_light(bd_g, fs_g);
                    cb = blend_soft_light(bd_b, fs_b);
                },
                .difference => {
                    cr = blend_difference(bd_r, fs_r);
                    cg = blend_difference(bd_g, fs_g);
                    cb = blend_difference(bd_b, fs_b);
                },
                .exclusion => {
                    cr = blend_exclusion(bd_r, fs_r);
                    cg = blend_exclusion(bd_g, fs_g);
                    cb = blend_exclusion(bd_b, fs_b);
                },
                .hue => {
                    cr = fs_r;
                    cg = fs_g;
                    cb = fs_b;
                    set_sat_impl(&cr, &cg, &cb, sat(bd_r, bd_g, bd_b));
                    set_lum(&cr, &cg, &cb, lum(bd_r, bd_g, bd_b));
                },
                .saturation => {
                    cr = bd_r;
                    cg = bd_g;
                    cb = bd_b;
                    set_sat_impl(&cr, &cg, &cb, sat(fs_r, fs_g, fs_b));
                    set_lum(&cr, &cg, &cb, lum(bd_r, bd_g, bd_b));
                },
                .color => {
                    cr = fs_r;
                    cg = fs_g;
                    cb = fs_b;
                    set_lum(&cr, &cg, &cb, lum(bd_r, bd_g, bd_b));
                },
                .luminosity => {
                    cr = bd_r;
                    cg = bd_g;
                    cb = bd_b;
                    set_lum(&cr, &cg, &cb, lum(fs_r, fs_g, fs_b));
                },
            }

            // Composite with source alpha: out = blend_result * sa + bg * (1-sa)
            d[i] = clamp_u8(cr * 255.0 * fs_a + bd_r * 255.0 * (1.0 - fs_a));
            d[i + 1] = clamp_u8(cg * 255.0 * fs_a + bd_g * 255.0 * (1.0 - fs_a));
            d[i + 2] = clamp_u8(cb * 255.0 * fs_a + bd_b * 255.0 * (1.0 - fs_a));
            // Alpha: sa + da * (1-sa)
            const da: f32 = @as(f32, @floatFromInt(d[i + 3])) / 255.0;
            d[i + 3] = clamp_u8((fs_a + da * (1.0 - fs_a)) * 255.0);
        }
    }
}

// ── Tests ──

test "multiply darkens" {
    var pixels = [_]u8{ 200, 200, 200, 255 };
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    blend_rect(&pb, 0, 0, 1, 1, 128, 128, 128, 255, .multiply);
    // multiply: 200/255 * 128/255 ≈ 100/255 → should be ~100
    try std.testing.expect(pixels[0] < 150);
    try std.testing.expect(pixels[0] > 50);
}

test "screen lightens" {
    var pixels = [_]u8{ 100, 100, 100, 255 };
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    blend_rect(&pb, 0, 0, 1, 1, 100, 100, 100, 255, .screen);
    // screen always lightens
    try std.testing.expect(pixels[0] > 100);
}

test "difference of same color is black" {
    var pixels = [_]u8{ 128, 128, 128, 255 };
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    blend_rect(&pb, 0, 0, 1, 1, 128, 128, 128, 255, .difference);
    try std.testing.expect(pixels[0] < 5);
}

test "overlay on dark bg multiplies" {
    var pixels = [_]u8{ 50, 50, 50, 255 };
    var pb = PixelBuffer{ .data = &pixels, .width = 1, .height = 1, .stride = 4 };
    blend_rect(&pb, 0, 0, 1, 1, 200, 200, 200, 255, .overlay);
    // Dark bg + overlay → multiply path → should still be relatively dark
    try std.testing.expect(pixels[0] < 100);
}
