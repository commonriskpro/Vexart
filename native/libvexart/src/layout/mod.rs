// native/libvexart/src/layout/mod.rs
// LayoutContext owns the Taffy tree and provides compute/measure/writeback entry points.
// Phase 2 stubs: layout commands decoded in Slice 6; measure returns (0, 0) per DEC-011.

pub mod tree;
pub mod writeback;

use crate::ffi::panic::OK;

/// Owns the Taffy layout tree for a single vexart context.
pub struct LayoutContext {
    pub tree: tree::LayoutTree,
}

impl LayoutContext {
    pub fn new() -> Self {
        Self {
            tree: tree::LayoutTree::new(),
        }
    }

    /// Phase 2 stub: parse flat command buffer, build Taffy tree, compute layout.
    pub fn compute(&mut self, _cmds: &[u8], _out: &mut [u8], out_used: &mut u32) -> i32 {
        *out_used = 0;
        OK
    }

    /// Phase 2 stub: measure returns (0.0, 0.0) per DEC-011.
    pub fn measure(
        &self,
        _text: &[u8],
        _font_id: u32,
        _font_size: f32,
        out_w: &mut f32,
        out_h: &mut f32,
    ) -> i32 {
        *out_w = 0.0;
        *out_h = 0.0;
        OK
    }

    /// Phase 2 stub: process writeback (scroll offsets, handle updates).
    pub fn writeback(&mut self, _wb: &[u8]) -> i32 {
        OK
    }
}
