// native/libvexart/src/paint/pipelines/filter.rs
// Self-filter pipeline — Phase 2b Slice 5 (cmd_kind = 19).
// Reuses the same shader structure as backdrop_filter.rs but binds the
// element's own paint output as the source texture instead of the backdrop.
// Per design §5 (Decision: Self-filter reuses backdrop pipeline with source swap).

use wgpu::{BindGroupLayout, Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    image_bgl: &BindGroupLayout,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-self-filter-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/self_filter.wgsl").into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("vexart-self-filter-pipeline-layout"),
        bind_group_layouts: &[Some(image_bgl)],
        immediate_size: 0,
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-self-filter-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                // SelfFilterInstance: rect [4 f32] + params0 [4 f32] + params1 [4 f32] = 48 bytes
                array_stride: std::mem::size_of::<crate::paint::instances::SelfFilterInstance>()
                    as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32> — x, y, w, h (NDC)
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) params0: vec4<f32> — brightness, contrast, saturate, grayscale
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) params1: vec4<f32> — invert, sepia, hue_rotate_deg, _pad
                    wgpu::VertexAttribute {
                        offset: 32,
                        shader_location: 2,
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
