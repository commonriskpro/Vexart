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
const nebula = @import("nebula.zig");
const starfield = @import("starfield.zig");
const text_mod = @import("text.zig");
const filters = @import("filters.zig");
const blendmodes = @import("blendmodes.zig");
const polygon_mod = @import("polygon.zig");
const affine_mod = @import("affine.zig");

// Force test discovery for all sub-modules
comptime {
    _ = rect;
    _ = circle;
    _ = line_mod;
    _ = shadow;
    _ = halo_mod;
    _ = gradient;
    _ = nebula;
    _ = starfield;
    _ = text_mod;
    _ = filters;
    _ = blendmodes;
    _ = polygon_mod;
    _ = affine_mod;
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

// ── Helper: read little-endian values from packed param buffer ──
inline fn rd_i32(p: [*]const u8, off: usize) i32 {
    return @bitCast([4]u8{ p[off], p[off + 1], p[off + 2], p[off + 3] });
}
inline fn rd_u32(p: [*]const u8, off: usize) u32 {
    return @bitCast([4]u8{ p[off], p[off + 1], p[off + 2], p[off + 3] });
}

// Rect — fill_rect stays at 8 params (no migration needed)
export fn tge_fill_rect(data: [*]u8, width: u32, height: u32, x: i32, y: i32, w: u32, h: u32, color: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.fill(&buf, x, y, w, h, c.r, c.g, c.b, c.a);
}

// params_ptr layout (20 bytes): [x:i32][y:i32][w:u32][h:u32][radius:u32]
export fn tge_rounded_rect(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.rounded(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16));
}

// params_ptr layout (24 bytes): [x:i32][y:i32][w:u32][h:u32][radius:u32][strokeWidth:u32]
export fn tge_stroke_rect(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.stroke(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16), rd_u32(p, 20));
}

// Per-corner radius rect
// params_ptr layout (20 bytes): [x:i32][y:i32][w:u32][h:u32][radii:u32]
export fn tge_rounded_rect_corners(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.rounded_corners(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16));
}

// params_ptr layout (24 bytes): [x:i32][y:i32][w:u32][h:u32][radii:u32][strokeWidth:u32]
export fn tge_stroke_rect_corners(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    rect.stroke_corners(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16), rd_u32(p, 20));
}

// Circle
export fn tge_filled_circle(data: [*]u8, width: u32, height: u32, cx: i32, cy: i32, rx: u32, ry: u32, color: u32) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    circle.filled(&buf, cx, cy, rx, ry, c.r, c.g, c.b, c.a);
}

// params_ptr layout (20 bytes): [cx:i32][cy:i32][rx:u32][ry:u32][strokeWidth:u32]
export fn tge_stroked_circle(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    circle.stroked(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16));
}

// Line
// params_ptr layout (20 bytes): [x0:i32][y0:i32][x1:i32][y1:i32][lineWidth:u32]
export fn tge_line(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    line_mod.line(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_i32(p, 8), rd_i32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16));
}

// params_ptr layout (28 bytes): [x0:i32][y0:i32][cx:i32][cy:i32][x1:i32][y1:i32][lineWidth:u32]
export fn tge_bezier(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    line_mod.bezier(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_i32(p, 8), rd_i32(p, 12), rd_i32(p, 16), rd_i32(p, 20), c.r, c.g, c.b, c.a, rd_u32(p, 24));
}

// Shadow
// params_ptr layout (24 bytes): [x:u32][y:u32][w:u32][h:u32][radius:u32][passes:u32]
export fn tge_blur(data: [*]u8, width: u32, height: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    shadow.blur(&buf, rd_u32(p, 0), rd_u32(p, 4), rd_u32(p, 8), rd_u32(p, 12), rd_u32(p, 16), rd_u32(p, 20));
}

// Inset shadow (SDF-based, no blur pass needed)
// Uses packed params buffer to stay ≤8 FFI params:
// params_ptr layout (28 bytes): [x:i32][y:i32][w:u32][h:u32][radius:u32][ox:i32][oy:i32][spread:u32]
// All values little-endian as written by DataView on JS side.
export fn tge_inset_shadow(data: [*]u8, width: u32, height: u32, color: u32, params_ptr: [*]const u8) void {
    var b = mkbuf(data, width, height);
    const c = unpack(color);

    // Read params from packed buffer (little-endian)
    const x: i32 = @bitCast([4]u8{ params_ptr[0], params_ptr[1], params_ptr[2], params_ptr[3] });
    const y: i32 = @bitCast([4]u8{ params_ptr[4], params_ptr[5], params_ptr[6], params_ptr[7] });
    const w: u32 = @bitCast([4]u8{ params_ptr[8], params_ptr[9], params_ptr[10], params_ptr[11] });
    const h: u32 = @bitCast([4]u8{ params_ptr[12], params_ptr[13], params_ptr[14], params_ptr[15] });
    const radius: u32 = @bitCast([4]u8{ params_ptr[16], params_ptr[17], params_ptr[18], params_ptr[19] });
    const ox: i32 = @bitCast([4]u8{ params_ptr[20], params_ptr[21], params_ptr[22], params_ptr[23] });
    const oy: i32 = @bitCast([4]u8{ params_ptr[24], params_ptr[25], params_ptr[26], params_ptr[27] });
    const spread: u32 = @bitCast([4]u8{ params_ptr[28], params_ptr[29], params_ptr[30], params_ptr[31] });

    shadow.inset(&b, x, y, w, h, radius, ox, oy, spread, c.r, c.g, c.b, c.a);
}

// Halo
// params_ptr layout (20 bytes): [cx:i32][cy:i32][rx:u32][ry:u32][intensity_pct:u32]
export fn tge_halo(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c = unpack(color);
    halo_mod.halo(&buf, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c.r, c.g, c.b, c.a, rd_u32(p, 16));
}

// Gradient — two colors packed
// params_ptr layout (24 bytes): [x:u32][y:u32][w:u32][h:u32][color1:u32][angle_deg:u32]
export fn tge_linear_gradient(data: [*]u8, width: u32, height: u32, color0: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    const c0 = unpack(color0);
    const c1 = unpack(rd_u32(p, 16));
    gradient.linear(&buf, rd_u32(p, 0), rd_u32(p, 4), rd_u32(p, 8), rd_u32(p, 12), c0.r, c0.g, c0.b, c0.a, c1.r, c1.g, c1.b, c1.a, rd_u32(p, 20));
}

export fn tge_radial_gradient(data: [*]u8, width: u32, height: u32, cx: u32, cy: u32, radius: u32, color0: u32, color1: u32) void {
    var buf = mkbuf(data, width, height);
    const c0 = unpack(color0);
    const c1 = unpack(color1);
    gradient.radial(&buf, cx, cy, radius, c0.r, c0.g, c0.b, c0.a, c1.r, c1.g, c1.b, c1.a);
}

// Multi-stop gradients — stops + spatial params packed
// params_ptr layout (20 bytes): [x:u32][y:u32][w:u32][h:u32][angle_deg:u32]
export fn tge_linear_gradient_multi(data: [*]u8, width: u32, height: u32, stops_ptr: [*]const u8, stop_count: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    gradient.linear_multi(&buf, rd_u32(p, 0), rd_u32(p, 4), rd_u32(p, 8), rd_u32(p, 12), stops_ptr, stop_count, rd_u32(p, 16));
}

export fn tge_radial_gradient_multi(data: [*]u8, width: u32, height: u32, cx: u32, cy: u32, radius: u32, stops_ptr: [*]const u8, stop_count: u32) void {
    var buf = mkbuf(data, width, height);
    gradient.radial_multi(&buf, cx, cy, radius, stops_ptr, stop_count);
}

// params_ptr layout (20 bytes): [cx:u32][cy:u32][w:u32][h:u32][start_angle:u32]
export fn tge_conic_gradient(data: [*]u8, width: u32, height: u32, stops_ptr: [*]const u8, stop_count: u32, p: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    gradient.conic(&buf, rd_u32(p, 0), rd_u32(p, 4), rd_u32(p, 8), rd_u32(p, 12), stops_ptr, stop_count, rd_u32(p, 16));
}

// Gradient border — stroke with gradient colors (packed params to stay ≤8)
export fn tge_gradient_stroke(data: [*]u8, width: u32, height: u32, stops_ptr: [*]const u8, stop_count: u32, params_ptr: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    gradient.gradient_stroke(&buf, stops_ptr, stop_count, params_ptr);
}

// Nebula — packed multi-stop procedural cloud field
// params_ptr layout (48 bytes): [x:u32][y:u32][w:u32][h:u32][seed:u32][scale:u32][octaves:u32][gain_pct:u32][lacunarity_pct:u32][warp_pct:u32][detail_pct:u32][dust_pct:u32]
export fn tge_nebula(data: [*]u8, width: u32, height: u32, stops_ptr: [*]const u8, stop_count: u32, params_ptr: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    nebula.paint(&buf, rd_u32(params_ptr, 0), rd_u32(params_ptr, 4), rd_u32(params_ptr, 8), rd_u32(params_ptr, 12), stops_ptr, stop_count, rd_u32(params_ptr, 16), rd_u32(params_ptr, 20), rd_u32(params_ptr, 24), rd_u32(params_ptr, 28), rd_u32(params_ptr, 32), rd_u32(params_ptr, 36), rd_u32(params_ptr, 40), rd_u32(params_ptr, 44));
}

// Starfield — packed procedural stars + clusters
// params_ptr layout (44 bytes): [x:u32][y:u32][w:u32][h:u32][seed:u32][count:u32][cluster_count:u32][cluster_stars:u32][warm:u32][neutral:u32][cool:u32]
export fn tge_starfield(data: [*]u8, width: u32, height: u32, params_ptr: [*]const u8) void {
    var buf = mkbuf(data, width, height);
    starfield.paint(&buf, rd_u32(params_ptr, 0), rd_u32(params_ptr, 4), rd_u32(params_ptr, 8), rd_u32(params_ptr, 12), rd_u32(params_ptr, 16), rd_u32(params_ptr, 20), rd_u32(params_ptr, 24), rd_u32(params_ptr, 28), rd_u32(params_ptr, 32), rd_u32(params_ptr, 36), rd_u32(params_ptr, 40));
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
/// params_ptr layout (12 bytes): [x:i32][y:i32][font_id:u32]
export fn tge_draw_text_font(data: [*]u8, width: u32, height: u32, text_ptr: [*]const u8, text_len: u32, color: u32, p: [*]const u8) void {
    const x = rd_i32(p, 0);
    const y = rd_i32(p, 4);
    const font_id = rd_u32(p, 8);
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
    var pos: u32 = 0;
    while (pos < text_len) {
        // Decode UTF-8 codepoint
        const decoded = text_mod.decodeUtf8(text_ptr, text_len, pos) orelse {
            pos += 1; // skip invalid byte
            continue;
        };
        const cp = decoded.cp;
        pos += decoded.size;

        // Runtime fonts only cover ASCII 32-126
        if (cp < first_cp or cp > last_cp) {
            // Skip non-printable, advance by cell width
            cx += @intCast(cw);
            continue;
        }

        const idx = cp - first_cp;
        const glyph_offset = idx * cw * ch;

        // Render glyph from runtime atlas
        for (0..ch) |row_idx| {
            const draw_y = @as(i32, @intCast(row_idx)) + y;
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

// Polygon — regular polygon fill/stroke
// filled: (data, w, h, color, params_ptr) — 5 params
// params_ptr layout (16 bytes): [cx:i32][cy:i32][radius:u32][sides_rotation:u32]
// sides_rotation packs: (sides & 0xff) | ((rotation_deg & 0xffffff) << 8)
export fn tge_filled_polygon(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var b = mkbuf(data, width, height);
    const c = unpack(color);
    const sr = rd_u32(p, 12);
    const sides = sr & 0xff;
    const rotation = (sr >> 8) & 0xffffff;
    polygon_mod.filled(&b, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), sides, rotation, c.r, c.g, c.b, c.a);
}

// params_ptr layout (20 bytes): [cx:i32][cy:i32][radius:u32][sides_rotation:u32][strokeWidth:u32]
export fn tge_stroked_polygon(data: [*]u8, width: u32, height: u32, color: u32, p: [*]const u8) void {
    var b = mkbuf(data, width, height);
    const c = unpack(color);
    const sr = rd_u32(p, 12);
    const sides = sr & 0xff;
    const rotation = (sr >> 8) & 0xffffff;
    polygon_mod.stroked(&b, rd_i32(p, 0), rd_i32(p, 4), rd_u32(p, 8), sides, rotation, c.r, c.g, c.b, c.a, rd_u32(p, 16));
}

// Backdrop filters — in-place region operations (≤8 params each)
export fn tge_filter_brightness(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, factor_pct: u32) void {
    var b = mkbuf(data, width, height);
    filters.brightness(&b, x, y, w, h, factor_pct);
}

export fn tge_filter_contrast(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, factor_pct: u32) void {
    var b = mkbuf(data, width, height);
    filters.contrast(&b, x, y, w, h, factor_pct);
}

export fn tge_filter_saturate(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, factor_pct: u32) void {
    var b = mkbuf(data, width, height);
    filters.saturate(&b, x, y, w, h, factor_pct);
}

export fn tge_filter_grayscale(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, amount_pct: u32) void {
    var b = mkbuf(data, width, height);
    filters.grayscale(&b, x, y, w, h, amount_pct);
}

export fn tge_filter_invert(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, amount_pct: u32) void {
    var b = mkbuf(data, width, height);
    filters.invert(&b, x, y, w, h, amount_pct);
}

export fn tge_filter_sepia(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, amount_pct: u32) void {
    var b = mkbuf(data, width, height);
    filters.sepia(&b, x, y, w, h, amount_pct);
}

export fn tge_filter_hue_rotate(data: [*]u8, width: u32, height: u32, x: u32, y: u32, w: u32, h: u32, angle_deg: u32) void {
    var b = mkbuf(data, width, height);
    filters.hue_rotate(&b, x, y, w, h, angle_deg);
}

// Blend modes — blend solid color onto region with specified mode (≤8 params via packed)
// params_ptr: [x:u32][y:u32][w:u32][h:u32] = 16 bytes
export fn tge_blend_mode(data: [*]u8, width: u32, height: u32, color: u32, mode: u8, params_ptr: [*]const u8) void {
    var b = mkbuf(data, width, height);
    const c = unpack(color);

    const x: u32 = @bitCast([4]u8{ params_ptr[0], params_ptr[1], params_ptr[2], params_ptr[3] });
    const y: u32 = @bitCast([4]u8{ params_ptr[4], params_ptr[5], params_ptr[6], params_ptr[7] });
    const w: u32 = @bitCast([4]u8{ params_ptr[8], params_ptr[9], params_ptr[10], params_ptr[11] });
    const h: u32 = @bitCast([4]u8{ params_ptr[12], params_ptr[13], params_ptr[14], params_ptr[15] });

    const blend_mode = std.meta.intToEnum(blendmodes.BlendMode, mode) catch return;
    blendmodes.blend_rect(&b, x, y, w, h, c.r, c.g, c.b, c.a, blend_mode);
}

// Affine blit — projective buffer composite with bilinear interpolation
// params_ptr layout (52 bytes): [matrix:9×f32][dstOx:i32][dstOy:i32][blitW:u32][blitH:u32]
export fn tge_affine_blit(
    dst_data: [*]u8,
    dst_w: u32,
    dst_h: u32,
    src_data: [*]const u8,
    src_w: u32,
    params_ptr: [*]const u8,
) void {
    var dst = mkbuf(dst_data, dst_w, dst_h);
    // src_h is packed into params to stay ≤8 FFI params
    // Actually we can pass it as 6th param. Let's read it from after the main params.
    // Wait — we have 6 params. That's fine for ARM64. But src_h is needed.
    // Let's pack src_h into the params buffer at offset 52.
    const src_h = @as(u32, @bitCast([4]u8{ params_ptr[52], params_ptr[53], params_ptr[54], params_ptr[55] }));
    affine_mod.affine_blit(&dst, src_data, src_w, src_h, params_ptr);
}

// 1:1 RGBA blit — params_ptr layout (16 bytes): [src_h:u32][dst_x:i32][dst_y:i32][opacity:u32]
export fn tge_blit_rgba(
    dst_data: [*]u8,
    dst_w: u32,
    dst_h: u32,
    src_data: [*]const u8,
    src_w: u32,
    params_ptr: [*]const u8,
) void {
    var dst = mkbuf(dst_data, dst_w, dst_h);
    const src_h = @as(u32, @bitCast([4]u8{ params_ptr[0], params_ptr[1], params_ptr[2], params_ptr[3] }));
    const dst_x = @as(i32, @bitCast([4]u8{ params_ptr[4], params_ptr[5], params_ptr[6], params_ptr[7] }));
    const dst_y = @as(i32, @bitCast([4]u8{ params_ptr[8], params_ptr[9], params_ptr[10], params_ptr[11] }));
    const opacity = @as(u32, @bitCast([4]u8{ params_ptr[12], params_ptr[13], params_ptr[14], params_ptr[15] }));

    if (src_w == 0 or src_h == 0 or opacity == 0) return;

    const src_stride = src_w * 4;
    const x0: i32 = @max(0, dst_x);
    const y0: i32 = @max(0, dst_y);
    const x1: i32 = @min(@as(i32, @intCast(dst.width)), dst_x + @as(i32, @intCast(src_w)));
    const y1: i32 = @min(@as(i32, @intCast(dst.height)), dst_y + @as(i32, @intCast(src_h)));
    if (x0 >= x1 or y0 >= y1) return;

    if (opacity == 255 and x0 == dst_x and x1 == dst_x + @as(i32, @intCast(src_w))) {
        var y: i32 = y0;
        while (y < y1) : (y += 1) {
            const src_row = @as(u32, @intCast(y - dst_y)) * src_stride;
            const dst_row = @as(u32, @intCast(y)) * dst.stride + @as(u32, @intCast(dst_x)) * 4;
            @memcpy(dst.data[dst_row .. dst_row + src_stride], src_data[src_row .. src_row + src_stride]);
        }
        return;
    }

    var y: i32 = y0;
    while (y < y1) : (y += 1) {
        const src_row = @as(u32, @intCast(y - dst_y)) * src_stride;
        var x: i32 = x0;
        while (x < x1) : (x += 1) {
            const src_off = src_row + @as(u32, @intCast(x - dst_x)) * 4;
            const sa_src: u32 = src_data[src_off + 3];
            const sa = (sa_src * opacity + 127) / 255;
            if (sa == 0) continue;

            const dst_off = @as(u32, @intCast(y)) * dst.stride + @as(u32, @intCast(x)) * 4;
            if (sa == 255) {
                dst.data[dst_off] = src_data[src_off];
                dst.data[dst_off + 1] = src_data[src_off + 1];
                dst.data[dst_off + 2] = src_data[src_off + 2];
                dst.data[dst_off + 3] = 255;
                continue;
            }

            const da: u32 = dst.data[dst_off + 3];
            const inv = 255 - sa;
            const oa = sa * 255 + da * inv;
            if (oa == 0) continue;
            const dr: u32 = dst.data[dst_off];
            const dg: u32 = dst.data[dst_off + 1];
            const db: u32 = dst.data[dst_off + 2];
            dst.data[dst_off] = @intCast((@as(u32, src_data[src_off]) * sa * 255 + dr * da * inv + oa / 2) / oa);
            dst.data[dst_off + 1] = @intCast((@as(u32, src_data[src_off + 1]) * sa * 255 + dg * da * inv + oa / 2) / oa);
            dst.data[dst_off + 2] = @intCast((@as(u32, src_data[src_off + 2]) * sa * 255 + db * da * inv + oa / 2) / oa);
            const out_a = (oa + 127) / 255;
            dst.data[dst_off + 3] = if (out_a > 255) 255 else @intCast(out_a);
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

test "tge_blit_rgba copies opaque rows" {
    var dst_pixels = [_]u8{0} ** 64;
    var src_pixels = [_]u8{0} ** 16;
    src_pixels[0] = 10;
    src_pixels[1] = 20;
    src_pixels[2] = 30;
    src_pixels[3] = 255;
    src_pixels[4] = 40;
    src_pixels[5] = 50;
    src_pixels[6] = 60;
    src_pixels[7] = 255;
    src_pixels[8] = 70;
    src_pixels[9] = 80;
    src_pixels[10] = 90;
    src_pixels[11] = 255;
    src_pixels[12] = 100;
    src_pixels[13] = 110;
    src_pixels[14] = 120;
    src_pixels[15] = 255;

    const params = [16]u8{
        2,   0, 0, 0,
        1,   0, 0, 0,
        1,   0, 0, 0,
        255, 0, 0, 0,
    };

    tge_blit_rgba(&dst_pixels, 4, 4, &src_pixels, 2, &params);

    try std.testing.expectEqual(@as(u8, 10), dst_pixels[(1 * 16) + 4]);
    try std.testing.expectEqual(@as(u8, 20), dst_pixels[(1 * 16) + 5]);
    try std.testing.expectEqual(@as(u8, 30), dst_pixels[(1 * 16) + 6]);
    try std.testing.expectEqual(@as(u8, 255), dst_pixels[(1 * 16) + 7]);
    try std.testing.expectEqual(@as(u8, 100), dst_pixels[(2 * 16) + 8]);
    try std.testing.expectEqual(@as(u8, 110), dst_pixels[(2 * 16) + 9]);
    try std.testing.expectEqual(@as(u8, 120), dst_pixels[(2 * 16) + 10]);
    try std.testing.expectEqual(@as(u8, 255), dst_pixels[(2 * 16) + 11]);
}
