// native/libvexart/src/paint/context.rs
// Real WGPU context: Instance/Adapter/Device/Queue + image bind group layout + PipelineRegistry.
// Per design §17.1, §17.4. Replaces Phase 2 Slice 2 placeholder.
// Phase 2b Slice 6.1: accepts PipelineCacheManager for fast warm-start (REQ-2B-601).

use crate::paint::pipeline_cache::PipelineCacheManager;
use crate::paint::pipelines::PipelineRegistry;

/// Real WGPU rendering context — owns Device, Queue, image BGL, and all render pipelines.
pub struct WgpuContext {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    /// 2-binding BGL (texture @ 0, sampler @ 1, both fragment-visible).
    /// Ported from bridge L2185-2205.
    pub image_bind_group_layout: wgpu::BindGroupLayout,
    /// Shared sampler for all composite/image bind groups (ClampToEdge, Linear).
    /// Avoids creating a new sampler per frame per layer.
    pub cached_sampler: wgpu::Sampler,
    /// All render pipelines.
    pub pipelines: PipelineRegistry,
    /// Pipeline cache manager for fast warm-start persistence (REQ-2B-601).
    pub pipeline_cache_mgr: PipelineCacheManager,
}

impl WgpuContext {
    /// Initialize WGPU: request adapter → request device → load pipeline cache →
    /// build image BGL → create all pipelines (with cache) → save cache to disk.
    ///
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

        let pipeline_cache_supported = adapter.features().contains(wgpu::Features::PIPELINE_CACHE);
        let required_features = if pipeline_cache_supported {
            wgpu::Features::PIPELINE_CACHE
        } else {
            wgpu::Features::empty()
        };

        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("vexart-device"),
            required_features,
            required_limits: wgpu::Limits::downlevel_defaults(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
            experimental_features: Default::default(),
        }))
        .expect("failed to create WGPU device");

        // Load persisted pipeline cache from disk (REQ-2B-601).
        // On first run / cold start: cached_data is None.
        // On warm start: cached_data is Some(bytes) from previous run.
        let pipeline_cache_mgr = PipelineCacheManager::new();

        // Create the WGPU PipelineCache handle.
        // SAFETY: data comes from a previous wgpu call (get_data()) on the same platform/version.
        //         The version tag in the filename ensures we only load compatible data (REQ-2B-602).
        //         fallback: true means wgpu will create an empty cache if data is invalid (REQ-2B-604).
        let wgpu_pipeline_cache = if pipeline_cache_supported {
            Some(unsafe {
                device.create_pipeline_cache(&wgpu::PipelineCacheDescriptor {
                    label: Some("vexart-pipeline-cache"),
                    data: pipeline_cache_mgr.data(),
                    fallback: true,
                })
            })
        } else {
            None
        };

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

        let cached_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("vexart-cached-sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let pipelines = PipelineRegistry::new(
            &device,
            wgpu::TextureFormat::Rgba8Unorm,
            &image_bind_group_layout,
            wgpu_pipeline_cache.as_ref(),
        );

        // Save compiled pipeline cache to disk for next run (REQ-2B-601).
        // get_data() returns None on Metal/non-Vulkan — save() handles that gracefully.
        if let Some(cache) = &wgpu_pipeline_cache {
            if let Some(data) = cache.get_data() {
                pipeline_cache_mgr.save(&data);
            }
        }

        Self {
            device,
            queue,
            image_bind_group_layout,
            cached_sampler,
            pipelines,
            pipeline_cache_mgr,
        }
    }
}
