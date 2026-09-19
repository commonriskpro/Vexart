// native/libvexart/src/composite/copy.rs
// Region copy and GPU-to-CPU readback operations.

use crate::composite::readback;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::paint::instances::ImageCopyInstance;
use crate::paint::PaintContext;
use crate::types::FrameStats;
use bytemuck::bytes_of;

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

    let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
    if cw > max_dim || ch > max_dim {
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

    // Target render attachments use premultiplied storage after alpha
    // blending. Convert the cropped region back to straight RGBA before
    // registering it as an image: uploaded images use straight RGBA, and the
    // normal image compositor applies alpha exactly once.
    let source_view =
        unsafe { (&*src_texture_ptr).create_view(&wgpu::TextureViewDescriptor::default()) };
    let source_bind_group = pctx
        .wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-region-source-bind-group"),
            layout: &pctx.wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&source_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
                },
            ],
        });
    let instance = ImageCopyInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        source_u0: cx as f32 / tw as f32,
        source_v0: cy as f32 / th as f32,
        source_u1: (cx + cw) as f32 / tw as f32,
        source_v1: (cy + ch) as f32 / th as f32,
    };
    let instance_bytes = bytes_of(&instance);
    let offset = pctx.alloc_vertex_space(instance_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, offset as u64, instance_bytes);
    let mut encoder = pctx
        .wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-copy-region-encoder"),
        });

    let dst_view = dst_texture.create_view(&wgpu::TextureViewDescriptor::default());
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-region-copy-pass"),
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
        pass.set_pipeline(&pctx.wgpu.pipelines.image_unpremultiply);
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
        pass.set_bind_group(0, &source_bind_group, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));

    // Create view + bind group and register as image.
    let view = dst_view;
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
                    resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
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
            width: cw,
            height: ch,
            references: 1,
        },
    );

    // SAFETY: out_image is non-null (checked above).
    unsafe { *out_image = handle };
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

    let rec = match pctx.targets.get_mut(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let needed = match rec
        .width
        .checked_mul(rec.height)
        .and_then(|px| px.checked_mul(4))
    {
        Some(bytes) => bytes,
        None => return ERR_INVALID_ARG,
    };

    if dst_cap < needed {
        return ERR_INVALID_ARG;
    }

    // Extract fields needed before the mutable borrow of pctx (for device/queue).
    let w = rec.width;
    let h = rec.height;
    rec.advance_staging_slot();
    let (storage_buf, staging_buf, bind_group) = match rec
        .ensure_readback_buffers(&pctx.wgpu.device, &pctx.wgpu.pipelines.unpremultiply_bgl)
    {
        Some(bufs) => bufs,
        None => return ERR_INVALID_ARG,
    };
    let storage_ptr: *const wgpu::Buffer = storage_buf;
    let readback_ptr: *const wgpu::Buffer = staging_buf;
    let bg_ptr: *const wgpu::BindGroup = bind_group;
    let pipeline_ptr: *const wgpu::ComputePipeline = &pctx.wgpu.pipelines.unpremultiply_pack;

    // SAFETY: storage_ptr, readback_ptr, bg_ptr point into the TargetRecord in pctx.targets,
    // which is a stable heap allocation. pipeline_ptr points into pctx.wgpu.pipelines.
    // pctx.wgpu (device/queue) is a disjoint field.
    let written = readback::readback_full(
        &pctx.wgpu.device,
        &pctx.wgpu.queue,
        unsafe { &*pipeline_ptr },
        unsafe { &*bg_ptr },
        unsafe { &*storage_ptr },
        unsafe { &*readback_ptr },
        w,
        h,
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

    if rw == 0 || rh == 0 {
        return ERR_INVALID_ARG;
    }

    let rec = match pctx.targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let tw = rec.width;
    let th = rec.height;

    let right = match rx.checked_add(rw) {
        Some(val) => val,
        None => return ERR_INVALID_ARG,
    };
    let bottom = match ry.checked_add(rh) {
        Some(val) => val,
        None => return ERR_INVALID_ARG,
    };
    if right > tw || bottom > th {
        return ERR_INVALID_ARG;
    }

    let needed = match rw
        .checked_mul(rh)
        .and_then(|px| px.checked_mul(4))
    {
        Some(bytes) => bytes,
        None => return ERR_INVALID_ARG,
    };
    if dst_cap < needed {
        return ERR_INVALID_ARG;
    }

    let view_ptr: *const wgpu::TextureView = &rec.view;
    let pool = pctx.ensure_regional_pool() as *mut readback::RegionalReadbackPool;

    let written = readback::readback_region(
        unsafe { &mut *pool },
        &pctx.wgpu.device,
        &pctx.wgpu.queue,
        &pctx.wgpu.pipelines.unpremultiply_pack,
        &pctx.wgpu.pipelines.unpremultiply_bgl,
        // SAFETY: view_ptr points to rec.view in pctx.targets; device/queue/pool are disjoint fields.
        unsafe { &*view_ptr },
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

