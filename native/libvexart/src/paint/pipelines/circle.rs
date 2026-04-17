// native/libvexart/src/paint/pipelines/circle.rs
// Circle/ellipse pipeline — ported from bridge create_circle_pipeline (L680-773).
// Shader: shaders/circle.wgsl (extracted from bridge L683-738).

use wgpu::{Device, RenderPipeline, TextureFormat};

pub fn create(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-circle-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/circle.wgsl").into()),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-circle-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::paint::instances::BridgeCircleInstance>()
                    as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32> — x, y, w, h
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
                    // @location(3) params: vec4<f32> — stroke_norm, has_fill, has_stroke, pad
                    wgpu::VertexAttribute {
                        offset: 48,
                        shader_location: 3,
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
        cache: None,
    })
}
