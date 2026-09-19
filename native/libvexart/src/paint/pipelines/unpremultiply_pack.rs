// native/libvexart/src/paint/pipelines/unpremultiply_pack.rs
// GPU compute pipeline to unpremultiply premultiplied RGBA targets and pack them
// into contiguous straight-alpha u32 little-endian pixels without row padding.

use wgpu::{BindGroupLayout, ComputePipeline, Device};

pub fn create_bind_group_layout(device: &Device) -> BindGroupLayout {
    device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("vexart-unpremultiply-pack-bgl"),
        entries: &[
            // @binding(0): t_input: texture_2d<f32>
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            // @binding(1): output_buffer: array<u32> (storage, read_write)
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: false },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            // @binding(2): uniforms: Uniforms { width, height }
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    })
}

pub fn create(
    device: &Device,
    bgl: &BindGroupLayout,
    cache: Option<&wgpu::PipelineCache>,
) -> ComputePipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("vexart-unpremultiply-pack-shader"),
        source: wgpu::ShaderSource::Wgsl(
            include_str!("../shaders/unpremultiply_pack.wgsl").into(),
        ),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("vexart-unpremultiply-pack-pipeline-layout"),
        bind_group_layouts: &[Some(bgl)],
        immediate_size: 0,
    });

    device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("vexart-unpremultiply-pack-pipeline"),
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: Some("cs_main"),
        compilation_options: wgpu::PipelineCompilationOptions::default(),
        cache,
    })
}

