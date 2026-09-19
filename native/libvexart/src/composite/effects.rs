// native/libvexart/src/composite/effects.rs
// Backdrop filter passes, blur downsampling/upsampling, and rounded rect clipping.

use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::paint::instances::{BackdropBlurInstance, BackdropFilterInstance, ImageMaskInstance};
use crate::paint::PaintContext;
use bytemuck::bytes_of;

pub(crate) fn source_image_size(pctx: &PaintContext, image: u64) -> Result<(u32, u32), i32> {
    match pctx.images.get(&image) {
        Some(img) => {
            let size = img.texture.size();
            Ok((size.width, size.height))
        }
        None => Err(ERR_INVALID_HANDLE),
    }
}

pub(crate) fn create_effect_destination(
    pctx: &mut PaintContext,
    _label: &'static str,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let current_frame = crate::current_frame();
    pctx.texture_pool
        .acquire(&pctx.wgpu.device, width, height, current_frame)
}

pub(crate) fn register_effect_output(
    pctx: &mut PaintContext,
    label: &'static str,
    texture: wgpu::Texture,
    view: wgpu::TextureView,
) -> u64 {
    let bind_group = pctx
        .wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(label),
            layout: &pctx.wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
                },
            ],
        });

    let handle = crate::paint::alloc_image_handle();
    let size = texture.size();
    pctx.images.insert(
        handle,
        crate::paint::ImageRecord {
            texture,
            view,
            bind_group,
            width: size.width,
            height: size.height,
            references: 1,
        },
    );
    handle
}

pub(crate) fn remove_temp_image(pctx: &mut PaintContext, handle: u64) {
    if let Some(img) = pctx.images.remove(&handle) {
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
            let current_frame = crate::current_frame();
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

pub(crate) fn render_blur_image(pctx: &mut PaintContext, image: u64, blur_radius: f32) -> Result<u64, i32> {
    let (src_w, src_h) = source_image_size(pctx, image)?;
    let (mid_texture, mid_view) =
        create_effect_destination(pctx, "vexart-blur-horizontal", src_w, src_h);
    let (dst_texture, dst_view) =
        create_effect_destination(pctx, "vexart-blur-vertical", src_w, src_h);

    let horizontal = BackdropBlurInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        blur_radius,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    let vertical = BackdropBlurInstance {
        _pad0: 1.0,
        ..horizontal
    };

    let h_bytes = bytes_of(&horizontal);
    let h_offset = pctx.alloc_vertex_space(h_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, h_offset as u64, h_bytes);

    let v_bytes = bytes_of(&vertical);
    let v_offset = pctx.alloc_vertex_space(v_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, v_offset as u64, v_bytes);

    let Some(src_img) = pctx.images.get(&image) else {
        return Err(ERR_INVALID_HANDLE);
    };
    let source_bind_group = pctx
        .wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-blur-source-bind-group"),
            layout: &pctx.wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&src_img.view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
                },
            ],
        });
    let mid_bind_group = pctx
        .wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-blur-horizontal-bind-group"),
            layout: &pctx.wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&mid_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
                },
            ],
        });

    let mut encoder = pctx
        .wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-blur-encoder"),
        });

    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-blur-horizontal-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &mid_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&pctx.wgpu.pipelines.backdrop_blur);
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(h_offset as u64..(h_offset + h_bytes.len()) as u64),
        );
        pass.set_bind_group(0, &source_bind_group, &[]);
        pass.draw(0..6, 0..1);
    }

    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-blur-vertical-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &dst_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&pctx.wgpu.pipelines.backdrop_blur);
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(v_offset as u64..(v_offset + v_bytes.len()) as u64),
        );
        pass.set_bind_group(0, &mid_bind_group, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));
    drop(mid_bind_group);
    let current_frame = crate::current_frame();
    pctx.texture_pool
        .release(mid_texture, mid_view, src_w, src_h, current_frame);
    Ok(register_effect_output(
        pctx,
        "vexart-blur-bind-group",
        dst_texture,
        dst_view,
    ))
}

pub(crate) fn render_color_filter_image(
    pctx: &mut PaintContext,
    image: u64,
    brightness: f32,
    contrast: f32,
    saturate: f32,
    grayscale: f32,
    invert: f32,
    sepia: f32,
    hue_rotate_deg: f32,
) -> Result<u64, i32> {
    let (src_w, src_h) = source_image_size(pctx, image)?;
    let (dst_texture, dst_view) =
        create_effect_destination(pctx, "vexart-filter-dst", src_w, src_h);

    let instance = BackdropFilterInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        brightness,
        contrast,
        saturate,
        grayscale,
        invert,
        sepia,
        hue_rotate_deg,
        _pad: 0.0,
    };

    let instance_bytes = bytes_of(&instance);
    let offset = pctx.alloc_vertex_space(instance_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, offset as u64, instance_bytes);

    let Some(src_img) = pctx.images.get(&image) else {
        return Err(ERR_INVALID_HANDLE);
    };
    let src_bg_ptr: *const wgpu::BindGroup = &src_img.bind_group as *const wgpu::BindGroup;

    let mut encoder = pctx
        .wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-filter-encoder"),
        });

    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-filter-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &dst_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&pctx.wgpu.pipelines.backdrop_filter);
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
        pass.set_bind_group(0, unsafe { &*src_bg_ptr }, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));
    Ok(register_effect_output(
        pctx,
        "vexart-filter-bind-group",
        dst_texture,
        dst_view,
    ))
}

/// Apply backdrop blur + color filter chain to an image, producing a new image handle.
///
/// `params_ptr` points to a 32-byte buffer: 8 × f32 in order:
///   blur, brightness, contrast, saturate, grayscale, invert, sepia, hue_rotate_deg
///
/// NaN means "parameter absent" from the TS caller.
/// Blur is applied first, then the 7-op color filter chain.
/// Returns the new image handle in `*out_image`.
pub fn image_filter_backdrop(
    pctx: &mut PaintContext,
    image: u64,
    params_ptr: *const u8,
    params_len: u32,
    out_image: *mut u64,
) -> i32 {
    if out_image.is_null() {
        return ERR_INVALID_ARG;
    }
    if params_ptr.is_null() || params_len < 32 {
        return ERR_INVALID_ARG;
    }

    // Read 8 filter params.
    // SAFETY: caller guarantees params_ptr is valid for params_len bytes.
    let params: &[f32] = unsafe { std::slice::from_raw_parts(params_ptr as *const f32, 8) };
    let blur_raw = params[0];
    let brightness_raw = params[1];
    let contrast_raw = params[2];
    let saturate_raw = params[3];
    let grayscale_raw = params[4];
    let invert_raw = params[5];
    let sepia_raw = params[6];
    let hue_rotate_deg_raw = params[7];

    let blur = if blur_raw.is_nan() {
        0.0
    } else {
        blur_raw.max(0.0)
    };
    let brightness = if brightness_raw.is_nan() {
        100.0
    } else {
        brightness_raw
    };
    let contrast = if contrast_raw.is_nan() {
        100.0
    } else {
        contrast_raw
    };
    let saturate = if saturate_raw.is_nan() {
        100.0
    } else {
        saturate_raw
    };
    let grayscale = if grayscale_raw.is_nan() {
        0.0
    } else {
        grayscale_raw
    };
    let invert = if invert_raw.is_nan() { 0.0 } else { invert_raw };
    let sepia = if sepia_raw.is_nan() { 0.0 } else { sepia_raw };
    let hue_rotate_deg = if hue_rotate_deg_raw.is_nan() {
        0.0
    } else {
        hue_rotate_deg_raw
    };

    let has_blur = blur > 0.0;
    let has_color = (brightness - 100.0).abs() > f32::EPSILON
        || (contrast - 100.0).abs() > f32::EPSILON
        || (saturate - 100.0).abs() > f32::EPSILON
        || grayscale.abs() > f32::EPSILON
        || invert.abs() > f32::EPSILON
        || sepia.abs() > f32::EPSILON
        || hue_rotate_deg.abs() > f32::EPSILON;

    if source_image_size(pctx, image).is_err() {
        return ERR_INVALID_HANDLE;
    }

    let mut current_image = image;
    let mut blur_image = None;

    if has_blur {
        let handle = match render_blur_image(pctx, current_image, blur) {
            Ok(handle) => handle,
            Err(code) => return code,
        };
        current_image = handle;
        blur_image = Some(handle);
    }

    if has_color {
        let filtered = match render_color_filter_image(
            pctx,
            current_image,
            brightness,
            contrast,
            saturate,
            grayscale,
            invert,
            sepia,
            hue_rotate_deg,
        ) {
            Ok(handle) => handle,
            Err(code) => {
                if let Some(handle) = blur_image {
                    remove_temp_image(pctx, handle);
                }
                return code;
            }
        };
        if let Some(handle) = blur_image {
            remove_temp_image(pctx, handle);
        }
        current_image = filtered;
    }

    if current_image == image {
        return ERR_INVALID_ARG;
    }

    unsafe { *out_image = current_image };
    OK
}

/// Shared rounded-rect image-mask implementation. `mask_rect` is optional so
/// the original full-image FFI remains ABI-compatible while clipped callers
/// can provide the original box in cropped-image NDC coordinates.
pub(crate) fn image_mask_rounded_rect_impl(
    pctx: &mut PaintContext,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
    mask_rect: Option<[f32; 4]>,
) -> i32 {
    if out_image.is_null() {
        return ERR_INVALID_ARG;
    }
    if rect_ptr.is_null() {
        return ERR_INVALID_ARG;
    }

    // Read 6 f32 params: radius_uniform, tl, tr, br, bl, mode.
    // SAFETY: caller guarantees rect_ptr is valid for 24 bytes.
    let params: &[f32] = unsafe { std::slice::from_raw_parts(rect_ptr as *const f32, 6) };
    let radius_uniform = params[0];
    let radius_tl = params[1];
    let radius_tr = params[2];
    let radius_br = params[3];
    let radius_bl = params[4];
    let mode = params[5];

    // Determine source image size.
    let (src_w, src_h) = match pctx.images.get(&image) {
        Some(img) => {
            let size = img.texture.size();
            (size.width, size.height)
        }
        None => return ERR_INVALID_HANDLE,
    };

    // Create destination texture.
    let (dst_texture, dst_view) =
        create_effect_destination(pctx, "vexart-mask-dst", src_w, src_h);

    // Build mask instance (full-NDC quad, mask fills same region).
    let instance = ImageMaskInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        mask_x: mask_rect.map(|rect| rect[0]).unwrap_or(-1.0),
        mask_y: mask_rect.map(|rect| rect[1]).unwrap_or(-1.0),
        mask_w: mask_rect.map(|rect| rect[2]).unwrap_or(2.0),
        mask_h: mask_rect.map(|rect| rect[3]).unwrap_or(2.0),
        radius_uniform,
        radius_tl,
        radius_tr,
        radius_br,
        radius_bl,
        mode,
        _pad0: 0.0,
        _pad1: 0.0,
    };

    let instance_bytes = bytes_of(&instance);
    let offset = pctx.alloc_vertex_space(instance_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, offset as u64, instance_bytes);

    // Extract source bind group before mutable ops.
    let Some(src_img) = pctx.images.get(&image) else {
        return ERR_INVALID_HANDLE;
    };
    let src_bg_ptr: *const wgpu::BindGroup = &src_img.bind_group as *const wgpu::BindGroup;

    let mut encoder = pctx
        .wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-mask-encoder"),
        });

    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-mask-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &dst_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&pctx.wgpu.pipelines.image_mask);
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
        // SAFETY: src_bg_ptr is stable — image is in pctx.images (heap map).
        pass.set_bind_group(0, unsafe { &*src_bg_ptr }, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));

    // Register new image.
    let dst_bind_group = pctx
        .wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-mask-bind-group"),
            layout: &pctx.wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&dst_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
                },
            ],
        });

    let handle = crate::paint::alloc_image_handle();
    pctx.images.insert(
        handle,
        crate::paint::ImageRecord {
            texture: dst_texture,
            view: dst_view,
            bind_group: dst_bind_group,
            width: src_w,
            height: src_h,
            references: 1,
        },
    );

    // SAFETY: out_image is non-null (checked above).
    unsafe { *out_image = handle };
    OK
}

/// Apply a rounded-rect SDF mask to an image, producing a new image handle.
///
/// `rect_ptr` points to a 24-byte buffer containing radius_uniform,
/// radius_tl, radius_tr, radius_br, radius_bl, and mode.
pub fn image_mask_rounded_rect(
    pctx: &mut PaintContext,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    image_mask_rounded_rect_impl(pctx, image, rect_ptr, out_image, None)
}

/// Apply a rounded-rect mask while retaining the original box geometry for a
/// cropped source image. The 40-byte buffer contains the six radius/mode
/// values followed by mask_x, mask_y, mask_w, and mask_h in output NDC.
pub fn image_mask_rounded_rect_region(
    pctx: &mut PaintContext,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    if rect_ptr.is_null() {
        return ERR_INVALID_ARG;
    }
    // SAFETY: this internal boundary requires the caller's 40-byte region
    // buffer; the public six-float function above keeps its original contract.
    let params: &[f32] = unsafe { std::slice::from_raw_parts(rect_ptr as *const f32, 10) };
    let mask_rect = [params[6], params[7], params[8], params[9]];
    image_mask_rounded_rect_impl(pctx, image, rect_ptr, out_image, Some(mask_rect))
}

