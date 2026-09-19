// native/libvexart/src/ffi/paint.rs
// Paint dispatch, image upload/remove, and batched text rendering FFI exports.

use std::sync::atomic::Ordering;

use crate::ffi::panic::{
    ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, ERR_OUT_OF_BUDGET, OK,
};
use crate::ffi_guard;
use crate::types::FrameStats;
use crate::{
    font, lock_or_recover, paint, text, upload_image_record, FRAME_COUNT,
    SHARED_FONT_SYSTEM, SHARED_MSDF_ATLAS,
};

/// Execute paint graph from packed buffer. Phase 2 stub.
///
/// # Safety
/// `graph_ptr` must be valid for `graph_len` bytes; `stats_out` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_paint_dispatch(
    _ctx: u64,
    target: u64,
    graph_ptr: *const u8,
    graph_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let graph = if graph_ptr.is_null() || graph_len == 0 {
            &[][..]
        } else {
            std::slice::from_raw_parts(graph_ptr, graph_len as usize)
        };
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        pctx.dispatch(target, graph, stats_out)
    })
}

/// RGBA/BGRA → GPU texture; returns handle in `out_image`.
/// Per design §5.3, task 5a.17.
///
/// # Safety
/// `image_ptr` must be valid for `image_len` bytes; `out_image` must be valid if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_paint_upload_image(
    _ctx: u64,
    image_ptr: *const u8,
    image_len: u32,
    width: u32,
    height: u32,
    _format: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        if image_ptr.is_null() || image_len == 0 || width == 0 || height == 0 {
            return ERR_INVALID_ARG;
        }
        let bytes = match (width as u64)
            .checked_mul(height as u64)
            .and_then(|px| px.checked_mul(4))
        {
            Some(b) => b,
            None => {
                *out_image = 0;
                return ERR_OUT_OF_BUDGET;
            }
        };

        if (image_len as u64) < bytes {
            *out_image = 0;
            return ERR_INVALID_ARG;
        }

        let rgba = std::slice::from_raw_parts(image_ptr, image_len as usize);

        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
        if width > max_dim || height > max_dim {
            return ERR_INVALID_ARG;
        }
        let handle = paint::alloc_image_handle();
        if !upload_image_record(pctx, handle, rgba, width, height) {
            return ERR_INVALID_ARG;
        }

        *out_image = handle;
        OK
    })
}

/// Free GPU texture. Per design §5.3, task 5a.17.
#[no_mangle]
pub extern "C" fn vexart_paint_remove_image(_ctx: u64, image: u64) -> i32 {
    ffi_guard!({
        if image == 0 {
            return ERR_INVALID_ARG;
        }
        let mut guard = crate::get_or_init_paint();
        if let Some(pctx) = guard.as_mut() {
            if let Some(img) = pctx.images.remove(&image) {
                let size = img.texture.size();
                let required_usage = wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_SRC
                    | wgpu::TextureUsages::COPY_DST;
                if img.texture.format() == wgpu::TextureFormat::Rgba8Unorm
                    && img.texture.usage().contains(required_usage)
                    && size.depth_or_array_layers == 1
                {
                    drop(img.bind_group);
                    let current_frame = FRAME_COUNT.load(Ordering::Relaxed);
                    pctx.texture_pool.release(
                        img.texture,
                        img.view,
                        size.width,
                        size.height,
                        current_frame,
                    );
                }
            }
        }
        OK
    })
}

/// Render a batch of text items using the MSDF pipeline.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
#[no_mangle]
pub unsafe extern "C" fn vexart_font_render_batch(
    _ctx_handle: u64,
    target_handle: u64,
    batch_ptr: *const u8,
    batch_len: u32,
    stats_out: *mut u32,
) -> i32 {
    ffi_guard!({
        use font::msdf_atlas::MsdfGlyphEntry;

        const BATCH_MAGIC: u32 = 0x56585458; // 'VXTX'
        const BATCH_VERSION: u32 = 1;

        if batch_ptr.is_null() || batch_len < 16 {
            if !stats_out.is_null() {
                unsafe {
                    *stats_out = 0;
                }
            }
            return ERR_INVALID_ARG;
        }

        let batch = unsafe { std::slice::from_raw_parts(batch_ptr, batch_len as usize) };
        let magic = u32::from_le_bytes([batch[0], batch[1], batch[2], batch[3]]);
        let version = u32::from_le_bytes([batch[4], batch[5], batch[6], batch[7]]);
        let item_count = u32::from_le_bytes([batch[8], batch[9], batch[10], batch[11]]);
        let total_bytes = u32::from_le_bytes([batch[12], batch[13], batch[14], batch[15]]);

        if magic != BATCH_MAGIC || version != BATCH_VERSION || batch_len < total_bytes || total_bytes < 16 {
            if !stats_out.is_null() {
                unsafe {
                    *stats_out = 0;
                }
            }
            return ERR_INVALID_ARG;
        }

        if item_count == 0 {
            if !stats_out.is_null() {
                unsafe {
                    *stats_out = 0;
                }
            }
            return OK;
        }

        let mut font_system = lock_or_recover(&SHARED_FONT_SYSTEM);
        let mut pctx_guard = crate::get_or_init_paint();
        let pctx = match pctx_guard.as_mut() {
            Some(p) => p,
            None => return ERR_GPU_DEVICE_LOST,
        };

        let (target_w, target_h) = if target_handle != 0 {
            pctx.targets
                .get(target_handle)
                .map(|t| (t.width as f32, t.height as f32))
                .unwrap_or((1920.0, 1080.0))
        } else {
            (1920.0, 1080.0)
        };
        let target_w = if target_w <= 0.0 { 1920.0 } else { target_w };
        let target_h = if target_h <= 0.0 { 1080.0 } else { target_h };

        let mut atlas_mgr = lock_or_recover(&SHARED_MSDF_ATLAS);

        struct CachedFace {
            family: String,
            weight: u16,
            italic: bool,
            data: std::sync::Arc<Vec<u8>>,
            face_index: u32,
            units_per_em: f32,
            ascender: f32,
        }

        let mut cached_face: Option<CachedFace> = None;
        let mut instances: Vec<paint::instances::MsdfGlyphInstance> = Vec::new();

        let mut offset: usize = 16;
        for _ in 0..item_count {
            if offset + 32 > total_bytes as usize {
                return ERR_INVALID_ARG;
            }
            let item = &batch[offset..];
            let x = f32::from_le_bytes([item[0], item[1], item[2], item[3]]);
            let y = f32::from_le_bytes([item[4], item[5], item[6], item[7]]);
            let font_size = f32::from_le_bytes([item[8], item[9], item[10], item[11]]);
            let line_height = f32::from_le_bytes([item[12], item[13], item[14], item[15]]);
            let max_width = f32::from_le_bytes([item[16], item[17], item[18], item[19]]);
            let color_rgba = u32::from_le_bytes([item[20], item[21], item[22], item[23]]);
            let weight = u16::from_le_bytes([item[24], item[25]]);
            let flags = u16::from_le_bytes([item[26], item[27]]);
            let italic = (flags & 1) != 0;
            let family_len = u16::from_le_bytes([item[28], item[29]]) as usize;
            let text_len = u16::from_le_bytes([item[30], item[31]]) as usize;

            let item_total = 32 + family_len + text_len;
            if offset + item_total > total_bytes as usize {
                return ERR_INVALID_ARG;
            }

            let family_bytes = &item[32..32 + family_len];
            let text_bytes = &item[32 + family_len..item_total];
            offset += item_total;

            let text = match std::str::from_utf8(text_bytes) {
                Ok(s) => s,
                Err(_) => return ERR_INVALID_ARG,
            };

            let family_str = match std::str::from_utf8(family_bytes) {
                Ok(s) => s,
                Err(_) => return ERR_INVALID_ARG,
            };

            if text.is_empty() || font_size <= 0.0 {
                continue;
            }

            let family_norm = if family_str.is_empty() {
                "sans-serif"
            } else {
                family_str
            };

            let is_match = match &cached_face {
                Some(cf) => cf.family == family_norm && cf.weight == weight && cf.italic == italic,
                None => false,
            };

            if !is_match {
                let families: Vec<&str> = family_norm.split('\0').collect();
                let resolved = font_system.query_face(&families, weight, italic);
                cached_face = match resolved {
                    Some(rf) => {
                        if let Some(parsed) = rf.parse() {
                            let units_per_em = parsed.units_per_em() as f32;
                            let ascender = parsed.ascender() as f32;
                            Some(CachedFace {
                                family: family_norm.to_string(),
                                weight,
                                italic,
                                data: rf.data.clone(),
                                face_index: rf.face_index,
                                units_per_em,
                                ascender,
                            })
                        } else {
                            None
                        }
                    }
                    None => None,
                };
            }

            let face = match &cached_face {
                Some(f) => f,
                None => continue,
            };

            let color_r = ((color_rgba >> 24) & 0xFF) as f32 / 255.0;
            let color_g = ((color_rgba >> 16) & 0xFF) as f32 / 255.0;
            let color_b = ((color_rgba >> 8) & 0xFF) as f32 / 255.0;
            let color_a = (color_rgba & 0xFF) as f32 / 255.0;

            let scale = font_size / face.units_per_em.max(1.0);
            let ascender = face.ascender;

            let text_layout = font::layout::layout_text(
                text,
                &face.data,
                face.face_index,
                font_size,
                line_height,
                max_width,
            );

            for (line_idx, line) in text_layout.lines.iter().enumerate() {
                let baseline_y = y + line_idx as f32 * line_height + ascender * scale;
                let mut pen_x = x;

                for ch in line.text.chars() {
                    let entry: Option<MsdfGlyphEntry> =
                        atlas_mgr.get_or_generate(&face.data, face.face_index, ch);

                    let (entry, _) = if entry.is_some() {
                        (entry, false)
                    } else {
                        let fallback_face = font_system.find_face_for_codepoint(ch, weight, italic);
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
        }

        let page_size = atlas_mgr.page_size();
        let stride = page_size * 4;
        for (page_idx, page) in atlas_mgr.pages.iter_mut().enumerate() {
            if page.dirty {
                let msdf_atlas_id = (page_idx as u32) + 2;
                if msdf_atlas_id <= 15 {
                    if !pctx.atlases.contains(msdf_atlas_id) || page.dirty_subregions.is_empty() {
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

        drop(atlas_mgr);
        drop(font_system);

        if instances.is_empty() {
            if !stats_out.is_null() {
                unsafe {
                    *stats_out = 0;
                }
            }
            return OK;
        }

        let total_glyphs = instances.len() as u32;
        let code = text::dispatch_glyph_instances(pctx, target_handle, &instances);

        if !stats_out.is_null() {
            unsafe {
                *stats_out = total_glyphs;
            }
        }
        code
    })
}

