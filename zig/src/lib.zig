///! TGE Pixel Engine — Zig native library.
///!
///! High-performance pixel painting primitives for the TGE terminal renderer.
///! Called from TypeScript via bun:ffi.
///!
///! Modules:
///!   buffer   — PixelBuffer operations (blend, set, clear)
///!   rect     — Rounded rectangle SDF (fill, stroke)
///!   circle   — Ellipse SDF (filled, stroked)
///!   line     — Segment-distance SDF, bezier flattening
///!   shadow   — Box blur for shadow effects
///!   halo     — Radial glow with plateau+falloff
///!   gradient — Linear and radial gradients
const std = @import("std");

// ── Sub-modules (imported for tests + internal use) ──

const rect = @import("rect.zig");
const circle = @import("circle.zig");
const line_mod = @import("line.zig");
const shadow = @import("shadow.zig");
const halo_mod = @import("halo.zig");
const gradient = @import("gradient.zig");
const text_mod = @import("text.zig");

// Force test discovery for all sub-modules
comptime {
    _ = rect;
    _ = circle;
    _ = line_mod;
    _ = shadow;
    _ = halo_mod;
    _ = gradient;
    _ = text_mod;
}

// ── Pixel Buffer ──

/// RGBA pixel buffer stored as a flat byte array.
/// Layout: [R, G, B, A, R, G, B, A, ...] row-major, top-left origin.
pub const PixelBuffer = struct {
    data: [*]u8,
    width: u32,
    height: u32,
    stride: u32, // bytes per row (width * 4)
};

/// Alpha-blend src over dst at (x, y).
pub fn blend(buf: *PixelBuffer, x: u32, y: u32, r: u8, g: u8, b: u8, a: u8) void {
    if (x >= buf.width or y >= buf.height) return;
    if (a == 0) return;
    const i = y * buf.stride + x * 4;
    const d = buf.data;
    if (a == 0xff) {
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 0xff;
        return;
    }
    // src-over: out = src * srcA + dst * dstA * (1 - srcA) / outA
    const sa: u32 = a;
    const da: u32 = d[i + 3];
    const inv = 255 - sa;
    // Output alpha: oa = sa + da * (1-sa)/255
    const oa = sa * 255 + da * inv;
    if (oa == 0) return;
    const dr: u32 = d[i];
    const dg: u32 = d[i + 1];
    const db: u32 = d[i + 2];
    // Premultiplied blend: outC = (srcC * sa * 255 + dstC * da * inv) / oa
    d[i] = @intCast((@as(u32, r) * sa * 255 + dr * da * inv + oa / 2) / oa);
    d[i + 1] = @intCast((@as(u32, g) * sa * 255 + dg * da * inv + oa / 2) / oa);
    d[i + 2] = @intCast((@as(u32, b) * sa * 255 + db * da * inv + oa / 2) / oa);
    const out_a = (oa + 127) / 255;
    d[i + 3] = if (out_a > 255) 255 else @intCast(out_a);
}

// ── FFI Exports ──
// All exports prefixed with tge_.
// Colors packed as u32 RGBA (0xRRGGBBAA) to keep params ≤ 8.
// bun:ffi has issues with >8 params on ARM64 (stack ABI mismatch).

/// Unpack u32 RGBA into components.
fn unpack(color: u32) struct { r: u8, g: u8, b: u8, a: u8 } {
    return .{
        .r = @intCast((color >> 24) & 0xff),
        .g = @intCast((color >> 16) & 0xff),
        .b = @intCast((color >> 8) & 0xff),
        .a = @intCast(color & 0xff),
    };
}

fn mkbuf(data: [*]u8, width: u32, height: u32) PixelBuffer {
    return .{ .data = data, .width = width, .height = height, .stride = width * 4 };
}

// Rect
export fn tge_fill_rect(data: [*]u8, width: u32, height: u32, x: i32, y: i32, w: u32, h: u32, color: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.fill(&buf, x, y, w, h, c.r, c.g, c.b, c.a);
}

export fn tge_rounded_rect(data: [*]u8, width: u32, height: u32, x: i32, y: i32, w: u32, h: u32, color: u32, radius: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.rounded(&buf, x, y, w, h, c.r, c.g, c.b, c.a, radius);
}

export fn tge_stroke_rect(data: [*]u8, width: u32, height: u32, x: i32, y: i32, w: u32, h: u32, color: u32, radius: u32, sw: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.stroke(&buf, x, y, w, h, c.r, c.g, c.b, c.a, radius, sw);
}

// Circle
export fn tge_filled_circle(data: [*]u8, width: u32, height: u32, cx: i32, cy: i32, rx: u32, ry: u32, color: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    circle.filled(&buf, cx, cy, rx, ry, c.r, c.g, c.b, c.a);
}

export fn tge_stroked_circle(data: [*]u8, width: u32, height: u32, cx: i32, cy: i32, rx: u32, ry: u32, color: u32, sw: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    circle.stroked(&buf, cx, cy, rx, ry, c.r, c.g, c.b, c.a, sw);
}

// Line
export fn tge_line(data: [*]u8, width: u32, height: u32, x0: i32, y0: i32, x1: i32, y1: i32, color: u32, lw: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    line_mod.line(&buf, x0, y0, x1, y1, c.r, c.g, c.b, c.a, lw);
}

export fn tge_bezier(data: [*]u8, width: u32, height: u32, x0: i32, y0: i32, cx: i32, cy: i32, x1: i32, y1: i32, color: u32, lw: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    line_mod.bezier(&buf, x0, y0, cx, cy, x1, y1, c.r, c.g, c.b, c.a, lw);
}

// Shadow
export fn tge_blur(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, radius: u32, passes: u32) void {
    var buf = mkbuf(data, width, height);
    shadow.blur(&buf, x, y, w, h, radius, passes);
}

// Halo
export fn tge_halo(data: [*]u8, width: u32, height: u32, cx: i32, cy: i32, rx: u32, ry: u32, color: u32, intensity_pct: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    halo_mod.halo(&buf, cx, cy, rx, ry, c.r, c.g, c.b, c.a, intensity_pct);
}

// Gradient — two colors packed
export fn tge_linear_gradient(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, color0: u32, color1: u32, angle_deg: u32) void {
    var buf = mkbuf(data, width, height);
    const c0 = unpack(color0);
    const c1 = unpack(color1);
    gradient.linear(&buf, x, y, w, h, c0.r, c0.g, c0.b, c0.a, c1.r, c1.g, c1.b, c1.a, angle_deg);
}

export fn tge_radial_gradient(data: [*]u8, width: u32, height: u32, cx: u32, cy: u32, radius: u32, color0: u32, color1: u32) void {
    var buf = mkbuf(data, width, height);
    const c0 = unpack(color0);
    const c1 = unpack(color1);
    gradient.radial(&buf, cx, cy, radius, c0.r, c0.g, c0.b, c0.a, c1.r, c1.g, c1.b, c1.a);
}

// Text — 8 params (within ARM64 limit)
// Font 0 = built-in SF Mono atlas. Fonts 1+ = runtime-loaded.
export fn tge_draw_text(data: [*]u8, width: u32, height: u32, x: i32, y: i32, text_ptr: [*]const u8, text_len: u32, color: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    _ = text_mod.drawText(&buf, x, y, text_ptr, text_len, c.r, c.g, c.b, c.a);
}

export fn tge_measure_text(text_len: u32) u32 {
    return text_mod.measureText(text_len);
}

// ── Runtime Font Atlas ──
// Supports up to 16 dynamically loaded font atlases.
// Each atlas covers ASCII 32-126 (95 glyphs) as grayscale alpha.

const MAX_FONTS = 16;

const RuntimeFont = struct {
    data: ?[*]const u8, // grayscale alpha data (95 * cell_w * cell_h bytes)
    cell_width: u32,
    cell_height: u32,
    data_len: u32,
    active: bool,
    widths: ?[*]const f32, // per-glyph advance widths (95 floats), null = monospace
};

var runtime_fonts: [MAX_FONTS]RuntimeFont = [_]RuntimeFont{.{
    .data = null,
    .cell_width = 0,
    .cell_height = 0,
    .data_len = 0,
    .active = false,
    .widths = null,
}} ** MAX_FONTS;

/// Load a font atlas at runtime. font_id 0 is reserved for built-in.
/// atlas_data: grayscale alpha, 95 glyphs * cell_w * cell_h bytes.
/// widths_ptr: per-glyph advance widths (95 floats), or null for monospace.
export fn tge_load_font_atlas(font_id: u32, atlas_data: [*]const u8, data_len: u32, cell_w: u32, cell_h: u32, widths_ptr: ?[*]const f32) void {
    if (font_id == 0 or font_id >= MAX_FONTS) return;
    runtime_fonts[font_id] = .{
        .data = atlas_data,
        .cell_width = cell_w,
        .cell_height = cell_h,
        .data_len = data_len,
        .active = true,
        .widths = widths_ptr,
    };
}

/// Draw text with a specific runtime font atlas.
/// font_id 0 = built-in SF Mono. 1+ = runtime loaded.
export fn tge_draw_text_font(data: [*]u8, width: u32, height: u32, x: i32, y: i32, text_ptr: [*]const u8, text_len: u32, color: u32, font_id: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);

    if (font_id == 0 or font_id >= MAX_FONTS or !runtime_fonts[font_id].active) {
        // Fall back to built-in atlas
        _ = text_mod.drawText(&buf, x, y, text_ptr, text_len, c.r, c.g, c.b, c.a);
        return;
    }

    const font = &runtime_fonts[font_id];
    const atlas_data_ptr = font.data orelse return;
    const cw = font.cell_width;
    const ch = font.cell_height;
    const first_cp: u32 = 32;
    const last_cp: u32 = 126;

    var cx: i32 = x;
    var i: u32 = 0;
    while (i < text_len) : (i += 1) {
        const cp: u32 = text_ptr[i];
        if (cp < first_cp or cp > last_cp) {
            // Skip non-printable, advance by cell width
            cx += @intCast(cw);
            continue;
        }

        const idx = cp - first_cp;
        const glyph_offset = idx * cw * ch;

        // Render glyph from runtime atlas
        for (0..ch) |row_idx| {
            const py = cx + @as(i32, @intCast(row_idx));
            _ = py;
            const draw_y = @as(i32, @intCast(row_idx)) + (y);
            if (draw_y < 0) continue;
            if (draw_y >= @as(i32, @intCast(buf.height))) break;

            for (0..cw) |col_idx| {
                const draw_x = @as(i32, @intCast(col_idx)) + cx;
                if (draw_x < 0) continue;
                if (draw_x >= @as(i32, @intCast(buf.width))) break;

                const coverage = atlas_data_ptr[glyph_offset + row_idx * cw + col_idx];
                if (coverage == 0) continue;

                const final_a: u32 = (@as(u32, coverage) * @as(u32, c.a) + 127) / 255;
                blend(&buf, @intCast(draw_x), @intCast(draw_y), c.r, c.g, c.b, @intCast(final_a));
            }
        }

        // Advance cursor
        if (font.widths) |w| {
            // Proportional font: use per-glyph width (rounded)
            const glyph_w: f32 = w[idx];
            cx += @intFromFloat(@round(glyph_w));
        } else {
            cx += @intCast(cw);
        }
    }
}

// ── Tests ──

test "blend opaque onto empty" {
    var pixels = [_]u8{0} ** 16; // 2x2
    var buf = PixelBuffer{ .data = &pixels, .width = 2, .height = 2, .stride = 8 };
    blend(&buf, 0, 0, 255, 0, 0, 255);
    try std.testing.expectEqual(@as(u8, 255), pixels[0]); // R
    try std.testing.expectEqual(@as(u8, 0), pixels[1]); // G
    try std.testing.expectEqual(@as(u8, 0), pixels[2]); // B
    try std.testing.expectEqual(@as(u8, 255), pixels[3]); // A
}
