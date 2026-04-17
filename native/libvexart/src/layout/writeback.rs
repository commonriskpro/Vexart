// native/libvexart/src/layout/writeback.rs
// Writes Taffy computed layout → caller output buffer as PositionedCommand[].
//
// ## Output Buffer Format
//
// ### GraphHeader (16 bytes, same as input format per design §8)
//
// | Offset | Size | Field          | Notes                              |
// |-------:|-----:|----------------|------------------------------------|
// |      0 |  u32 | `magic`        | `0x56584152` (`"VXAR"`)            |
// |      4 |  u32 | `version`      | `0x00020000`                       |
// |      8 |  u32 | `cmd_count`    | Number of PositionedCommand records |
// |     12 |  u32 | `payload_bytes`| Total bytes after header (cmd_count × 40) |
//
// ### PositionedCommand (40 bytes each, written starting at offset 16)
//
// | Offset | Size | Field       | Notes                                  |
// |-------:|-----:|-------------|----------------------------------------|
// |      0 |  u64 | `node_id`   | Stable Vexart ID matching input        |
// |      8 |  f32 | `x`         | Top-left x in parent-relative coords   |
// |     12 |  f32 | `y`         | Top-left y in parent-relative coords   |
// |     16 |  f32 | `width`     | Computed width                         |
// |     20 |  f32 | `height`    | Computed height                        |
// |     24 |  f32 | `content_x` | Padding offset x (location + padding.left) |
// |     28 |  f32 | `content_y` | Padding offset y (location + padding.top) |
// |     32 |  f32 | `content_w` | Content-area width                     |
// |     36 |  f32 | `content_h` | Content-area height                    |
//
// Walk order: nodes sorted by Vexart node_id ascending for deterministic output across frames.
//
// If `out.len()` < 16 + N×40, writes as many complete records as fit. Sets `*out_used` to
// bytes actually written. Returns OK — caller checks `*out_used` vs expected.

use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
use crate::ffi::panic::OK;
use crate::layout::tree::LayoutTree;

/// Size of one PositionedCommand record in bytes.
pub const POSITIONED_COMMAND_BYTES: usize = 40;

/// Write computed layout to `out`, setting `*out_used` to bytes written.
///
/// Returns `OK` always. If the buffer is too small for all records,
/// writes as many as fit (including the header if ≥ 16 bytes available).
pub fn write_layout(tree: &LayoutTree, out: &mut [u8], out_used: &mut u32) -> i32 {
    // Collect all (node_id, NodeId) pairs, sorted by stable ID for determinism.
    let mut entries: Vec<(u64, taffy::NodeId)> =
        tree.id_map.iter().map(|(&id, &node)| (id, node)).collect();
    entries.sort_unstable_by_key(|&(id, _)| id);

    let cmd_count = entries.len();
    let payload_bytes = cmd_count * POSITIONED_COMMAND_BYTES;
    let total_needed = 16 + payload_bytes;

    // Write the header if we have at least 16 bytes.
    if out.len() < 16 {
        *out_used = 0;
        return OK;
    }

    out[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    out[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    out[8..12].copy_from_slice(&(cmd_count as u32).to_le_bytes());
    out[12..16].copy_from_slice(&(payload_bytes as u32).to_le_bytes());

    if total_needed > out.len() {
        // Buffer too small for all records; write as many as fit.
        let records_that_fit = (out.len() - 16) / POSITIONED_COMMAND_BYTES;
        let mut offset = 16usize;
        for (node_id, taffy_node) in entries.iter().take(records_that_fit) {
            write_record(tree, *node_id, *taffy_node, out, offset);
            offset += POSITIONED_COMMAND_BYTES;
        }
        *out_used = offset as u32;
        return OK;
    }

    // Enough space — write all records.
    let mut offset = 16usize;
    for (node_id, taffy_node) in &entries {
        write_record(tree, *node_id, *taffy_node, out, offset);
        offset += POSITIONED_COMMAND_BYTES;
    }
    *out_used = offset as u32;
    OK
}

/// Write a single 40-byte PositionedCommand at `out[offset..]`.
fn write_record(
    tree: &LayoutTree,
    node_id: u64,
    taffy_node: taffy::NodeId,
    out: &mut [u8],
    offset: usize,
) {
    let layout = match tree.taffy.layout(taffy_node) {
        Ok(l) => l,
        Err(_) => {
            // Node has no computed layout (shouldn't happen after compute(); write zeros).
            out[offset..offset + POSITIONED_COMMAND_BYTES].fill(0);
            return;
        }
    };

    let x = layout.location.x;
    let y = layout.location.y;
    let w = layout.size.width;
    let h = layout.size.height;
    // Content area = size minus padding (Taffy's padding field is top/right/bottom/left).
    let content_x = x + layout.padding.left;
    let content_y = y + layout.padding.top;
    let content_w = w - layout.padding.left - layout.padding.right;
    let content_h = h - layout.padding.top - layout.padding.bottom;

    out[offset..offset + 8].copy_from_slice(&node_id.to_le_bytes());
    out[offset + 8..offset + 12].copy_from_slice(&x.to_le_bytes());
    out[offset + 12..offset + 16].copy_from_slice(&y.to_le_bytes());
    out[offset + 16..offset + 20].copy_from_slice(&w.to_le_bytes());
    out[offset + 20..offset + 24].copy_from_slice(&h.to_le_bytes());
    out[offset + 24..offset + 28].copy_from_slice(&content_x.to_le_bytes());
    out[offset + 28..offset + 32].copy_from_slice(&content_y.to_le_bytes());
    out[offset + 32..offset + 36].copy_from_slice(&content_w.to_le_bytes());
    out[offset + 36..offset + 40].copy_from_slice(&content_h.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
    use crate::ffi::panic::OK;
    use crate::layout::tree::{build_test_buffer, LayoutTree, TestNode, FLAG_IS_ROOT};

    fn build_two_node_tree() -> LayoutTree {
        let mut tree = LayoutTree::new();
        tree.viewport_w = 800.0;
        tree.viewport_h = 600.0;

        // Two nodes: root + one child (using build_test_buffer which emits flat OPEN/CLOSE pairs)
        // For a proper parent-child we need nested buffer.
        // Use root-only for simplicity — just confirm 1 record is written.
        let root = TestNode {
            node_id: 10,
            parent_id: 0,
            flags: FLAG_IS_ROOT,
            flex_direction: 1,
            size_w_kind: 0,
            size_h_kind: 0,
            size_w_value: 0.0,
            size_h_value: 0.0,
            flex_grow: 1.0,
            justify_content: 255,
        };
        let child = TestNode {
            node_id: 20,
            parent_id: 10,
            flags: 0,
            flex_direction: 1,
            size_w_kind: 0,
            size_h_kind: 0,
            size_w_value: 0.0,
            size_h_value: 0.0,
            flex_grow: 1.0,
            justify_content: 255,
        };

        // Build nested buffer: root OPEN, child OPEN, child CLOSE, root CLOSE
        let buf = build_nested_test_buffer(&root, &[child]);
        tree.build_from_commands(&buf);
        tree.compute();
        tree
    }

    fn build_nested_test_buffer(root: &TestNode, children: &[TestNode]) -> Vec<u8> {
        use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
        use crate::layout::tree::OPEN_PAYLOAD_BYTES;

        let per_node = 8 + OPEN_PAYLOAD_BYTES + 8;
        let cmd_count = 2 + 2 * children.len();
        let payload_bytes = per_node * (1 + children.len());
        let total = 16 + payload_bytes;
        let mut buf = vec![0u8; total];

        buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&(cmd_count as u32).to_le_bytes());
        buf[12..16].copy_from_slice(&(payload_bytes as u32).to_le_bytes());

        let mut off = 16;

        let write_open = |buf: &mut Vec<u8>, off: &mut usize, node: &TestNode| {
            buf[*off..*off + 2].copy_from_slice(&0u16.to_le_bytes());
            buf[*off + 2..*off + 4].copy_from_slice(&node.flags.to_le_bytes());
            buf[*off + 4..*off + 8].copy_from_slice(&(OPEN_PAYLOAD_BYTES as u32).to_le_bytes());
            *off += 8;
            buf[*off..*off + 8].copy_from_slice(&node.node_id.to_le_bytes());
            buf[*off + 8..*off + 16].copy_from_slice(&node.parent_id.to_le_bytes());
            buf[*off + 16] = node.flex_direction;
            buf[*off + 18] = node.size_w_kind;
            buf[*off + 19] = node.size_h_kind;
            buf[*off + 20..*off + 24].copy_from_slice(&node.size_w_value.to_le_bytes());
            buf[*off + 24..*off + 28].copy_from_slice(&node.size_h_value.to_le_bytes());
            buf[*off + 44..*off + 48].copy_from_slice(&node.flex_grow.to_le_bytes());
            buf[*off + 48..*off + 52].copy_from_slice(&1.0f32.to_le_bytes());
            buf[*off + 52] = node.justify_content;
            buf[*off + 53] = 255;
            buf[*off + 54] = 255;
            *off += OPEN_PAYLOAD_BYTES;
        };

        let write_close = |buf: &mut Vec<u8>, off: &mut usize| {
            buf[*off..*off + 2].copy_from_slice(&1u16.to_le_bytes());
            buf[*off + 2..*off + 4].copy_from_slice(&0u16.to_le_bytes());
            buf[*off + 4..*off + 8].copy_from_slice(&0u32.to_le_bytes());
            *off += 8;
        };

        write_open(&mut buf, &mut off, root);
        for child in children {
            write_open(&mut buf, &mut off, child);
            write_close(&mut buf, &mut off);
        }
        write_close(&mut buf, &mut off);
        buf
    }

    #[test]
    fn test_write_layout_writes_header_and_records() {
        let tree = build_two_node_tree();
        // 2 nodes → 16 + 2*40 = 96 bytes
        let expected = 16 + 2 * POSITIONED_COMMAND_BYTES; // 96
        let mut out = vec![0u8; expected];
        let mut used = 0u32;
        let code = write_layout(&tree, &mut out, &mut used);
        assert_eq!(code, OK);
        assert_eq!(
            used as usize, expected,
            "expected {expected} bytes, got {used}"
        );

        // Verify header
        let magic = u32::from_le_bytes(out[0..4].try_into().unwrap());
        let version = u32::from_le_bytes(out[4..8].try_into().unwrap());
        let cmd_count = u32::from_le_bytes(out[8..12].try_into().unwrap());
        assert_eq!(magic, GRAPH_MAGIC);
        assert_eq!(version, GRAPH_VERSION);
        assert_eq!(cmd_count, 2);
    }

    #[test]
    fn test_write_layout_respects_out_cap_truncation() {
        let tree = build_two_node_tree();
        // Provide a 50-byte buffer — not enough for 2 records (needs 96).
        // Header (16) fits, but 16 + 40 = 56 > 50, so even 1 record doesn't fit.
        // Should write header only (16 bytes).
        let mut out = vec![0u8; 50];
        let mut used = 0u32;
        let code = write_layout(&tree, &mut out, &mut used);
        assert_eq!(code, OK);
        // 50 bytes available; (50 - 16) / 40 = 0 records fit.
        // Should write header + 0 records = 16 bytes.
        assert_eq!(used, 16, "expected header only (16 bytes), got {used}");

        let magic = u32::from_le_bytes(out[0..4].try_into().unwrap());
        assert_eq!(magic, GRAPH_MAGIC);
    }
}
