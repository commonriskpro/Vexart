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

    let (wgpu, targets, _, _, _, _) = pctx.split();
    let handle_ref = unsafe { &mut *out_handle };
    let rec = targets.create(&wgpu.device, width, height, handle_ref);
    let handle = *handle_ref;
    targets.insert(handle, rec);
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
    let (wgpu, targets, _, _, _, _) = pctx.split();
    match targets.begin_layer(&wgpu.device, handle, load_mode, clear_rgba) {
        Ok(()) => OK,
        Err(code) => code,
    }
}

/// End a layer: submit the encoder to the queue and return the target to rested state.
pub fn target_end_layer(pctx: &mut PaintContext, handle: u64) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    let (wgpu, targets, _, _, _, _) = pctx.split();
    match targets.end_layer(&wgpu.queue, handle) {
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

    let (wgpu, targets, images, _, _, fallback_bg) = pctx.split();
    let target_rec = match targets.get(target) {
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
        y: ndc_y, // top-left corner in NDC
        w: ndc_w,
        h: -ndc_h,
        opacity: 1.0,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };

    let instance_bytes = bytes_of(&instance);

    // Get bind group for the source image (fall back to transparent if missing).
    let bind_group = if let Some(img) = images.get(&image) {
        &img.bind_group
    } else {
        fallback_bg
    };

    // Build vertex buffer.
    let vertex_buf = wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-composite-image-buf"),
            contents: instance_bytes,
            usage: wgpu::BufferUsages::VERTEX,
        });

    // Encode render pass into the target's active layer encoder if present,
    // or create a new standalone encoder.
    let has_layer = targets
        .get(target)
        .map(|rec| rec.active_layer.is_some())
        .unwrap_or(false);
    if has_layer {
        // Render into existing layer encoder.
        let Some(rec) = targets.get_mut(target) else { return ERR_INVALID_HANDLE; };
        let Some(layer) = rec.active_layer.as_mut() else { return ERR_INVALID_ARG; };
        let view_ref = &rec.view;

        let clear_op = if layer.first_pass {
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

        pass.set_pipeline(&wgpu.pipelines.image);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..6, 0..1);
    } else {
        // No active layer: standalone encoder.
        let mut encoder = wgpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
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
        let Some(view_ref) = targets.get(target).map(|rec| &rec.view) else { return ERR_INVALID_HANDLE; };

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

        pass.set_pipeline(&wgpu.pipelines.image);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        // SAFETY: bind_group extracted before any mutable ops; still valid.
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..6, 0..1);
        drop(pass);

        let cmd = encoder.finish();
        wgpu.queue.submit(std::iter::once(cmd));
    }

    OK
}

/// Composite a source image onto a target using an explicit transformed quad + opacity.
/// The image is rendered using the image-transform pipeline (cmd_kind=10 equivalent),
/// but with the real source image bind group instead of the fallback dummy texture.
pub fn composite_render_image_transform_layer(
    pctx: &mut PaintContext,
    target: u64,
    image: u64,
    params: &[u8],
    clear_rgba: u32,
) -> i32 {
    use crate::paint::instances::BridgeImageTransformInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

    if target == 0 || params.len() < std::mem::size_of::<BridgeImageTransformInstance>() {
        return ERR_INVALID_ARG;
    }

    let (wgpu, targets, images, _, _, fallback_bg) = pctx.split();
    let target_rec = match targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let bind_group = if let Some(img) = images.get(&image) {
        &img.bind_group
    } else {
        fallback_bg
    };

    let instance = bytemuck::pod_read_unaligned::<BridgeImageTransformInstance>(
        &params[..std::mem::size_of::<BridgeImageTransformInstance>()],
    );
    let instance_bytes = bytes_of(&instance);

    let vertex_buf = wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-composite-image-transform-buf"),
            contents: instance_bytes,
            usage: wgpu::BufferUsages::VERTEX,
        });

    let target_width = target_rec.width;
    let _ = target_width;

    let has_layer = targets
        .get(target)
        .map(|rec| rec.active_layer.is_some())
        .unwrap_or(false);
    if has_layer {
        let Some(rec) = targets.get_mut(target) else { return ERR_INVALID_HANDLE; };
        let Some(layer) = rec.active_layer.as_mut() else { return ERR_INVALID_ARG; };
        let view_ref = &rec.view;

        let clear_op = if layer.first_pass {
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
                label: Some("vexart-composite-transform-pass"),
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

        pass.set_pipeline(&wgpu.pipelines.image_transform);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..6, 0..1);
    } else {
        let mut encoder = wgpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-composite-transform-encoder"),
        });

        let c = clear_rgba;
        let clear_op = wgpu::LoadOp::Clear(wgpu::Color {
            r: ((c >> 24) & 0xff) as f64 / 255.0,
            g: ((c >> 16) & 0xff) as f64 / 255.0,
            b: ((c >> 8) & 0xff) as f64 / 255.0,
            a: (c & 0xff) as f64 / 255.0,
        });

        let Some(view_ref) = targets.get(target).map(|rec| &rec.view) else { return ERR_INVALID_HANDLE; };
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-composite-transform-pass"),
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

        pass.set_pipeline(&wgpu.pipelines.image_transform);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..6, 0..1);
        drop(pass);

        let cmd = encoder.finish();
        wgpu.queue.submit(std::iter::once(cmd));
    }

    OK
}

/// Composite a retained source target onto another target using an explicit transformed quad + opacity.
/// This is the retained compositor-path uniform update primitive for transform/opacity-only frames.
pub fn composite_update_uniform(
    pctx: &mut PaintContext,
    target: u64,
    source_target: u64,
    params: &[u8],
    clear_rgba: u32,
) -> i32 {
    use crate::paint::instances::BridgeImageTransformInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

    if target == 0
        || source_target == 0
        || params.len() < std::mem::size_of::<BridgeImageTransformInstance>()
    {
        return ERR_INVALID_ARG;
    }

    let (wgpu, targets, _, _, _, _) = pctx.split();
    let bind_group = {
        let source_rec = match targets.get(source_target) {
            Some(r) => r,
            None => return ERR_INVALID_HANDLE,
        };
        wgpu
            .device
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("vexart-composite-uniform-bind-group"),
                layout: &wgpu.image_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&source_rec.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&wgpu.cached_sampler),
                    },
                ],
            })
    };

    let instance = bytemuck::pod_read_unaligned::<BridgeImageTransformInstance>(
        &params[..std::mem::size_of::<BridgeImageTransformInstance>()],
    );
    let instance_bytes = bytes_of(&instance);

    let vertex_buf = wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-composite-uniform-buf"),
            contents: instance_bytes,
            usage: wgpu::BufferUsages::VERTEX,
        });

    if targets.get(target).is_none() {
        return ERR_INVALID_HANDLE;
    }
    let has_layer = targets
        .get(target)
        .map(|rec| rec.active_layer.is_some())
        .unwrap_or(false);

    if has_layer {
        let Some(rec) = targets.get_mut(target) else { return ERR_INVALID_HANDLE; };
        let Some(layer) = rec.active_layer.as_mut() else { return ERR_INVALID_ARG; };
        let view_ref = &rec.view;

        let clear_op = if layer.first_pass {
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
                label: Some("vexart-composite-uniform-pass"),
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

        pass.set_pipeline(&wgpu.pipelines.image_transform);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..6, 0..1);
    } else {
        let mut encoder = wgpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-composite-uniform-encoder"),
        });

        let c = clear_rgba;
        let clear_op = wgpu::LoadOp::Clear(wgpu::Color {
            r: ((c >> 24) & 0xff) as f64 / 255.0,
            g: ((c >> 16) & 0xff) as f64 / 255.0,
            b: ((c >> 8) & 0xff) as f64 / 255.0,
            a: (c & 0xff) as f64 / 255.0,
        });

        let Some(view_ref) = targets.get(target).map(|rec| &rec.view) else { return ERR_INVALID_HANDLE; };
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-composite-uniform-pass"),
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

        pass.set_pipeline(&wgpu.pipelines.image_transform);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..6, 0..1);
        drop(pass);

        let cmd = encoder.finish();
        wgpu.queue.submit(std::iter::once(cmd));
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

    let (wgpu, targets, images, _, _, _) = pctx.split_with_images();
    let (tw, th) = {
        let rec = match targets.get(target) {
            Some(r) => r,
            None => return ERR_INVALID_HANDLE,
        };
        (rec.width, rec.height)
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
    let dst_texture = wgpu.device.create_texture(&wgpu::TextureDescriptor {
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
    let mut encoder = wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-copy-region-encoder"),
        });

    let Some(src_rec) = targets.get(target) else { return ERR_INVALID_HANDLE; };
    encoder.copy_texture_to_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &src_rec.texture,
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

    wgpu.queue.submit(std::iter::once(encoder.finish()));

    // Create view + sampler + bind group and register as image.
    let view = dst_texture.create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = wgpu
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-region-bind-group"),
            layout: &wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&wgpu.cached_sampler),
                },
            ],
        });

    let handle = crate::paint::alloc_image_handle();
    images.insert(
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

/// Legacy composite merge — returns handle 0 (no-op).
///
/// The active composite path uses `composite_target_*` + `render_image_layer`
/// for per-layer composition, making this z-order merge path unnecessary.
/// Retained for FFI contract stability; will be removed in the next ABI bump.
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

    let (wgpu, targets, _, _, _, _) = pctx.split();
    let rec = match targets.get(target) {
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
    let written = readback::readback_full(
        &wgpu.device,
        &wgpu.queue,
        &rec.texture,
        w,
        h,
        padded,
        &rec.readback_buffer,
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

    let (wgpu, targets, _, _, _, _) = pctx.split();
    let rec = match targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let tw = rec.width;
    let th = rec.height;
    let written = readback::readback_region(
        &wgpu.device,
        &wgpu.queue,
        &rec.texture,
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

fn source_image_size(pctx: &PaintContext, image: u64) -> Result<(u32, u32), i32> {
    match pctx.images.get(&image) {
        Some(img) => {
            let size = img.texture.size();
            Ok((size.width, size.height))
        }
        None => Err(ERR_INVALID_HANDLE),
    }
}

fn create_effect_destination(
    pctx: &PaintContext,
    label: &'static str,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = pctx.wgpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d {
            width,
            height,
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
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn register_effect_output(
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
    pctx.images.insert(
        handle,
        crate::paint::ImageRecord {
            texture,
            view,
            bind_group,
        },
    );
    handle
}

fn remove_temp_image(pctx: &mut PaintContext, handle: u64) {
    let _ = pctx.images.remove(&handle);
}

fn render_blur_image(pctx: &mut PaintContext, image: u64, blur_radius: f32) -> Result<u64, i32> {
    use crate::paint::instances::BackdropBlurInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

    let (src_w, src_h) = source_image_size(pctx, image)?;
    let (dst_texture, dst_view) = create_effect_destination(pctx, "vexart-blur-dst", src_w, src_h);

    let instance = BackdropBlurInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        blur_radius,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };

    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-blur-instance-buf"),
            contents: bytes_of(&instance),
            usage: wgpu::BufferUsages::VERTEX,
        });

    let Some(src_bg) = pctx.images.get(&image).map(|img| &img.bind_group) else {
        return Err(ERR_INVALID_HANDLE);
    };

    let mut encoder = pctx
        .wgpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-blur-encoder"),
        });

    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("vexart-blur-pass"),
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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, src_bg, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));
    Ok(register_effect_output(
        pctx,
        "vexart-blur-bind-group",
        dst_texture,
        dst_view,
    ))
}

fn render_color_filter_image(
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
    use crate::paint::instances::BackdropFilterInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

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

    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-filter-instance-buf"),
            contents: bytes_of(&instance),
            usage: wgpu::BufferUsages::VERTEX,
        });

    let Some(src_bg) = pctx.images.get(&image).map(|img| &img.bind_group) else {
        return Err(ERR_INVALID_HANDLE);
    };

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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, src_bg, &[]);
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

    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-mask-instance-buf"),
            contents: bytes_of(&instance),
            usage: wgpu::BufferUsages::VERTEX,
        });

    let Some(src_bg) = pctx.images.get(&image).map(|img| &img.bind_group) else {
        return ERR_INVALID_HANDLE;
    };

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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, src_bg, &[]);
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
