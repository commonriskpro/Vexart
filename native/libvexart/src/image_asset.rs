use crate::paint;
use crate::resource::{ResourceKind, ResourceManager, WgpuHandle};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct ImageAsset {
    pub handle: u64,
    pub key: String,
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Default)]
pub struct ImageAssetRegistry {
    by_key: HashMap<String, u64>,
    assets: HashMap<u64, ImageAsset>,
}

impl ImageAssetRegistry {
    pub fn new() -> Self {
        Self { by_key: HashMap::new(), assets: HashMap::new() }
    }

    pub fn register(
        &mut self,
        key: String,
        rgba: &[u8],
        width: u32,
        height: u32,
        resources: &mut ResourceManager,
    ) -> Option<u64> {
        let expected_len = width.checked_mul(height)?.checked_mul(4)? as usize;
        if width == 0 || height == 0 || rgba.len() != expected_len {
            return None;
        }

        if let Some(handle) = self.by_key.get(&key).copied() {
            if let Some(asset) = self.assets.get_mut(&handle) {
                asset.width = width;
                asset.height = height;
                asset.bytes.clear();
                asset.bytes.extend_from_slice(rgba);
                resources.register(handle, ResourceKind::ImageSprite, rgba.len() as u64, 0, WgpuHandle::Id(handle));
                return Some(handle);
            }
        }

        let handle = paint::alloc_image_handle();
        self.by_key.insert(key.clone(), handle);
        self.assets.insert(handle, ImageAsset { handle, key, width, height, bytes: rgba.to_vec() });
        resources.register(handle, ResourceKind::ImageSprite, rgba.len() as u64, 0, WgpuHandle::Id(handle));
        Some(handle)
    }

    pub fn touch(&self, handle: u64, resources: &mut ResourceManager) -> bool {
        if !self.assets.contains_key(&handle) {
            return false;
        }
        resources.touch(handle, 0);
        true
    }

    pub fn release(&mut self, handle: u64, resources: &mut ResourceManager) -> bool {
        let Some(asset) = self.assets.remove(&handle) else {
            return false;
        };
        self.by_key.remove(&asset.key);
        resources.remove(handle);
        true
    }

    pub fn get(&self, handle: u64) -> Option<&ImageAsset> {
        self.assets.get(&handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_reuses_handle_for_same_key() {
        let mut registry = ImageAssetRegistry::new();
        let mut resources = ResourceManager::new();
        let bytes = vec![255u8; 2 * 2 * 4];

        let first = registry.register("logo.png".to_string(), &bytes, 2, 2, &mut resources).unwrap();
        let second = registry.register("logo.png".to_string(), &bytes, 2, 2, &mut resources).unwrap();

        assert_eq!(first, second);
        assert_eq!(registry.get(first).unwrap().bytes.len(), bytes.len());
    }

    #[test]
    fn register_tracks_image_sprite_resources() {
        let mut registry = ImageAssetRegistry::new();
        let mut resources = ResourceManager::new();
        let bytes = vec![128u8; 4 * 4 * 4];

        let handle = registry.register("sprite.png".to_string(), &bytes, 4, 4, &mut resources).unwrap();

        assert_eq!(resources.resource_count(), 1);
        assert_eq!(resources.current_usage_bytes(), bytes.len() as u64);
        assert!(registry.touch(handle, &mut resources));
        assert!(registry.release(handle, &mut resources));
        assert_eq!(resources.current_usage_bytes(), 0);
    }
}
