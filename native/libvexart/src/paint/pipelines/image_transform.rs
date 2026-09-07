// native/libvexart/src/paint/pipelines/image_transform.rs
// Transformed image pipeline — ported from bridge create_image_transform_pipeline (L1754-1844).
// Shader: shaders/image_transform.wgsl (extracted from bridge L1757-1845).
// Uses image_bind_group_layout (texture + sampler).

use wgpu::{BindGroupLayout, Device, RenderPipeline, TextureFormat};

pub fn create(
    device: &Device,
    format: TextureFormat,
    image_bgl: &BindGroupLayout,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    create_with_blend(
        device,
        format,
        image_bgl,
        cache,
        wgpu::BlendState::ALPHA_BLENDING,
        "vexart-image-transform-pipeline",
        "vexart-image-transform-pipeline-layout",
        "fs_main",
    )
}

/// Create the target-to-target variant. Retained targets already store
/// premultiplied RGBA, so their source factor must not multiply RGB by alpha a
/// second time. Uploaded and copied images continue using `create` above.
pub fn create_premultiplied(
    device: &Device,
    format: TextureFormat,
    image_bgl: &BindGroupLayout,
    cache: Option<&wgpu::PipelineCache>,
) -> RenderPipeline {
    create_with_blend(
        device,
        format,
        image_bgl,
        cache,
        wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING,
        "vexart-image-transform-premultiplied-pipeline",
        "vexart-image-transform-premultiplied-pipeline-layout",
        "fs_premultiplied",
    )
}

fn create_with_blend(
    device: &Device,
    format: TextureFormat,
    image_bgl: &BindGroupLayout,
    cache: Option<&wgpu::PipelineCache>,
    blend: wgpu::BlendState,
    pipeline_label: &'static str,
    layout_label: &'static str,
    fragment_entry: &'static str,
) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-image-transform-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/image_transform.wgsl").into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some(layout_label),
        bind_group_layouts: &[Some(image_bgl)],
        immediate_size: 0,
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(pipeline_label),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<
                    crate::paint::instances::BridgeImageTransformInstance,
                >() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // @location(0) p0: vec4<f32> — p0x, p0y, p1x, p1y
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(1) p1: vec4<f32> — p2x, p2y, p3x, p3y
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                    // @location(2) opacity: vec4<f32> — opacity.x used, rest padded
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
            entry_point: Some(fragment_entry),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(blend),
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
