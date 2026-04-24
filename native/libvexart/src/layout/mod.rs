// native/libvexart/src/layout/mod.rs
// LayoutContext owns the Taffy tree and provides compute/measure/writeback entry points.
// Phase 2: real Taffy integration in Slice 6. measure returns (0, 0) per DEC-011.

pub mod tree;
pub mod writeback;

use crate::ffi::buffer::parse_header;
use crate::ffi::panic::{ERR_INVALID_ARG, OK};
use crate::scene::SceneGraph;
use crate::text::atlas::AtlasRegistry;
use crate::text::{measure_text_layout, WhiteSpaceMode, WordBreakMode};

/// Owns the Taffy layout tree and viewport state for a single vexart context.
///
/// # Viewport
/// `viewport_w` and `viewport_h` default to 1920×1080. They are updated by
/// `vexart_context_resize` which calls the singleton's setter. Full multi-context
/// support (the `ctx: u64` parameter) is deferred to Phase 3 (TODO Phase 3: per-context
/// isolation; current impl uses a single global `SHARED_LAYOUT`).
pub struct LayoutContext {
    pub tree: tree::LayoutTree,
}

impl LayoutContext {
    pub fn new() -> Self {
        Self {
            tree: tree::LayoutTree::new(),
        }
    }

    /// Set the viewport size used for layout computation.
    ///
    /// Called by `vexart_context_resize`. Default is 1920×1080.
    pub fn set_viewport(&mut self, w: f32, h: f32) {
        self.tree.viewport_w = w;
        self.tree.viewport_h = h;
    }

    /// Parse flat command buffer, build Taffy tree, compute layout, write PositionedCommands.
    ///
    /// Per design §5.2 (vexart_layout_compute).
    pub fn compute(&mut self, cmds: &[u8], out: &mut [u8], out_used: &mut u32) -> i32 {
        // Build the Taffy tree from the input command buffer.
        let code = self.tree.build_from_commands(cmds);
        if code != OK {
            *out_used = 0;
            return code;
        }

        // Compute layout against current viewport size.
        let code = self.tree.compute(None);
        if code != OK {
            *out_used = 0;
            return code;
        }

        // Write the PositionedCommand output buffer.
        writeback::write_layout(&self.tree, out, out_used)
    }

    pub fn compute_scene(&mut self, scene: &SceneGraph, atlases: Option<&AtlasRegistry>, out: &mut [u8], out_used: &mut u32) -> i32 {
        let code = self.tree.build_from_scene(scene);
        if code != OK {
            *out_used = 0;
            return code;
        }
        let code = self.tree.compute(atlases);
        if code != OK {
            *out_used = 0;
            return code;
        }
        writeback::write_layout(&self.tree, out, out_used)
    }

    /// Native text measure shared with retained layout.
    pub fn measure(
        &self,
        text: &[u8],
        font_id: u32,
        font_size: f32,
        atlases: Option<&AtlasRegistry>,
        out_w: &mut f32,
        out_h: &mut f32,
    ) -> i32 {
        let text = String::from_utf8_lossy(text);
        let (width, height) = measure_text_layout(
            &text,
            font_id,
            font_size,
            font_size.max(17.0),
            None,
            WhiteSpaceMode::Normal,
            WordBreakMode::Normal,
            atlases,
        );
        *out_w = width;
        *out_h = height;
        OK
    }

    /// Phase 2 writeback: parse scroll-offset records, validate format.
    ///
    /// Each record: u64 node_id + f32 scroll_x + f32 scroll_y = 16 bytes.
    /// Parsing validates the buffer has a proper GraphHeader and 16-byte records.
    /// Actual scroll offsets are NOT applied in Slice 6 (deferred to Slice 9 paint integration).
    ///
    /// Returns OK if format valid, ERR_INVALID_ARG if malformed.
    pub fn writeback(&mut self, wb: &[u8]) -> i32 {
        // Empty buffer is valid (no-op).
        if wb.is_empty() {
            return OK;
        }

        // Parse and validate the header.
        let header = match parse_header(wb) {
            Ok(h) => h,
            Err(_) => return ERR_INVALID_ARG,
        };

        // Each record is 16 bytes (u64 node_id + f32 scroll_x + f32 scroll_y).
        const RECORD_BYTES: usize = 16;
        let expected_payload = header.cmd_count as usize * RECORD_BYTES;
        if wb.len() < 16 + expected_payload {
            return ERR_INVALID_ARG;
        }

        // Validate each record: just parse node_id, scroll_x, scroll_y.
        // Actual application is deferred to Slice 9 (paint/scroll integration TODO).
        let mut offset = 16usize;
        for _ in 0..header.cmd_count {
            if offset + RECORD_BYTES > wb.len() {
                return ERR_INVALID_ARG;
            }
            let _node_id = u64::from_le_bytes(wb[offset..offset + 8].try_into().unwrap());
            let _scroll_x = f32::from_le_bytes(wb[offset + 8..offset + 12].try_into().unwrap());
            let _scroll_y = f32::from_le_bytes(wb[offset + 12..offset + 16].try_into().unwrap());
            offset += RECORD_BYTES;
        }

        OK
    }
}
