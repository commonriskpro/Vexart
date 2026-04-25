// native/libvexart/src/paint/pipelines/nebula.rs
// Nebula (procedural noise + 4-stop gradient) pipeline — ported from bridge create_nebula_pipeline (L1232-1379).
// Shader: shaders/nebula.wgsl (extracted from bridge L1235-1380).

use wgpu::{Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-nebula-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/nebula.wgsl").into()),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-nebula-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::paint::instances::BridgeNebulaInstance>()
                    as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32> — x, y, w, h
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) params0: vec4<f32> — seed, scale, octaves, gain
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) params1: vec4<f32> — lacunarity, warp, detail, dust
                    wgpu::VertexAttribute {
                        offset: 32,
                        shader_location: 2,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(3) stop0: vec4<f32> — pos, r, g, b
                    wgpu::VertexAttribute {
                        offset: 48,
                        shader_location: 3,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(4) stop1: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 64,
                        shader_location: 4,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(5) stop2: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 80,
                        shader_location: 5,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(6) stop3: vec4<f32>
                    wgpu::VertexAttribute {
                        offset: 96,
                        shader_location: 6,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(7) stopa: vec4<f32> — alpha values for each stop
                    wgpu::VertexAttribute {
                        offset: 112,
                        shader_location: 7,
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
