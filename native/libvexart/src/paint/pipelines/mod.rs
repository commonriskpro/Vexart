// native/libvexart/src/paint/pipelines/mod.rs
// PipelineRegistry: holds all 17 GPU render pipelines (13 ported + 4 new from Slice 5b).
// Per design §17.1, §17.6, tasks 5a.2–5a.15, 5b.1–5b.5.

pub mod backdrop_blur;
pub mod backdrop_filter;
pub mod bezier;
pub mod circle;
pub mod glow;
pub mod gradient_conic;
pub mod gradient_linear;
pub mod gradient_radial;
pub mod image;
pub mod image_mask;
pub mod image_transform;
pub mod nebula;
pub mod polygon;
pub mod rect;
pub mod rect_corners;
pub mod shape_rect;
pub mod starfield;

use wgpu::{BindGroupLayout, Device, RenderPipeline, TextureFormat};

/// Holds all 17 render pipelines indexed by cmd_kind.
/// cmd_kind allocation per design §17.6 (as-deployed in Slice 5a + 5b):
///   Slice 5a (ported):
///     0 = rect, 1 = shape_rect, 2 = shape_rect_corners, 3 = circle,
///     4 = polygon, 5 = bezier, 6 = glow, 7 = nebula, 8 = starfield,
///     9 = image, 10 = image_transform, 11 = reserved (glyph, DEC-011),
///     12 = gradient_linear, 13 = gradient_radial
///   Slice 5b (NEW GPU pipelines, DEC-012):
///     14 = gradient_conic, 15 = backdrop_blur, 16 = backdrop_filter, 17 = image_mask
///   18..=31 reserved for Phase 2b (blend, gradient_stroke, MSDF text, etc.)
pub struct PipelineRegistry {
    // ── Slice 5a ──────────────────────────────────────────────────────────────
    pub rect: RenderPipeline,
    pub shape_rect: RenderPipeline,
    pub shape_rect_corners: RenderPipeline,
    pub circle: RenderPipeline,
    pub polygon: RenderPipeline,
    pub bezier: RenderPipeline,
    pub glow: RenderPipeline,
    pub nebula: RenderPipeline,
    pub starfield: RenderPipeline,
    pub image: RenderPipeline,
    pub image_transform: RenderPipeline,
    pub gradient_linear: RenderPipeline,
    pub gradient_radial: RenderPipeline,
    // ── Slice 5b ──────────────────────────────────────────────────────────────
    pub gradient_conic: RenderPipeline,
    pub backdrop_blur: RenderPipeline,
    pub backdrop_filter: RenderPipeline,
    pub image_mask: RenderPipeline,
}

impl PipelineRegistry {
    /// Create all 17 pipelines. Called once at WgpuContext init.
    pub fn new(device: &Device, format: TextureFormat, image_bgl: &BindGroupLayout) -> Self {
        Self {
            // Slice 5a
            rect: rect::create(device, format),
            shape_rect: shape_rect::create(device, format),
            shape_rect_corners: rect_corners::create(device, format),
            circle: circle::create(device, format),
            polygon: polygon::create(device, format),
            bezier: bezier::create(device, format),
            glow: glow::create(device, format),
            nebula: nebula::create(device, format),
            starfield: starfield::create(device, format),
            image: image::create(device, format, image_bgl),
            image_transform: image_transform::create(device, format, image_bgl),
            gradient_linear: gradient_linear::create(device, format),
            gradient_radial: gradient_radial::create(device, format),
            // Slice 5b
            gradient_conic: gradient_conic::create(device, format),
            backdrop_blur: backdrop_blur::create(device, format, image_bgl),
            backdrop_filter: backdrop_filter::create(device, format, image_bgl),
            image_mask: image_mask::create(device, format, image_bgl),
        }
    }
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_pipeline_registry_creates_all() {
        use super::*;
        use wgpu::TextureFormat;

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
        .expect("no adapter");

        let (device, _queue) =
            pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
                label: Some("test-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
                experimental_features: Default::default(),
            }))
            .expect("device creation failed");

        let image_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("test-image-bgl"),
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

        // Should not panic — all 17 pipelines compile successfully (13 Slice 5a + 4 Slice 5b).
        let _registry = PipelineRegistry::new(&device, TextureFormat::Rgba8Unorm, &image_bgl);
    }
}
