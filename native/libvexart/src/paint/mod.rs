// native/libvexart/src/paint/mod.rs
// PaintContext with real dispatch: parses graph buffer, batches instances by cmd_kind,
// uploads vertex buffers, submits render passes. Per design §8, §17.6, task 5a.16.

pub mod context;
pub mod instances;
pub mod pipelines;

use std::collections::HashMap;
use std::time::Instant;

use bytemuck::cast_slice;
use wgpu::util::DeviceExt;

use crate::ffi::panic::{ERR_INVALID_ARG, OK};
use crate::types::FrameStats;

/// Holds a GPU texture + view + bind group for one uploaded image.
pub struct ImageRecord {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub bind_group: wgpu::BindGroup,
}

/// Owns the WGPU rendering context, all render pipelines, and image registry.
pub struct PaintContext {
    pub wgpu: context::WgpuContext,
    /// Image registry: handle → ImageRecord. Key is monotonically-increasing u64.
    pub images: HashMap<u64, ImageRecord>,
    next_image_handle: u64,
    /// Minimal offscreen target for dispatch (64×64 Rgba8Unorm).
    /// In Slice 5a we create one default target; Slice 6+ wires real per-context targets.
    pub target_texture: wgpu::Texture,
    pub target_view: wgpu::TextureView,
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

        Self {
            wgpu,
            images: HashMap::new(),
            next_image_handle: 1,
            target_texture,
            target_view,
        }
    }

    /// Parse the graph buffer per design §8 and dispatch render commands.
    /// cmd_kind allocation (§17.6):
    ///   0=rect, 1=shape_rect, 2=shape_rect_corners, 3=circle, 4=polygon,
    ///   5=bezier, 6=glow, 7=nebula, 8=starfield, 9=image, 10=image_transform,
    ///   (11 reserved-unused/glyph, skipped), 12=gradient_linear, 13=gradient_radial,
    ///   14..=31 reserved for Slice 5b — silently skipped.
    pub fn dispatch(&mut self, _target: u64, graph: &[u8], stats_out: *mut FrameStats) -> i32 {
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

        // Accumulators per cmd_kind.
        let mut batches: HashMap<u16, Vec<u8>> = HashMap::new();

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

            // cmd_kinds 11 and 14..=31 are reserved / Slice 5b — silently skip.
            if cmd_kind == 11 || cmd_kind >= 14 {
                continue;
            }

            batches
                .entry(cmd_kind)
                .or_default()
                .extend_from_slice(payload);
        }

        if batches.is_empty() {
            if !stats_out.is_null() {
                unsafe { *stats_out = FrameStats::default() };
            }
            return OK;
        }

        // Step 3: Submit one CommandEncoder with one render pass per non-empty kind.
        let t_gpu_start = Instant::now();

        let mut encoder =
            self.wgpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("vexart-frame-encoder"),
                });

        // We need a fresh render pass per pipeline (clearing on first, loading on rest).
        // For simplicity in Slice 5a, iterate in cmd_kind order.
        let mut first_pass = true;
        for kind in 0u16..14u16 {
            if kind == 11 {
                continue;
            }
            let batch = match batches.get(&kind) {
                Some(b) if !b.is_empty() => b,
                _ => continue,
            };

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
                    view: &self.target_view,
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
            // 6 vertices per quad (2 triangles), instance_count instances.
            pass.draw(0..6, 0..instance_count);
        }

        let cmd = encoder.finish();
        self.wgpu.queue.submit(std::iter::once(cmd));

        let gpu_us = t_gpu_start.elapsed().as_micros() as u64;
        let cpu_us = t_start.elapsed().as_micros() as u64;

        // Step 4: Write stats.
        if !stats_out.is_null() {
            let total_prims: u32 = batches
                .iter()
                .map(|(&kind, bytes)| {
                    let stride = instance_stride_for_kind(kind);
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
        _ => 0,
    }
}

/// Return a reference to the pipeline for the given cmd_kind.
fn pipeline_for_kind<'a>(
    kind: u16,
    reg: &'a pipelines::PipelineRegistry,
) -> &'a wgpu::RenderPipeline {
    match kind {
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
        _ => panic!("pipeline_for_kind called with unsupported kind {kind}"),
    }
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_dispatch_single_rect_returns_ok() {
        use super::*;
        use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
        use crate::ffi::panic::OK;

        // Build a minimal graph buffer with 1 rect command.
        // Header: magic(4) + version(4) + cmd_count(4) + payload_bytes(4) = 16 bytes
        // Command prefix: cmd_kind(2) + flags(2) + payload_bytes(4) = 8 bytes
        // Rect payload = sizeof(BridgeRectInstance) = 32 bytes
        let instance_size = std::mem::size_of::<instances::BridgeRectInstance>();
        let cmd_prefix_size = 8usize;
        let payload_bytes = cmd_prefix_size + instance_size;

        let mut buf = vec![0u8; 16 + payload_bytes];
        // Header
        buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&1u32.to_le_bytes()); // cmd_count = 1
        buf[12..16].copy_from_slice(&(payload_bytes as u32).to_le_bytes());
        // Command prefix at offset 16
        buf[16..18].copy_from_slice(&0u16.to_le_bytes()); // cmd_kind = 0 (rect)
        buf[18..20].copy_from_slice(&0u16.to_le_bytes()); // flags = 0
        buf[20..24].copy_from_slice(&(instance_size as u32).to_le_bytes()); // payload_bytes
                                                                            // Instance data at offset 24 (all zeros = valid BridgeRectInstance)

        let mut ctx = PaintContext::new();
        let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
        assert_eq!(result, OK);
    }
}
