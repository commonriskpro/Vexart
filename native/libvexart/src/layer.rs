// native/libvexart/src/layer.rs
// Native LayerRegistry: retained terminal layer identity and resource accounting.
// Phase 2c — Native Layer Registry.

use crate::resource::{ResourceKind, ResourceManager, WgpuHandle};
use std::collections::HashMap;

const FIRST_LAYER_HANDLE: u64 = 1;
const FIRST_TERMINAL_IMAGE_ID: u32 = 1000;
const RESOURCE_KEY_PREFIX: u64 = 0x4C00_0000_0000_0000;
const TARGET_RESOURCE_TAG: u64 = 0;
const TERMINAL_IMAGE_RESOURCE_TAG: u64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LayerKey(String);

impl LayerKey {
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self(String::from_utf8_lossy(bytes).to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LayerDescriptor {
    pub target: u64,
    pub x: f32,
    pub y: f32,
    pub width: u32,
    pub height: u32,
    pub z: i32,
    pub flags: u32,
    pub frame: u64,
}

impl LayerDescriptor {
    pub const BYTE_LEN: usize = 40;

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < Self::BYTE_LEN {
            return None;
        }
        Some(Self {
            target: u64::from_le_bytes(bytes[0..8].try_into().ok()?),
            x: f32::from_le_bytes(bytes[8..12].try_into().ok()?),
            y: f32::from_le_bytes(bytes[12..16].try_into().ok()?),
            width: u32::from_le_bytes(bytes[16..20].try_into().ok()?),
            height: u32::from_le_bytes(bytes[20..24].try_into().ok()?),
            z: i32::from_le_bytes(bytes[24..28].try_into().ok()?),
            flags: u32::from_le_bytes(bytes[28..32].try_into().ok()?),
            frame: u64::from_le_bytes(bytes[32..40].try_into().ok()?),
        })
    }

    pub fn bytes(&self) -> u64 {
        (self.width as u64).saturating_mul(self.height as u64).saturating_mul(4)
    }
}

#[derive(Debug, Clone)]
pub struct LayerRecord {
    pub key: LayerKey,
    pub handle: u64,
    pub target: u64,
    pub terminal_image_id: u32,
    pub x: f32,
    pub y: f32,
    pub width: u32,
    pub height: u32,
    pub z: i32,
    pub dirty: bool,
    pub last_used_frame: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct LayerUpsertResult {
    pub handle: u64,
    pub terminal_image_id: u32,
    pub flags: u32,
    pub bytes: u64,
}

impl LayerUpsertResult {
    pub const BYTE_LEN: usize = 24;
    pub const FLAG_CREATED: u32 = 1;
    pub const FLAG_DIRTY: u32 = 2;
    pub const FLAG_RESIZED: u32 = 4;

    pub fn write_to(self, out: &mut [u8]) -> bool {
        if out.len() < Self::BYTE_LEN {
            return false;
        }
        out[0..8].copy_from_slice(&self.handle.to_le_bytes());
        out[8..12].copy_from_slice(&self.terminal_image_id.to_le_bytes());
        out[12..16].copy_from_slice(&self.flags.to_le_bytes());
        out[16..24].copy_from_slice(&self.bytes.to_le_bytes());
        true
    }
}

pub struct LayerRegistry {
    next_handle: u64,
    next_terminal_image_id: u32,
    by_key: HashMap<LayerKey, u64>,
    records: HashMap<u64, LayerRecord>,
}

impl LayerRegistry {
    pub fn new() -> Self {
        Self {
            next_handle: FIRST_LAYER_HANDLE,
            next_terminal_image_id: FIRST_TERMINAL_IMAGE_ID,
            by_key: HashMap::new(),
            records: HashMap::new(),
        }
    }

    pub fn upsert(
        &mut self,
        key: LayerKey,
        desc: LayerDescriptor,
        resources: &mut ResourceManager,
    ) -> LayerUpsertResult {
        if let Some(handle) = self.by_key.get(&key).copied() {
            let record = self.records.get_mut(&handle).expect("layer handle missing");
            let old_bytes = record.bytes;
            let resized = record.width != desc.width || record.height != desc.height;
            let target_changed = record.target != desc.target;
            let moved = record.x != desc.x || record.y != desc.y || record.z != desc.z;
            record.target = desc.target;
            record.x = desc.x;
            record.y = desc.y;
            record.width = desc.width;
            record.height = desc.height;
            record.z = desc.z;
            record.last_used_frame = desc.frame;
            record.bytes = desc.bytes();
            if resized || target_changed || moved {
                record.dirty = true;
            }

            if resized || old_bytes != record.bytes || target_changed {
                register_layer_resources(resources, record);
            } else {
                touch_layer_resources(resources, record.handle, desc.frame);
            }

            let mut flags = 0;
            if record.dirty {
                flags |= LayerUpsertResult::FLAG_DIRTY;
            }
            if resized {
                flags |= LayerUpsertResult::FLAG_RESIZED;
            }
            return LayerUpsertResult {
                handle,
                terminal_image_id: record.terminal_image_id,
                flags,
                bytes: record.bytes,
            };
        }

        let handle = self.next_handle;
        self.next_handle += 1;
        let terminal_image_id = self.next_terminal_image_id;
        self.next_terminal_image_id += 1;
        let record = LayerRecord {
            key: key.clone(),
            handle,
            target: desc.target,
            terminal_image_id,
            x: desc.x,
            y: desc.y,
            width: desc.width,
            height: desc.height,
            z: desc.z,
            dirty: true,
            last_used_frame: desc.frame,
            bytes: desc.bytes(),
        };
        register_layer_resources(resources, &record);
        self.by_key.insert(key, handle);
        self.records.insert(handle, record);

        LayerUpsertResult {
            handle,
            terminal_image_id,
            flags: LayerUpsertResult::FLAG_CREATED | LayerUpsertResult::FLAG_DIRTY,
            bytes: desc.bytes(),
        }
    }

    pub fn mark_dirty(&mut self, handle: u64) -> bool {
        if let Some(record) = self.records.get_mut(&handle) {
            record.dirty = true;
            return true;
        }
        false
    }

    pub fn reuse(&mut self, handle: u64, frame: u64, resources: &mut ResourceManager) -> Option<u32> {
        let record = self.records.get_mut(&handle)?;
        record.last_used_frame = frame;
        touch_layer_resources(resources, handle, frame);
        Some(record.terminal_image_id)
    }

    pub fn mark_presented(&mut self, handle: u64, frame: u64, resources: &mut ResourceManager) -> Option<u32> {
        let record = self.records.get_mut(&handle)?;
        record.dirty = false;
        record.last_used_frame = frame;
        touch_layer_resources(resources, handle, frame);
        Some(record.terminal_image_id)
    }

    pub fn remove(&mut self, handle: u64, resources: &mut ResourceManager) -> Option<u32> {
        let record = self.records.remove(&handle)?;
        self.by_key.remove(&record.key);
        remove_layer_resources(resources, handle);
        Some(record.terminal_image_id)
    }

    pub fn clear(&mut self, resources: &mut ResourceManager) {
        let handles: Vec<u64> = self.records.keys().copied().collect();
        for handle in handles {
            let _ = self.remove(handle, resources);
        }
    }

    pub fn get(&self, handle: u64) -> Option<&LayerRecord> {
        self.records.get(&handle)
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }
}

impl Default for LayerRegistry {
    fn default() -> Self {
        Self::new()
    }
}

fn layer_target_resource_key(handle: u64) -> u64 {
    RESOURCE_KEY_PREFIX | (handle << 1) | TARGET_RESOURCE_TAG
}

fn terminal_image_resource_key(handle: u64) -> u64 {
    RESOURCE_KEY_PREFIX | (handle << 1) | TERMINAL_IMAGE_RESOURCE_TAG
}

fn register_layer_resources(resources: &mut ResourceManager, record: &LayerRecord) {
    resources.register(
        layer_target_resource_key(record.handle),
        ResourceKind::LayerTarget,
        record.bytes,
        record.last_used_frame,
        WgpuHandle::Id(record.target),
    );
    resources.register(
        terminal_image_resource_key(record.handle),
        ResourceKind::TerminalImage,
        record.bytes,
        record.last_used_frame,
        WgpuHandle::Id(record.terminal_image_id as u64),
    );
}

fn touch_layer_resources(resources: &mut ResourceManager, handle: u64, frame: u64) {
    resources.touch(layer_target_resource_key(handle), frame);
    resources.touch(terminal_image_resource_key(handle), frame);
}

fn remove_layer_resources(resources: &mut ResourceManager, handle: u64) {
    resources.remove(layer_target_resource_key(handle));
    resources.remove(terminal_image_resource_key(handle));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn desc(width: u32, height: u32) -> LayerDescriptor {
        LayerDescriptor {
            target: 42,
            x: 1.0,
            y: 2.0,
            width,
            height,
            z: 3,
            flags: 0,
            frame: 1,
        }
    }

    #[test]
    fn upsert_creates_layer_and_resource_records() {
        let mut registry = LayerRegistry::new();
        let mut resources = ResourceManager::new();

        let result = registry.upsert(LayerKey::from_bytes(b"layer:a"), desc(10, 20), &mut resources);

        assert_eq!(result.handle, 1);
        assert_eq!(result.terminal_image_id, FIRST_TERMINAL_IMAGE_ID);
        assert_eq!(result.flags & LayerUpsertResult::FLAG_CREATED, LayerUpsertResult::FLAG_CREATED);
        assert_eq!(registry.len(), 1);
        assert_eq!(resources.resource_count(), 2);
    }

    #[test]
    fn upsert_reuses_existing_layer_for_same_key() {
        let mut registry = LayerRegistry::new();
        let mut resources = ResourceManager::new();
        let first = registry.upsert(LayerKey::from_bytes(b"layer:a"), desc(10, 20), &mut resources);
        let second = registry.upsert(LayerKey::from_bytes(b"layer:a"), desc(10, 20), &mut resources);

        assert_eq!(first.handle, second.handle);
        assert_eq!(first.terminal_image_id, second.terminal_image_id);
        assert_eq!(registry.len(), 1);
        assert_eq!(resources.resource_count(), 2);
    }

    #[test]
    fn resized_layer_marks_dirty_and_updates_resource_size() {
        let mut registry = LayerRegistry::new();
        let mut resources = ResourceManager::new();
        let first = registry.upsert(LayerKey::from_bytes(b"layer:a"), desc(10, 20), &mut resources);
        registry.mark_presented(first.handle, 1, &mut resources);
        let second = registry.upsert(LayerKey::from_bytes(b"layer:a"), desc(20, 20), &mut resources);

        assert_eq!(second.flags & LayerUpsertResult::FLAG_RESIZED, LayerUpsertResult::FLAG_RESIZED);
        assert_eq!(registry.get(first.handle).unwrap().dirty, true);
        assert_eq!(registry.get(first.handle).unwrap().bytes, 20 * 20 * 4);
    }

    #[test]
    fn remove_deletes_layer_and_resources() {
        let mut registry = LayerRegistry::new();
        let mut resources = ResourceManager::new();
        let result = registry.upsert(LayerKey::from_bytes(b"layer:a"), desc(10, 20), &mut resources);

        let image_id = registry.remove(result.handle, &mut resources);

        assert_eq!(image_id, Some(FIRST_TERMINAL_IMAGE_ID));
        assert_eq!(registry.len(), 0);
        assert_eq!(resources.resource_count(), 0);
    }
}
