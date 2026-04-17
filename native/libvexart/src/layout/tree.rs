// native/libvexart/src/layout/tree.rs
// LayoutTree: owns a Taffy tree + stable ID → NodeId mapping.
// Phase 2 stub: real Taffy integration lands in Slice 6.

use std::collections::HashMap;
use taffy::prelude::*;

/// Maps stable Vexart node IDs (u64) to Taffy NodeIds.
pub struct LayoutTree {
    pub taffy: TaffyTree<()>,
    pub id_map: HashMap<u64, NodeId>,
    pub root: Option<NodeId>,
}

impl LayoutTree {
    pub fn new() -> Self {
        Self {
            taffy: TaffyTree::new(),
            id_map: HashMap::new(),
            root: None,
        }
    }

    /// Phase 2 stub: build Taffy tree from flat command buffer.
    /// Real implementation lands in Slice 6.
    pub fn build_from_commands(&mut self, _cmds: &[u8]) {
        // TODO(Slice 6): parse flat command buffer into Taffy Style nodes.
    }

    /// Phase 2 stub: compute layout for the given available space.
    pub fn compute_layout(&mut self, _available_width: f32, _available_height: f32) {
        // TODO(Slice 6): call taffy.compute_layout_with_measure().
    }
}
