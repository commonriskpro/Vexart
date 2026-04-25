// native/libvexart/src/paint/pipelines/rect.rs
// Rect fill pipeline — ported from bridge create_rect_pipeline (L609-678).
// Shader: shaders/rect.wgsl (extracted from bridge L612-642).

use wgpu::{Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-rect-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/rect.wgsl").into()),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-rect-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::paint::instances::BridgeRectInstance>()
                    as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32> — x, y, w, h
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) color: vec4<f32> — r, g, b, a
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
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
