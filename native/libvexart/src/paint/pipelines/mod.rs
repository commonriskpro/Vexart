// native/libvexart/src/paint/pipelines/mod.rs
// PipelineRegistry: holds all 20 GPU render pipelines (13 ported + 4 new from Slice 5b
// + 1 MSDF text + 1 self-filter + 1 analytic shadow pipeline).
// Per design §17.1, §17.6, tasks 5a.2–5a.15, 5b.1–5b.5, 4.3.

pub mod backdrop_blur;
pub mod backdrop_filter;
pub mod bezier;
pub mod circle;
pub mod filter;
pub mod glyph;
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
pub mod shadow;
pub mod starfield;

use wgpu::{BindGroupLayout, Device, RenderPipeline, TextureFormat};

/// Holds all 20 render pipelines indexed by cmd_kind.
/// cmd_kind allocation per design §17.6 (as-deployed in Slice 5a + 5b + Phase 2b Slice 4 + 5):
///   Slice 5a (ported):
///     0 = rect, 1 = shape_rect, 2 = shape_rect_corners, 3 = circle,
///     4 = polygon, 5 = bezier, 6 = glow, 7 = nebula, 8 = starfield,
///     9 = image, 10 = image_transform, 11 = reserved (legacy glyph slot — unused),
///     12 = gradient_linear, 13 = gradient_radial
///   Slice 5b (NEW GPU pipelines, DEC-012):
///     14 = gradient_conic, 15 = backdrop_blur, 16 = backdrop_filter, 17 = image_mask
///   Phase 2b Slice 4 (MSDF text):
///     18 = glyph (MSDF text, REQ-2B-203/204)
///   Phase 2b Slice 5 (self-filter):
///     19 = self_filter (REQ-2B-402/403/404)
///   Phase 4+:
///     20 = shadow (analytic box-shadow)
///   21..=31 reserved for future pipelines (blend, gradient_stroke, etc.)
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
    // ── Phase 2b Slice 4 (MSDF text) ─────────────────────────────────────────
    pub glyph: RenderPipeline,
    // ── Phase 2b Slice 5 (self-filter) ───────────────────────────────────────
    pub self_filter: RenderPipeline,
    // ── Phase 4+ ─────────────────────────────────────────────────────────────
    pub shadow: RenderPipeline,
}

impl PipelineRegistry {
    /// Create all 20 pipelines. Called once at WgpuContext init.
    ///
    /// `cache` — optional wgpu PipelineCache handle for fast warm-start (REQ-2B-601).
    /// On backends that don't support caching (Metal), cache is a no-op and ignored by wgpu.
    pub fn new(
        device: &Device,
        format: TextureFormat,
        image_bgl: &BindGroupLayout,
        cache: Option<&wgpu::PipelineCache>,
    ) -> Self {
        Self {
            // Slice 5a
            rect: rect::create(device, format, cache),
            shape_rect: shape_rect::create(device, format, cache),
            shape_rect_corners: rect_corners::create(device, format, cache),
            circle: circle::create(device, format, cache),
            polygon: polygon::create(device, format, cache),
            bezier: bezier::create(device, format, cache),
            glow: glow::create(device, format, cache),
            nebula: nebula::create(device, format, cache),
            starfield: starfield::create(device, format, cache),
            image: image::create(device, format, image_bgl, cache),
            image_transform: image_transform::create(device, format, image_bgl, cache),
            gradient_linear: gradient_linear::create(device, format, cache),
            gradient_radial: gradient_radial::create(device, format, cache),
            // Slice 5b
            gradient_conic: gradient_conic::create(device, format, cache),
            backdrop_blur: backdrop_blur::create(device, format, image_bgl, cache),
            backdrop_filter: backdrop_filter::create(device, format, image_bgl, cache),
            image_mask: image_mask::create(device, format, image_bgl, cache),
            // Phase 2b Slice 4
            glyph: glyph::create(device, format, image_bgl, cache),
            // Phase 2b Slice 5 — self-filter
            self_filter: filter::create(device, format, image_bgl, cache),
            // Phase 4+ — analytic box-shadow
            shadow: shadow::create(device, format, cache),
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

        // Should not panic — all 19 pipelines compile successfully (13 Slice 5a + 4 Slice 5b + 2 Phase 2b).
        let _registry = PipelineRegistry::new(&device, TextureFormat::Rgba8Unorm, &image_bgl, None);
    }
}
