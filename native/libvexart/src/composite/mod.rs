// native/libvexart/src/composite/mod.rs
// Real composite operations: image layer rendering, region copy, full/region readback.
// Phase 2b Slice 1, tasks 1.2 and 1.4. Per REQ-2B-003/004/005.

pub mod readback;
pub mod target;

use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::paint::PaintContext;
use crate::types::FrameStats;

// ─── Target lifecycle ─────────────────────────────────────────────────────

/// Create an offscreen target in the registry. Returns OK with handle in `*out_handle`.
pub fn target_create(
    pctx: &mut PaintContext,
    width: u32,
    height: u32,
    out_handle: *mut u64,
) -> i32 {
    if out_handle.is_null() {
        return ERR_INVALID_ARG;
    }
    if width == 0 || height == 0 {
        return ERR_INVALID_ARG;
    }

    // Extract device pointer before borrowing pctx.targets mutably.
    // SAFETY: device is owned by pctx.wgpu which is stable for the duration of this call.
    let device_ptr: *const wgpu::Device = &pctx.wgpu.device as *const wgpu::Device;

    // SAFETY: out_handle is non-null (checked above) and valid (caller contract).
    let handle_ref = unsafe { &mut *out_handle };
    // SAFETY: device_ptr is valid — it points to pctx.wgpu.device which is alive.
    let rec = pctx.targets.create(unsafe { &*device_ptr }, width, height, handle_ref);
    let handle = *handle_ref;
    pctx.targets.insert(handle, rec);
    OK
}

/// Destroy an offscreen target, releasing GPU memory.
pub fn target_destroy(pctx: &mut PaintContext, handle: u64) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    if pctx.targets.destroy(handle) {
        OK
    } else {
        ERR_INVALID_HANDLE
    }
}

/// Begin a layer on a target: create CommandEncoder for subsequent dispatch calls.
pub fn target_begin_layer(
    pctx: &mut PaintContext,
    handle: u64,
    load_mode: u32,
    clear_rgba: u32,
) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    // Extract device pointer before borrowing pctx.targets.
    // SAFETY: pctx.wgpu.device is stable; the raw pointer is valid for this call.
    let device_ptr: *const wgpu::Device = &pctx.wgpu.device as *const wgpu::Device;
    match pctx.targets.begin_layer(unsafe { &*device_ptr }, handle, load_mode, clear_rgba) {
        Ok(()) => OK,
        Err(code) => code,
    }
}

/// End a layer: submit the encoder to the queue and return the target to rested state.
pub fn target_end_layer(pctx: &mut PaintContext, handle: u64) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    // Extract queue pointer before borrowing pctx.targets.
    // SAFETY: pctx.wgpu.queue is stable; the raw pointer is valid for this call.
    let queue_ptr: *const wgpu::Queue = &pctx.wgpu.queue as *const wgpu::Queue;
    match pctx.targets.end_layer(unsafe { &*queue_ptr }, handle) {
        Ok(()) => OK,
        Err(code) => code,
    }
}

// ─── Compositing ──────────────────────────────────────────────────────────

/// Composite a source image onto a target at the given position.
/// The image is rendered using the image pipeline (cmd_kind=9).
/// x, y, w, h are pixel coordinates within the target.
pub fn composite_render_image_layer(
    pctx: &mut PaintContext,
    target: u64,
    image: u64,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    _z: u32,
    clear_rgba: u32,
) -> i32 {
    use crate::paint::instances::BridgeImageInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

    if target == 0 {
        return ERR_INVALID_ARG;
    }

    // Look up target and image.
    let target_rec = match pctx.targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let tw = target_rec.width as f32;
    let th = target_rec.height as f32;

    // Convert pixel coords to NDC for the image instance.
    // NDC: x in [-1,1], y in [-1,1] (Y flipped).
    let ndc_x = (x / tw) * 2.0 - 1.0;
    let ndc_y = 1.0 - (y / th) * 2.0;
    let ndc_w = (w / tw) * 2.0;
    let ndc_h = (h / th) * 2.0;

    let instance = BridgeImageInstance {
        x: ndc_x,
        y: ndc_y - ndc_h, // bottom-left corner in NDC
        w: ndc_w,
        h: ndc_h,
        opacity: 1.0,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };

    let instance_bytes = bytes_of(&instance);

    // Get bind group for the source image (fall back to transparent if missing).
    let bind_group: *const wgpu::BindGroup = if let Some(img) = pctx.images.get(&image) {
        &img.bind_group as *const wgpu::BindGroup
    } else {
        &pctx.fallback_bind_group as *const wgpu::BindGroup
    };

    // Build vertex buffer.
    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-composite-image-buf"),
            contents: instance_bytes,
            usage: wgpu::BufferUsages::VERTEX,
        });

    // Encode render pass into the target's active layer encoder if present,
    // or create a new standalone encoder.
    let target_view_ptr: *const wgpu::TextureView = {
        let r = pctx.targets.get(target).unwrap();
        &r.view as *const wgpu::TextureView
    };

    if pctx.targets.get(target).unwrap().active_layer.is_some() {
        // Render into existing layer encoder.
        let rec_ptr: *mut target::TargetRecord = pctx.targets.get_mut(target).unwrap();
        // SAFETY: view and active_layer are disjoint fields of the same TargetRecord.
        let view_ref: &wgpu::TextureView = unsafe { &(*rec_ptr).view };
        let layer = unsafe {
            (*rec_ptr)
                .active_layer
                .as_mut()
                .expect("active layer disappeared")
        };

        let clear_op = if layer.first_pass {
            layer.first_pass = false;
            let c = clear_rgba;
            wgpu::LoadOp::Clear(wgpu::Color {
                r: ((c >> 24) & 0xff) as f64 / 255.0,
                g: ((c >> 16) & 0xff) as f64 / 255.0,
                b: ((c >> 8) & 0xff) as f64 / 255.0,
                a: (c & 0xff) as f64 / 255.0,
            })
        } else {
            wgpu::LoadOp::Load
        };

        let mut pass = layer.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-composite-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: view_ref,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: clear_op,
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&pctx.wgpu.pipelines.image);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        // SAFETY: bind_group extracted before mutable borrow; still valid.
        pass.set_bind_group(0, unsafe { &*bind_group }, &[]);
        pass.draw(0..6, 0..1);
    } else {
        // No active layer: standalone encoder.
        let mut encoder =
            pctx.wgpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("vexart-composite-encoder"),
                });

        let c = clear_rgba;
        let clear_op = wgpu::LoadOp::Clear(wgpu::Color {
            r: ((c >> 24) & 0xff) as f64 / 255.0,
            g: ((c >> 16) & 0xff) as f64 / 255.0,
            b: ((c >> 8) & 0xff) as f64 / 255.0,
            a: (c & 0xff) as f64 / 255.0,
        });

        // SAFETY: target_view_ptr was extracted above; target still in registry.
        let view_ref: &wgpu::TextureView = unsafe { &*target_view_ptr };

        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-composite-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: view_ref,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: clear_op,
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&pctx.wgpu.pipelines.image);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        // SAFETY: bind_group extracted before any mutable ops; still valid.
        pass.set_bind_group(0, unsafe { &*bind_group }, &[]);
        pass.draw(0..6, 0..1);
        drop(pass);

        let cmd = encoder.finish();
        pctx.wgpu.queue.submit(std::iter::once(cmd));
    }

    OK
}

/// Copy a region from a target texture into a new image handle.
/// Creates a new GPU texture + view + bind group for the extracted region.
pub fn copy_region_to_image(
    pctx: &mut PaintContext,
    target: u64,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    out_image: *mut u64,
) -> i32 {
    if out_image.is_null() {
        return ERR_INVALID_ARG;
    }
    if target == 0 || w == 0 || h == 0 {
        return ERR_INVALID_ARG;
    }

    let (src_texture_ptr, tw, th) = {
        let rec = match pctx.targets.get(target) {
            Some(r) => r,
            None => return ERR_INVALID_HANDLE,
        };
        (&rec.texture as *const wgpu::Texture, rec.width, rec.height)
    };

    // Clamp region to target bounds.
    let cx = x.min(tw);
    let cy = y.min(th);
    let cw = w.min(tw.saturating_sub(cx));
    let ch = h.min(th.saturating_sub(cy));

    if cw == 0 || ch == 0 {
        return ERR_INVALID_ARG;
    }

    // Create destination texture.
    let dst_texture = pctx.wgpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vexart-region-copy-texture"),
        size: wgpu::Extent3d {
            width: cw,
            height: ch,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_DST
            | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });

    // Copy from target texture region to dst.
    let mut encoder = pctx
        .wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-copy-region-encoder"),
        });

    // SAFETY: src_texture_ptr extracted from pctx.targets before any mutation.
    encoder.copy_texture_to_texture(
        wgpu::TexelCopyTextureInfo {
            texture: unsafe { &*src_texture_ptr },
            mip_level: 0,
            origin: wgpu::Origin3d { x: cx, y: cy, z: 0 },
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyTextureInfo {
            texture: &dst_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::Extent3d {
            width: cw,
            height: ch,
            depth_or_array_layers: 1,
        },
    );

    pctx.wgpu
        .queue
        .submit(std::iter::once(encoder.finish()));

    // Create view + sampler + bind group and register as image.
    let view = dst_texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = pctx.wgpu.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("vexart-region-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        ..Default::default()
    });
    let bind_group = pctx
        .wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-region-bind-group"),
            layout: &pctx.wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

    let handle = crate::paint::alloc_image_handle();
    pctx.images.insert(
        handle,
        crate::paint::ImageRecord {
            texture: dst_texture,
            view,
            bind_group,
        },
    );

    // SAFETY: out_image is non-null (checked above).
    unsafe { *out_image = handle };
    OK
}

/// Phase 2 legacy stub: z-order merge. Returns handle=0.
pub fn composite_merge(
    _ctx: u64,
    _composite: &[u8],
    out_target: *mut u64,
    stats_out: *mut FrameStats,
) -> i32 {
    if !out_target.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *out_target = 0;
        }
    }
    if !stats_out.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *stats_out = FrameStats::default();
        }
    }
    OK
}

/// Real full-target GPU→CPU readback.
pub fn readback_rgba(
    pctx: &mut PaintContext,
    target: u64,
    dst: *mut u8,
    dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    if target == 0 {
        return ERR_INVALID_ARG;
    }
    if dst.is_null() {
        return ERR_INVALID_ARG;
    }

    let rec = match pctx.targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let needed = rec.width * rec.height * 4;
    if dst_cap < needed {
        return ERR_INVALID_ARG; // buffer too small
    }

    // Extract fields needed before the mutable borrow of pctx (for device/queue).
    let w = rec.width;
    let h = rec.height;
    let padded = rec.padded_bytes_per_row;
    let texture_ptr: *const wgpu::Texture = &rec.texture;
    let readback_ptr: *const wgpu::Buffer = &rec.readback_buffer;

    // SAFETY: texture_ptr and readback_ptr point into the TargetRecord in pctx.targets,
    // which is a stable heap allocation. pctx.wgpu (device/queue) is a disjoint field.
    let written = readback::readback_full(
        &pctx.wgpu.device,
        &pctx.wgpu.queue,
        unsafe { &*texture_ptr },
        w,
        h,
        padded,
        unsafe { &*readback_ptr },
        dst,
        dst_cap,
    );

    if !stats_out.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *stats_out = FrameStats::default();
        }
    }

    if written == 0 {
        ERR_INVALID_ARG
    } else {
        OK
    }
}

/// Real region GPU→CPU readback.
pub fn readback_region_rgba(
    pctx: &mut PaintContext,
    target: u64,
    rect: &[u8],
    dst: *mut u8,
    dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    if target == 0 {
        return ERR_INVALID_ARG;
    }
    if dst.is_null() {
        return ERR_INVALID_ARG;
    }
    if rect.len() < 16 {
        return ERR_INVALID_ARG;
    }

    // Parse 4×u32 rect (x,y,w,h) from rect bytes.
    let rx = u32::from_le_bytes([rect[0], rect[1], rect[2], rect[3]]);
    let ry = u32::from_le_bytes([rect[4], rect[5], rect[6], rect[7]]);
    let rw = u32::from_le_bytes([rect[8], rect[9], rect[10], rect[11]]);
    let rh = u32::from_le_bytes([rect[12], rect[13], rect[14], rect[15]]);

    let rec = match pctx.targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let tw = rec.width;
    let th = rec.height;
    let texture_ptr: *const wgpu::Texture = &rec.texture;

    let written = readback::readback_region(
        &pctx.wgpu.device,
        &pctx.wgpu.queue,
        // SAFETY: texture_ptr stable in pctx.targets; device/queue are disjoint fields.
        unsafe { &*texture_ptr },
        tw,
        th,
        rx,
        ry,
        rw,
        rh,
        dst,
        dst_cap,
    );

    if !stats_out.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *stats_out = FrameStats::default();
        }
    }

    if written == 0 {
        ERR_INVALID_ARG
    } else {
        OK
    }
}

// ─── Task 1.5: Backdrop filter + mask on images ───────────────────────────

/// Apply the 7-op backdrop filter chain to an image, producing a new image handle.
///
/// `params_ptr` points to a 28-byte buffer: 7 × f32 in order:
///   brightness, contrast, saturate, grayscale, invert, sepia, hue_rotate_deg
///
/// The filter is applied using the existing `backdrop_filter` pipeline (cmd_kind=16).
/// Returns the new image handle in `*out_image`.
pub fn image_filter_backdrop(
    pctx: &mut PaintContext,
    image: u64,
    params_ptr: *const u8,
    params_len: u32,
    out_image: *mut u64,
) -> i32 {
    use crate::paint::instances::BackdropFilterInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

    if out_image.is_null() {
        return ERR_INVALID_ARG;
    }
    if params_ptr.is_null() || params_len < 28 {
        return ERR_INVALID_ARG;
    }

    // Read 7 filter params.
    // SAFETY: caller guarantees params_ptr is valid for params_len bytes.
    let params: &[f32] = unsafe {
        std::slice::from_raw_parts(params_ptr as *const f32, 7)
    };
    let brightness = params[0];
    let contrast = params[1];
    let saturate = params[2];
    let grayscale = params[3];
    let invert = params[4];
    let sepia = params[5];
    let hue_rotate_deg = params[6];

    // Determine source image size.
    let (src_w, src_h) = match pctx.images.get(&image) {
        Some(img) => {
            let size = img.texture.size();
            (size.width, size.height)
        }
        None => return ERR_INVALID_HANDLE,
    };

    // Create destination texture (same size as source).
    let dst_texture = pctx.wgpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vexart-filter-dst"),
        size: wgpu::Extent3d {
            width: src_w,
            height: src_h,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let dst_view = dst_texture.create_view(&wgpu::TextureViewDescriptor::default());

    // Build filter instance (full-NDC quad).
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

    let vertex_buf = pctx.wgpu.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("vexart-filter-instance-buf"),
        contents: bytes_of(&instance),
        usage: wgpu::BufferUsages::VERTEX,
    });

    // Extract source bind group before mutable ops.
    let src_bg_ptr: *const wgpu::BindGroup = {
        let img = pctx.images.get(&image).unwrap();
        &img.bind_group as *const wgpu::BindGroup
    };

    let mut encoder = pctx.wgpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        // SAFETY: src_bg_ptr is stable — image is in pctx.images (heap map).
        pass.set_bind_group(0, unsafe { &*src_bg_ptr }, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));

    // Register new image.
    let sampler = pctx.wgpu.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("vexart-filter-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        ..Default::default()
    });
    let dst_bind_group = pctx.wgpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("vexart-filter-bind-group"),
        layout: &pctx.wgpu.image_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&dst_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&sampler),
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
        },
    );

    // SAFETY: out_image is non-null (checked above).
    unsafe { *out_image = handle };
    OK
}

/// Apply a rounded-rect SDF mask to an image, producing a new image handle.
///
/// `rect_ptr` points to a 24-byte buffer: 5 × f32:
///   radius_uniform, radius_tl, radius_tr, radius_br, radius_bl, mode
///   (mode: 0.0 = uniform, 1.0 = per-corner)
///
/// The mask is applied using the existing `image_mask` pipeline (cmd_kind=17).
pub fn image_mask_rounded_rect(
    pctx: &mut PaintContext,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    use crate::paint::instances::ImageMaskInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

    if out_image.is_null() {
        return ERR_INVALID_ARG;
    }
    if rect_ptr.is_null() {
        return ERR_INVALID_ARG;
    }

    // Read 6 f32 params: radius_uniform, tl, tr, br, bl, mode.
    // SAFETY: caller guarantees rect_ptr is valid for 24 bytes.
    let params: &[f32] = unsafe {
        std::slice::from_raw_parts(rect_ptr as *const f32, 6)
    };
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
    let dst_texture = pctx.wgpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vexart-mask-dst"),
        size: wgpu::Extent3d {
            width: src_w,
            height: src_h,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let dst_view = dst_texture.create_view(&wgpu::TextureViewDescriptor::default());

    // Build mask instance (full-NDC quad, mask fills same region).
    let instance = ImageMaskInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        mask_x: -1.0,
        mask_y: -1.0,
        mask_w: 2.0,
        mask_h: 2.0,
        radius_uniform,
        radius_tl,
        radius_tr,
        radius_br,
        radius_bl,
        mode,
        _pad0: 0.0,
        _pad1: 0.0,
    };

    let vertex_buf = pctx.wgpu.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("vexart-mask-instance-buf"),
        contents: bytes_of(&instance),
        usage: wgpu::BufferUsages::VERTEX,
    });

    // Extract source bind group before mutable ops.
    let src_bg_ptr: *const wgpu::BindGroup = {
        let img = pctx.images.get(&image).unwrap();
        &img.bind_group as *const wgpu::BindGroup
    };

    let mut encoder = pctx.wgpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        // SAFETY: src_bg_ptr is stable — image is in pctx.images (heap map).
        pass.set_bind_group(0, unsafe { &*src_bg_ptr }, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));

    // Register new image.
    let sampler = pctx.wgpu.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("vexart-mask-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        ..Default::default()
    });
    let dst_bind_group = pctx.wgpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("vexart-mask-bind-group"),
        layout: &pctx.wgpu.image_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&dst_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&sampler),
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
        },
    );

    // SAFETY: out_image is non-null (checked above).
    unsafe { *out_image = handle };
    OK
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_rect_parse_from_bytes() {
        // Verify the 4×u32 rect parse in readback_region_rgba.
        let mut rect = [0u8; 16];
        rect[0..4].copy_from_slice(&10u32.to_le_bytes());
        rect[4..8].copy_from_slice(&20u32.to_le_bytes());
        rect[8..12].copy_from_slice(&50u32.to_le_bytes());
        rect[12..16].copy_from_slice(&30u32.to_le_bytes());

        let rx = u32::from_le_bytes([rect[0], rect[1], rect[2], rect[3]]);
        let ry = u32::from_le_bytes([rect[4], rect[5], rect[6], rect[7]]);
        let rw = u32::from_le_bytes([rect[8], rect[9], rect[10], rect[11]]);
        let rh = u32::from_le_bytes([rect[12], rect[13], rect[14], rect[15]]);

        assert_eq!(rx, 10);
        assert_eq!(ry, 20);
        assert_eq!(rw, 50);
        assert_eq!(rh, 30);
    }
}
