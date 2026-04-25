use crate::paint;
use crate::resource::{ResourceKind, ResourceManager, WgpuHandle};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct CanvasDisplayList {
    pub handle: u64,
    pub key: String,
    pub bytes: Vec<u8>,
    pub hash: String,
}

#[derive(Debug, Default)]
pub struct CanvasDisplayListRegistry {
    by_key: HashMap<String, u64>,
    lists: HashMap<u64, CanvasDisplayList>,
}

impl CanvasDisplayListRegistry {
    pub fn new() -> Self {
        Self {
            by_key: HashMap::new(),
            lists: HashMap::new(),
        }
    }

    pub fn update(
        &mut self,
        key: String,
        bytes: &[u8],
        hash: String,
        resources: &mut ResourceManager,
    ) -> Option<u64> {
        if key.is_empty() || bytes.is_empty() {
            return None;
        }

        if let Some(handle) = self.by_key.get(&key).copied() {
            if let Some(list) = self.lists.get_mut(&handle) {
                if list.hash != hash || list.bytes.len() != bytes.len() {
                    list.bytes.clear();
                    list.bytes.extend_from_slice(bytes);
                    list.hash = hash;
                    resources.register(
                        handle,
                        ResourceKind::CanvasDisplayList,
                        bytes.len() as u64,
                        0,
                        WgpuHandle::Id(handle),
                    );
                } else {
                    resources.touch(handle, 0);
                }
                return Some(handle);
            }
        }

        let handle = paint::alloc_image_handle();
        self.by_key.insert(key.clone(), handle);
        self.lists.insert(
            handle,
            CanvasDisplayList {
                handle,
                key,
                bytes: bytes.to_vec(),
                hash,
            },
        );
        resources.register(
            handle,
            ResourceKind::CanvasDisplayList,
            bytes.len() as u64,
            0,
            WgpuHandle::Id(handle),
        );
        Some(handle)
    }

    pub fn touch(&self, handle: u64, resources: &mut ResourceManager) -> bool {
        if !self.lists.contains_key(&handle) {
            return false;
        }
        resources.touch(handle, 0);
        true
    }

    pub fn release(&mut self, handle: u64, resources: &mut ResourceManager) -> bool {
        let Some(list) = self.lists.remove(&handle) else {
            return false;
        };
        self.by_key.remove(&list.key);
        resources.remove(handle);
        true
    }

    pub fn get(&self, handle: u64) -> Option<&CanvasDisplayList> {
        self.lists.get(&handle)
    }
}

pub fn hash_display_list(bytes: &[u8]) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for byte in bytes {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_reuses_handle_for_same_key() {
        let mut registry = CanvasDisplayListRegistry::new();
        let mut resources = ResourceManager::new();
        let first = registry
            .update(
                "canvas:1".to_string(),
                br#"{"commands":[]}"#,
                "a".to_string(),
                &mut resources,
            )
            .unwrap();
        let second = registry
            .update(
                "canvas:1".to_string(),
                br#"{"commands":[]}"#,
                "a".to_string(),
                &mut resources,
            )
            .unwrap();

        assert_eq!(first, second);
        assert_eq!(registry.get(first).unwrap().hash, "a");
    }

    #[test]
    fn update_tracks_canvas_display_list_resources() {
        let mut registry = CanvasDisplayListRegistry::new();
        let mut resources = ResourceManager::new();
        let bytes = br#"{"version":1,"commands":[{"kind":"line"}]}"#;

        let handle = registry
            .update(
                "canvas:2".to_string(),
                bytes,
                "b".to_string(),
                &mut resources,
            )
            .unwrap();

        assert_eq!(resources.resource_count(), 1);
        assert_eq!(resources.current_usage_bytes(), bytes.len() as u64);
        assert!(registry.release(handle, &mut resources));
        assert_eq!(resources.current_usage_bytes(), 0);
    }
}
