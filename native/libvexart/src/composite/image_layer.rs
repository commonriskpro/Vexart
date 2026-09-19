// native/libvexart/src/composite/image_layer.rs
// Image layer rendering and affine quad transforms.

use crate::composite::target;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::paint::instances::{BridgeImageInstance, BridgeImageTransformInstance};
use crate::paint::PaintContext;
use bytemuck::bytes_of;

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
    if target == 0 {
        return ERR_INVALID_ARG;
    }

    // Look up target and image.
    let (tw_u32, th_u32, scissor) = match pctx.targets.get(target) {
        Some(r) => (
            r.width,
            r.height,
            r.active_layer
                .as_ref()
                .and_then(|l| l.scissor)
                .or(r.scissor),
        ),
        None => return ERR_INVALID_HANDLE,
    };

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

    let offset = pctx.alloc_vertex_space(instance_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, offset as u64, instance_bytes);

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

        layer.finish_pass();
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
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
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
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
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
    if target == 0 || params.len() < std::mem::size_of::<BridgeImageTransformInstance>() {
        return ERR_INVALID_ARG;
    }

    let (tw_u32, th_u32, scissor, target_view_ptr) = match pctx.targets.get(target) {
        Some(r) => (
            r.width,
            r.height,
            r.active_layer
                .as_ref()
                .and_then(|l| l.scissor)
                .or(r.scissor),
            &r.view as *const wgpu::TextureView,
        ),
        None => return ERR_INVALID_HANDLE,
    };

    let bind_group: *const wgpu::BindGroup = if let Some(img) = pctx.images.get(&image) {
        &img.bind_group as *const wgpu::BindGroup
    } else {
        &pctx.fallback_bind_group as *const wgpu::BindGroup
    };

    let instance = bytemuck::pod_read_unaligned::<BridgeImageTransformInstance>(
        &params[..std::mem::size_of::<BridgeImageTransformInstance>()],
    );
    let instance_bytes = bytes_of(&instance);

    let offset = pctx.alloc_vertex_space(instance_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, offset as u64, instance_bytes);

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

        layer.finish_pass();
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
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
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
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
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

    let offset = pctx.alloc_vertex_space(instance_bytes.len());
    pctx.wgpu
        .queue
        .write_buffer(&pctx.vertex_buffer, offset as u64, instance_bytes);

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

        layer.finish_pass();
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
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
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
        pass.set_vertex_buffer(
            0,
            pctx.vertex_buffer
                .slice(offset as u64..(offset + instance_bytes.len()) as u64),
        );
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..6, 0..1);
        drop(pass);

        let cmd = encoder.finish();
        pctx.wgpu.queue.submit(std::iter::once(cmd));
    }

    OK
}

