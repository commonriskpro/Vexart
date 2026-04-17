// native/libvexart/src/layout/writeback.rs
// Writes Taffy computed layout → caller output buffer as PositionedCommand[].
// Phase 2 stub: real implementation lands in Slice 6.

use crate::layout::tree::LayoutTree;

/// Phase 2 stub: writes 0 bytes to out, sets out_used = 0.
/// Real implementation in Slice 6 iterates Taffy node results and writes PositionedCommand structs.
pub fn write_layout(_tree: &LayoutTree, _out: &mut [u8], out_used: &mut u32) {
    *out_used = 0;
    // TODO(Slice 6): iterate taffy node layout results, write PositionedCommand per node.
}
