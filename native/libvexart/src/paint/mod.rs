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

use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::types::FrameStats;

/// 2MB base vertex buffer capacity to accommodate a full 4K terminal grid without reallocating.
pub const BASE_VERTEX_BUFFER_CAPACITY: usize = 2 * 1024 * 1024;
/// Number of consecutive idle frames before decayed buffer returns to base capacity.
pub const VERTEX_BUFFER_COOLDOWN_FRAMES: u32 = 120;
/// Byte alignment requirement for vertex buffer slices.
pub const VERTEX_BUFFER_ALIGNMENT: usize = 16;

/// Monotonic image handle allocator. Shared between paint (upload_image) and
/// composite (copy_region_to_image / filter / mask operations).
pub static NEXT_IMAGE_HANDLE: AtomicU64 = AtomicU64::new(1);

/// Allocate the next image handle.
pub fn alloc_image_handle() -> u64 {
    NEXT_IMAGE_HANDLE.fetch_add(1, Ordering::Relaxed)
}

/// A batch of instances prepared for drawing in a single render pass.
#[derive(Debug, Clone, Copy)]
pub struct PreparedBatch {
    pub kind: u16,
    pub instance_count: u32,
    pub staging_offset: usize,
    pub bytes_len: usize,
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
    /// Persistent vertex buffer for instance data, avoiding per-batch GPU allocation thrashing.
    pub vertex_buffer: wgpu::Buffer,
    /// Current capacity in bytes of `vertex_buffer`.
    pub vertex_buffer_capacity: usize,
    /// Bump allocation offset within `vertex_buffer` for the active frame/layer.
    pub vertex_buffer_offset: usize,
    /// Idle frame counter for cooldown decay back to BASE_VERTEX_BUFFER_CAPACITY.
    pub vertex_buffer_idle_frames: u32,
    /// Peak bytes requested during the current frame.
    pub vertex_buffer_peak_frame_bytes: usize,
    /// CPU-side staging buffer for packing instance data prior to GPU upload.
    pub staging_buffer: Vec<u8>,
}

impl Default for PaintContext {
    fn default() -> Self {
        Self::new()
    }
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

        let vertex_buffer = wgpu.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("vexart-persistent-vertex-buffer"),
            size: BASE_VERTEX_BUFFER_CAPACITY as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self {
            wgpu,
            images: HashMap::new(),
            targets: crate::composite::target::TargetRegistry::new(),
            atlases: crate::text::atlas::AtlasRegistry::new(),
            target_texture,
            target_view,
            fallback_bind_group,
            vertex_buffer,
            vertex_buffer_capacity: BASE_VERTEX_BUFFER_CAPACITY,
            vertex_buffer_offset: 0,
            vertex_buffer_idle_frames: 0,
            vertex_buffer_peak_frame_bytes: 0,
            staging_buffer: Vec::new(),
        }
    }

    /// Allocate space in the persistent vertex buffer, aligning to 16 bytes.
    /// Tracks peak frame bytes and dynamically doubles capacity if needed.
    pub fn alloc_vertex_space(&mut self, required_bytes: usize) -> usize {
        let aligned_offset = (self.vertex_buffer_offset + (VERTEX_BUFFER_ALIGNMENT - 1))
            & !(VERTEX_BUFFER_ALIGNMENT - 1);
        let needed = aligned_offset.saturating_add(required_bytes);
        if needed > self.vertex_buffer_peak_frame_bytes {
            self.vertex_buffer_peak_frame_bytes = needed;
        }
        if needed > self.vertex_buffer_capacity {
            let mut new_capacity = self.vertex_buffer_capacity.max(BASE_VERTEX_BUFFER_CAPACITY);
            while new_capacity < needed {
                new_capacity = match new_capacity.checked_mul(2) {
                    Some(c) => c,
                    None => {
                        new_capacity = usize::MAX;
                        break;
                    }
                };
            }
            self.vertex_buffer = self.wgpu.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-persistent-vertex-buffer"),
                size: new_capacity as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            self.vertex_buffer_capacity = new_capacity;
            self.vertex_buffer_idle_frames = 0;
        }
        self.vertex_buffer_offset = needed;
        aligned_offset
    }

    /// Reset offset and handle hysteresis cooldown decay back to base capacity.
    pub fn on_frame_complete(&mut self) {
        self.vertex_buffer_offset = 0;
        if self.vertex_buffer_capacity > BASE_VERTEX_BUFFER_CAPACITY {
            if self.vertex_buffer_peak_frame_bytes <= BASE_VERTEX_BUFFER_CAPACITY {
                self.vertex_buffer_idle_frames += 1;
                if self.vertex_buffer_idle_frames >= VERTEX_BUFFER_COOLDOWN_FRAMES {
                    self.vertex_buffer = self.wgpu.device.create_buffer(&wgpu::BufferDescriptor {
                        label: Some("vexart-persistent-vertex-buffer"),
                        size: BASE_VERTEX_BUFFER_CAPACITY as u64,
                        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                        mapped_at_creation: false,
                    });
                    self.vertex_buffer_capacity = BASE_VERTEX_BUFFER_CAPACITY;
                    self.vertex_buffer_idle_frames = 0;
                }
            } else {
                self.vertex_buffer_idle_frames = 0;
            }
        }
        self.vertex_buffer_peak_frame_bytes = 0;
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
    #[allow(clippy::not_unsafe_ptr_arg_deref)]
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

        // Step 2: Iterate commands and stage into staging_buffer.
        // Per-command prefix (8 bytes): u16 cmd_kind | u16 flags | u32 payload_bytes
        let mut offset = 16usize; // skip header
        let body_end = 16 + header.payload_bytes as usize;

        self.staging_buffer.clear();
        let mut prepared_batches: Vec<PreparedBatch> = Vec::new();

        let mut truncated = false;
        for _ in 0..header.cmd_count {
            if offset + 8 > graph.len() {
                truncated = true;
                break;
            }
            let cmd_kind = u16::from_le_bytes([graph[offset], graph[offset + 1]]);
            let payload_bytes = u32::from_le_bytes([
                graph[offset + 4],
                graph[offset + 5],
                graph[offset + 6],
                graph[offset + 7],
            ]) as usize;
            offset += 8;

            let payload_end = offset + payload_bytes;
            if payload_end > graph.len() || payload_end > body_end {
                truncated = true;
                break;
            }
            let payload = &graph[offset..payload_end];
            offset = payload_end;

            // cmd_kind 11 is the legacy glyph slot (unused); 21+ are future — silently skip.
            if cmd_kind == 11 || cmd_kind > 20 {
                continue;
            }
            if payload.is_empty() {
                continue;
            }
            let instance_stride = instance_stride_for_kind(cmd_kind);
            if instance_stride == 0 {
                continue;
            }
            let instance_count = (payload.len() / instance_stride) as u32;
            if instance_count == 0 {
                continue;
            }

            // Align staging buffer to 16 bytes for each batch
            let unaligned = self.staging_buffer.len();
            let aligned = (unaligned + (VERTEX_BUFFER_ALIGNMENT - 1)) & !(VERTEX_BUFFER_ALIGNMENT - 1);
            if aligned > unaligned {
                self.staging_buffer.resize(aligned, 0);
            }
            let staging_offset = self.staging_buffer.len();
            self.staging_buffer.extend_from_slice(payload);
            prepared_batches.push(PreparedBatch {
                kind: cmd_kind,
                instance_count,
                staging_offset,
                bytes_len: payload.len(),
            });
        }

        if truncated {
            crate::ffi::error::set_last_error(
                "paint_dispatch: graph buffer truncated, partial commands skipped",
            );
        }

        if prepared_batches.is_empty() {
            if !stats_out.is_null() {
                unsafe { *stats_out = FrameStats::default() };
            }
            return OK;
        }

        // Step 3: Resolve the render target view.
        // SAFETY: We extract raw pointers to fields inside `self` to work around Rust's
        // split-borrow limitation. All raw pointers remain valid for the duration of this
        // function — the pointed-to values are owned by `self` which outlives the block.
        // Bun FFI is single-threaded; no concurrent mutation occurs.
        let (render_view_ptr, use_active_encoder, target_dims, target_scissor): (
            *const wgpu::TextureView,
            bool,
            (u32, u32),
            Option<[u32; 4]>,
        ) = if target != 0 {
            if let Some(rec) = self.targets.get(target) {
                let has_layer = rec.active_layer.is_some();
                let scissor = rec
                    .active_layer
                    .as_ref()
                    .and_then(|l| l.scissor)
                    .or(rec.scissor);
                (
                    &rec.view as *const wgpu::TextureView,
                    has_layer,
                    (rec.width, rec.height),
                    scissor,
                )
            } else {
                (
                    &self.target_view as *const wgpu::TextureView,
                    false,
                    (self.target_texture.width(), self.target_texture.height()),
                    None,
                )
            }
        } else {
            (
                &self.target_view as *const wgpu::TextureView,
                false,
                (self.target_texture.width(), self.target_texture.height()),
                None,
            )
        };

        let t_gpu_start = Instant::now();

        // Step 4: Allocate vertex space & upload staging buffer in a single copy
        let base_offset = self.alloc_vertex_space(self.staging_buffer.len());
        self.wgpu.queue.write_buffer(
            &self.vertex_buffer,
            base_offset as u64,
            &self.staging_buffer,
        );

        // Step 5: Execute with a single render pass and pipeline switching
        if use_active_encoder {
            let rec_ptr: *mut crate::composite::target::TargetRecord =
                match self.targets.get_mut(target) {
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

            let mut active_kind: Option<u16> = None;
            for b in &prepared_batches {
                if active_kind != Some(b.kind) {
                    let pipeline = pipeline_for_kind(b.kind, &self.wgpu.pipelines);
                    pass.set_pipeline(pipeline);
                    if needs_fallback_bind_group(b.kind) {
                        pass.set_bind_group(0, &self.fallback_bind_group, &[]);
                    }
                    active_kind = Some(b.kind);
                }
                let start = (base_offset + b.staging_offset) as u64;
                let end = start + b.bytes_len as u64;
                pass.set_vertex_buffer(0, self.vertex_buffer.slice(start..end));
                if let Some(s) = target_scissor {
                    if let Some([sx, sy, sw, sh]) =
                        crate::composite::target::clamp_scissor(s, target_dims.0, target_dims.1)
                    {
                        pass.set_scissor_rect(sx, sy, sw, sh);
                        pass.draw(0..6, 0..b.instance_count);
                    }
                } else {
                    pass.draw(0..6, 0..b.instance_count);
                }
            }
            drop(pass);
            // Do NOT submit or complete frame here — happens in target_end_layer.
        } else {
            let render_view: &wgpu::TextureView = unsafe { &*render_view_ptr };
            let mut encoder =
                self.wgpu
                    .device
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("vexart-frame-encoder"),
                    });

            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("vexart-render-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: render_view,
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

            let mut active_kind: Option<u16> = None;
            for b in &prepared_batches {
                if active_kind != Some(b.kind) {
                    let pipeline = pipeline_for_kind(b.kind, &self.wgpu.pipelines);
                    pass.set_pipeline(pipeline);
                    if needs_fallback_bind_group(b.kind) {
                        pass.set_bind_group(0, &self.fallback_bind_group, &[]);
                    }
                    active_kind = Some(b.kind);
                }
                let start = (base_offset + b.staging_offset) as u64;
                let end = start + b.bytes_len as u64;
                pass.set_vertex_buffer(0, self.vertex_buffer.slice(start..end));
                if let Some(s) = target_scissor {
                    if let Some([sx, sy, sw, sh]) =
                        crate::composite::target::clamp_scissor(s, target_dims.0, target_dims.1)
                    {
                        pass.set_scissor_rect(sx, sy, sw, sh);
                        pass.draw(0..6, 0..b.instance_count);
                    }
                } else {
                    pass.draw(0..6, 0..b.instance_count);
                }
            }
            drop(pass);

            let cmd = encoder.finish();
            self.wgpu.queue.submit(std::iter::once(cmd));
            self.on_frame_complete();
        }

        let gpu_us = t_gpu_start.elapsed().as_micros() as u64;
        let cpu_us = t_start.elapsed().as_micros() as u64;

        // Step 6: Write stats.
        if !stats_out.is_null() {
            let total_prims: u32 = prepared_batches.iter().map(|b| b.instance_count).sum();
            unsafe {
                (*stats_out).gpu_time_us = gpu_us;
                (*stats_out).cpu_time_us = cpu_us;
                (*stats_out).draw_calls = prepared_batches.len() as u32;
                (*stats_out).primitives = total_prims;
            }
        }

        OK
    }
}

/// Helper returning true if the command kind requires the fallback texture bind group.
#[inline]
fn needs_fallback_bind_group(kind: u16) -> bool {
    matches!(kind, 9 | 10 | 15 | 16 | 17 | 18 | 19)
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
fn pipeline_for_kind(
    kind: u16,
    reg: &pipelines::PipelineRegistry,
) -> &wgpu::RenderPipeline {
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
        _ => &reg.rect,
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

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_vertex_buffer_alloc_expansion_and_cooldown_decay() {
        let mut ctx = PaintContext::new();

        // 1. Verify initial state
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);
        assert_eq!(ctx.vertex_buffer_offset, 0);
        assert_eq!(ctx.vertex_buffer_idle_frames, 0);
        assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 0);

        // 2. Normal allocation under base capacity
        let off0 = ctx.alloc_vertex_space(100);
        assert_eq!(off0, 0);
        assert_eq!(ctx.vertex_buffer_offset, 100);
        assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 100);

        // Second allocation: aligns to 16 bytes (100 -> 112)
        let off1 = ctx.alloc_vertex_space(200);
        assert_eq!(off1, 112);
        assert_eq!(ctx.vertex_buffer_offset, 312);
        assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 312);
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);

        // Complete normal frame
        ctx.on_frame_complete();
        assert_eq!(ctx.vertex_buffer_offset, 0);
        assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 0);
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);
        assert_eq!(ctx.vertex_buffer_idle_frames, 0);

        // 3. Elastic expansion: exceed base capacity
        let big_size = BASE_VERTEX_BUFFER_CAPACITY + 1024;
        let big_off = ctx.alloc_vertex_space(big_size);
        assert_eq!(big_off, 0);
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
        assert_eq!(ctx.vertex_buffer_peak_frame_bytes, big_size);

        // Frame complete with peak exceeding base capacity -> idle_frames remains 0
        ctx.on_frame_complete();
        assert_eq!(ctx.vertex_buffer_offset, 0);
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
        assert_eq!(ctx.vertex_buffer_idle_frames, 0);

        // 4. Cooldown decay: run 119 frames under base capacity
        for frame in 1..VERTEX_BUFFER_COOLDOWN_FRAMES {
            let off = ctx.alloc_vertex_space(512);
            assert_eq!(off, 0);
            ctx.on_frame_complete();
            assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
            assert_eq!(ctx.vertex_buffer_idle_frames, frame);
        }

        // Frame 120 (reaches VERTEX_BUFFER_COOLDOWN_FRAMES) -> triggers cooldown decay back to base!
        let off = ctx.alloc_vertex_space(512);
        assert_eq!(off, 0);
        ctx.on_frame_complete();
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);
        assert_eq!(ctx.vertex_buffer_idle_frames, 0);
        assert_eq!(ctx.vertex_buffer_offset, 0);
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_vertex_buffer_hysteresis_resets_on_spike() {
        let mut ctx = PaintContext::new();

        // Expand to 4MB
        ctx.alloc_vertex_space(BASE_VERTEX_BUFFER_CAPACITY + 1024);
        ctx.on_frame_complete();
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);

        // 10 idle frames
        for _ in 0..10 {
            ctx.alloc_vertex_space(64);
            ctx.on_frame_complete();
        }
        assert_eq!(ctx.vertex_buffer_idle_frames, 10);

        // Spike frame exceeding base capacity resets idle counter
        ctx.alloc_vertex_space(BASE_VERTEX_BUFFER_CAPACITY + 512);
        ctx.on_frame_complete();
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
        assert_eq!(ctx.vertex_buffer_idle_frames, 0);
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_multi_batch_pipeline_switching_and_ring_reset() {
        let mut ctx = PaintContext::new();

        // Build a multi-command graph: 1 rect (kind 0) + 1 circle (kind 3) + 1 rect (kind 0)
        let rect_size = std::mem::size_of::<instances::BridgeRectInstance>();
        let circle_size = std::mem::size_of::<instances::BridgeCircleInstance>();

        let total_payload = (8 + rect_size) + (8 + circle_size) + (8 + rect_size);
        let mut buf = vec![0u8; 16 + total_payload];

        // Header
        buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&3u32.to_le_bytes()); // cmd_count = 3
        buf[12..16].copy_from_slice(&(total_payload as u32).to_le_bytes());

        let mut off = 16usize;
        // Cmd 1: Rect (kind 0)
        buf[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
        buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());
        off += 8 + rect_size;

        // Cmd 2: Circle (kind 3)
        buf[off..off + 2].copy_from_slice(&3u16.to_le_bytes());
        buf[off + 4..off + 8].copy_from_slice(&(circle_size as u32).to_le_bytes());
        off += 8 + circle_size;

        // Cmd 3: Rect (kind 0)
        buf[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
        buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());

        let mut stats = FrameStats::default();
        let result = ctx.dispatch(0, &buf, &mut stats);

        assert_eq!(result, OK);
        assert_eq!(stats.draw_calls, 3);
        assert_eq!(stats.primitives, 3);
        // Offset must be reset to 0 by on_frame_complete() in standalone dispatch
        assert_eq!(ctx.vertex_buffer_offset, 0);
    }
}
