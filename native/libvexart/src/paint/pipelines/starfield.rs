// native/libvexart/src/paint/pipelines/starfield.rs
// Starfield procedural pipeline — ported from bridge create_starfield_pipeline (L1381-1486).
// Shader: shaders/starfield.wgsl (extracted from bridge L1384-1487).

use wgpu::{Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-starfield-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/starfield.wgsl").into()),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-starfield-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::paint::instances::BridgeStarfieldInstance>(
                ) as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32> — x, y, w, h
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) params0: vec4<f32> — seed, count, cluster_count, cluster_stars
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) warm: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 32,
                        shader_location: 2,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(3) neutral: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 48,
                        shader_location: 3,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(4) cool: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 64,
                        shader_location: 4,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(5) pad: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 80,
                        shader_location: 5,
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
