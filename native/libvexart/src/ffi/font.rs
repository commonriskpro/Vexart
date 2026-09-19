// native/libvexart/src/ffi/font.rs
// Font initialization, query, text rendering, and text measurement FFI exports.

use crate::ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, OK};
use crate::ffi_guard;
use crate::font;
use crate::paint;
use crate::text;
use crate::types::FrameStats;
use crate::{lock_or_recover, SHARED_FONT_SYSTEM, SHARED_MSDF_ATLAS};

/// Initialize the font system by scanning system fonts.
/// Returns the number of font faces discovered, or negative on error.
#[no_mangle]
pub extern "C" fn vexart_font_init() -> i32 {
    ffi_guard!({
        let guard = lock_or_recover(&SHARED_FONT_SYSTEM);
        guard.face_count() as i32
    })
}

/// Query a font face by family name and return an opaque font handle.
///
/// # Safety
/// `families_ptr` must be valid for `families_len` bytes.
/// `out_handle` must be a valid mutable u64 pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_query(
    families_ptr: *const u8,
    families_len: u32,
    weight: u16,
    italic: u32,
    out_handle: *mut u64,
) -> i32 {
    ffi_guard!({
        if families_ptr.is_null() || families_len == 0 || out_handle.is_null() {
            return ERR_INVALID_ARG;
        }
        let str_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
        let families_str = match std::str::from_utf8(str_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };
        let families: Vec<&str> = families_str.split('\0').collect();
        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let face = match system.query_face(&families, weight, italic != 0) {
            Some(f) => f,
            None => {
                crate::ffi::error::set_last_error(format!(
                    "no font found for families={families_str} weight={weight}"
                ));
                return crate::ffi::panic::ERR_INVALID_FONT;
            }
        };
        let handle = std::sync::Arc::as_ptr(&face.data) as u64;
        *out_handle = handle;
        OK
    })
}

/// Render text using the MSDF pipeline.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_render_text(
    _ctx: u64,
    target: u64,
    text_ptr: *const u8,
    text_len: u32,
    params_ptr: *const u8,
    params_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        use font::msdf_atlas::MsdfGlyphEntry;

        if text_ptr.is_null() || text_len == 0 || params_ptr.is_null() || params_len < 28 {
            if !stats_out.is_null() {
                *stats_out = FrameStats::default();
            }
            return OK;
        }

        let text_bytes = std::slice::from_raw_parts(text_ptr, text_len as usize);
        let text = match std::str::from_utf8(text_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };

        let params = std::slice::from_raw_parts(params_ptr, params_len as usize);
        let x = f32::from_le_bytes([params[0], params[1], params[2], params[3]]);
        let y = f32::from_le_bytes([params[4], params[5], params[6], params[7]]);
        let font_size = f32::from_le_bytes([params[8], params[9], params[10], params[11]]);
        let line_height = f32::from_le_bytes([params[12], params[13], params[14], params[15]]);
        let max_width = f32::from_le_bytes([params[16], params[17], params[18], params[19]]);
        let color_rgba = u32::from_le_bytes([params[20], params[21], params[22], params[23]]);
        let weight = u16::from_le_bytes([params[24], params[25]]);
        let flags = u16::from_le_bytes([params[26], params[27]]);
        let italic = (flags & 1) != 0;

        let families_owned: Vec<&str>;
        let families: &[&str] = if params_len > 28 {
            let str_bytes = &params[28..params_len as usize];
            if let Ok(s) = std::str::from_utf8(str_bytes) {
                families_owned = s.split('\0').collect();
                &families_owned
            } else {
                &["sans-serif"]
            }
        } else {
            &["sans-serif"]
        };

        let color_r = ((color_rgba >> 24) & 0xFF) as f32 / 255.0;
        let color_g = ((color_rgba >> 16) & 0xFF) as f32 / 255.0;
        let color_b = ((color_rgba >> 8) & 0xFF) as f32 / 255.0;
        let color_a = (color_rgba & 0xFF) as f32 / 255.0;

        let mut font_system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match font_system.query_face(families, weight, italic) {
            Some(f) => f,
            None => {
                if !stats_out.is_null() {
                    *stats_out = FrameStats::default();
                }
                return OK;
            }
        };

        let mut pctx_guard = crate::get_or_init_paint();
        let pctx = match pctx_guard.as_mut() {
            Some(p) => p,
            None => return ERR_GPU_DEVICE_LOST,
        };

        let (target_w, target_h) = if target != 0 {
            pctx.targets
                .get(target)
                .map(|t| (t.width as f32, t.height as f32))
                .unwrap_or((1920.0, 1080.0))
        } else {
            (1920.0, 1080.0)
        };

        let face_data = resolved.data.clone();
        let face_index = resolved.face_index;
        let face = match resolved.parse() {
            Some(f) => f,
            None => return ERR_INVALID_ARG,
        };

        let units_per_em = face.units_per_em() as f32;
        let scale = font_size / units_per_em;

        // Ascender in font units → pixels. This is the baseline offset from line top.
        let ascender = face.ascender() as f32;

        let text_layout = font::layout::layout_text(
            text,
            &face_data,
            face_index,
            font_size,
            line_height,
            max_width,
        );

        let mut atlas_mgr = lock_or_recover(&SHARED_MSDF_ATLAS);
        let mut instances: Vec<paint::instances::MsdfGlyphInstance> = Vec::new();

        for (line_idx, line) in text_layout.lines.iter().enumerate() {
            // pen_y is the TOP of the line box. The baseline sits at ascender below.
            let baseline_y = y + line_idx as f32 * line_height + ascender * scale;
            let mut pen_x = x;

            for ch in line.text.chars() {
                let entry: Option<MsdfGlyphEntry> =
                    atlas_mgr.get_or_generate(&face_data, face_index, ch);

                let (entry, _) = if entry.is_some() {
                    (entry, false)
                } else {
                    drop(atlas_mgr);
                    let fallback_face = font_system.find_face_for_codepoint(ch, weight, !italic);
                    atlas_mgr = lock_or_recover(&SHARED_MSDF_ATLAS);
                    if let Some(fb) = fallback_face {
                        (atlas_mgr.get_or_generate(&fb.data, fb.face_index, ch), true)
                    } else {
                        (None, false)
                    }
                };

                let entry = match entry {
                    Some(e) => e,
                    None => {
                        pen_x += font_size * 0.5;
                        continue;
                    }
                };

                let advance = entry.advance * scale;

                if entry.bbox_w > 0.0 && entry.bbox_h > 0.0 {
                    let glyph_w = entry.quad_w(scale);
                    let glyph_h = entry.quad_h(scale);
                    let glyph_x = pen_x + entry.quad_offset_x(scale);
                    let glyph_y = baseline_y + entry.quad_offset_y(scale);

                    instances.push(paint::instances::MsdfGlyphInstance {
                        x: (glyph_x / target_w) * 2.0 - 1.0,
                        y: 1.0 - (glyph_y / target_h) * 2.0,
                        w: (glyph_w / target_w) * 2.0,
                        h: -((glyph_h / target_h) * 2.0),
                        uv_x: entry.uv_x(),
                        uv_y: entry.uv_y(),
                        uv_w: entry.uv_w(),
                        uv_h: entry.uv_h(),
                        color_r,
                        color_g,
                        color_b,
                        color_a,
                        atlas_id: (entry.page as u32) + 2,
                        msdf_flag: 1,
                        _pad1: 0,
                        _pad2: 0,
                    });
                }
                pen_x += advance;
            }
        }

        let page_size = atlas_mgr.page_size();
        let stride = page_size * 4;
        for (page_idx, page) in atlas_mgr.pages.iter_mut().enumerate() {
            if page.dirty {
                let msdf_atlas_id = (page_idx as u32) + 2;
                if msdf_atlas_id <= 15 {
                    if !pctx.atlases.contains(msdf_atlas_id) || page.dirty_subregions.is_empty() {
                        // Initial upload if not loaded yet, or in-place full update if no specific subregions recorded.
                        let _ = pctx.atlases.load_atlas_raw(
                            &pctx.wgpu.device,
                            &pctx.wgpu.queue,
                            &pctx.wgpu.image_bind_group_layout,
                            msdf_atlas_id,
                            &page.rgba,
                            page_size,
                            page_size,
                        );
                    } else {
                        for sub in page.dirty_subregions.drain(..) {
                            let offset = (sub.y as u64 * stride as u64) + (sub.x as u64 * 4);
                            let _ = pctx.atlases.update_subregion(
                                &pctx.wgpu.queue,
                                msdf_atlas_id,
                                sub.x,
                                sub.y,
                                sub.width,
                                sub.height,
                                &page.rgba,
                                stride,
                                offset,
                            );
                        }
                    }
                }
                page.dirty = false;
                page.dirty_subregions.clear();
            }
        }

        if instances.is_empty() {
            if !stats_out.is_null() {
                *stats_out = FrameStats::default();
            }
            return OK;
        }

        drop(atlas_mgr);

        let code = text::dispatch_glyph_instances(pctx, target, &instances);

        if !stats_out.is_null() {
            (*stats_out).primitives = instances.len() as u32;
            (*stats_out).draw_calls = 1;
        }
        code
    })
}

/// Measure text width and height using font system metrics.
///
/// # Safety
/// All pointer args must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_measure(
    text_ptr: *const u8,
    text_len: u32,
    families_ptr: *const u8,
    families_len: u32,
    font_size: f32,
    weight: u16,
    italic: u32,
    out_w: *mut f32,
    out_h: *mut f32,
) -> i32 {
    ffi_guard!({
        if out_w.is_null() || out_h.is_null() {
            return ERR_INVALID_ARG;
        }
        if text_ptr.is_null() || text_len == 0 {
            *out_w = 0.0;
            *out_h = 0.0;
            return OK;
        }
        let text =
            match std::str::from_utf8(std::slice::from_raw_parts(text_ptr, text_len as usize)) {
                Ok(s) => s,
                Err(_) => {
                    *out_w = 0.0;
                    *out_h = 0.0;
                    return OK;
                }
            };
        let families_owned: Vec<&str>;
        let families: &[&str] = if !families_ptr.is_null() && families_len > 0 {
            let str_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
            if let Ok(s) = std::str::from_utf8(str_bytes) {
                families_owned = s.split('\0').collect();
                &families_owned
            } else {
                &["sans-serif"]
            }
        } else {
            &["sans-serif"]
        };
        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match system.query_face(families, weight, italic != 0) {
            Some(f) => f,
            None => {
                *out_w = 0.0;
                *out_h = 0.0;
                return OK;
            }
        };
        let face = match resolved.parse() {
            Some(f) => f,
            None => {
                *out_w = 0.0;
                *out_h = 0.0;
                return OK;
            }
        };
        let units_per_em = face.units_per_em() as f32;
        let scale = font_size / units_per_em;
        let mut width = 0.0f32;
        let mut lines = 1u32;
        for ch in text.chars() {
            if ch == '\n' {
                lines += 1;
                continue;
            }
            if let Some(glyph_id) = face.glyph_index(ch) {
                width += face.glyph_hor_advance(glyph_id).unwrap_or(0) as f32 * scale;
            } else {
                width += font_size * 0.5;
            }
        }
        *out_w = width;
        *out_h = lines as f32 * font_size * 1.2;
        OK
    })
}

/// Unified font layout, measurement, and line-breaking C-ABI endpoint.
///
/// # Safety
/// All pointer arguments must be valid for their respective lengths or null if optional.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_layout_measure(
    text_ptr: *const u8,
    text_len: u32,
    families_ptr: *const u8,
    families_len: u32,
    font_size: f32,
    line_height: f32,
    max_width: f32,
    weight: u16,
    flags: u32,
    metrics_out: *mut font::layout::LayoutMetrics,
    lines_out_ptr: *mut font::layout::LineRecord,
    lines_out_cap: u32,
) -> i32 {
    ffi_guard!({
        if metrics_out.is_null() {
            return ERR_INVALID_ARG;
        }

        let italic = (flags & 1) != 0;
        let white_space = match (flags >> 1) & 0x3 {
            1 => font::layout::WhiteSpaceMode::PreWrap,
            2 => font::layout::WhiteSpaceMode::NoWrap,
            _ => font::layout::WhiteSpaceMode::Normal,
        };
        let word_break = match (flags >> 3) & 0x1 {
            1 => font::layout::WordBreakMode::KeepAll,
            _ => font::layout::WordBreakMode::Normal,
        };

        let eff_line_height = if line_height > 0.0 { line_height } else { font_size * 1.2 };

        if text_ptr.is_null() || text_len == 0 {
            *metrics_out = font::layout::LayoutMetrics {
                total_width: 0.0,
                total_height: eff_line_height,
                max_content_width: 0.0,
                min_content_width: 0.0,
                line_count: 1,
                glyph_count: 0,
            };
            if !lines_out_ptr.is_null() && lines_out_cap > 0 {
                *lines_out_ptr = font::layout::LineRecord {
                    start_byte: 0,
                    end_byte: 0,
                    width: 0.0,
                    glyph_count: 0,
                };
            }
            return OK;
        }

        let text_bytes = std::slice::from_raw_parts(text_ptr, text_len as usize);
        let text = match std::str::from_utf8(text_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARG,
        };

        let families_owned: Vec<&str>;
        let families: &[&str] = if !families_ptr.is_null() && families_len > 0 {
            let str_bytes = std::slice::from_raw_parts(families_ptr, families_len as usize);
            if let Ok(s) = std::str::from_utf8(str_bytes) {
                families_owned = s.split(' ').collect();
                &families_owned
            } else {
                &["sans-serif"]
            }
        } else {
            &["sans-serif"]
        };

        let mut system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let resolved = match system.query_face(families, weight, italic) {
            Some(f) => f,
            None => {
                match system.query_face(&["sans-serif"], weight, italic) {
                    Some(f) => f,
                    None => {
                        *metrics_out = font::layout::LayoutMetrics {
                            total_width: text_len as f32 * font_size * 0.5,
                            total_height: eff_line_height,
                            max_content_width: text_len as f32 * font_size * 0.5,
                            min_content_width: font_size * 0.5,
                            line_count: 1,
                            glyph_count: text.chars().count() as u32,
                        };
                        if !lines_out_ptr.is_null() && lines_out_cap > 0 {
                            *lines_out_ptr = font::layout::LineRecord {
                                start_byte: 0,
                                end_byte: text_len,
                                width: text_len as f32 * font_size * 0.5,
                                glyph_count: text.chars().count() as u32,
                            };
                        }
                        return OK;
                    }
                }
            }
        };

        let face = match resolved.parse() {
            Some(f) => f,
            None => return ERR_INVALID_ARG,
        };

        drop(system);

        let lines_slice = if !lines_out_ptr.is_null() && lines_out_cap > 0 {
            Some(std::slice::from_raw_parts_mut(lines_out_ptr, lines_out_cap as usize))
        } else {
            None
        };

        let (metrics, _written) = font::layout::layout_measure(
            text,
            &face,
            font_size,
            eff_line_height,
            max_width,
            weight,
            italic,
            white_space,
            word_break,
            lines_slice,
        );

        *metrics_out = metrics;
        OK
    })
}
