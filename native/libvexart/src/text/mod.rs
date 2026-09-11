// native/libvexart/src/text/mod.rs
// MSDF text pipeline — glyph instance dispatch.
// Per design §4.3, REQ-2B-202/203/204.

pub mod atlas;
pub mod glyph_info;

use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::paint::PaintContext;

struct PreparedGlyphDraw {
    vertex_buf: wgpu::Buffer,
    bind_group_ptr: *const wgpu::BindGroup,
    instance_count: u32,
}

/// Dispatch glyph instances through the glyph pipeline.
/// Groups by atlas_id and issues one draw call per atlas in a single render pass.
pub(crate) fn dispatch_glyph_instances(
    pctx: &mut PaintContext,
    target: u64,
    glyphs: &[crate::paint::instances::MsdfGlyphInstance],
) -> i32 {
    use std::collections::BTreeMap;
    use wgpu::util::DeviceExt;

    if glyphs.is_empty() {
        return OK;
    }

    // 1. Resolve target, render view, active layer, and scissor:
    let (render_view_ptr, use_active_encoder, target_scissor, target_dims) = if target != 0 {
        if let Some(rec) = pctx.targets.get(target) {
            let has_layer = rec.active_layer.is_some();
            let scissor = rec
                .active_layer
                .as_ref()
                .and_then(|l| l.scissor)
                .or(rec.scissor);
            (
                &rec.view as *const wgpu::TextureView,
                has_layer,
                scissor,
                (rec.width, rec.height),
            )
        } else {
            (
                &pctx.target_view as *const wgpu::TextureView,
                false,
                None,
                (pctx.target_texture.width(), pctx.target_texture.height()),
            )
        }
    } else {
        (
            &pctx.target_view as *const wgpu::TextureView,
            false,
            None,
            (pctx.target_texture.width(), pctx.target_texture.height()),
        )
    };

    // Group glyphs by atlas_id.
    let mut by_atlas: BTreeMap<u32, Vec<crate::paint::instances::MsdfGlyphInstance>> =
        BTreeMap::new();
    for g in glyphs {
        by_atlas.entry(g.atlas_id).or_default().push(*g);
    }

    // 2. For each atlas in by_atlas, build vertex buffers and prepare instance draws.
    let mut prepared_draws = Vec::with_capacity(by_atlas.len());
    for (atlas_id, atlas_glyphs) in &by_atlas {
        // Look up atlas bind group (fallback to default if atlas not loaded yet).
        let bind_group_ptr: *const wgpu::BindGroup =
            if let Some(atlas) = pctx.atlases.get(*atlas_id) {
                &atlas.bind_group as *const _
            } else {
                &pctx.fallback_bind_group as *const _
            };

        let payload: &[u8] = bytemuck::cast_slice(atlas_glyphs.as_slice());
        // SAFETY: device is disjoint from targets/atlases.
        let vertex_buf = pctx
            .wgpu
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("vexart-glyph-instance-buf"),
                contents: payload,
                usage: wgpu::BufferUsages::VERTEX,
            });

        prepared_draws.push(PreparedGlyphDraw {
            vertex_buf,
            bind_group_ptr,
            instance_count: atlas_glyphs.len() as u32,
        });
    }

    // 3. For use_active_encoder:
    if use_active_encoder {
        // SAFETY: rec fields are stable; we access disjoint fields.
        let rec_ptr: *mut crate::composite::target::TargetRecord =
            match pctx.targets.get_mut(target) {
                Some(r) => r as *mut _,
                None => return ERR_INVALID_HANDLE,
            };

        let view_ref: &wgpu::TextureView = unsafe { &(*rec_ptr).view };
        let layer: &mut crate::composite::target::ActiveLayerRecord =
            match unsafe { (*rec_ptr).active_layer.as_mut() } {
                Some(l) => l,
                None => return ERR_INVALID_ARG,
            };

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

        {
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

            pass.set_pipeline(&pctx.wgpu.pipelines.glyph);

            let should_draw = match target_scissor {
                Some(s) => {
                    match crate::composite::target::clamp_scissor(s, target_dims.0, target_dims.1)
                    {
                        Some([sx, sy, sw, sh]) => {
                            pass.set_scissor_rect(sx, sy, sw, sh);
                            true
                        }
                        None => false,
                    }
                }
                None => true,
            };

            if should_draw {
                for draw in &prepared_draws {
                    pass.set_vertex_buffer(0, draw.vertex_buf.slice(..));
                    // SAFETY: bind_group_ptr points to an atlas or fallback bind group valid for this frame.
                    pass.set_bind_group(0, unsafe { &*draw.bind_group_ptr }, &[]);
                    pass.draw(0..6, 0..draw.instance_count);
                }
            }
        }
    } else {
        // 4. For !use_active_encoder:
        let render_view: &wgpu::TextureView = unsafe { &*render_view_ptr };
        let mut encoder =
            pctx.wgpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
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

            pass.set_pipeline(&pctx.wgpu.pipelines.glyph);

            let should_draw = match target_scissor {
                Some(s) => {
                    match crate::composite::target::clamp_scissor(s, target_dims.0, target_dims.1)
                    {
                        Some([sx, sy, sw, sh]) => {
                            pass.set_scissor_rect(sx, sy, sw, sh);
                            true
                        }
                        None => false,
                    }
                }
                None => true,
            };

            if should_draw {
                for draw in &prepared_draws {
                    pass.set_vertex_buffer(0, draw.vertex_buf.slice(..));
                    // SAFETY: bind_group_ptr points to an atlas or fallback bind group valid for this frame.
                    pass.set_bind_group(0, unsafe { &*draw.bind_group_ptr }, &[]);
                    pass.draw(0..6, 0..draw.instance_count);
                }
            }
        }

        pctx.wgpu.queue.submit(std::iter::once(encoder.finish()));
        if target == 0 {
            pctx.on_frame_complete();
        }
    }

    OK
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatch_glyph_instances_should_return_ok_when_empty() {
        let mut pctx = PaintContext::new();
        let glyphs: Vec<crate::paint::instances::MsdfGlyphInstance> = Vec::new();
        let rc = dispatch_glyph_instances(&mut pctx, 0, &glyphs);
        assert_eq!(rc, OK);
    }

    #[test]
    fn dispatch_glyph_instances_should_batch_glyphs_by_atlas_and_render_to_default_target() {
        let mut pctx = PaintContext::new();
        let mut glyphs = vec![crate::paint::instances::MsdfGlyphInstance::default(); 3];
        glyphs[0].atlas_id = 1;
        glyphs[0].w = 10.0;
        glyphs[0].h = 12.0;

        glyphs[1].atlas_id = 2;
        glyphs[1].w = 14.0;
        glyphs[1].h = 16.0;

        glyphs[2].atlas_id = 1;
        glyphs[2].w = 18.0;
        glyphs[2].h = 20.0;

        let rc = dispatch_glyph_instances(&mut pctx, 0, &glyphs);
        assert_eq!(rc, OK);
    }

    #[test]
    fn dispatch_glyph_instances_should_render_to_target_active_layer_and_honor_scissor() {
        let mut pctx = PaintContext::new();
        let mut target = 0u64;
        assert_eq!(
            crate::composite::target_create(&mut pctx, 128, 128, &mut target),
            OK
        );
        assert_eq!(
            crate::composite::target_set_scissor(&mut pctx, target, 10, 10, 40, 40),
            OK
        );
        assert_eq!(
            crate::composite::target_begin_layer(&mut pctx, target, 0, 0),
            OK
        );

        let glyph = crate::paint::instances::MsdfGlyphInstance {
            w: 12.0,
            h: 14.0,
            atlas_id: 1,
            ..Default::default()
        };
        let rc = dispatch_glyph_instances(&mut pctx, target, &[glyph]);
        assert_eq!(rc, OK);

        assert_eq!(crate::composite::target_end_layer(&mut pctx, target), OK);
        assert_eq!(crate::composite::target_destroy(&mut pctx, target), OK);
    }

    #[test]
    fn dispatch_glyph_instances_should_handle_out_of_bounds_scissor_gracefully() {
        let mut pctx = PaintContext::new();
        let mut target = 0u64;
        assert_eq!(
            crate::composite::target_create(&mut pctx, 64, 64, &mut target),
            OK
        );
        // Scissor entirely outside target bounds
        assert_eq!(
            crate::composite::target_set_scissor(&mut pctx, target, 200, 200, 50, 50),
            OK
        );
        assert_eq!(
            crate::composite::target_begin_layer(&mut pctx, target, 0, 0),
            OK
        );

        let glyph = crate::paint::instances::MsdfGlyphInstance {
            w: 10.0,
            h: 10.0,
            atlas_id: 1,
            ..Default::default()
        };
        let rc = dispatch_glyph_instances(&mut pctx, target, &[glyph]);
        assert_eq!(rc, OK);

        assert_eq!(crate::composite::target_end_layer(&mut pctx, target), OK);
        assert_eq!(crate::composite::target_destroy(&mut pctx, target), OK);
    }
}
