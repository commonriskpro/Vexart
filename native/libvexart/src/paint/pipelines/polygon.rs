// native/libvexart/src/paint/pipelines/polygon.rs
// Polygon pipeline — ported from bridge create_polygon_pipeline (L775-884).
// Shader: shaders/polygon.wgsl (extracted from bridge L778-885).

use wgpu::{Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-polygon-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/polygon.wgsl").into()),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-polygon-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::paint::instances::BridgePolygonInstance>()
                    as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) fill_color: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) stroke_color: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 32,
                        shader_location: 2,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(3) params0: vec4<f32> — stroke_norm, has_fill, has_stroke, sides
                    wgpu::VertexAttribute {
                        offset: 48,
                        shader_location: 3,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(4) params1: vec4<f32> — rotation_deg, pad...
                    wgpu::VertexAttribute {
                        offset: 64,
                        shader_location: 4,
                        format: wgpu::VertexFormat::Float32x4,
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
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache,
    })
}
