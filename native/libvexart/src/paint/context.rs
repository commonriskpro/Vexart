// native/libvexart/src/paint/context.rs
// Real WGPU context: Instance/Adapter/Device/Queue + image bind group layout + PipelineRegistry.
// Per design §17.1, §17.4. Replaces Phase 2 Slice 2 placeholder.

use crate::paint::pipelines::PipelineRegistry;

/// Real WGPU rendering context — owns Device, Queue, image BGL, and all 13 render pipelines.
pub struct WgpuContext {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    /// 2-binding BGL (texture @ 0, sampler @ 1, both fragment-visible).
    /// Ported from bridge L2185-2205.
    pub image_bind_group_layout: wgpu::BindGroupLayout,
    /// All 13 ported render pipelines.
    pub pipelines: PipelineRegistry,
}

impl WgpuContext {
    /// Initialize WGPU: request adapter → request device → build image BGL → create all pipelines.
    /// Blocks on the async calls via pollster. Panics if no suitable adapter is found
    /// (caller's ffi_guard! converts that to ERR_PANIC with a descriptive message).
    pub fn new() -> Self {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::empty(),
            backend_options: wgpu::BackendOptions::default(),
            memory_budget_thresholds: Default::default(),
            display: Default::default(),
        });

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .expect("no suitable WGPU adapter found");

        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("vexart-device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
            experimental_features: Default::default(),
        }))
        .expect("failed to create WGPU device");

        // 2-binding image BGL — ported from bridge L2185-2205.
        let image_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("vexart-image-bind-group-layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

        let pipelines = PipelineRegistry::new(
            &device,
            wgpu::TextureFormat::Rgba8Unorm,
            &image_bind_group_layout,
        );

        Self {
            device,
            queue,
            image_bind_group_layout,
            pipelines,
        }
    }
}
