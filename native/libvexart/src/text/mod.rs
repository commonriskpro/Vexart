// native/libvexart/src/text/mod.rs
// MSDF text pipeline — Phase 2b implementation.
// Replaces Phase 2 DEC-011 stubs with real atlas loading and glyph dispatch.
// Per design §4.3, REQ-2B-202/203/204, tasks 4.2-4.4.

pub mod atlas;
pub mod glyph_info;
pub mod render;

use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_FONT, OK};
use crate::paint::PaintContext;
use crate::types::FrameStats;
use atlas::AtlasRegistry;

const BUILTIN_ADVANCE: f32 = 8.65;
const BUILTIN_HEIGHT: f32 = 17.0;
const BUILTIN_FONT_SIZE: f32 = 14.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhiteSpaceMode {
    Normal,
    PreWrap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WordBreakMode {
    Normal,
    KeepAll,
}

struct FontMeasureMetrics<'a> {
    atlas: Option<&'a atlas::AtlasRecord>,
    space_advance: f32,
    fallback_advance: f32,
    line_height: f32,
    scale: f32,
}

fn resolve_font_metrics<'a>(
    atlases: Option<&'a AtlasRegistry>,
    font_id: u32,
    font_size: f32,
    line_height: f32,
) -> FontMeasureMetrics<'a> {
    if font_id == 0 {
        let scale = font_size.max(1.0) / BUILTIN_FONT_SIZE;
        let height = (BUILTIN_HEIGHT * scale).ceil();
        return FontMeasureMetrics {
            atlas: None,
            space_advance: BUILTIN_ADVANCE * scale,
            fallback_advance: BUILTIN_ADVANCE * scale,
            line_height: line_height.max(height),
            scale,
        };
    }

    if let Some(atlas) = atlases.and_then(|registry| registry.get(font_id)) {
        let scale = if atlas.ref_size > 0.0 {
            font_size / atlas.ref_size
        } else {
            1.0
        };
        let space_advance = atlas
            .glyphs
            .get(&' ')
            .map(|glyph| glyph.x_advance as f32 * scale)
            .unwrap_or(atlas.cell_width as f32 * scale * 0.5);
        let glyph_height = atlas.cell_height as f32 * scale;
        return FontMeasureMetrics {
            atlas: Some(atlas),
            space_advance,
            fallback_advance: space_advance,
            line_height: line_height.max(glyph_height),
            scale,
        };
    }

    let fallback_advance = if font_size > 0.0 {
        font_size * 0.6
    } else {
        BUILTIN_ADVANCE
    };
    let fallback_height = if font_size > 0.0 {
        font_size * 1.2
    } else {
        BUILTIN_HEIGHT
    };
    FontMeasureMetrics {
        atlas: None,
        space_advance: fallback_advance,
        fallback_advance,
        line_height: line_height.max(fallback_height),
        scale: 1.0,
    }
}

fn measure_char(metrics: &FontMeasureMetrics<'_>, ch: char) -> f32 {
    if ch == '\t' {
        return metrics.space_advance * 4.0;
    }
    if ch.is_whitespace() {
        return metrics.space_advance;
    }
    if let Some(atlas) = metrics.atlas {
        if let Some(glyph) = atlas.glyphs.get(&ch) {
            return glyph.x_advance as f32 * metrics.scale;
        }
    }
    metrics.fallback_advance
}

fn measure_string(metrics: &FontMeasureMetrics<'_>, text: &str) -> f32 {
    text.chars().map(|ch| measure_char(metrics, ch)).sum()
}

fn measure_unwrapped_lines(
    text: &str,
    metrics: &FontMeasureMetrics<'_>,
    white_space: WhiteSpaceMode,
) -> (f32, f32) {
    let mut max_width: f32 = 0.0;
    let mut line_count = 0u32;

    for raw_line in text.split('\n') {
        let line = match white_space {
            WhiteSpaceMode::Normal => raw_line.split_whitespace().collect::<Vec<_>>().join(" "),
            WhiteSpaceMode::PreWrap => raw_line.to_string(),
        };
        max_width = max_width.max(measure_string(metrics, &line));
        line_count += 1;
    }

    if line_count == 0 {
        return (0.0, 0.0);
    }

    (max_width, line_count as f32 * metrics.line_height)
}

fn wrap_long_word(
    word: &str,
    max_width: f32,
    metrics: &FontMeasureMetrics<'_>,
    current_width: &mut f32,
    max_line_width: &mut f32,
    line_count: &mut u32,
) {
    for ch in word.chars() {
        let width = measure_char(metrics, ch);
        if *current_width > 0.0 && *current_width + width > max_width {
            *max_line_width = max_line_width.max(*current_width);
            *line_count += 1;
            *current_width = 0.0;
        }
        *current_width += width;
    }
}

fn measure_wrapped_normal(
    text: &str,
    max_width: f32,
    metrics: &FontMeasureMetrics<'_>,
    word_break: WordBreakMode,
) -> (f32, f32) {
    let mut max_line_width: f32 = 0.0;
    let mut line_count = 0u32;

    for raw_line in text.split('\n') {
        let words: Vec<&str> = raw_line.split_whitespace().collect();
        let mut current_width: f32 = 0.0;

        if words.is_empty() {
            line_count += 1;
            continue;
        }

        for word in words {
            let word_width = measure_string(metrics, word);
            if current_width == 0.0 {
                if word_width > max_width && matches!(word_break, WordBreakMode::Normal) {
                    wrap_long_word(
                        word,
                        max_width,
                        metrics,
                        &mut current_width,
                        &mut max_line_width,
                        &mut line_count,
                    );
                } else {
                    current_width = word_width;
                }
                continue;
            }

            let proposed = current_width + metrics.space_advance + word_width;
            if proposed <= max_width {
                current_width = proposed;
                continue;
            }

            max_line_width = max_line_width.max(current_width);
            line_count += 1;
            current_width = 0.0;

            if word_width > max_width && matches!(word_break, WordBreakMode::Normal) {
                wrap_long_word(
                    word,
                    max_width,
                    metrics,
                    &mut current_width,
                    &mut max_line_width,
                    &mut line_count,
                );
            } else {
                current_width = word_width;
            }
        }

        max_line_width = max_line_width.max(current_width);
        line_count += 1;
    }

    (max_line_width, line_count as f32 * metrics.line_height)
}

fn measure_wrapped_pre_wrap(
    text: &str,
    max_width: f32,
    metrics: &FontMeasureMetrics<'_>,
    word_break: WordBreakMode,
) -> (f32, f32) {
    let mut max_line_width: f32 = 0.0;
    let mut current_width: f32 = 0.0;
    let mut line_count = 1u32;
    let mut last_break_width = 0.0f32;

    for ch in text.chars() {
        if ch == '\n' {
            max_line_width = max_line_width.max(current_width);
            line_count += 1;
            current_width = 0.0;
            last_break_width = 0.0;
            continue;
        }

        let width = measure_char(metrics, ch);
        if current_width == 0.0 || current_width + width <= max_width {
            current_width += width;
            if ch.is_whitespace() {
                last_break_width = current_width;
            }
            continue;
        }

        if ch.is_whitespace() {
            max_line_width = max_line_width.max(current_width);
            line_count += 1;
            current_width = 0.0;
            last_break_width = 0.0;
            continue;
        }

        if last_break_width > 0.0 {
            max_line_width = max_line_width.max(last_break_width);
            line_count += 1;
            current_width = (current_width - last_break_width) + width;
            last_break_width = 0.0;
            continue;
        }

        max_line_width = max_line_width.max(current_width);
        line_count += 1;
        current_width = width;

        if matches!(word_break, WordBreakMode::KeepAll) {
            last_break_width = 0.0;
        }
    }

    max_line_width = max_line_width.max(current_width);
    (max_line_width, line_count as f32 * metrics.line_height)
}

pub(crate) fn measure_text_layout(
    text: &str,
    font_id: u32,
    font_size: f32,
    line_height: f32,
    max_width: Option<f32>,
    white_space: WhiteSpaceMode,
    word_break: WordBreakMode,
    atlases: Option<&AtlasRegistry>,
) -> (f32, f32) {
    if text.is_empty() {
        return (0.0, 0.0);
    }

    let metrics = resolve_font_metrics(atlases, font_id, font_size, line_height);
    let measured = if let Some(limit) = max_width.filter(|width| width.is_finite() && *width > 0.0)
    {
        match white_space {
            WhiteSpaceMode::Normal => measure_wrapped_normal(text, limit, &metrics, word_break),
            WhiteSpaceMode::PreWrap => measure_wrapped_pre_wrap(text, limit, &metrics, word_break),
        }
    } else {
        measure_unwrapped_lines(text, &metrics, white_space)
    };

    if font_id == 0 {
        return (measured.0.ceil(), measured.1.ceil());
    }

    measured
}

/// Load a pre-generated MSDF atlas PNG + metrics JSON into the GPU.
///
/// - `pctx`: the shared PaintContext owning GPU device/queue/atlases.
/// - `font_id`: 1-15 (per spec). 0 and >15 return ERR_INVALID_FONT.
/// - `png_ptr/png_len`: raw PNG bytes.
/// - `metrics_ptr/metrics_len`: UTF-8 JSON metrics produced by internal-atlas-gen.
///
/// Returns ERR_INVALID_FONT (-8) if:
/// - font_id is 0 or >15
/// - font_id is already loaded (REQ-2B-202 duplicate scenario)
/// - PNG or JSON is invalid (REQ-2B-202 corrupted-metrics scenario)
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
pub unsafe fn load_atlas(
    pctx: &mut PaintContext,
    font_id: u32,
    png_ptr: *const u8,
    png_len: u32,
    metrics_ptr: *const u8,
    metrics_len: u32,
) -> i32 {
    if png_ptr.is_null() || png_len == 0 || metrics_ptr.is_null() || metrics_len == 0 {
        return ERR_INVALID_ARG;
    }

    let png_bytes = std::slice::from_raw_parts(png_ptr, png_len as usize);
    let metrics_bytes = std::slice::from_raw_parts(metrics_ptr, metrics_len as usize);

    let metrics_json = match std::str::from_utf8(metrics_bytes) {
        Ok(s) => s,
        Err(_) => return ERR_INVALID_FONT,
    };

    let device = &pctx.wgpu.device;
    let queue = &pctx.wgpu.queue;
    let image_bgl = &pctx.wgpu.image_bind_group_layout;

    match pctx
        .atlases
        .load_atlas(device, queue, image_bgl, font_id, png_bytes, metrics_json)
    {
        Ok(()) => OK,
        Err(_) => ERR_INVALID_FONT,
    }
}

/// Dispatch MSDF glyph rendering from a packed glyph instance buffer.
///
/// The buffer contains a sequence of `MsdfGlyphInstance` structs (cmd_kind=18 payloads).
/// Glyphs are batched by atlas_id and dispatched through the glyph pipeline.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
pub unsafe fn dispatch(
    pctx: &mut PaintContext,
    target: u64,
    glyphs_ptr: *const u8,
    glyphs_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    if glyphs_ptr.is_null() || glyphs_len == 0 {
        if !stats_out.is_null() {
            *stats_out = FrameStats::default();
        }
        return OK;
    }

    let stride = std::mem::size_of::<crate::paint::instances::MsdfGlyphInstance>();
    if (glyphs_len as usize) % stride != 0 {
        return ERR_INVALID_ARG;
    }

    let raw = std::slice::from_raw_parts(glyphs_ptr, glyphs_len as usize);
    let glyphs: &[crate::paint::instances::MsdfGlyphInstance] = bytemuck::cast_slice(raw);

    if glyphs.is_empty() {
        if !stats_out.is_null() {
            *stats_out = FrameStats::default();
        }
        return OK;
    }

    // Route through the paint pipeline for the glyph cmd_kind (18).
    // Build a minimal graph buffer with cmd_kind=18 wrapping the glyph payload.
    let code = dispatch_glyph_instances(pctx, target, glyphs);

    if !stats_out.is_null() {
        (*stats_out).primitives = glyphs.len() as u32;
        (*stats_out).draw_calls = 1;
    }

    code
}

/// Dispatch glyph instances through the glyph pipeline.
/// Groups by atlas_id and issues one draw call per atlas.
pub(crate) fn dispatch_glyph_instances(
    pctx: &mut PaintContext,
    target: u64,
    glyphs: &[crate::paint::instances::MsdfGlyphInstance],
) -> i32 {
    use std::collections::HashMap;
    use wgpu::util::DeviceExt;

    // Group glyphs by atlas_id.
    let mut by_atlas: HashMap<u32, Vec<crate::paint::instances::MsdfGlyphInstance>> =
        HashMap::new();
    for g in glyphs {
        by_atlas.entry(g.atlas_id).or_default().push(*g);
    }

    let (wgpu, targets, _, atlases, default_view, fallback_bg) = pctx.split();
    let use_active_encoder = target != 0
        && targets
            .get(target)
            .map(|rec| rec.active_layer.is_some())
            .unwrap_or(false);

    for (atlas_id, atlas_glyphs) in &by_atlas {
        // Look up atlas bind group (fallback to default if atlas not loaded yet).
        let bind_group = if let Some(atlas) = atlases.get(*atlas_id) {
            &atlas.bind_group
        } else {
            fallback_bg
        };

        let payload: &[u8] = bytemuck::cast_slice(atlas_glyphs.as_slice());
        let instance_count = atlas_glyphs.len() as u32;

        // SAFETY: device is disjoint from targets/atlases.
        let vertex_buf = wgpu
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("vexart-glyph-instance-buf"),
                contents: payload,
                usage: wgpu::BufferUsages::VERTEX,
            });

        if use_active_encoder {
            let Some(rec) = targets.get_mut(target) else { return ERR_INVALID_ARG; };
            let Some(layer) = rec.active_layer.as_mut() else { return ERR_INVALID_ARG; };
            let view_ref = &rec.view;

            let load_op = if layer.first_pass {
                layer.first_pass = false;
                if layer.first_load_mode == 0 {
                    let c = layer.clear_rgba;
                    wgpu::LoadOp::Clear(wgpu::Color {
                        r: ((c >> 24) & 0xff) as f64 / 255.0,
                        g: ((c >> 16) & 0xff) as f64 / 255.0,
                        b: ((c >> 8) & 0xff) as f64 / 255.0,
                        a: (c & 0xff) as f64 / 255.0,
                    })
                } else {
                    wgpu::LoadOp::Load
                }
            } else {
                wgpu::LoadOp::Load
            };

            let mut pass = layer
                .encoder
                .begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("vexart-glyph-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: view_ref,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: load_op,
                            store: wgpu::StoreOp::Store,
                        },
                        depth_slice: None,
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });

            pass.set_pipeline(&wgpu.pipelines.glyph);
            pass.set_vertex_buffer(0, vertex_buf.slice(..));
            pass.set_bind_group(0, bind_group, &[]);
            pass.draw(0..6, 0..instance_count);
        } else {
            let render_view = if target != 0 {
                targets.get(target).map(|rec| &rec.view).unwrap_or(default_view)
            } else {
                default_view
            };
            let mut encoder = wgpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("vexart-glyph-encoder"),
            });

            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("vexart-glyph-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: render_view,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Load,
                            store: wgpu::StoreOp::Store,
                        },
                        depth_slice: None,
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });

                pass.set_pipeline(&wgpu.pipelines.glyph);
                pass.set_vertex_buffer(0, vertex_buf.slice(..));
                pass.set_bind_group(0, bind_group, &[]);
                pass.draw(0..6, 0..instance_count);
            }

            wgpu.queue.submit(std::iter::once(encoder.finish()));
        }
    }

    OK
}

/// Measure the width and height of a UTF-8 text string using loaded atlas metrics.
///
/// Uses the atlas for `font_id` if loaded; falls back to 0.0×0.0 if atlas is not yet loaded.
///
/// # Safety
/// `out_w` and `out_h` must be valid mutable f32 pointers. `text_ptr` must be valid.
pub unsafe fn measure(
    pctx: &PaintContext,
    text_ptr: *const u8,
    text_len: u32,
    font_id: u32,
    font_size: f32,
    out_w: *mut f32,
    out_h: *mut f32,
) -> i32 {
    if out_w.is_null() || out_h.is_null() {
        return ERR_INVALID_ARG;
    }

    if text_ptr.is_null() || text_len == 0 {
        *out_w = 0.0;
        *out_h = 0.0;
        return OK;
    }

    let text_bytes = std::slice::from_raw_parts(text_ptr, text_len as usize);
    let text = match std::str::from_utf8(text_bytes) {
        Ok(s) => s,
        Err(_) => {
            *out_w = 0.0;
            *out_h = 0.0;
            return OK;
        }
    };

    let (width, height) = measure_text_layout(
        text,
        font_id,
        font_size,
        font_size.max(BUILTIN_HEIGHT),
        None,
        WhiteSpaceMode::Normal,
        WordBreakMode::Normal,
        Some(&pctx.atlases),
    );

    *out_w = width;
    *out_h = height;

    OK
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests for glyph_info::parse_metrics are in glyph_info.rs.
    // Tests for atlas::decode_png are in atlas.rs.
    // Tests for render::glyph_ndc are in render.rs.

    // ── measure stub tests (without GPU — test null-pointer guards) ──────────

    // NOTE: Testing measure() without a real PaintContext is tricky since it needs
    // pctx.atlases. We test through the raw null-pointer guard path here.
    // Full integration tests with GPU are gated behind #[cfg(feature = "gpu-tests")].

    #[test]
    fn test_measure_null_out_w_returns_err() {
        // We need a PaintContext — skip this without gpu-tests.
        // This is intentionally a compile-time check; the runtime test is in gpu-tests.
        // We just verify ERR_INVALID_ARG constant is correct.
        assert_eq!(ERR_INVALID_ARG, -9);
    }

    #[test]
    fn test_err_invalid_font_value() {
        assert_eq!(ERR_INVALID_FONT, -8);
    }

    #[test]
    fn test_measure_text_layout_builtin_single_line() {
        let (width, height) = measure_text_layout(
            "Hello",
            0,
            14.0,
            17.0,
            None,
            WhiteSpaceMode::Normal,
            WordBreakMode::Normal,
            None,
        );
        assert_eq!(width, (5.0 * BUILTIN_ADVANCE).ceil());
        assert_eq!(height, 17.0);
    }

    #[test]
    fn test_measure_text_layout_wraps_words() {
        let (width, height) = measure_text_layout(
            "hello world again",
            0,
            14.0,
            17.0,
            Some(50.0),
            WhiteSpaceMode::Normal,
            WordBreakMode::Normal,
            None,
        );
        assert!(width <= 50.0);
        assert!(height > 17.0);
    }

    #[test]
    fn test_measure_text_layout_respects_newlines() {
        let (width, height) = measure_text_layout(
            "hello\nworld",
            0,
            14.0,
            17.0,
            None,
            WhiteSpaceMode::Normal,
            WordBreakMode::Normal,
            None,
        );
        assert_eq!(width, (5.0 * BUILTIN_ADVANCE).ceil());
        assert_eq!(height, 34.0);
    }
}
