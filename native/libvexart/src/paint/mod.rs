// native/libvexart/src/paint/mod.rs
// PaintContext stub — real WGPU init lands in Slice 5.

pub mod context;
pub mod instances;
pub mod pipelines;

use crate::ffi::panic::OK;
use crate::types::FrameStats;

/// Owns the WGPU rendering context and all render pipelines.
pub struct PaintContext {
    pub wgpu: context::WgpuContext,
}

impl PaintContext {
    pub fn new() -> Self {
        Self {
            wgpu: context::WgpuContext::new(),
        }
    }

    /// Phase 2 stub: parse graph buffer and dispatch draw calls.
    /// Real implementation lands in Slice 5.
    pub fn dispatch(&mut self, _target: u64, _graph: &[u8], stats_out: *mut FrameStats) -> i32 {
        if !stats_out.is_null() {
            // SAFETY: caller guarantees valid pointer.
            unsafe {
                *stats_out = FrameStats::default();
            }
        }
        OK
    }
}
