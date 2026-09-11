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

    let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
    if width > max_dim || height > max_dim {
        return ERR_INVALID_ARG;
    }

    // Extract device pointer before borrowing pctx.targets mutably.
    // SAFETY: device is owned by pctx.wgpu which is stable for the duration of this call.
    let device_ptr: *const wgpu::Device = &pctx.wgpu.device as *const wgpu::Device;

    // SAFETY: out_handle is non-null (checked above) and valid (caller contract).
    let handle_ref = unsafe { &mut *out_handle };
    // SAFETY: device_ptr is valid — it points to pctx.wgpu.device which is alive.
    let rec = match pctx
        .targets
        .create(unsafe { &*device_ptr }, width, height, handle_ref)
    {
        Some(r) => r,
        None => return ERR_INVALID_ARG,
    };
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
    match pctx
        .targets
        .begin_layer(unsafe { &*device_ptr }, handle, load_mode, clear_rgba)
    {
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

/// Set hardware scissor rectangle on an offscreen render target.
pub fn target_set_scissor(
    pctx: &mut PaintContext,
    target: u64,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> i32 {
    if target == 0 {
        return ERR_INVALID_ARG;
    }
    let rec = match pctx.targets.get_mut(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };
    rec.set_scissor(x, y, width, height);
    OK
}

/// Reset/clear hardware scissor rectangle on an offscreen render target.
pub fn target_reset_scissor(pctx: &mut PaintContext, target: u64) -> i32 {
    if target == 0 {
        return ERR_INVALID_ARG;
    }
    let rec = match pctx.targets.get_mut(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };
    rec.clear_scissor();
    OK
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

    let tw_u32 = target_rec.width;
    let th_u32 = target_rec.height;
    let scissor = target_rec
        .active_layer
        .as_ref()
        .and_then(|l| l.scissor)
        .or(target_rec.scissor);

    let tw = tw_u32 as f32;
    let th = th_u32 as f32;

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

        pass.set_pipeline(&pctx.wgpu.pipelines.image);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        // SAFETY: bind_group extracted before mutable borrow; still valid.
        pass.set_bind_group(0, unsafe { &*bind_group }, &[]);
        if let Some(s) = scissor {
            if let Some([sx, sy, sw, sh]) = target::clamp_scissor(s, tw_u32, th_u32) {
                pass.set_scissor_rect(sx, sy, sw, sh);
                pass.draw(0..6, 0..1);
            }
        } else {
            pass.draw(0..6, 0..1);
        }
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
        if let Some(s) = scissor {
            if let Some([sx, sy, sw, sh]) = target::clamp_scissor(s, tw_u32, th_u32) {
                pass.set_scissor_rect(sx, sy, sw, sh);
                pass.draw(0..6, 0..1);
            }
        } else {
            pass.draw(0..6, 0..1);
        }
        drop(pass);

        let cmd = encoder.finish();
        pctx.wgpu.queue.submit(std::iter::once(cmd));
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

    let target_rec = match pctx.targets.get(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };

    let tw_u32 = target_rec.width;
    let th_u32 = target_rec.height;
    let scissor = target_rec
        .active_layer
        .as_ref()
        .and_then(|l| l.scissor)
        .or(target_rec.scissor);

    let bind_group: *const wgpu::BindGroup = if let Some(img) = pctx.images.get(&image) {
        &img.bind_group as *const wgpu::BindGroup
    } else {
        &pctx.fallback_bind_group as *const wgpu::BindGroup
    };

    let instance = bytemuck::pod_read_unaligned::<BridgeImageTransformInstance>(
        &params[..std::mem::size_of::<BridgeImageTransformInstance>()],
    );
    let instance_bytes = bytes_of(&instance);

    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-composite-image-transform-buf"),
            contents: instance_bytes,
            usage: wgpu::BufferUsages::VERTEX,
        });

    let target_view_ptr: *const wgpu::TextureView = &target_rec.view as *const wgpu::TextureView;

    if pctx.targets.get(target).unwrap().active_layer.is_some() {
        let rec_ptr: *mut target::TargetRecord = pctx.targets.get_mut(target).unwrap();
        let view_ref: &wgpu::TextureView = unsafe { &(*rec_ptr).view };
        let layer = unsafe {
            (*rec_ptr)
                .active_layer
                .as_mut()
                .expect("active layer disappeared")
        };

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

        pass.set_pipeline(&pctx.wgpu.pipelines.image_transform);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, unsafe { &*bind_group }, &[]);
        if let Some(s) = scissor {
            if let Some([sx, sy, sw, sh]) = target::clamp_scissor(s, tw_u32, th_u32) {
                pass.set_scissor_rect(sx, sy, sw, sh);
                pass.draw(0..6, 0..1);
            }
        } else {
            pass.draw(0..6, 0..1);
        }
    } else {
        let mut encoder =
            pctx.wgpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("vexart-composite-transform-encoder"),
                });

        let c = clear_rgba;
        let clear_op = wgpu::LoadOp::Clear(wgpu::Color {
            r: ((c >> 24) & 0xff) as f64 / 255.0,
            g: ((c >> 16) & 0xff) as f64 / 255.0,
            b: ((c >> 8) & 0xff) as f64 / 255.0,
            a: (c & 0xff) as f64 / 255.0,
        });

        let view_ref: &wgpu::TextureView = unsafe { &*target_view_ptr };
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

        pass.set_pipeline(&pctx.wgpu.pipelines.image_transform);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, unsafe { &*bind_group }, &[]);
        if let Some(s) = scissor {
            if let Some([sx, sy, sw, sh]) = target::clamp_scissor(s, tw_u32, th_u32) {
                pass.set_scissor_rect(sx, sy, sw, sh);
                pass.draw(0..6, 0..1);
            }
        } else {
            pass.draw(0..6, 0..1);
        }
        drop(pass);

        let cmd = encoder.finish();
        pctx.wgpu.queue.submit(std::iter::once(cmd));
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

    let bind_group = {
        let source_rec = match pctx.targets.get(source_target) {
            Some(r) => r,
            None => return ERR_INVALID_HANDLE,
        };
        pctx.wgpu
            .device
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("vexart-composite-uniform-bind-group"),
                layout: &pctx.wgpu.image_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&source_rec.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&pctx.wgpu.cached_sampler),
                    },
                ],
            })
    };

    let instance = bytemuck::pod_read_unaligned::<BridgeImageTransformInstance>(
        &params[..std::mem::size_of::<BridgeImageTransformInstance>()],
    );
    let instance_bytes = bytes_of(&instance);

    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-composite-uniform-buf"),
            contents: instance_bytes,
            usage: wgpu::BufferUsages::VERTEX,
        });

    let target_view_ptr: *const wgpu::TextureView = {
        let target_rec = match pctx.targets.get(target) {
            Some(r) => r,
            None => return ERR_INVALID_HANDLE,
        };
        &target_rec.view as *const wgpu::TextureView
    };

    if pctx.targets.get(target).unwrap().active_layer.is_some() {
        let rec_ptr: *mut target::TargetRecord = pctx.targets.get_mut(target).unwrap();
        let view_ref: &wgpu::TextureView = unsafe { &(*rec_ptr).view };
        let layer = unsafe {
            (*rec_ptr)
                .active_layer
                .as_mut()
                .expect("active layer disappeared")
        };

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

        // The source is another render target, whose RGB is already
        // premultiplied by alpha. Use the matching blend factors so this
        // retained-compositor path does not premultiply it twice.
        pass.set_pipeline(&pctx.wgpu.pipelines.image_transform_premultiplied);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..6, 0..1);
    } else {
        let mut encoder =
            pctx.wgpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("vexart-composite-uniform-encoder"),
                });

        let c = clear_rgba;
        let clear_op = wgpu::LoadOp::Clear(wgpu::Color {
            r: ((c >> 24) & 0xff) as f64 / 255.0,
            g: ((c >> 16) & 0xff) as f64 / 255.0,
            b: ((c >> 8) & 0xff) as f64 / 255.0,
            a: (c & 0xff) as f64 / 255.0,
        });

        let view_ref: &wgpu::TextureView = unsafe { &*target_view_ptr };
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

        // See the active-layer path above: source targets are premultiplied.
        pass.set_pipeline(&pctx.wgpu.pipelines.image_transform_premultiplied);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, &bind_group, &[]);
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
    use crate::paint::instances::ImageCopyInstance;
    use bytemuck::bytes_of;
    use wgpu::util::DeviceExt;

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
    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-region-copy-instance-buf"),
            contents: bytes_of(&instance),
            usage: wgpu::BufferUsages::VERTEX,
        });
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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_bind_group(0, &source_bind_group, &[]);
        pass.draw(0..6, 0..1);
    }

    pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));

    // Create view + sampler + bind group and register as image.
    let view = dst_view;
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
    let sampler = pctx.wgpu.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some(label),
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
            label: Some(label),
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
    let (_mid_texture, mid_view) =
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

    let horizontal_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-blur-horizontal-buf"),
            contents: bytes_of(&horizontal),
            usage: wgpu::BufferUsages::VERTEX,
        });
    let vertical_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-blur-vertical-buf"),
            contents: bytes_of(&vertical),
            usage: wgpu::BufferUsages::VERTEX,
        });

    let Some(src_img) = pctx.images.get(&image) else {
        return Err(ERR_INVALID_HANDLE);
    };
    // Preserve nearest filtering for normal image presentation, but use a
    // linear sampler here so a narrow impulse cannot disappear between taps.
    let linear_sampler = pctx.wgpu.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("vexart-blur-linear-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        ..Default::default()
    });
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
                    resource: wgpu::BindingResource::Sampler(&linear_sampler),
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
                    resource: wgpu::BindingResource::Sampler(&linear_sampler),
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
        pass.set_vertex_buffer(0, horizontal_buf.slice(..));
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
        pass.set_vertex_buffer(0, vertical_buf.slice(..));
        pass.set_bind_group(0, &mid_bind_group, &[]);
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
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
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
fn image_mask_rounded_rect_impl(
    pctx: &mut PaintContext,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
    mask_rect: Option<[f32; 4]>,
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

    let vertex_buf = pctx
        .wgpu
        .device
        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vexart-mask-instance-buf"),
            contents: bytes_of(&instance),
            usage: wgpu::BufferUsages::VERTEX,
        });

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_target_set_reset_scissor_invalid_args() {
        let mut pctx = PaintContext::new();
        assert_eq!(target_set_scissor(&mut pctx, 0, 10, 10, 50, 50), ERR_INVALID_ARG);
        assert_eq!(target_reset_scissor(&mut pctx, 0), ERR_INVALID_ARG);
        assert_eq!(target_set_scissor(&mut pctx, 999999, 10, 10, 50, 50), ERR_INVALID_HANDLE);
        assert_eq!(target_reset_scissor(&mut pctx, 999999), ERR_INVALID_HANDLE);
    }

    #[test]
    fn test_target_set_reset_scissor_valid() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);
        assert_ne!(handle, 0);

        assert_eq!(target_set_scissor(&mut pctx, handle, 5, 10, 20, 30), OK);
        assert_eq!(pctx.targets.get(handle).unwrap().scissor, Some([5, 10, 20, 30]));

        assert_eq!(target_reset_scissor(&mut pctx, handle), OK);
        assert_eq!(pctx.targets.get(handle).unwrap().scissor, None);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

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

    #[test]
    fn readback_rgba_should_fail_when_buffer_is_too_small() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 100];
        // 64 * 64 * 4 = 16384 bytes needed; capacity 100 is too small.
        let status = readback_rgba(
            &mut pctx,
            handle,
            buf.as_mut_ptr(),
            100,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_rgba_should_fail_when_dimensions_overflow() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 16];

        // Case 1: width * height overflows u32
        pctx.targets.get_mut(handle).unwrap().width = u32::MAX;
        let status1 = readback_rgba(
            &mut pctx,
            handle,
            buf.as_mut_ptr(),
            u32::MAX,
            std::ptr::null_mut(),
        );
        assert_eq!(status1, ERR_INVALID_ARG);

        // Case 2: (width * height) * 4 overflows u32
        pctx.targets.get_mut(handle).unwrap().width = 1 << 30;
        pctx.targets.get_mut(handle).unwrap().height = 1;
        let status2 = readback_rgba(
            &mut pctx,
            handle,
            buf.as_mut_ptr(),
            u32::MAX,
            std::ptr::null_mut(),
        );
        assert_eq!(status2, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_region_rgba_should_fail_on_overflow_or_buffer_too_small() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 64];

        // Buffer too small: region 10x10 requires 400 bytes, buffer capacity is 64
        let mut rect_small = [0u8; 16];
        rect_small[8..12].copy_from_slice(&10u32.to_le_bytes()); // w = 10
        rect_small[12..16].copy_from_slice(&10u32.to_le_bytes()); // h = 10

        let status_small = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_small,
            buf.as_mut_ptr(),
            64,
            std::ptr::null_mut(),
        );
        assert_eq!(status_small, ERR_INVALID_ARG);

        // Target with overflow dimensions in region
        pctx.targets.get_mut(handle).unwrap().width = u32::MAX;
        pctx.targets.get_mut(handle).unwrap().height = u32::MAX;
        let mut rect_overflow = [0u8; 16];
        rect_overflow[8..12].copy_from_slice(&u32::MAX.to_le_bytes()); // rw = u32::MAX
        rect_overflow[12..16].copy_from_slice(&u32::MAX.to_le_bytes()); // rh = u32::MAX

        let status_overflow = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_overflow,
            buf.as_mut_ptr(),
            u32::MAX,
            std::ptr::null_mut(),
        );
        assert_eq!(status_overflow, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    fn make_test_rect(x: u32, y: u32, w: u32, h: u32) -> [u8; 16] {
        let mut rect = [0u8; 16];
        rect[0..4].copy_from_slice(&x.to_le_bytes());
        rect[4..8].copy_from_slice(&y.to_le_bytes());
        rect[8..12].copy_from_slice(&w.to_le_bytes());
        rect[12..16].copy_from_slice(&h.to_le_bytes());
        rect
    }

    #[test]
    fn readback_region_rgba_should_fail_when_dimensions_are_zero() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 256];

        // rw == 0
        let rect_zero_w = make_test_rect(0, 0, 0, 10);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_zero_w,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // rh == 0
        let rect_zero_h = make_test_rect(0, 0, 10, 0);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_zero_h,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // both zero
        let rect_both_zero = make_test_rect(0, 0, 0, 0);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_both_zero,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_region_rgba_should_fail_when_origin_is_out_of_bounds() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 256];

        // rx == tw (64)
        let rect_rx_eq_tw = make_test_rect(64, 0, 4, 4);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_rx_eq_tw,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // rx > tw (100 > 64)
        let rect_rx_gt_tw = make_test_rect(100, 0, 4, 4);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_rx_gt_tw,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // ry == th (64)
        let rect_ry_eq_th = make_test_rect(0, 64, 4, 4);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_ry_eq_th,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // ry > th (100 > 64)
        let rect_ry_gt_th = make_test_rect(0, 100, 4, 4);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_ry_gt_th,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_region_rgba_should_fail_when_region_exceeds_bounds_preventing_silent_clamping() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 1024];

        // rx < tw but rx + rw > tw (60 + 10 = 70 > 64)
        let rect_x_overflow = make_test_rect(60, 0, 10, 10);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_x_overflow,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // ry < th but ry + rh > th (0, 60 + 10 = 70 > 64)
        let rect_y_overflow = make_test_rect(0, 60, 10, 10);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_y_overflow,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // rx = 0, rw > tw (65 > 64)
        let rect_w_overflow = make_test_rect(0, 0, 65, 10);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_w_overflow,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // ry = 0, rh > th (65 > 64)
        let rect_h_overflow = make_test_rect(0, 0, 10, 65);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_h_overflow,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_region_rgba_should_fail_on_arithmetic_overflow() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        let mut buf = vec![0u8; 64];

        // rx + rw overflows u32
        let rect_rx_overflow = make_test_rect(u32::MAX, 0, 1, 1);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_rx_overflow,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // ry + rh overflows u32
        let rect_ry_overflow = make_test_rect(0, u32::MAX, 1, 1);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_ry_overflow,
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // Byte calculation overflow (rw * rh * 4 overflows u32)
        // Set target dimensions large to pass bounds check first.
        pctx.targets.get_mut(handle).unwrap().width = u32::MAX;
        pctx.targets.get_mut(handle).unwrap().height = u32::MAX;

        let rect_mul_overflow = make_test_rect(0, 0, u32::MAX, u32::MAX);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_mul_overflow,
            buf.as_mut_ptr(),
            u32::MAX,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        let rect_bytes_overflow = make_test_rect(0, 0, 1 << 30, 1);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_bytes_overflow,
            buf.as_mut_ptr(),
            u32::MAX,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_region_rgba_should_fail_when_dst_cap_is_smaller_than_needed() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        // rw = 10, rh = 10 requires 10 * 10 * 4 = 400 bytes.
        let rect = make_test_rect(0, 0, 10, 10);
        let mut buf = vec![0u8; 400];

        // Capacity 399 < 400
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect,
            buf.as_mut_ptr(),
            399,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        // Capacity 0 < 400
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect,
            buf.as_mut_ptr(),
            0,
            std::ptr::null_mut(),
        );
        assert_eq!(status, ERR_INVALID_ARG);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }

    #[test]
    fn readback_region_rgba_should_succeed_for_valid_bounded_region() {
        let mut pctx = PaintContext::new();
        let mut handle = 0u64;
        let rc = target_create(&mut pctx, 64, 64, &mut handle);
        assert_eq!(rc, OK);

        // Interior sub-region: x=10, y=10, w=20, h=20 (right=30 <= 64, bottom=30 <= 64)
        let rect = make_test_rect(10, 10, 20, 20);
        let needed = 20 * 20 * 4;
        let mut buf = vec![0u8; needed as usize];
        let mut stats = FrameStats::default();

        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect,
            buf.as_mut_ptr(),
            needed,
            &mut stats,
        );
        assert_eq!(status, OK);

        // Edge-aligned region touching boundary: x=44, y=44, w=20, h=20 (right=64 == tw, bottom=64 == th)
        let rect_edge = make_test_rect(44, 44, 20, 20);
        let status = readback_region_rgba(
            &mut pctx,
            handle,
            &rect_edge,
            buf.as_mut_ptr(),
            needed,
            std::ptr::null_mut(),
        );
        assert_eq!(status, OK);

        assert_eq!(target_destroy(&mut pctx, handle), OK);
    }
}
