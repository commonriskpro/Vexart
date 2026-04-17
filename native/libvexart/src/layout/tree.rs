/// # Layout Input Buffer Format
///
/// `vexart_layout_compute(ctx, cmds_ptr, cmds_len, out_ptr, out_cap, out_used)` consumes a
/// flat byte buffer describing the node tree. This document is the canonical definition.
///
/// ## GraphHeader (16 bytes — same structure as paint/composite buffers per design §8)
///
/// | Offset | Size | Field          | Value                              |
/// |-------:|-----:|----------------|-------------------------------------|
/// |      0 |  u32 | `magic`        | `0x56584152` (`"VXAR"`)             |
/// |      4 |  u32 | `version`      | `0x00020000`                        |
/// |      8 |  u32 | `cmd_count`    | Number of node commands that follow |
/// |     12 |  u32 | `payload_bytes`| Total bytes of all payloads after header |
///
/// ## Per-Node Command Prefix (8 bytes)
///
/// | Offset | Size | Field          | Notes                                          |
/// |-------:|-----:|----------------|------------------------------------------------|
/// |      0 |  u16 | `cmd_kind`     | `0` = LAYOUT_NODE_OPEN, `1` = LAYOUT_NODE_CLOSE |
/// |      2 |  u16 | `flags`        | bit 0: is_root, bit 1: floating-absolute, bit 2: scroll_x, bit 3: scroll_y |
/// |      4 |  u32 | `payload_bytes`| Byte length of payload following this 8-byte prefix |
///
/// ## LAYOUT_NODE_OPEN Payload (~100 bytes)
///
/// | Offset | Size | Field              | Notes                                |
/// |-------:|-----:|---------------------|--------------------------------------|
/// |      0 |  u64 | `node_id`          | Stable Vexart node ID (reconciler hash) |
/// |      8 |  u64 | `parent_node_id`   | `0` if is_root, else parent's stable ID |
/// |     16 |   u8 | `flex_direction`   | 0=Row, 1=Column, 2=RowReverse, 3=ColumnReverse |
/// |     17 |   u8 | `position_kind`    | 0=Relative, 1=Absolute              |
/// |     18 |   u8 | `size_w_kind`      | 0=Auto, 1=Length, 2=Percent         |
/// |     19 |   u8 | `size_h_kind`      | 0=Auto, 1=Length, 2=Percent         |
/// |     20 |  f32 | `size_w_value`     |                                     |
/// |     24 |  f32 | `size_h_value`     |                                     |
/// |     28 |  f32 | `min_w`            |                                     |
/// |     32 |  f32 | `min_h`            |                                     |
/// |     36 |  f32 | `max_w`            | `0.0` = no constraint               |
/// |     40 |  f32 | `max_h`            | `0.0` = no constraint               |
/// |     44 |  f32 | `flex_grow`        |                                     |
/// |     48 |  f32 | `flex_shrink`      |                                     |
/// |     52 |   u8 | `justify_content`  | 0=Start, 1=End, 2=Center, 3=SpaceBetween, 4=SpaceAround, 5=SpaceEvenly, 255=None |
/// |     53 |   u8 | `align_items`      | same enum                           |
/// |     54 |   u8 | `align_content`    | same enum                           |
/// |     55 |   u8 | `_pad`             | reserved, must be 0                 |
/// |     56 |  f32 | `padding_top`      |                                     |
/// |     60 |  f32 | `padding_right`    |                                     |
/// |     64 |  f32 | `padding_bottom`   |                                     |
/// |     68 |  f32 | `padding_left`     |                                     |
/// |     72 |  f32 | `border_top`       |                                     |
/// |     76 |  f32 | `border_right`     |                                     |
/// |     80 |  f32 | `border_bottom`    |                                     |
/// |     84 |  f32 | `border_left`      |                                     |
/// |     88 |  f32 | `gap_row`          |                                     |
/// |     92 |  f32 | `gap_column`       |                                     |
/// |     96 |  f32 | `inset_top`        | Only meaningful if position_kind=Absolute |
/// |    100 |  f32 | `inset_right`      |                                     |
/// |    104 |  f32 | `inset_bottom`     |                                     |
/// |    108 |  f32 | `inset_left`       |                                     |
///
/// Total OPEN payload: 112 bytes.
///
/// ## LAYOUT_NODE_CLOSE Payload
///
/// Zero bytes. Closes the most recently opened node, popping the parent stack.
///
/// ## Tree Construction
///
/// Commands form a nested open/close pair structure. The parser maintains a parent stack.
/// - On OPEN: create or update Taffy node, push to parent stack; if not is_root, add as child of stack top.
/// - On CLOSE: pop the parent stack.
/// - After all commands: parent stack must be empty or a single root node (validation).
///
/// ## Notes
///
/// - All multi-byte fields are little-endian.
/// - This format is defined for Rust consumption in Slice 6. TS-side construction (Slice 9)
///   must match this spec exactly.
/// - If TS-side construction needs format adjustments, negotiate in Slice 9 and update this doc.
// native/libvexart/src/layout/tree.rs
use std::collections::HashMap;
use taffy::prelude::*;

use crate::ffi::buffer::parse_header;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_LAYOUT_FAILED, OK};

/// Command kinds in the layout input buffer.
const CMD_NODE_OPEN: u16 = 0;
const CMD_NODE_CLOSE: u16 = 1;

/// Flag bits in the per-command flags field.
const FLAG_IS_ROOT: u16 = 1 << 0;
const FLAG_FLOATING_ABSOLUTE: u16 = 1 << 1;
// FLAG_SCROLL_X = 1 << 2  (parsed but not used in Slice 6 — scroll handled paint-side)
// FLAG_SCROLL_Y = 1 << 3  (same)

/// Size of the LAYOUT_NODE_OPEN payload (fixed).
pub const OPEN_PAYLOAD_BYTES: usize = 112;

/// Packed style fields extracted from the OPEN payload starting at byte 16.
#[derive(Debug, Clone, Copy)]
pub(crate) struct PackedStyle {
    flex_direction: u8,
    position_kind: u8,
    size_w_kind: u8,
    size_h_kind: u8,
    size_w_value: f32,
    size_h_value: f32,
    min_w: f32,
    min_h: f32,
    max_w: f32,
    max_h: f32,
    flex_grow: f32,
    flex_shrink: f32,
    justify_content: u8,
    align_items: u8,
    align_content: u8,
    padding_top: f32,
    padding_right: f32,
    padding_bottom: f32,
    padding_left: f32,
    border_top: f32,
    border_right: f32,
    border_bottom: f32,
    border_left: f32,
    gap_row: f32,
    gap_column: f32,
    inset_top: f32,
    inset_right: f32,
    inset_bottom: f32,
    inset_left: f32,
}

/// Maps stable Vexart node IDs (u64) to Taffy NodeIds, and tracks parent-child relationships.
pub struct LayoutTree {
    pub taffy: TaffyTree<()>,
    /// Stable Vexart node ID → Taffy NodeId.
    pub id_map: HashMap<u64, NodeId>,
    /// The root Taffy node (set from is_root flag).
    pub root: Option<NodeId>,
    /// Viewport width for layout computation (updated by vexart_context_resize).
    pub viewport_w: f32,
    /// Viewport height for layout computation (updated by vexart_context_resize).
    pub viewport_h: f32,
}

impl LayoutTree {
    pub fn new() -> Self {
        Self {
            taffy: TaffyTree::new(),
            id_map: HashMap::new(),
            root: None,
            viewport_w: 1920.0,
            viewport_h: 1080.0,
        }
    }

    /// Parse the input flat command buffer into Taffy nodes.
    ///
    /// Returns `OK` on success, `ERR_INVALID_ARG` if the buffer is malformed.
    ///
    /// On each call, re-processes all nodes in the buffer. Existing Taffy nodes whose
    /// `node_id` matches a prior frame's entry are updated via `taffy.set_style()`
    /// (which auto-marks dirty). New nodes are created with `taffy.new_leaf()`.
    ///
    /// # Phase 2 note
    /// Old nodes not seen in the current frame are retained across frames for now.
    /// Phase 3 will add incremental diffing to prune removed nodes.
    pub fn build_from_commands(&mut self, cmds: &[u8]) -> i32 {
        // Empty buffer is valid — nothing to do (no root means no layout to compute).
        if cmds.is_empty() {
            self.root = None;
            return OK;
        }

        // Parse and validate the header.
        let header = match parse_header(cmds) {
            Ok(h) => h,
            Err(_) => return ERR_INVALID_ARG,
        };

        let mut offset = 16usize; // after header
        let mut parent_stack: Vec<NodeId> = Vec::new();
        // Track which node_ids we saw this frame for future diffing (Phase 3).
        // For now we just rebuild. If root was previously set we keep any pre-existing
        // nodes that appear again (set_style updates them).

        for _cmd_idx in 0..header.cmd_count {
            // Each command starts with an 8-byte prefix.
            if offset + 8 > cmds.len() {
                return ERR_INVALID_ARG;
            }
            let cmd_kind = u16::from_le_bytes([cmds[offset], cmds[offset + 1]]);
            let flags = u16::from_le_bytes([cmds[offset + 2], cmds[offset + 3]]);
            let payload_bytes = u32::from_le_bytes([
                cmds[offset + 4],
                cmds[offset + 5],
                cmds[offset + 6],
                cmds[offset + 7],
            ]) as usize;
            offset += 8;

            match cmd_kind {
                CMD_NODE_OPEN => {
                    if payload_bytes < OPEN_PAYLOAD_BYTES {
                        return ERR_INVALID_ARG;
                    }
                    if offset + payload_bytes > cmds.len() {
                        return ERR_INVALID_ARG;
                    }
                    let payload = &cmds[offset..offset + payload_bytes];

                    // Parse node_id and parent_node_id.
                    let node_id = u64::from_le_bytes(payload[0..8].try_into().unwrap());
                    // parent_node_id at payload[8..16] is informational for TS; we use stack.

                    // Parse packed Style.
                    let packed = parse_packed_style(payload);
                    let is_absolute = (flags & FLAG_FLOATING_ABSOLUTE) != 0;
                    let style = pack_to_taffy_style(&packed, is_absolute);

                    // Create or update Taffy node.
                    let taffy_node = if let Some(&existing) = self.id_map.get(&node_id) {
                        // Node exists from a previous frame — update its style (auto-dirties).
                        if let Err(_) = self.taffy.set_style(existing, style) {
                            return ERR_LAYOUT_FAILED;
                        }
                        existing
                    } else {
                        // New node — create as a leaf; children added below via add_child.
                        match self.taffy.new_leaf(style) {
                            Ok(n) => {
                                self.id_map.insert(node_id, n);
                                n
                            }
                            Err(_) => return ERR_LAYOUT_FAILED,
                        }
                    };

                    let is_root = (flags & FLAG_IS_ROOT) != 0;
                    if is_root {
                        self.root = Some(taffy_node);
                    } else {
                        // Add as child of the current parent (top of stack).
                        match parent_stack.last() {
                            Some(&parent) => {
                                if let Err(_) = self.taffy.add_child(parent, taffy_node) {
                                    return ERR_LAYOUT_FAILED;
                                }
                            }
                            None => {
                                // No parent on stack but not marked is_root — treat as root.
                                self.root = Some(taffy_node);
                            }
                        }
                    }

                    parent_stack.push(taffy_node);
                    offset += payload_bytes;
                }

                CMD_NODE_CLOSE => {
                    // CLOSE payload must be 0 bytes.
                    if payload_bytes != 0 {
                        return ERR_INVALID_ARG;
                    }
                    if parent_stack.pop().is_none() {
                        // Unmatched CLOSE.
                        return ERR_INVALID_ARG;
                    }
                    // offset already advanced past the 8-byte prefix; no payload to skip.
                }

                _ => {
                    // Unknown command kind — skip payload and continue.
                    offset += payload_bytes;
                }
            }
        }

        // After all commands, parent stack should be empty (or contain just the root
        // if the caller emits OPEN without a matching CLOSE — allow single-node case).
        // Strict: require empty stack for well-formed buffers.
        if !parent_stack.is_empty() {
            return ERR_INVALID_ARG;
        }

        OK
    }

    /// Compute layout against `self.viewport_w` × `self.viewport_h`.
    ///
    /// Returns `OK` on success, `ERR_LAYOUT_FAILED` if Taffy fails.
    pub fn compute(&mut self) -> i32 {
        let root = match self.root {
            Some(r) => r,
            None => return OK, // No tree to compute.
        };

        let available = Size {
            width: AvailableSpace::Definite(self.viewport_w),
            height: AvailableSpace::Definite(self.viewport_h),
        };

        // Phase 2: text measure always returns (0, 0) per DEC-011.
        // We use compute_layout_with_measure with a trivial closure.
        match self.taffy.compute_layout_with_measure(
            root,
            available,
            |_known, _available, _node_id, _node_ctx, _style| Size {
                width: 0.0,
                height: 0.0,
            },
        ) {
            Ok(()) => OK,
            Err(_) => ERR_LAYOUT_FAILED,
        }
    }
}

/// Read a f32 from a byte slice at a given offset (little-endian).
#[inline(always)]
fn read_f32(data: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes(data[offset..offset + 4].try_into().unwrap())
}

/// Parse the packed Style fields from an OPEN payload starting at byte 16.
fn parse_packed_style(payload: &[u8]) -> PackedStyle {
    PackedStyle {
        flex_direction: payload[16],
        position_kind: payload[17],
        size_w_kind: payload[18],
        size_h_kind: payload[19],
        size_w_value: read_f32(payload, 20),
        size_h_value: read_f32(payload, 24),
        min_w: read_f32(payload, 28),
        min_h: read_f32(payload, 32),
        max_w: read_f32(payload, 36),
        max_h: read_f32(payload, 40),
        flex_grow: read_f32(payload, 44),
        flex_shrink: read_f32(payload, 48),
        justify_content: payload[52],
        align_items: payload[53],
        align_content: payload[54],
        // payload[55] is _pad
        padding_top: read_f32(payload, 56),
        padding_right: read_f32(payload, 60),
        padding_bottom: read_f32(payload, 64),
        padding_left: read_f32(payload, 68),
        border_top: read_f32(payload, 72),
        border_right: read_f32(payload, 76),
        border_bottom: read_f32(payload, 80),
        border_left: read_f32(payload, 84),
        gap_row: read_f32(payload, 88),
        gap_column: read_f32(payload, 92),
        inset_top: read_f32(payload, 96),
        inset_right: read_f32(payload, 100),
        inset_bottom: read_f32(payload, 104),
        inset_left: read_f32(payload, 108),
    }
}

// ─── Clay → Taffy style translation helpers (design §10) ─────────────────

/// Convert a packed kind+value pair to a Taffy `Dimension`.
/// kind: 0=Auto, 1=Length, 2=Percent
///
/// NOTE: Taffy 0.10.x uses lowercase constructor functions (not enum variants).
/// Documented divergence from the prompt's API quick-reference which listed
/// enum-style constructors; actual API is `Dimension::length(v)`, `Dimension::percent(v)`,
/// `Dimension::auto()`.
fn dim_from_kind_value(kind: u8, value: f32) -> Dimension {
    match kind {
        1 => Dimension::length(value),
        2 => Dimension::percent(value),
        _ => Dimension::auto(),
    }
}

/// Convert kind+value to `LengthPercentage` (no Auto variant).
/// Auto collapses to Length(0.0).
#[allow(dead_code)]
fn lp_from_kind_value(kind: u8, value: f32) -> LengthPercentage {
    match kind {
        2 => LengthPercentage::percent(value),
        _ => LengthPercentage::length(value),
    }
}

/// Convert kind+value to `LengthPercentageAuto` (full enum).
fn lpa_from_kind_value(kind: u8, value: f32) -> LengthPercentageAuto {
    match kind {
        1 => LengthPercentageAuto::length(value),
        2 => LengthPercentageAuto::percent(value),
        _ => LengthPercentageAuto::auto(),
    }
}

/// Translate a flex_direction byte to `FlexDirection`.
fn flex_dir_from_u8(byte: u8) -> FlexDirection {
    match byte {
        0 => FlexDirection::Row,
        1 => FlexDirection::Column,
        2 => FlexDirection::RowReverse,
        3 => FlexDirection::ColumnReverse,
        _ => FlexDirection::Column, // Vexart default
    }
}

/// Translate a justify/align byte to `Option<JustifyContent>`.
/// 255 = None (absent).
fn justify_from_u8(byte: u8) -> Option<JustifyContent> {
    match byte {
        0 => Some(JustifyContent::Start),
        1 => Some(JustifyContent::End),
        2 => Some(JustifyContent::Center),
        3 => Some(JustifyContent::SpaceBetween),
        4 => Some(JustifyContent::SpaceAround),
        5 => Some(JustifyContent::SpaceEvenly),
        _ => None,
    }
}

/// Translate an align_items byte to `Option<AlignItems>`.
fn align_items_from_u8(byte: u8) -> Option<AlignItems> {
    match byte {
        0 => Some(AlignItems::Start),
        1 => Some(AlignItems::End),
        2 => Some(AlignItems::Center),
        3 => Some(AlignItems::Stretch), // no space-between for align_items; fallback to Stretch
        _ => None,
    }
}

/// Translate an align_content byte to `Option<AlignContent>`.
fn align_content_from_u8(byte: u8) -> Option<AlignContent> {
    match byte {
        0 => Some(AlignContent::Start),
        1 => Some(AlignContent::End),
        2 => Some(AlignContent::Center),
        3 => Some(AlignContent::SpaceBetween),
        4 => Some(AlignContent::SpaceAround),
        5 => Some(AlignContent::SpaceEvenly),
        _ => None,
    }
}

/// Build a Taffy `Style` from a `PackedStyle` per design §10 migration map.
///
/// - `is_absolute`: when true, sets `position = Position::Absolute` and fills `inset`.
pub(crate) fn pack_to_taffy_style(packed: &PackedStyle, is_absolute: bool) -> Style {
    let position = if is_absolute || packed.position_kind == 1 {
        Position::Absolute
    } else {
        Position::Relative
    };

    // Inset — only meaningful for Absolute nodes; set to Auto for Relative.
    let inset = if position == Position::Absolute {
        Rect {
            top: lpa_from_kind_value(1, packed.inset_top),
            right: lpa_from_kind_value(1, packed.inset_right),
            bottom: lpa_from_kind_value(1, packed.inset_bottom),
            left: lpa_from_kind_value(1, packed.inset_left),
        }
    } else {
        Rect {
            top: LengthPercentageAuto::auto(),
            right: LengthPercentageAuto::auto(),
            bottom: LengthPercentageAuto::auto(),
            left: LengthPercentageAuto::auto(),
        }
    };

    // min/max constraints — 0.0 means "no constraint" → use Auto.
    let min_size = Size {
        width: if packed.min_w > 0.0 {
            Dimension::length(packed.min_w)
        } else {
            Dimension::auto()
        },
        height: if packed.min_h > 0.0 {
            Dimension::length(packed.min_h)
        } else {
            Dimension::auto()
        },
    };
    let max_size = Size {
        width: if packed.max_w > 0.0 {
            Dimension::length(packed.max_w)
        } else {
            Dimension::auto()
        },
        height: if packed.max_h > 0.0 {
            Dimension::length(packed.max_h)
        } else {
            Dimension::auto()
        },
    };

    Style {
        display: Display::Flex,
        position,
        flex_direction: flex_dir_from_u8(packed.flex_direction),
        flex_grow: packed.flex_grow,
        flex_shrink: packed.flex_shrink,
        size: Size {
            width: dim_from_kind_value(packed.size_w_kind, packed.size_w_value),
            height: dim_from_kind_value(packed.size_h_kind, packed.size_h_value),
        },
        min_size,
        max_size,
        padding: Rect {
            top: LengthPercentage::length(packed.padding_top),
            right: LengthPercentage::length(packed.padding_right),
            bottom: LengthPercentage::length(packed.padding_bottom),
            left: LengthPercentage::length(packed.padding_left),
        },
        border: Rect {
            top: LengthPercentage::length(packed.border_top),
            right: LengthPercentage::length(packed.border_right),
            bottom: LengthPercentage::length(packed.border_bottom),
            left: LengthPercentage::length(packed.border_left),
        },
        gap: Size {
            width: LengthPercentage::length(packed.gap_column),
            height: LengthPercentage::length(packed.gap_row),
        },
        justify_content: justify_from_u8(packed.justify_content),
        align_items: align_items_from_u8(packed.align_items),
        align_content: align_content_from_u8(packed.align_content),
        inset,
        ..Style::default()
    }
}

// ─── Helper: build a minimal LAYOUT_NODE_OPEN buffer for tests ────────────

/// Build a single-frame command buffer for testing.
/// `nodes`: list of (node_id, parent_id, is_root, style_bytes_override).
///
/// Each call produces a complete GraphHeader + OPEN + CLOSE pair per node.
#[cfg(test)]
pub fn build_test_buffer(nodes: &[TestNode]) -> Vec<u8> {
    use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};

    // Calculate total payload
    // Each node contributes: 8-byte prefix + OPEN_PAYLOAD_BYTES payload + 8-byte CLOSE prefix
    let per_node = 8 + OPEN_PAYLOAD_BYTES + 8;
    let cmd_count = (nodes.len() * 2) as u32; // OPEN + CLOSE per node
    let payload_bytes = (nodes.len() * per_node) as u32;

    let total = 16 + payload_bytes as usize;
    let mut buf = vec![0u8; total];

    // Write header
    buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    buf[8..12].copy_from_slice(&cmd_count.to_le_bytes());
    buf[12..16].copy_from_slice(&payload_bytes.to_le_bytes());

    let mut offset = 16;
    for node in nodes {
        // OPEN prefix: cmd_kind=0, flags, payload_bytes
        buf[offset..offset + 2].copy_from_slice(&0u16.to_le_bytes()); // CMD_NODE_OPEN
        buf[offset + 2..offset + 4].copy_from_slice(&node.flags.to_le_bytes());
        buf[offset + 4..offset + 8].copy_from_slice(&(OPEN_PAYLOAD_BYTES as u32).to_le_bytes());
        offset += 8;

        // OPEN payload: node_id + parent_node_id + style fields
        buf[offset..offset + 8].copy_from_slice(&node.node_id.to_le_bytes());
        buf[offset + 8..offset + 16].copy_from_slice(&node.parent_id.to_le_bytes());
        // style fields starting at payload[16]
        buf[offset + 16] = node.flex_direction; // flex_direction
        buf[offset + 17] = 0; // position_kind = Relative
        buf[offset + 18] = node.size_w_kind; // size_w_kind
        buf[offset + 19] = node.size_h_kind; // size_h_kind
        buf[offset + 20..offset + 24].copy_from_slice(&node.size_w_value.to_le_bytes());
        buf[offset + 24..offset + 28].copy_from_slice(&node.size_h_value.to_le_bytes());
        // min/max/flex_grow/flex_shrink/align fields at their offsets
        buf[offset + 44..offset + 48].copy_from_slice(&node.flex_grow.to_le_bytes());
        buf[offset + 48..offset + 52].copy_from_slice(&1.0f32.to_le_bytes()); // flex_shrink=1
        buf[offset + 52] = node.justify_content;
        buf[offset + 53] = 255; // align_items = None
        buf[offset + 54] = 255; // align_content = None
                                // rest zeroed (padding, border, gap, inset)
        offset += OPEN_PAYLOAD_BYTES;

        // CLOSE prefix: cmd_kind=1, flags=0, payload_bytes=0
        buf[offset..offset + 2].copy_from_slice(&1u16.to_le_bytes()); // CMD_NODE_CLOSE
        buf[offset + 2..offset + 4].copy_from_slice(&0u16.to_le_bytes());
        buf[offset + 4..offset + 8].copy_from_slice(&0u32.to_le_bytes());
        offset += 8;
    }

    buf
}

#[cfg(test)]
#[allow(dead_code)]
pub struct TestNode {
    pub node_id: u64,
    pub parent_id: u64,
    pub flags: u16, // FLAG_IS_ROOT etc.
    pub flex_direction: u8,
    pub size_w_kind: u8,
    pub size_h_kind: u8,
    pub size_w_value: f32,
    pub size_h_value: f32,
    pub flex_grow: f32,
    pub justify_content: u8,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::panic::ERR_INVALID_ARG;

    /// Helper: make a single-root node with grow sizing.
    fn root_grow_node() -> TestNode {
        TestNode {
            node_id: 1,
            parent_id: 0,
            flags: FLAG_IS_ROOT,
            flex_direction: 1, // Column
            size_w_kind: 0,    // Auto
            size_h_kind: 0,    // Auto
            size_w_value: 0.0,
            size_h_value: 0.0,
            flex_grow: 1.0,
            justify_content: 255, // None
        }
    }

    /// Helper: make a child node.
    fn child_node(id: u64, parent_id: u64, flex_grow: f32) -> TestNode {
        TestNode {
            node_id: id,
            parent_id,
            flags: 0,
            flex_direction: 1, // Column
            size_w_kind: 0,    // Auto
            size_h_kind: 0,    // Auto
            size_w_value: 0.0,
            size_h_value: 0.0,
            flex_grow,
            justify_content: 255,
        }
    }

    // ── Task 6.1 tests ─────────────────────────────────────────────────

    #[test]
    fn test_build_single_root_node_returns_ok() {
        let mut tree = LayoutTree::new();
        let buf = build_test_buffer(&[root_grow_node()]);
        let result = tree.build_from_commands(&buf);
        assert_eq!(result, OK);
        assert!(tree.id_map.contains_key(&1));
        assert!(tree.root.is_some());
    }

    #[test]
    fn test_build_parent_with_two_children() {
        let mut tree = LayoutTree::new();
        // Build: root(1) → child(2), child(3)
        // Buffer must be root OPEN, child2 OPEN, child2 CLOSE, child3 OPEN, child3 CLOSE, root CLOSE
        // But build_test_buffer emits OPEN+CLOSE for each node sequentially — we need custom.
        let buf = build_nested_buffer();
        let result = tree.build_from_commands(&buf);
        assert_eq!(result, OK);
        // root + 2 children in id_map
        assert_eq!(tree.id_map.len(), 3);
        let root_node = tree.root.expect("root must be set");
        let children = tree.taffy.children(root_node).expect("children query");
        assert_eq!(children.len(), 2);
    }

    // ── Task 6.2 + 6.3 tests ───────────────────────────────────────────

    #[test]
    fn test_pack_to_taffy_style_dimensions() {
        // NOTE: Taffy 0.10.x uses constructor functions not enum variants.
        // Length
        let packed = make_packed_style_with_size(1, 100.0, 1, 200.0);
        let style = pack_to_taffy_style(&packed, false);
        assert_eq!(style.size.width, Dimension::length(100.0));
        assert_eq!(style.size.height, Dimension::length(200.0));

        // Percent
        let packed = make_packed_style_with_size(2, 0.5, 2, 1.0);
        let style = pack_to_taffy_style(&packed, false);
        assert_eq!(style.size.width, Dimension::percent(0.5));
        assert_eq!(style.size.height, Dimension::percent(1.0));

        // Auto
        let packed = make_packed_style_with_size(0, 0.0, 0, 0.0);
        let style = pack_to_taffy_style(&packed, false);
        assert_eq!(style.size.width, Dimension::auto());
        assert_eq!(style.size.height, Dimension::auto());
    }

    #[test]
    fn test_pack_to_taffy_style_justify_content() {
        let cases: &[(u8, Option<JustifyContent>)] = &[
            (0, Some(JustifyContent::Start)),
            (1, Some(JustifyContent::End)),
            (2, Some(JustifyContent::Center)),
            (3, Some(JustifyContent::SpaceBetween)),
            (4, Some(JustifyContent::SpaceAround)),
            (5, Some(JustifyContent::SpaceEvenly)),
            (255, None),
        ];
        for &(byte, expected) in cases {
            let packed = make_packed_style_with_justify(byte);
            let style = pack_to_taffy_style(&packed, false);
            assert_eq!(
                style.justify_content, expected,
                "justify_content mismatch for byte {byte}"
            );
        }
    }

    // ── Task 6.8 compute tests ─────────────────────────────────────────

    #[test]
    fn test_compute_root_size_grow_fills_viewport() {
        let mut tree = LayoutTree::new();
        tree.viewport_w = 800.0;
        tree.viewport_h = 600.0;

        let buf = build_test_buffer(&[root_grow_node()]);
        assert_eq!(tree.build_from_commands(&buf), OK);
        assert_eq!(tree.compute(), OK);

        let root = tree.root.unwrap();
        let layout = tree.taffy.layout(root).unwrap();
        // Root with flex_grow=1 fills available space.
        assert_eq!(layout.size.width, 800.0);
        assert_eq!(layout.size.height, 600.0);
    }

    #[test]
    fn test_compute_two_children_split_evenly() {
        let mut tree = LayoutTree::new();
        tree.viewport_w = 800.0;
        tree.viewport_h = 600.0;

        // Root row direction + 2 children flex_grow=1 each.
        let buf = build_row_with_two_grow_children();
        assert_eq!(tree.build_from_commands(&buf), OK);
        assert_eq!(tree.compute(), OK);

        let root = tree.root.unwrap();
        let children: Vec<NodeId> = tree.taffy.children(root).unwrap();
        assert_eq!(children.len(), 2);

        let c1 = tree.taffy.layout(children[0]).unwrap();
        let c2 = tree.taffy.layout(children[1]).unwrap();
        // Each child gets half the width.
        assert!(
            (c1.size.width - 400.0).abs() < 1.0,
            "c1 width={}",
            c1.size.width
        );
        assert!(
            (c2.size.width - 400.0).abs() < 1.0,
            "c2 width={}",
            c2.size.width
        );
        assert!(
            (c1.size.height - 600.0).abs() < 1.0,
            "c1 height={}",
            c1.size.height
        );
    }

    // ── Helper builders for tests ──────────────────────────────────────

    /// Root → child1 → child2 nested structure.
    /// Buffer layout: root OPEN, child1 OPEN, child1 CLOSE, child2 OPEN, child2 CLOSE, root CLOSE
    fn build_nested_buffer() -> Vec<u8> {
        build_nested_from_nodes(
            &root_grow_node(),
            &[child_node(2, 1, 1.0), child_node(3, 1, 1.0)],
        )
    }

    /// Row root with two flex_grow=1 children.
    fn build_row_with_two_grow_children() -> Vec<u8> {
        let root = TestNode {
            node_id: 1,
            parent_id: 0,
            flags: FLAG_IS_ROOT,
            flex_direction: 0, // Row
            size_w_kind: 0,    // Auto
            size_h_kind: 0,    // Auto
            size_w_value: 0.0,
            size_h_value: 0.0,
            flex_grow: 1.0,
            justify_content: 255,
        };
        build_nested_from_nodes(&root, &[child_node(2, 1, 1.0), child_node(3, 1, 1.0)])
    }

    /// Build a buffer with a root OPEN + N children (each OPEN/CLOSE) + root CLOSE.
    fn build_nested_from_nodes(root: &TestNode, children: &[TestNode]) -> Vec<u8> {
        use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};

        let per_node = 8 + OPEN_PAYLOAD_BYTES + 8; // prefix + payload + close
                                                   // cmd count = 2 (root) + 2 * children
        let cmd_count = 2 + 2 * children.len();
        let payload_bytes = per_node * (1 + children.len());

        let total = 16 + payload_bytes;
        let mut buf = vec![0u8; total];

        buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
        buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
        buf[8..12].copy_from_slice(&(cmd_count as u32).to_le_bytes());
        buf[12..16].copy_from_slice(&(payload_bytes as u32).to_le_bytes());

        let mut off = 16;

        // Write a single node OPEN.
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

    fn make_packed_style_with_size(
        size_w_kind: u8,
        size_w_value: f32,
        size_h_kind: u8,
        size_h_value: f32,
    ) -> PackedStyle {
        PackedStyle {
            flex_direction: 1,
            position_kind: 0,
            size_w_kind,
            size_h_kind,
            size_w_value,
            size_h_value,
            min_w: 0.0,
            min_h: 0.0,
            max_w: 0.0,
            max_h: 0.0,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            justify_content: 255,
            align_items: 255,
            align_content: 255,
            padding_top: 0.0,
            padding_right: 0.0,
            padding_bottom: 0.0,
            padding_left: 0.0,
            border_top: 0.0,
            border_right: 0.0,
            border_bottom: 0.0,
            border_left: 0.0,
            gap_row: 0.0,
            gap_column: 0.0,
            inset_top: 0.0,
            inset_right: 0.0,
            inset_bottom: 0.0,
            inset_left: 0.0,
        }
    }

    fn make_packed_style_with_justify(justify_content: u8) -> PackedStyle {
        PackedStyle {
            flex_direction: 1,
            position_kind: 0,
            size_w_kind: 0,
            size_h_kind: 0,
            size_w_value: 0.0,
            size_h_value: 0.0,
            min_w: 0.0,
            min_h: 0.0,
            max_w: 0.0,
            max_h: 0.0,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            justify_content,
            align_items: 255,
            align_content: 255,
            padding_top: 0.0,
            padding_right: 0.0,
            padding_bottom: 0.0,
            padding_left: 0.0,
            border_top: 0.0,
            border_right: 0.0,
            border_bottom: 0.0,
            border_left: 0.0,
            gap_row: 0.0,
            gap_column: 0.0,
            inset_top: 0.0,
            inset_right: 0.0,
            inset_bottom: 0.0,
            inset_left: 0.0,
        }
    }
}
