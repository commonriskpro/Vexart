// native/libvexart/src/paint/pipelines/glyph.rs
// MSDF text render pipeline — Phase 2b (cmd_kind = 18).
// Per design §4.3, REQ-2B-203/204, task 4.3.
//
// Pipeline details:
// - Vertex step mode: Instance (one MsdfGlyphInstance per glyph quad).
// - Vertex attributes: pos_size (vec4), uv_rect (vec4), color (vec4), ids (vec4<u32>).
// - Fragment: samples atlas via group(0) image_bind_group_layout.
// - Blend: ALPHA_BLENDING (text composites over background with SDF alpha).

use wgpu::{BindGroupLayout, Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    image_bgl: &BindGroupLayout,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-msdf-text-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/msdf_text.wgsl").into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("vexart-msdf-text-pipeline-layout"),
        bind_group_layouts: &[Some(image_bgl)],
        immediate_size: 0,
    });

    // MsdfGlyphInstance layout (64 bytes = 16 f32):
    //   offset  0: pos_size  [f32; 4]  = x, y, w, h        (NDC quad)
    //   offset 16: uv_rect   [f32; 4]  = uv_x, uv_y, uv_w, uv_h
    //   offset 32: color     [f32; 4]  = r, g, b, a
    //   offset 48: atlas_id  u32       + _pad0 u32 + _pad1 u32 + _pad2 u32  (= 4 u32 = 16 bytes)
    //
    // Shader @location(3) uses vec4<u32> for the ids block.
    let stride = std::mem::size_of::<crate::paint::instances::MsdfGlyphInstance>() as u64;

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-msdf-text-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: stride,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) pos_size: vec4<f32> — x, y, w, h (NDC)
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) uv_rect: vec4<f32> — uv_x, uv_y, uv_w, uv_h
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) color: vec4<f32> — r, g, b, a
                    wgpu::VertexAttribute {
                        offset: 32,
                        shader_location: 2,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(3) ids: vec4<u32> — atlas_id, pad0, pad1, pad2
                    wgpu::VertexAttribute {
                        offset: 48,
                        shader_location: 3,
                        format: wgpu::VertexFormat::Uint32x4,
                    },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                // Alpha blending: text SDF alpha composites over background.
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}
