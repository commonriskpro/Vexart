// native/libvexart/src/paint/pipelines/mod.rs
// Pipeline registry — each render pipeline lives in its own submodule.
// Stubs here; real WGSL + RenderPipeline creation lands in Slice 5.

// Slice 5 pipeline modules (created empty for now):
// pub mod rect;
// pub mod rect_corners;
// pub mod circle;
// pub mod line;
// pub mod bezier;
// pub mod polygon;
// pub mod gradient_linear;
// pub mod gradient_radial;
// pub mod gradient_conic;
// pub mod gradient_stroke;
// pub mod image;
// pub mod image_transform;
// pub mod glow;
// pub mod shadow;
// pub mod blur;
// pub mod filter;
// pub mod blend;

/// Holds all render pipelines per kind. Empty in Phase 2 Slice 2.
pub struct PipelineRegistry {
    // TODO(Slice 5): add wgpu::RenderPipeline fields per primitive kind.
    _placeholder: (),
}

impl PipelineRegistry {
    pub fn new_stub() -> Self {
        Self { _placeholder: () }
    }
}
