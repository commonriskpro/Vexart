// native/libvexart/src/scene.rs
// Phase 3b — Rust-retained scene graph skeleton.

use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
use std::collections::{HashMap, HashSet};

const LAYOUT_CMD_OPEN: u16 = 0;
const LAYOUT_CMD_CLOSE: u16 = 1;
const LAYOUT_OPEN_PAYLOAD_BYTES: usize = 112;
const FLAG_LAYOUT_IS_ROOT: u16 = 1 << 0;
const FLAG_LAYOUT_FLOATING_ABS: u16 = 1 << 1;
const FLAG_LAYOUT_SCROLL_X: u16 = 1 << 2;
const FLAG_LAYOUT_SCROLL_Y: u16 = 1 << 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeNodeKind {
    Root = 0,
    Box = 1,
    Text = 2,
    Image = 3,
    Canvas = 4,
}

impl NativeNodeKind {
    pub fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::Root),
            1 => Some(Self::Box),
            2 => Some(Self::Text),
            3 => Some(Self::Image),
            4 => Some(Self::Canvas),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum PropValue {
    Bool(bool),
    I32(i32),
    U32(u32),
    F32(f32),
    String(String),
    Capability(bool),
}

#[derive(Debug, Clone)]
pub struct NativeNode {
    pub id: u64,
    pub kind: NativeNodeKind,
    pub parent: Option<u64>,
    pub children: Vec<u64>,
    pub props: HashMap<u16, PropValue>,
    pub text: String,
    pub layout: NativeLayoutRect,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct NativeLayoutRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone)]
pub struct SceneGraph {
    next_node_id: u64,
    pub nodes: HashMap<u64, NativeNode>,
    pub captured_node: Option<u64>,
    hovered_nodes: HashSet<u64>,
    active_node: Option<u64>,
    pub cell_width: f32,
    pub cell_height: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NativeEventRecord {
    pub node_id: u64,
    pub event_kind: u16,
    pub flags: u16,
    pub x: f32,
    pub y: f32,
    pub node_x: f32,
    pub node_y: f32,
    pub width: f32,
    pub height: f32,
}

impl NativeEventRecord {
    pub const BYTE_LEN: usize = 40;
    pub const KIND_POINTER_MOVE: u16 = 1;
    pub const KIND_POINTER_DOWN: u16 = 2;
    pub const KIND_POINTER_UP: u16 = 3;
    pub const KIND_PRESS_CANDIDATE: u16 = 4;
    pub const KIND_MOUSE_OVER: u16 = 5;
    pub const KIND_MOUSE_OUT: u16 = 6;
    pub const KIND_MOUSE_DOWN: u16 = 7;
    pub const KIND_MOUSE_UP: u16 = 8;
    pub const KIND_MOUSE_MOVE: u16 = 9;
    pub const KIND_ACTIVE_END: u16 = 10;

    pub const FLAG_FOCUSABLE: u16 = 1;
    pub const FLAG_ON_PRESS: u16 = 2;
    pub const FLAG_CAPTURED: u16 = 4;

    pub fn write_to(self, out: &mut [u8]) -> bool {
        if out.len() < Self::BYTE_LEN {
            return false;
        }
        out[0..8].copy_from_slice(&self.node_id.to_le_bytes());
        out[8..10].copy_from_slice(&self.event_kind.to_le_bytes());
        out[10..12].copy_from_slice(&self.flags.to_le_bytes());
        out[12..16].copy_from_slice(&self.x.to_le_bytes());
        out[16..20].copy_from_slice(&self.y.to_le_bytes());
        out[20..24].copy_from_slice(&self.node_x.to_le_bytes());
        out[24..28].copy_from_slice(&self.node_y.to_le_bytes());
        out[28..32].copy_from_slice(&self.width.to_le_bytes());
        out[32..36].copy_from_slice(&self.height.to_le_bytes());
        out[36..40].copy_from_slice(&0u32.to_le_bytes());
        true
    }
}

impl SceneGraph {
    pub fn new() -> Self {
        Self {
            next_node_id: 1,
            nodes: HashMap::new(),
            captured_node: None,
            hovered_nodes: HashSet::new(),
            active_node: None,
            cell_width: 0.0,
            cell_height: 0.0,
        }
    }

    pub fn clear(&mut self) {
        self.nodes.clear();
        self.next_node_id = 1;
        self.captured_node = None;
        self.hovered_nodes.clear();
        self.active_node = None;
        self.cell_width = 0.0;
        self.cell_height = 0.0;
    }

    pub fn set_cell_size(&mut self, width: f32, height: f32) {
        self.cell_width = width.max(0.0);
        self.cell_height = height.max(0.0);
    }

    pub fn build_layout_commands(&self) -> Vec<u8> {
        let mut roots: Vec<u64> = self
            .nodes
            .values()
            .filter(|node| node.parent.is_none())
            .map(|node| node.id)
            .collect();
        roots.sort_unstable();

        let mut payload = Vec::new();
        let mut cmd_count = 0u32;
        for root_id in roots {
            self.write_layout_node(root_id, 0, true, &mut payload, &mut cmd_count);
        }

        let mut out = Vec::with_capacity(16 + payload.len());
        out.extend_from_slice(&GRAPH_MAGIC.to_le_bytes());
        out.extend_from_slice(&GRAPH_VERSION.to_le_bytes());
        out.extend_from_slice(&cmd_count.to_le_bytes());
        out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        out.extend_from_slice(&payload);
        out
    }

    pub fn create_node(&mut self, kind: NativeNodeKind) -> u64 {
        let id = self.next_node_id;
        self.next_node_id += 1;
        self.nodes.insert(
            id,
            NativeNode {
                id,
                kind,
                parent: None,
                children: vec![],
                props: HashMap::new(),
                text: String::new(),
                layout: NativeLayoutRect::default(),
            },
        );
        id
    }

    pub fn insert(&mut self, parent_id: u64, child_id: u64, anchor_id: Option<u64>) -> bool {
        if parent_id == child_id {
            return false;
        }
        if !self.nodes.contains_key(&parent_id) || !self.nodes.contains_key(&child_id) {
            return false;
        }

        let old_parent = self.nodes.get(&child_id).and_then(|node| node.parent);
        if let Some(old_parent_id) = old_parent {
            if let Some(old_parent_node) = self.nodes.get_mut(&old_parent_id) {
                old_parent_node.children.retain(|id| *id != child_id);
            }
        }

        let insert_index = if let Some(anchor) = anchor_id {
            self.nodes
                .get(&parent_id)
                .and_then(|node| node.children.iter().position(|id| *id == anchor))
        } else {
            None
        };

        let parent = self.nodes.get_mut(&parent_id).expect("parent exists");
        if let Some(index) = insert_index {
            parent.children.insert(index, child_id);
        } else {
            parent.children.push(child_id);
        }

        let child = self.nodes.get_mut(&child_id).expect("child exists");
        child.parent = Some(parent_id);
        true
    }

    pub fn remove(&mut self, parent_id: u64, child_id: u64) -> bool {
        if !self.nodes.contains_key(&parent_id) || !self.nodes.contains_key(&child_id) {
            return false;
        }
        let parent = self.nodes.get_mut(&parent_id).expect("parent exists");
        let before = parent.children.len();
        parent.children.retain(|id| *id != child_id);
        if before == parent.children.len() {
            return false;
        }
        let child = self.nodes.get_mut(&child_id).expect("child exists");
        child.parent = None;
        true
    }

    pub fn destroy_subtree(&mut self, node_id: u64) -> bool {
        if !self.nodes.contains_key(&node_id) {
            return false;
        }
        let children = self
            .nodes
            .get(&node_id)
            .map(|node| node.children.clone())
            .unwrap_or_default();
        for child_id in children {
            self.destroy_subtree(child_id);
        }
        if let Some(parent_id) = self.nodes.get(&node_id).and_then(|node| node.parent) {
            if let Some(parent) = self.nodes.get_mut(&parent_id) {
                parent.children.retain(|id| *id != node_id);
            }
        }
        self.nodes.remove(&node_id);
        if self.captured_node == Some(node_id) {
            self.captured_node = None;
        }
        self.hovered_nodes.remove(&node_id);
        if self.active_node == Some(node_id) {
            self.active_node = None;
        }
        true
    }

    pub fn set_props(&mut self, node_id: u64, bytes: &[u8]) -> bool {
        let Some(node) = self.nodes.get_mut(&node_id) else {
            return false;
        };
        let Some(props) = decode_props(bytes) else {
            return false;
        };
        for (id, value) in props {
            node.props.insert(id, value);
        }
        true
    }

    pub fn set_text(&mut self, node_id: u64, text: &[u8]) -> bool {
        let Some(node) = self.nodes.get_mut(&node_id) else {
            return false;
        };
        node.text = String::from_utf8_lossy(text).to_string();
        true
    }

    pub fn set_layout(&mut self, node_id: u64, layout: NativeLayoutRect) -> bool {
        let Some(node) = self.nodes.get_mut(&node_id) else {
            return false;
        };
        node.layout = layout;
        true
    }

    pub fn hit_test(&self, x: f32, y: f32) -> Option<u64> {
        if let Some(captured) = self.captured_node {
            if self.nodes.contains_key(&captured) {
                return Some(captured);
            }
        }
        let mut roots: Vec<u64> = self
            .nodes
            .values()
            .filter(|node| node.parent.is_none())
            .map(|node| node.id)
            .collect();
        roots.sort_unstable();
        roots.reverse();
        for root_id in roots {
            if let Some(hit) = self.hit_test_node(root_id, x, y) {
                return Some(hit);
            }
        }
        None
    }

    pub fn pointer_event(&self, x: f32, y: f32, event_kind: u16) -> Option<NativeEventRecord> {
        let node_id = self.hit_test(x, y)?;
        let node = self.nodes.get(&node_id)?;
        Some(self.event_record_for_node(node_id, event_kind, x, y, node))
    }

    pub fn interaction_frame(&mut self, x: f32, y: f32, flags: u16) -> Vec<NativeEventRecord> {
        const POINTER_DOWN: u16 = 1 << 0;
        const POINTER_DIRTY: u16 = 1 << 1;
        const POINTER_PRESSED: u16 = 1 << 2;
        const POINTER_RELEASED: u16 = 1 << 3;

        let pointer_down = (flags & POINTER_DOWN) != 0;
        let pointer_dirty = (flags & POINTER_DIRTY) != 0;
        let just_pressed = (flags & POINTER_PRESSED) != 0;
        let just_released = (flags & POINTER_RELEASED) != 0;

        let hovered = self.hovered_interactive_nodes(x, y);
        let hovered_set: HashSet<u64> = hovered.iter().copied().collect();
        let mut out = vec![];

        let mut previous: Vec<u64> = self.hovered_nodes.iter().copied().collect();
        previous.sort_unstable();
        for node_id in previous {
            if hovered_set.contains(&node_id) {
                continue;
            }
            if let Some(node) = self.nodes.get(&node_id) {
                out.push(self.event_record_for_node(node_id, NativeEventRecord::KIND_MOUSE_OUT, x, y, node));
            }
        }

        for node_id in &hovered {
            if let Some(node) = self.nodes.get(node_id) {
                if !self.hovered_nodes.contains(node_id) {
                    out.push(self.event_record_for_node(*node_id, NativeEventRecord::KIND_MOUSE_OVER, x, y, node));
                }
                if pointer_dirty {
                    out.push(self.event_record_for_node(*node_id, NativeEventRecord::KIND_MOUSE_MOVE, x, y, node));
                }
            }
        }

        if just_pressed {
            let target = self.hit_test(x, y).filter(|node_id| self.has_interactive_behavior(*node_id));
            self.active_node = target;
            if let Some(node_id) = target {
                if let Some(node) = self.nodes.get(&node_id) {
                    out.push(self.event_record_for_node(node_id, NativeEventRecord::KIND_MOUSE_DOWN, x, y, node));
                }
            }
        }

        if just_released {
            let active = self.active_node.take();
            if let Some(node_id) = active {
                if let Some(node) = self.nodes.get(&node_id) {
                    out.push(self.event_record_for_node(node_id, NativeEventRecord::KIND_MOUSE_UP, x, y, node));
                    out.push(self.event_record_for_node(node_id, NativeEventRecord::KIND_ACTIVE_END, x, y, node));
                }
                if hovered_set.contains(&node_id) {
                    out.extend(self.press_chain(x, y));
                }
            }
            self.captured_node = None;
        } else if !pointer_down {
            if let Some(node_id) = self.active_node.take() {
                if let Some(node) = self.nodes.get(&node_id) {
                    out.push(self.event_record_for_node(node_id, NativeEventRecord::KIND_ACTIVE_END, x, y, node));
                }
            }
        }

        self.hovered_nodes = hovered_set;
        out
    }

    pub fn press_chain(&self, x: f32, y: f32) -> Vec<NativeEventRecord> {
        let Some(target_id) = self.hit_test(x, y) else {
            return vec![];
        };
        let mut chain = vec![];
        let mut current = Some(target_id);
        while let Some(node_id) = current {
            let Some(node) = self.nodes.get(&node_id) else {
                break;
            };
            let mut flags = 0;
            if self.is_focusable(node_id) {
                flags |= NativeEventRecord::FLAG_FOCUSABLE;
            }
            if self.has_on_press(node_id) {
                flags |= NativeEventRecord::FLAG_ON_PRESS;
            }
            if flags != 0 {
                chain.push(NativeEventRecord {
                    node_id,
                    event_kind: NativeEventRecord::KIND_PRESS_CANDIDATE,
                    flags,
                    x,
                    y,
                    node_x: x - node.layout.x,
                    node_y: y - node.layout.y,
                    width: node.layout.width,
                    height: node.layout.height,
                });
            }
            current = node.parent;
        }
        chain
    }

    fn event_record_for_node(&self, node_id: u64, event_kind: u16, x: f32, y: f32, node: &NativeNode) -> NativeEventRecord {
        NativeEventRecord {
            node_id,
            event_kind,
            flags: if self.captured_node == Some(node_id) { NativeEventRecord::FLAG_CAPTURED } else { 0 },
            x,
            y,
            node_x: x - node.layout.x,
            node_y: y - node.layout.y,
            width: node.layout.width,
            height: node.layout.height,
        }
    }

    fn hovered_interactive_nodes(&self, x: f32, y: f32) -> Vec<u64> {
        if let Some(captured) = self.captured_node {
            if self.nodes.contains_key(&captured) {
                return vec![captured];
            }
        }

        let mut roots: Vec<u64> = self
            .nodes
            .values()
            .filter(|node| node.parent.is_none())
            .map(|node| node.id)
            .collect();
        roots.sort_unstable();
        let mut out = vec![];
        for root_id in roots {
            self.collect_hovered_interactive_nodes(root_id, x, y, &mut out);
        }
        out
    }

    fn collect_hovered_interactive_nodes(&self, node_id: u64, x: f32, y: f32, out: &mut Vec<u64>) {
        let Some(node) = self.nodes.get(&node_id) else {
            return;
        };
        let is_inside_self = self.point_inside_rect(node.layout, x, y);
        if self.is_scroll_container(node_id) && !is_inside_self {
            return;
        }

        for child_id in &node.children {
            self.collect_hovered_interactive_nodes(*child_id, x, y, out);
        }

        if self.point_inside_hit_area(node.layout, x, y)
            && !self.is_pointer_passthrough(node_id)
            && self.has_interactive_behavior(node_id)
        {
            out.push(node_id);
        }
    }

    pub fn set_pointer_capture(&mut self, node_id: u64) -> bool {
        if !self.nodes.contains_key(&node_id) {
            return false;
        }
        self.captured_node = Some(node_id);
        true
    }

    pub fn release_pointer_capture(&mut self, node_id: u64) -> bool {
        if self.captured_node == Some(node_id) {
            self.captured_node = None;
            return true;
        }
        false
    }

    pub fn focus_next(&self, current: Option<u64>) -> Option<u64> {
        let ordered = self.focusable_nodes_in_order();
        if ordered.is_empty() {
            return None;
        }
        let Some(current_id) = current else {
            return ordered.first().copied();
        };
        let idx = ordered.iter().position(|id| *id == current_id).unwrap_or(usize::MAX);
        if idx == usize::MAX {
            return ordered.first().copied();
        }
        Some(ordered[(idx + 1) % ordered.len()])
    }

    pub fn focus_prev(&self, current: Option<u64>) -> Option<u64> {
        let ordered = self.focusable_nodes_in_order();
        if ordered.is_empty() {
            return None;
        }
        let Some(current_id) = current else {
            return ordered.last().copied();
        };
        let idx = ordered.iter().position(|id| *id == current_id).unwrap_or(0);
        let prev = if idx == 0 { ordered.len() - 1 } else { idx - 1 };
        Some(ordered[prev])
    }

    pub fn is_hovered(&self, node_id: u64) -> bool {
        self.hovered_nodes.contains(&node_id)
    }

    pub fn is_active(&self, node_id: u64) -> bool {
        self.active_node == Some(node_id)
    }

    fn hit_test_node(&self, node_id: u64, x: f32, y: f32) -> Option<u64> {
        let node = self.nodes.get(&node_id)?;
        let is_inside_self = self.point_inside_rect(node.layout, x, y);
        let is_inside_hit_area = self.point_inside_hit_area(node.layout, x, y);

        if self.is_scroll_container(node_id) && !is_inside_self {
            return None;
        }

        let mut children = node.children.clone();
        children.reverse();
        for child_id in children {
            if let Some(hit) = self.hit_test_node(child_id, x, y) {
                return Some(hit);
            }
        }

        let l = node.layout;
        if l.width <= 0.0 && l.height <= 0.0 && self.cell_width <= 0.0 && self.cell_height <= 0.0 {
            return None;
        }
        if is_inside_hit_area && !self.is_pointer_passthrough(node_id) {
            return Some(node_id);
        }
        None
    }

    fn point_inside_rect(&self, rect: NativeLayoutRect, x: f32, y: f32) -> bool {
        rect.width > 0.0
            && rect.height > 0.0
            && x >= rect.x
            && x < rect.x + rect.width
            && y >= rect.y
            && y < rect.y + rect.height
    }

    fn point_inside_hit_area(&self, rect: NativeLayoutRect, x: f32, y: f32) -> bool {
        let hit_width = rect.width.max(self.cell_width);
        let hit_height = rect.height.max(self.cell_height);
        if hit_width <= 0.0 || hit_height <= 0.0 {
            return false;
        }
        let hit_x = rect.x - (hit_width - rect.width) * 0.5;
        let hit_y = rect.y - (hit_height - rect.height) * 0.5;
        x >= hit_x && x < hit_x + hit_width && y >= hit_y && y < hit_y + hit_height
    }

    fn write_layout_node(
        &self,
        node_id: u64,
        parent_id: u64,
        is_root: bool,
        out: &mut Vec<u8>,
        cmd_count: &mut u32,
    ) {
        let Some(node) = self.nodes.get(&node_id) else {
            return;
        };

        let mut flags = 0u16;
        if is_root {
            flags |= FLAG_LAYOUT_IS_ROOT;
        }
        if self.prop_truthy(node_id, prop_hash("scrollX")) {
            flags |= FLAG_LAYOUT_SCROLL_X;
        }
        if self.prop_truthy(node_id, prop_hash("scrollY")) {
            flags |= FLAG_LAYOUT_SCROLL_Y;
        }
        if self.prop_truthy(node_id, prop_hash("floating")) {
            flags |= FLAG_LAYOUT_FLOATING_ABS;
        }

        out.extend_from_slice(&LAYOUT_CMD_OPEN.to_le_bytes());
        out.extend_from_slice(&flags.to_le_bytes());
        out.extend_from_slice(&(LAYOUT_OPEN_PAYLOAD_BYTES as u32).to_le_bytes());

        let payload = self.layout_payload_for_node(node_id, parent_id, is_root);
        out.extend_from_slice(&payload);
        *cmd_count += 1;

        for &child_id in &node.children {
            self.write_layout_node(child_id, node_id, false, out, cmd_count);
        }

        out.extend_from_slice(&LAYOUT_CMD_CLOSE.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        *cmd_count += 1;
    }

    fn layout_payload_for_node(&self, node_id: u64, parent_id: u64, is_root: bool) -> [u8; LAYOUT_OPEN_PAYLOAD_BYTES] {
        let mut out = [0u8; LAYOUT_OPEN_PAYLOAD_BYTES];
        let Some(node) = self.nodes.get(&node_id) else {
            return out;
        };

        let width = self.size_prop(node_id, 1);
        let height = self.size_prop(node_id, 2);
        let min_w = self.numeric_prop(node_id, prop_hash("minWidth")).unwrap_or(0.0);
        let min_h = self.numeric_prop(node_id, prop_hash("minHeight")).unwrap_or(0.0);
        let max_w = self.numeric_prop(node_id, prop_hash("maxWidth")).unwrap_or(0.0);
        let max_h = self.numeric_prop(node_id, prop_hash("maxHeight")).unwrap_or(0.0);
        let flex_grow = self.flex_grow_for_node(node_id);
        let flex_shrink = self.numeric_prop(node_id, prop_hash("flexShrink")).unwrap_or(1.0);
        let direction = self.direction_prop(node_id).unwrap_or(1);
        let (justify, align) = self.layout_alignment_for_node(node_id, direction);
        let padding = self.padding_for_node(node_id);
        let border = self.border_for_node(node_id);
        let gap = self.numeric_prop(node_id, prop_hash("gap")).unwrap_or(0.0);

        out[0..8].copy_from_slice(&node.id.to_le_bytes());
        out[8..16].copy_from_slice(&parent_id.to_le_bytes());
        out[16] = direction;
        out[17] = if is_root { 0 } else { if self.prop_truthy(node_id, prop_hash("floating")) { 1 } else { 0 } };
        out[18] = width.0;
        out[19] = height.0;
        out[20..24].copy_from_slice(&width.1.to_le_bytes());
        out[24..28].copy_from_slice(&height.1.to_le_bytes());
        out[28..32].copy_from_slice(&min_w.to_le_bytes());
        out[32..36].copy_from_slice(&min_h.to_le_bytes());
        out[36..40].copy_from_slice(&max_w.to_le_bytes());
        out[40..44].copy_from_slice(&max_h.to_le_bytes());
        out[44..48].copy_from_slice(&flex_grow.to_le_bytes());
        out[48..52].copy_from_slice(&flex_shrink.to_le_bytes());
        out[52] = justify;
        out[53] = align;
        out[54] = align;
        out[56..60].copy_from_slice(&padding.0.to_le_bytes());
        out[60..64].copy_from_slice(&padding.1.to_le_bytes());
        out[64..68].copy_from_slice(&padding.2.to_le_bytes());
        out[68..72].copy_from_slice(&padding.3.to_le_bytes());
        out[72..76].copy_from_slice(&border.0.to_le_bytes());
        out[76..80].copy_from_slice(&border.1.to_le_bytes());
        out[80..84].copy_from_slice(&border.2.to_le_bytes());
        out[84..88].copy_from_slice(&border.3.to_le_bytes());
        out[88..92].copy_from_slice(&gap.to_le_bytes());
        out[92..96].copy_from_slice(&gap.to_le_bytes());
        out
    }

    fn prop_truthy(&self, node_id: u64, prop_id: u16) -> bool {
        matches!(
            self.nodes.get(&node_id).and_then(|node| node.props.get(&prop_id)),
            Some(PropValue::Bool(true)) | Some(PropValue::Capability(true))
        )
    }

    fn numeric_prop(&self, node_id: u64, prop_id: u16) -> Option<f32> {
        match self.nodes.get(&node_id).and_then(|node| node.props.get(&prop_id)) {
            Some(PropValue::I32(v)) => Some(*v as f32),
            Some(PropValue::U32(v)) => Some(*v as f32),
            Some(PropValue::F32(v)) => Some(*v),
            _ => None,
        }
    }

    fn string_prop<'a>(&'a self, node_id: u64, prop_id: u16) -> Option<&'a str> {
        match self.nodes.get(&node_id).and_then(|node| node.props.get(&prop_id)) {
            Some(PropValue::String(v)) => Some(v.as_str()),
            _ => None,
        }
    }

    fn size_prop(&self, node_id: u64, prop_id: u16) -> (u8, f32) {
        if let Some(value) = self.numeric_prop(node_id, prop_id) {
            return (1, value);
        }

        let Some(value) = self.string_prop(node_id, prop_id) else {
            return (0, 0.0);
        };
        if value == "grow" || value == "fit" || value == "auto" {
            return (0, 0.0);
        }
        if let Some(percent) = value.strip_suffix('%').and_then(|raw| raw.parse::<f32>().ok()) {
            return (2, percent / 100.0);
        }
        (0, 0.0)
    }

    fn flex_grow_for_node(&self, node_id: u64) -> f32 {
        if let Some(explicit) = self.numeric_prop(node_id, prop_hash("flexGrow")) {
            return explicit;
        }
        let width_grow = matches!(self.string_prop(node_id, 1), Some("grow"));
        let height_grow = matches!(self.string_prop(node_id, 2), Some("grow"));
        if width_grow || height_grow {
            return 1.0;
        }
        0.0
    }

    fn direction_prop(&self, node_id: u64) -> Option<u8> {
        let value = self
            .string_prop(node_id, prop_hash("direction"))
            .or_else(|| self.string_prop(node_id, prop_hash("flexDirection")))?;
        Some(match value {
            "row" => 0,
            "column" => 1,
            "row-reverse" => 2,
            "column-reverse" => 3,
            _ => 1,
        })
    }

    fn align_prop_value(&self, value: &str) -> u8 {
        match value {
            "left" | "top" | "flex-start" | "start" => 0,
            "right" | "bottom" | "flex-end" | "end" => 1,
            "center" => 2,
            "space-between" => 3,
            "space-around" => 4,
            "space-evenly" => 5,
            _ => 255,
        }
    }

    fn layout_alignment_for_node(&self, node_id: u64, direction: u8) -> (u8, u8) {
        let ax = self
            .string_prop(node_id, prop_hash("alignX"))
            .or_else(|| self.string_prop(node_id, prop_hash("justifyContent")))
            .map(|value| self.align_prop_value(value))
            .unwrap_or(0);
        let ay = self
            .string_prop(node_id, prop_hash("alignY"))
            .or_else(|| self.string_prop(node_id, prop_hash("alignItems")))
            .map(|value| self.align_prop_value(value))
            .unwrap_or(0);
        if direction == 1 || direction == 3 {
            (ay, ax)
        } else {
            (ax, ay)
        }
    }

    fn padding_for_node(&self, node_id: u64) -> (f32, f32, f32, f32) {
        let uniform = self.numeric_prop(node_id, prop_hash("padding")).unwrap_or(0.0);
        let px = self.numeric_prop(node_id, prop_hash("paddingX")).unwrap_or(uniform);
        let py = self.numeric_prop(node_id, prop_hash("paddingY")).unwrap_or(uniform);
        (
            self.numeric_prop(node_id, prop_hash("paddingTop")).unwrap_or(py),
            self.numeric_prop(node_id, prop_hash("paddingRight")).unwrap_or(px),
            self.numeric_prop(node_id, prop_hash("paddingBottom")).unwrap_or(py),
            self.numeric_prop(node_id, prop_hash("paddingLeft")).unwrap_or(px),
        )
    }

    fn border_for_node(&self, node_id: u64) -> (f32, f32, f32, f32) {
        let uniform = self.numeric_prop(node_id, 5).unwrap_or(0.0);
        (
            self.numeric_prop(node_id, prop_hash("borderTop")).unwrap_or(uniform),
            self.numeric_prop(node_id, prop_hash("borderRight")).unwrap_or(uniform),
            self.numeric_prop(node_id, prop_hash("borderBottom")).unwrap_or(uniform),
            self.numeric_prop(node_id, prop_hash("borderLeft")).unwrap_or(uniform),
        )
    }

    fn focusable_nodes_in_order(&self) -> Vec<u64> {
        let mut roots: Vec<u64> = self
            .nodes
            .values()
            .filter(|node| node.parent.is_none())
            .map(|node| node.id)
            .collect();
        roots.sort_unstable();
        let mut out = vec![];
        for root_id in roots {
            self.collect_focusable(root_id, &mut out);
        }
        out
    }

    fn collect_focusable(&self, node_id: u64, out: &mut Vec<u64>) {
        if self.is_focusable(node_id) {
            out.push(node_id);
        }
        if let Some(node) = self.nodes.get(&node_id) {
            for child in &node.children {
                self.collect_focusable(*child, out);
            }
        }
    }

    fn is_focusable(&self, node_id: u64) -> bool {
        const PROP_FOCUSABLE: u16 = 9;
        matches!(
            self.nodes.get(&node_id).and_then(|node| node.props.get(&PROP_FOCUSABLE)),
            Some(PropValue::Bool(true)) | Some(PropValue::Capability(true))
        )
    }

    fn has_on_press(&self, node_id: u64) -> bool {
        const PROP_ON_PRESS: u16 = 10;
        matches!(
            self.nodes.get(&node_id).and_then(|node| node.props.get(&PROP_ON_PRESS)),
            Some(PropValue::Bool(true)) | Some(PropValue::Capability(true))
        )
    }

    fn has_mouse_callback(&self, node_id: u64) -> bool {
        [11u16, 12u16, 13u16, 14u16, 15u16]
            .into_iter()
            .any(|prop_id| self.prop_truthy(node_id, prop_id))
    }

    fn has_style_callback_state(&self, node_id: u64) -> bool {
        [prop_hash("hoverStyle"), prop_hash("activeStyle"), prop_hash("focusStyle")]
            .into_iter()
            .any(|prop_id| self.nodes.get(&node_id).and_then(|node| node.props.get(&prop_id)).is_some())
    }

    fn has_interactive_behavior(&self, node_id: u64) -> bool {
        self.is_focusable(node_id)
            || self.has_on_press(node_id)
            || self.has_mouse_callback(node_id)
            || self.has_style_callback_state(node_id)
    }

    fn is_scroll_container(&self, node_id: u64) -> bool {
        const PROP_SCROLL_X: u16 = 16;
        const PROP_SCROLL_Y: u16 = 17;
        let props = self.nodes.get(&node_id).map(|node| &node.props);
        matches!(props.and_then(|p| p.get(&PROP_SCROLL_X)), Some(PropValue::Bool(true)) | Some(PropValue::Capability(true)))
            || matches!(props.and_then(|p| p.get(&PROP_SCROLL_Y)), Some(PropValue::Bool(true)) | Some(PropValue::Capability(true)))
    }

    fn is_pointer_passthrough(&self, node_id: u64) -> bool {
        const PROP_POINTER_PASSTHROUGH: u16 = 22;
        matches!(
            self.nodes.get(&node_id).and_then(|node| node.props.get(&PROP_POINTER_PASSTHROUGH)),
            Some(PropValue::Bool(true)) | Some(PropValue::Capability(true))
        )
    }

    pub fn snapshot_json(&self) -> String {
        let mut roots: Vec<u64> = self
            .nodes
            .values()
            .filter(|node| node.parent.is_none())
            .map(|node| node.id)
            .collect();
        roots.sort_unstable();
        let body = roots
            .into_iter()
            .filter_map(|root| self.snapshot_node_json(root))
            .collect::<Vec<_>>()
            .join(",");
        format!("{{\"roots\":[{}]}}", body)
    }

    fn snapshot_node_json(&self, node_id: u64) -> Option<String> {
        let node = self.nodes.get(&node_id)?;
        let children = node
            .children
            .iter()
            .filter_map(|child| self.snapshot_node_json(*child))
            .collect::<Vec<_>>()
            .join(",");
        Some(format!(
            "{{\"id\":{},\"kind\":{},\"text\":{:?},\"layout\":{{\"x\":{},\"y\":{},\"width\":{},\"height\":{}}},\"children\":[{}]}}",
            node.id,
            node.kind as u32,
            node.text,
            node.layout.x,
            node.layout.y,
            node.layout.width,
            node.layout.height,
            children
        ))
    }
}

fn prop_hash(name: &str) -> u16 {
    let mut hash: u32 = 2166136261;
    for byte in name.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16777619);
    }
    ((hash % 60000) + 1000) as u16
}

fn decode_props(bytes: &[u8]) -> Option<Vec<(u16, PropValue)>> {
    if bytes.len() < 2 {
        return None;
    }
    let count = u16::from_le_bytes(bytes[0..2].try_into().ok()?) as usize;
    let mut offset = 2usize;
    let mut values = Vec::with_capacity(count);
    for _ in 0..count {
        if offset + 8 > bytes.len() {
            return None;
        }
        let prop_id = u16::from_le_bytes(bytes[offset..offset + 2].try_into().ok()?);
        let value_kind = bytes[offset + 2];
        let len = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().ok()?) as usize;
        offset += 8;
        if offset + len > bytes.len() {
            return None;
        }
        let payload = &bytes[offset..offset + len];
        offset += len;
        let value = match value_kind {
            1 => PropValue::Bool(payload.first().copied().unwrap_or(0) != 0),
            2 => PropValue::I32(i32::from_le_bytes(payload.get(0..4)?.try_into().ok()?)),
            3 => PropValue::U32(u32::from_le_bytes(payload.get(0..4)?.try_into().ok()?)),
            4 => PropValue::F32(f32::from_le_bytes(payload.get(0..4)?.try_into().ok()?)),
            5 => PropValue::String(String::from_utf8_lossy(payload).to_string()),
            6 => PropValue::Capability(payload.first().copied().unwrap_or(0) != 0),
            _ => continue,
        };
        values.push((prop_id, value));
    }
    Some(values)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::LayoutContext;

    fn single_bool_prop(prop_id: u16, value: bool) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&prop_id.to_le_bytes());
        bytes.push(1);
        bytes.push(0);
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.push(if value { 1 } else { 0 });
        bytes
    }

    #[test]
    fn insert_preserves_anchor_order() {
        let mut scene = SceneGraph::new();
        let parent = scene.create_node(NativeNodeKind::Box);
        let a = scene.create_node(NativeNodeKind::Box);
        let b = scene.create_node(NativeNodeKind::Box);
        let c = scene.create_node(NativeNodeKind::Box);

        assert!(scene.insert(parent, a, None));
        assert!(scene.insert(parent, c, None));
        assert!(scene.insert(parent, b, Some(c)));

        let children = scene.nodes.get(&parent).unwrap().children.clone();
        assert_eq!(children, vec![a, b, c]);
    }

    #[test]
    fn destroy_subtree_removes_descendants() {
        let mut scene = SceneGraph::new();
        let parent = scene.create_node(NativeNodeKind::Box);
        let child = scene.create_node(NativeNodeKind::Box);
        let grandchild = scene.create_node(NativeNodeKind::Text);
        scene.insert(parent, child, None);
        scene.insert(child, grandchild, None);

        assert!(scene.destroy_subtree(child));
        assert!(scene.nodes.get(&child).is_none());
        assert!(scene.nodes.get(&grandchild).is_none());
        assert!(scene.nodes.get(&parent).unwrap().children.is_empty());
    }

    #[test]
    fn set_props_decodes_values() {
        let mut scene = SceneGraph::new();
        let node = scene.create_node(NativeNodeKind::Box);
        assert!(scene.set_props(node, &single_bool_prop(7, true)));
        assert_eq!(scene.nodes.get(&node).unwrap().props.get(&7), Some(&PropValue::Bool(true)));
    }

    #[test]
    fn hit_test_returns_deepest_child() {
        let mut scene = SceneGraph::new();
        let parent = scene.create_node(NativeNodeKind::Box);
        let child = scene.create_node(NativeNodeKind::Box);
        scene.insert(parent, child, None);
        scene.set_layout(parent, NativeLayoutRect { x: 0.0, y: 0.0, width: 100.0, height: 100.0 });
        scene.set_layout(child, NativeLayoutRect { x: 10.0, y: 10.0, width: 20.0, height: 20.0 });

        assert_eq!(scene.hit_test(15.0, 15.0), Some(child));
        assert_eq!(scene.hit_test(90.0, 90.0), Some(parent));
    }

    #[test]
    fn pointer_event_reports_node_geometry() {
        let mut scene = SceneGraph::new();
        let node = scene.create_node(NativeNodeKind::Box);
        scene.set_layout(node, NativeLayoutRect { x: 10.0, y: 20.0, width: 30.0, height: 40.0 });

        let event = scene.pointer_event(15.0, 25.0, NativeEventRecord::KIND_POINTER_DOWN).unwrap();
        assert_eq!(event.node_id, node);
        assert_eq!(event.node_x, 5.0);
        assert_eq!(event.node_y, 5.0);
        assert_eq!(event.width, 30.0);
        assert_eq!(event.height, 40.0);
    }

    #[test]
    fn pointer_capture_overrides_hit_test() {
        let mut scene = SceneGraph::new();
        let a = scene.create_node(NativeNodeKind::Box);
        let b = scene.create_node(NativeNodeKind::Box);
        scene.set_layout(a, NativeLayoutRect { x: 0.0, y: 0.0, width: 20.0, height: 20.0 });
        scene.set_layout(b, NativeLayoutRect { x: 100.0, y: 100.0, width: 20.0, height: 20.0 });
        scene.set_pointer_capture(a);

        assert_eq!(scene.hit_test(110.0, 110.0), Some(a));
        scene.release_pointer_capture(a);
        assert_eq!(scene.hit_test(110.0, 110.0), Some(b));
    }

    #[test]
    fn press_chain_bubbles_to_focusable_and_on_press_ancestors() {
        let mut scene = SceneGraph::new();
        let parent = scene.create_node(NativeNodeKind::Box);
        let child = scene.create_node(NativeNodeKind::Box);
        scene.insert(parent, child, None);
        scene.set_layout(parent, NativeLayoutRect { x: 0.0, y: 0.0, width: 100.0, height: 100.0 });
        scene.set_layout(child, NativeLayoutRect { x: 10.0, y: 10.0, width: 20.0, height: 20.0 });
        scene.set_props(parent, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&9u16.to_le_bytes());
            bytes.push(1);
            bytes.push(0);
            bytes.extend_from_slice(&1u32.to_le_bytes());
            bytes.push(1);
            bytes
        });
        scene.set_props(child, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&10u16.to_le_bytes());
            bytes.push(6);
            bytes.push(0);
            bytes.extend_from_slice(&1u32.to_le_bytes());
            bytes.push(1);
            bytes
        });

        let chain = scene.press_chain(15.0, 15.0);
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0].node_id, child);
        assert_eq!(chain[0].flags & NativeEventRecord::FLAG_ON_PRESS, NativeEventRecord::FLAG_ON_PRESS);
        assert_eq!(chain[1].node_id, parent);
        assert_eq!(chain[1].flags & NativeEventRecord::FLAG_FOCUSABLE, NativeEventRecord::FLAG_FOCUSABLE);
    }

    #[test]
    fn focus_order_uses_preorder_tree_walk() {
        let mut scene = SceneGraph::new();
        let a = scene.create_node(NativeNodeKind::Box);
        let b = scene.create_node(NativeNodeKind::Box);
        let c = scene.create_node(NativeNodeKind::Box);
        scene.insert(a, b, None);
        scene.insert(a, c, None);
        for id in [a, b, c] {
            scene.set_props(id, &{
                let mut bytes = Vec::new();
                bytes.extend_from_slice(&1u16.to_le_bytes());
                bytes.extend_from_slice(&9u16.to_le_bytes());
                bytes.push(1);
                bytes.push(0);
                bytes.extend_from_slice(&1u32.to_le_bytes());
                bytes.push(1);
                bytes
            });
        }

        assert_eq!(scene.focus_next(None), Some(a));
        assert_eq!(scene.focus_next(Some(a)), Some(b));
        assert_eq!(scene.focus_next(Some(c)), Some(a));
        assert_eq!(scene.focus_prev(Some(a)), Some(c));
    }

    #[test]
    fn offscreen_scroll_child_does_not_receive_hit() {
        let mut scene = SceneGraph::new();
        let scroll = scene.create_node(NativeNodeKind::Box);
        let child = scene.create_node(NativeNodeKind::Box);
        scene.insert(scroll, child, None);
        scene.set_layout(scroll, NativeLayoutRect { x: 0.0, y: 0.0, width: 40.0, height: 40.0 });
        scene.set_layout(child, NativeLayoutRect { x: 60.0, y: 60.0, width: 20.0, height: 20.0 });
        scene.set_props(scroll, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&17u16.to_le_bytes());
            bytes.push(1);
            bytes.push(0);
            bytes.extend_from_slice(&1u32.to_le_bytes());
            bytes.push(1);
            bytes
        });

        assert_eq!(scene.hit_test(65.0, 65.0), None);
    }

    #[test]
    fn pointer_passthrough_skips_self_but_not_children() {
        let mut scene = SceneGraph::new();
        let parent = scene.create_node(NativeNodeKind::Box);
        let child = scene.create_node(NativeNodeKind::Box);
        scene.insert(parent, child, None);
        scene.set_layout(parent, NativeLayoutRect { x: 0.0, y: 0.0, width: 100.0, height: 100.0 });
        scene.set_layout(child, NativeLayoutRect { x: 10.0, y: 10.0, width: 20.0, height: 20.0 });
        scene.set_props(parent, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&22u16.to_le_bytes());
            bytes.push(1);
            bytes.push(0);
            bytes.extend_from_slice(&1u32.to_le_bytes());
            bytes.push(1);
            bytes
        });

        assert_eq!(scene.hit_test(50.0, 50.0), None);
        assert_eq!(scene.hit_test(15.0, 15.0), Some(child));
    }

    #[test]
    fn minimum_hit_area_expands_small_nodes_to_cell_size() {
        let mut scene = SceneGraph::new();
        let node = scene.create_node(NativeNodeKind::Box);
        scene.set_layout(node, NativeLayoutRect { x: 10.0, y: 10.0, width: 2.0, height: 2.0 });
        scene.set_cell_size(8.0, 12.0);

        assert_eq!(scene.hit_test(7.5, 6.0), Some(node));
        assert_eq!(scene.hit_test(13.9, 15.9), Some(node));
        assert_eq!(scene.hit_test(5.9, 6.0), None);
        assert_eq!(scene.hit_test(15.1, 17.1), None);
    }

    #[test]
    fn interaction_frame_emits_hover_active_mouse_and_press_records() {
        let mut scene = SceneGraph::new();
        let parent = scene.create_node(NativeNodeKind::Box);
        let child = scene.create_node(NativeNodeKind::Box);
        scene.insert(parent, child, None);
        scene.set_layout(parent, NativeLayoutRect { x: 0.0, y: 0.0, width: 100.0, height: 100.0 });
        scene.set_layout(child, NativeLayoutRect { x: 10.0, y: 10.0, width: 20.0, height: 20.0 });
        scene.set_props(parent, &single_bool_prop(9, true));
        scene.set_props(child, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&2u16.to_le_bytes());
            for prop_id in [10u16, 13u16] {
                bytes.extend_from_slice(&prop_id.to_le_bytes());
                bytes.push(6);
                bytes.push(0);
                bytes.extend_from_slice(&1u32.to_le_bytes());
                bytes.push(1);
            }
            bytes
        });

        let move_records = scene.interaction_frame(15.0, 15.0, 1 << 1);
        assert!(move_records.iter().any(|record| record.node_id == child && record.event_kind == NativeEventRecord::KIND_MOUSE_OVER));
        assert!(move_records.iter().any(|record| record.node_id == child && record.event_kind == NativeEventRecord::KIND_MOUSE_MOVE));

        let down_records = scene.interaction_frame(15.0, 15.0, (1 << 0) | (1 << 2));
        assert!(down_records.iter().any(|record| record.node_id == child && record.event_kind == NativeEventRecord::KIND_MOUSE_DOWN));

        let up_records = scene.interaction_frame(15.0, 15.0, 1 << 3);
        assert!(up_records.iter().any(|record| record.node_id == child && record.event_kind == NativeEventRecord::KIND_MOUSE_UP));
        assert!(up_records.iter().any(|record| record.node_id == child && record.event_kind == NativeEventRecord::KIND_PRESS_CANDIDATE));
        assert!(up_records.iter().any(|record| record.node_id == parent && record.event_kind == NativeEventRecord::KIND_PRESS_CANDIDATE));
    }

    #[test]
    fn interaction_frame_emits_mouse_out_when_pointer_leaves() {
        let mut scene = SceneGraph::new();
        let node = scene.create_node(NativeNodeKind::Box);
        scene.set_layout(node, NativeLayoutRect { x: 0.0, y: 0.0, width: 20.0, height: 20.0 });
        scene.set_props(node, &single_bool_prop(14, true));

        let enter = scene.interaction_frame(10.0, 10.0, 1 << 1);
        assert!(enter.iter().any(|record| record.event_kind == NativeEventRecord::KIND_MOUSE_OVER));

        let leave = scene.interaction_frame(40.0, 40.0, 1 << 1);
        assert!(leave.iter().any(|record| record.node_id == node && record.event_kind == NativeEventRecord::KIND_MOUSE_OUT));
    }

    #[test]
    fn scene_can_build_layout_commands_for_retained_tree() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let a = scene.create_node(NativeNodeKind::Box);
        let b = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, a, None);
        scene.insert(root, b, None);

        scene.set_props(root, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&4u16.to_le_bytes());
            for (prop_id, kind, payload) in [
                (1u16, 3u8, 100u32.to_le_bytes().to_vec()),
                (2u16, 3u8, 20u32.to_le_bytes().to_vec()),
                (prop_hash("direction"), 5u8, b"row".to_vec()),
                (prop_hash("gap"), 3u8, 10u32.to_le_bytes().to_vec()),
            ] {
                bytes.extend_from_slice(&prop_id.to_le_bytes());
                bytes.push(kind);
                bytes.push(0);
                bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
                bytes.extend_from_slice(&payload);
            }
            bytes
        });
        scene.set_props(a, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&2u16.to_le_bytes());
            for (prop_id, payload) in [(1u16, 20u32.to_le_bytes().to_vec()), (2u16, 10u32.to_le_bytes().to_vec())] {
                bytes.extend_from_slice(&prop_id.to_le_bytes());
                bytes.push(3);
                bytes.push(0);
                bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
                bytes.extend_from_slice(&payload);
            }
            bytes
        });
        scene.set_props(b, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&2u16.to_le_bytes());
            for (prop_id, payload) in [(1u16, 30u32.to_le_bytes().to_vec()), (2u16, 10u32.to_le_bytes().to_vec())] {
                bytes.extend_from_slice(&prop_id.to_le_bytes());
                bytes.push(3);
                bytes.push(0);
                bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
                bytes.extend_from_slice(&payload);
            }
            bytes
        });

        let cmds = scene.build_layout_commands();
        let mut ctx = LayoutContext::new();
        ctx.set_viewport(100.0, 20.0);
        let mut out = vec![0u8; 256 * 1024];
        let mut used = 0u32;

        assert_eq!(ctx.compute(&cmds, &mut out, &mut used), 0);
        assert!(used >= 16 + 3 * 40);
    }
}
