// native/libvexart/src/paint/pipelines/image_mask.rs
// Image mask pipeline — NEW GPU pipeline (Slice 5b, cmd_kind = 17).
// Replaces apply_rounded_rect_mask_rgba (bridge L2580-2633) and
//          apply_rounded_rect_corners_mask_rgba (bridge L2634-2699).
// Shader: shaders/image_mask.wgsl (authored from scratch, SDF algorithm).
// Uses image_bind_group_layout (texture + sampler at fragment stage).
// Per design §17.2, §17.6, task 5b.4.

use wgpu::{BindGroupLayout, Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    image_bgl: &BindGroupLayout,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-image-mask-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/image_mask.wgsl").into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("vexart-image-mask-pipeline-layout"),
        bind_group_layouts: &[Some(image_bgl)],
        immediate_size: 0,
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vexart-image-mask-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::paint::instances::ImageMaskInstance>()
                    as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) rect: vec4<f32> — x, y, w, h (NDC source image)
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) mask_rect: vec4<f32> — mask_x, mask_y, mask_w, mask_h
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) radii_u_tl_tr_br: vec4<f32> — radius_uniform, radius_tl, radius_tr, radius_br
                    wgpu::VertexAttribute {
                        offset: 32,
                        shader_location: 2,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(3) radii_bl_mode_pad: vec4<f32> — radius_bl, mode, _pad0, _pad1
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
