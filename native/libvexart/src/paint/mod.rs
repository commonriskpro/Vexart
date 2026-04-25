// native/libvexart/src/paint/mod.rs
// PaintContext with real dispatch: parses graph buffer, batches instances by cmd_kind,
// uploads vertex buffers, submits render passes. Per design §8, §17.6, task 5a.16.

pub mod context;
pub mod instances;
pub mod pipeline_cache;
pub mod pipelines;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use wgpu::util::DeviceExt;

use crate::ffi::panic::{ERR_INVALID_ARG, OK};
use crate::types::FrameStats;

/// Monotonic image handle allocator. Shared between paint (upload_image) and
/// composite (copy_region_to_image / filter / mask operations).
pub static NEXT_IMAGE_HANDLE: AtomicU64 = AtomicU64::new(1);

/// Allocate the next image handle.
pub fn alloc_image_handle() -> u64 {
    NEXT_IMAGE_HANDLE.fetch_add(1, Ordering::Relaxed)
}

/// Holds a GPU texture + view + bind group for one uploaded image.
pub struct ImageRecord {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub bind_group: wgpu::BindGroup,
}

/// Owns the WGPU rendering context, all render pipelines, image registry, and target registry.
pub struct PaintContext {
    pub wgpu: context::WgpuContext,
    /// Image registry: handle → ImageRecord. Key is monotonically-increasing u64.
    pub images: HashMap<u64, ImageRecord>,
    /// Target registry: handle → TargetRecord. Embeds registry per design decision
    /// "Target registry lives inside SHARED_PAINT singleton".
    pub targets: crate::composite::target::TargetRegistry,
    /// MSDF atlas registry: font_id (1-15) → AtlasRecord (GPU texture + metrics).
    /// Phase 2b Slice 4 addition per REQ-2B-202.
    pub atlases: crate::text::atlas::AtlasRegistry,
    /// Default 64×64 offscreen target for dispatch when target=0 is passed.
    pub target_texture: wgpu::Texture,
    pub target_view: wgpu::TextureView,
    /// Fallback bind group for texture-sampling pipelines (backdrop_blur, backdrop_filter,
    /// image_mask, glyph) when no explicit source image is provided. A 1×1 transparent RGBA texture.
    pub fallback_bind_group: wgpu::BindGroup,
}

impl PaintContext {
    pub fn new() -> Self {
        let wgpu = context::WgpuContext::new();

        // Create a minimal 64×64 offscreen target for smoke-test dispatch.
        let target_texture = wgpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("vexart-default-target"),
            size: wgpu::Extent3d {
                width: 64,
                height: 64,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let target_view = target_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Create 1×1 transparent fallback texture + bind group for texture-sampling pipelines.
        let fallback_texture = wgpu.device.create_texture_with_data(
            &wgpu.queue,
            &wgpu::TextureDescriptor {
                label: Some("vexart-fallback-texture"),
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            },
            wgpu::util::TextureDataOrder::LayerMajor,
            &[0u8, 0, 0, 0], // transparent black 1×1
        );
        let fallback_view = fallback_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let fallback_sampler = wgpu.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("vexart-fallback-sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let fallback_bind_group = wgpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-fallback-bind-group"),
            layout: &wgpu.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&fallback_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&fallback_sampler),
                },
            ],
        });

        Self {
            wgpu,
            images: HashMap::new(),
            targets: crate::composite::target::TargetRegistry::new(),
            atlases: crate::text::atlas::AtlasRegistry::new(),
            target_texture,
            target_view,
            fallback_bind_group,
        }
    }

    /// Parse the graph buffer per design §8 and dispatch render commands.
    /// cmd_kind allocation (§17.6, as deployed across Slice 5a + 5b):
    ///   Slice 5a (ported pipelines):
    ///     0=rect, 1=shape_rect, 2=shape_rect_corners, 3=circle, 4=polygon,
    ///     5=bezier, 6=glow, 7=nebula, 8=starfield, 9=image, 10=image_transform,
    ///     11=reserved (glyph, DEC-011 — skipped), 12=gradient_linear, 13=gradient_radial
    ///   Slice 5b (NEW GPU pipelines, DEC-012):
    ///     14=gradient_conic, 15=backdrop_blur, 16=backdrop_filter, 17=image_mask
    ///   Phase 2b Slice 4:
    ///     18=glyph (MSDF text, REQ-2B-203/204)
    ///   Phase 2b Slice 5:
    ///     19=self_filter (REQ-2B-402/403/404)
    ///   Phase 4+:
    ///     20=shadow (analytic box-shadow)
    ///   21..=31 reserved for future pipelines (blend, gradient_stroke, etc.)
    ///
    /// Phase 2b: `target` is resolved from the TargetRegistry.
    /// If target=0, falls back to the PaintContext default offscreen texture.
    pub fn dispatch(&mut self, target: u64, graph: &[u8], stats_out: *mut FrameStats) -> i32 {
        let t_start = Instant::now();

        if graph.is_empty() {
            if !stats_out.is_null() {
                // SAFETY: caller guarantees valid pointer.
                unsafe { *stats_out = FrameStats::default() };
            }
            return OK;
        }

        // Step 1: Parse §8 GraphHeader.
        let header = match crate::ffi::buffer::parse_header(graph) {
            Ok(h) => h,
            Err(_) => return ERR_INVALID_ARG,
        };

        if header.cmd_count == 0 {
            if !stats_out.is_null() {
                unsafe { *stats_out = FrameStats::default() };
            }
            return OK;
        }

        // Step 2: Iterate commands.
        // Per-command prefix (8 bytes): u16 cmd_kind | u16 flags | u32 payload_bytes
        let mut offset = 16usize; // skip header
        let body_end = 16 + header.payload_bytes as usize;

        // Preserve command order. Some effects (shadow/glow/gradient) rely on
        // semantic paint ordering; grouping globally by kind would reorder them.
        let mut batches: Vec<(u16, Vec<u8>)> = Vec::new();

        for _ in 0..header.cmd_count {
            if offset + 8 > graph.len() {
                break;
            }
            let cmd_kind = u16::from_le_bytes([graph[offset], graph[offset + 1]]);
            // flags at offset+2..+4 (reserved for Slice 5b)
            let payload_bytes = u32::from_le_bytes([
                graph[offset + 4],
                graph[offset + 5],
                graph[offset + 6],
                graph[offset + 7],
            ]) as usize;
            offset += 8;

            let payload_end = offset + payload_bytes;
            if payload_end > graph.len() || payload_end > body_end {
                break;
            }
            let payload = &graph[offset..payload_end];
            offset = payload_end;

            // cmd_kind 11 is the legacy glyph slot (unused); 21+ are future — silently skip.
            // cmd_kind 18 = MSDF glyph pipeline (Phase 2b Slice 4).
            // cmd_kind 19 = self-filter pipeline (Phase 2b Slice 5).
            if cmd_kind == 11 || cmd_kind > 20 {
                continue;
            }

            batches.push((cmd_kind, payload.to_vec()));
        }

        if batches.is_empty() {
            if !stats_out.is_null() {
                unsafe { *stats_out = FrameStats::default() };
            }
            return OK;
        }

        // Step 3: Resolve the render target view.
        // Phase 2b: real target handles are looked up from the TargetRegistry.
        // If target=0 or unknown, fall back to the PaintContext default offscreen texture.
        //
        // SAFETY: We extract raw pointers to fields inside `self` to work around Rust's
        // split-borrow limitation. All raw pointers remain valid for the duration of this
        // function — the pointed-to values are owned by `self` which outlives the block.
        // Bun FFI is single-threaded; no concurrent mutation occurs.
        let (render_view_ptr, use_active_encoder): (*const wgpu::TextureView, bool) = if target != 0
        {
            if let Some(rec) = self.targets.get(target) {
                let has_layer = rec.active_layer.is_some();
                (&rec.view as *const wgpu::TextureView, has_layer)
            } else {
                (&self.target_view as *const wgpu::TextureView, false)
            }
        } else {
            (&self.target_view as *const wgpu::TextureView, false)
        };

        let t_gpu_start = Instant::now();

        // When a target has an active layer, we add render passes to its encoder.
        // Otherwise we create a standalone encoder and submit it.
        if use_active_encoder {
            // SAFETY: rec is in self.targets which is stable for this call.
            // We split the borrow manually: view_ptr and encoder_ptr point to disjoint
            // fields of the same TargetRecord. They are not aliased during use.
            let rec_ptr: *mut crate::composite::target::TargetRecord =
                self.targets.get_mut(target).expect("target disappeared") as *mut _;

            // SAFETY: rec_ptr is valid; view and active_layer are disjoint fields.
            let view_ref: &wgpu::TextureView = unsafe { &(*rec_ptr).view };
            let layer: &mut crate::composite::target::ActiveLayerRecord = unsafe {
                (*rec_ptr)
                    .active_layer
                    .as_mut()
                    .expect("active layer disappeared")
            };

            for (kind, batch) in batches.iter() {
                let kind = *kind;
                if batch.is_empty() {
                    continue;
                }
                let instance_stride = instance_stride_for_kind(kind);
                if instance_stride == 0 {
                    continue;
                }
                let instance_count = (batch.len() / instance_stride) as u32;
                if instance_count == 0 {
                    continue;
                }

                // SAFETY: self.wgpu.device is a disjoint field from self.targets.
                let vertex_buf =
                    self.wgpu
                        .device
                        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                            label: Some("vexart-instance-buf"),
                            contents: batch,
                            usage: wgpu::BufferUsages::VERTEX,
                        });

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
                        label: Some("vexart-layer-render-pass"),
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

                // SAFETY: self.wgpu.pipelines and self.fallback_bind_group are disjoint
                // from self.targets; the references are valid for this pass scope.
                let pipeline = pipeline_for_kind(kind, &self.wgpu.pipelines);
                pass.set_pipeline(pipeline);
                pass.set_vertex_buffer(0, vertex_buf.slice(..));
                // Pipelines that sample a texture need bind group 0.
                // cmd_kind 18 (glyph): use fallback for now (atlas bind group wired via
                // text::dispatch_glyph_instances for the dedicated text::dispatch path).
                if kind == 9
                    || kind == 10
                    || kind == 15
                    || kind == 16
                    || kind == 17
                    || kind == 18
                    || kind == 19
                {
                    pass.set_bind_group(0, &self.fallback_bind_group, &[]);
                }
                pass.draw(0..6, 0..instance_count);
            }
            // Do NOT submit — that happens in end_layer.
        } else {
            // SAFETY: render_view_ptr was extracted from self above; it remains valid.
            let render_view: &wgpu::TextureView = unsafe { &*render_view_ptr };
            // No active layer: create standalone encoder, render, submit.
            let mut encoder =
                self.wgpu
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("vexart-frame-encoder"),
                    });

            // We need a fresh render pass per pipeline (clearing on first, loading on rest).
            // Iterate over all known cmd_kinds in order (skipping 11 per legacy slot).
            // Slice 5a: 0-10, 12-13 | Slice 5b: 14-17 | Phase 2b Slice 4: 18 | Phase 2b Slice 5: 19
            let mut first_pass = true;
            for (kind, batch) in batches.iter() {
                let kind = *kind;
                if batch.is_empty() {
                    continue;
                }

                let instance_stride = instance_stride_for_kind(kind);
                if instance_stride == 0 {
                    continue;
                }
                let instance_count = (batch.len() / instance_stride) as u32;
                if instance_count == 0 {
                    continue;
                }

                let vertex_buf =
                    self.wgpu
                        .device
                        .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                            label: Some("vexart-instance-buf"),
                            contents: batch,
                            usage: wgpu::BufferUsages::VERTEX,
                        });

                let load_op = if first_pass {
                    first_pass = false;
                    wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT)
                } else {
                    wgpu::LoadOp::Load
                };

                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("vexart-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: render_view,
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

                let pipeline = pipeline_for_kind(kind, &self.wgpu.pipelines);
                pass.set_pipeline(pipeline);
                pass.set_vertex_buffer(0, vertex_buf.slice(..));
                // Pipelines that sample a texture need bind group 0 set.
                // cmd_kinds 9=image, 10=image_transform use per-image bind groups (looked up
                // from the image registry if available; fall back to the dummy bind group).
                // cmd_kinds 15=backdrop_blur, 16=backdrop_filter, 17=image_mask always use
                // the fallback bind group in Slice 5b (real source wiring is Slice 9+ work).
                // cmd_kind 18=glyph uses the fallback here; atlas bind group is set via
                // text::dispatch_glyph_instances for the dedicated text::dispatch path.
                if kind == 9
                    || kind == 10
                    || kind == 15
                    || kind == 16
                    || kind == 17
                    || kind == 18
                    || kind == 19
                {
                    pass.set_bind_group(0, &self.fallback_bind_group, &[]);
                }
                // 6 vertices per quad (2 triangles), instance_count instances.
                pass.draw(0..6, 0..instance_count);
            }

            let cmd = encoder.finish();
            self.wgpu.queue.submit(std::iter::once(cmd));
        }

        let gpu_us = t_gpu_start.elapsed().as_micros() as u64;
        let cpu_us = t_start.elapsed().as_micros() as u64;

        // Step 4: Write stats.
        if !stats_out.is_null() {
            let total_prims: u32 = batches
                .iter()
                .map(|(kind, bytes)| {
                    let stride = instance_stride_for_kind(*kind);
                    if stride > 0 {
                        (bytes.len() / stride) as u32
                    } else {
                        0
                    }
                })
                .sum();
            unsafe {
                (*stats_out).gpu_time_us = gpu_us;
                (*stats_out).cpu_time_us = cpu_us;
                (*stats_out).draw_calls = batches.len() as u32;
                (*stats_out).primitives = total_prims;
            }
        }

        OK
    }
}

/// Return the byte stride of one instance for the given cmd_kind.
/// Returns 0 for unsupported / reserved kinds.
fn instance_stride_for_kind(kind: u16) -> usize {
    use instances::*;
    use std::mem::size_of;
    match kind {
        // Slice 5a — ported pipelines
        0 => size_of::<BridgeRectInstance>(),
        1 => size_of::<BridgeShapeRectInstance>(),
        2 => size_of::<BridgeShapeRectCornersInstance>(),
        3 => size_of::<BridgeCircleInstance>(),
        4 => size_of::<BridgePolygonInstance>(),
        5 => size_of::<BridgeBezierInstance>(),
        6 => size_of::<BridgeGlowInstance>(),
        7 => size_of::<BridgeNebulaInstance>(),
        8 => size_of::<BridgeStarfieldInstance>(),
        9 => size_of::<BridgeImageInstance>(),
        10 => size_of::<BridgeImageTransformInstance>(),
        12 => size_of::<BridgeLinearGradientInstance>(),
        13 => size_of::<BridgeRadialGradientInstance>(),
        // Slice 5b — NEW GPU pipelines (DEC-012)
        14 => size_of::<ConicGradientInstance>(),
        15 => size_of::<BackdropBlurInstance>(),
        16 => size_of::<BackdropFilterInstance>(),
        17 => size_of::<ImageMaskInstance>(),
        // Phase 2b Slice 4 — MSDF glyph pipeline
        18 => size_of::<MsdfGlyphInstance>(),
        // Phase 2b Slice 5 — self-filter pipeline
        19 => size_of::<SelfFilterInstance>(),
        // Phase 4+ — analytic box-shadow pipeline
        20 => size_of::<BridgeShadowInstance>(),
        _ => 0,
    }
}

/// Return a reference to the pipeline for the given cmd_kind.
fn pipeline_for_kind<'a>(
    kind: u16,
    reg: &'a pipelines::PipelineRegistry,
) -> &'a wgpu::RenderPipeline {
    match kind {
        // Slice 5a — ported pipelines
        0 => &reg.rect,
        1 => &reg.shape_rect,
        2 => &reg.shape_rect_corners,
        3 => &reg.circle,
        4 => &reg.polygon,
        5 => &reg.bezier,
        6 => &reg.glow,
        7 => &reg.nebula,
        8 => &reg.starfield,
        9 => &reg.image,
        10 => &reg.image_transform,
        12 => &reg.gradient_linear,
        13 => &reg.gradient_radial,
        // Slice 5b — NEW GPU pipelines (DEC-012)
        14 => &reg.gradient_conic,
        15 => &reg.backdrop_blur,
        16 => &reg.backdrop_filter,
        17 => &reg.image_mask,
        // Phase 2b Slice 4 — MSDF glyph pipeline
        18 => &reg.glyph,
        // Phase 2b Slice 5 — self-filter pipeline
        19 => &reg.self_filter,
        // Phase 4+ — analytic box-shadow pipeline
        20 => &reg.shadow,
        _ => panic!("pipeline_for_kind called with unsupported kind {kind}"),
    }
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "gpu-tests")]
    use super::*;
    #[cfg(feature = "gpu-tests")]
    use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
    #[cfg(feature = "gpu-tests")]
    use crate::ffi::panic::OK;

    /// Helper: build a minimal graph buffer for a single command.
    #[cfg(feature = "gpu-tests")]
    fn make_graph_buf(cmd_kind: u16, payload: &[u8]) -> Vec<u8> {
        let cmd_prefix_size = 8usize;
        let total_payload = cmd_prefix_size + payload.len();

        let mut buf = vec![0u8; 16 + total_payload];
        // Header
        buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&1u32.to_le_bytes()); // cmd_count = 1
        buf[12..16].copy_from_slice(&(total_payload as u32).to_le_bytes());
        // Command prefix at offset 16
        buf[16..18].copy_from_slice(&cmd_kind.to_le_bytes());
        buf[18..20].copy_from_slice(&0u16.to_le_bytes()); // flags = 0
        buf[20..24].copy_from_slice(&(payload.len() as u32).to_le_bytes());
        // Payload
        buf[24..24 + payload.len()].copy_from_slice(payload);
        buf
    }

    // ─── Slice 5a test ──────────────────────────────────────────────────────

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_single_rect_returns_ok() {
        // Build a minimal graph buffer with 1 rect command (cmd_kind = 0).
        let instance_size = std::mem::size_of::<instances::BridgeRectInstance>();
        let payload = vec![0u8; instance_size];
        let buf = make_graph_buf(0, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(result, OK);
    }

    // ─── Slice 5b tests ─────────────────────────────────────────────────────

    /// 5b.6: gradient_conic visual smoke test.
    /// Dispatch a full-span 360° conic gradient (red→blue) over a 32×32 target.
    /// The pipeline must not panic and dispatch must return OK.
    /// Visual correctness (purple midpoint) is verified via the pixel at (16,0)
    /// in the rendered texture but requires readback — for this smoke test
    /// we verify only that dispatch succeeds.
    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_gradient_conic_returns_ok() {
        let instance = instances::ConicGradientInstance {
            // Full NDC rect (-1,-1)→(2,2) spanning the whole 32×32 target.
            x: -1.0,
            y: -1.0,
            w: 2.0,
            h: 2.0,
            box_w: 32.0,
            box_h: 32.0,
            radius: 0.0,
            _pad0: 0.0,
            // from_color = red (1,0,0,1)
            from_r: 1.0,
            from_g: 0.0,
            from_b: 0.0,
            from_a: 1.0,
            // to_color = blue (0,0,1,1)
            to_r: 0.0,
            to_g: 0.0,
            to_b: 1.0,
            to_a: 1.0,
            start_angle: 0.0,
            _pad1: 0.0,
            _pad2: 0.0,
            _pad3: 0.0,
        };
        let payload = bytemuck::bytes_of(&instance).to_vec();
        let buf = make_graph_buf(14, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(result, OK, "gradient_conic dispatch should return OK");
    }

    /// 5b.7: backdrop_blur — uniform-color preservation.
    /// A uniform solid color under box blur stays the same colour.
    /// We verify dispatch returns OK (readback would confirm colour preservation).
    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_backdrop_blur_returns_ok() {
        let instance = instances::BackdropBlurInstance {
            x: -1.0,
            y: -1.0,
            w: 2.0,
            h: 2.0,
            blur_radius: 4.0,
            _pad0: 0.0,
            _pad1: 0.0,
            _pad2: 0.0,
        };
        let payload = bytemuck::bytes_of(&instance).to_vec();
        let buf = make_graph_buf(15, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(result, OK, "backdrop_blur dispatch should return OK");
    }

    /// 5b.8: backdrop_filter brightness and invert correctness.
    /// Dispatch with brightness=50 and then with invert=100 — both must return OK.
    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_backdrop_filter_brightness_returns_ok() {
        let instance = instances::BackdropFilterInstance {
            x: -1.0,
            y: -1.0,
            w: 2.0,
            h: 2.0,
            brightness: 50.0, // 50% brightness
            contrast: 100.0,  // identity
            saturate: 100.0,  // identity
            grayscale: 0.0,   // identity
            invert: 0.0,      // identity
            sepia: 0.0,       // identity
            hue_rotate_deg: 0.0,
            _pad: 0.0,
        };
        let payload = bytemuck::bytes_of(&instance).to_vec();
        let buf = make_graph_buf(16, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(
            result, OK,
            "backdrop_filter brightness dispatch should return OK"
        );
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_backdrop_filter_invert_returns_ok() {
        let instance = instances::BackdropFilterInstance {
            x: -1.0,
            y: -1.0,
            w: 2.0,
            h: 2.0,
            brightness: 100.0, // identity
            contrast: 100.0,   // identity
            saturate: 100.0,   // identity
            grayscale: 0.0,    // identity
            invert: 100.0,     // full invert
            sepia: 0.0,
            hue_rotate_deg: 0.0,
            _pad: 0.0,
        };
        let payload = bytemuck::bytes_of(&instance).to_vec();
        let buf = make_graph_buf(16, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(
            result, OK,
            "backdrop_filter invert dispatch should return OK"
        );
    }

    /// 5b.9: image_mask corner alpha cut.
    /// Dispatch image_mask with radius_uniform=10 over a 40×40 mask rect.
    /// The pipeline must not panic and dispatch returns OK.
    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_image_mask_returns_ok() {
        let instance = instances::ImageMaskInstance {
            // Source image NDC rect: full target
            x: -1.0,
            y: -1.0,
            w: 2.0,
            h: 2.0,
            // Mask region: center 40×40 px (on a 64×64 target → NDC ~[-0.625, -0.625] 1.25×1.25)
            mask_x: -0.625,
            mask_y: -0.625,
            mask_w: 1.25,
            mask_h: 1.25,
            radius_uniform: 10.0,
            radius_tl: 0.0,
            radius_tr: 0.0,
            radius_br: 0.0,
            radius_bl: 0.0,
            mode: 0.0, // uniform
            _pad0: 0.0,
            _pad1: 0.0,
        };
        let payload = bytemuck::bytes_of(&instance).to_vec();
        let buf = make_graph_buf(17, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(result, OK, "image_mask dispatch should return OK");
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_shadow_returns_ok() {
        let instance = instances::BridgeShadowInstance {
            x: -1.0,
            y: 1.0,
            w: 2.0,
            h: -2.0,
            color_r: 0.0,
            color_g: 0.0,
            color_b: 0.0,
            color_a: 0.4,
            radius_tl: 16.0,
            radius_tr: 16.0,
            radius_br: 16.0,
            radius_bl: 16.0,
            box_w: 64.0,
            box_h: 32.0,
            offset_x: 0.0,
            offset_y: 6.0,
            blur: 12.0,
            _pad0: 0.0,
            _pad1: 0.0,
            _pad2: 0.0,
        };
        let payload = bytemuck::bytes_of(&instance).to_vec();
        let buf = make_graph_buf(20, &payload);

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(result, OK, "shadow dispatch should return OK");
    }
}
