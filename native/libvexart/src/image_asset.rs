use crate::paint;
use crate::resource::{ResourceKind, ResourceManager, WgpuHandle};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct ImageAsset {
    pub handle: u64,
    pub key: String,
    pub width: u32,
    pub height: u32,
    references: u64,
}

impl ImageAsset {
    pub fn size_bytes(&self) -> u64 {
        (self.width as u64) * (self.height as u64) * 4
    }
}

#[derive(Debug, Default)]
pub struct ImageAssetRegistry {
    by_key: HashMap<String, u64>,
    assets: HashMap<u64, ImageAsset>,
}

impl ImageAssetRegistry {
    pub fn new() -> Self {
        Self {
            by_key: HashMap::new(),
            assets: HashMap::new(),
        }
    }

    pub fn register(
        &mut self,
        key: String,
        rgba: &[u8],
        width: u32,
        height: u32,
        current_frame: u64,
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
                resources.register(
                    handle,
                    ResourceKind::ImageSprite,
                    rgba.len() as u64,
                    current_frame,
                    WgpuHandle::Id(handle),
                );
                return Some(handle);
            }
        }

        let handle = paint::alloc_image_handle();
        self.by_key.insert(key.clone(), handle);
        self.assets.insert(
            handle,
            ImageAsset {
                handle,
                key,
                width,
                height,
                references: 1,
            },
        );
        resources.register(
            handle,
            ResourceKind::ImageSprite,
            rgba.len() as u64,
            current_frame,
            WgpuHandle::Id(handle),
        );
        Some(handle)
    }

    pub fn touch(&self, handle: u64, current_frame: u64, resources: &mut ResourceManager) -> bool {
        if !self.assets.contains_key(&handle) {
            return false;
        }
        resources.touch(handle, current_frame);
        true
    }

    /// Acquire a separate owner without re-uploading or changing the asset.
    pub fn retain(&mut self, handle: u64) -> bool {
        let Some(asset) = self.assets.get_mut(&handle) else {
            return false;
        };
        let Some(references) = asset.references.checked_add(1) else {
            return false;
        };
        asset.references = references;
        true
    }

    pub fn release(&mut self, handle: u64, resources: &mut ResourceManager) -> bool {
        let Some(asset) = self.assets.get_mut(&handle) else {
            return false;
        };
        if asset.references > 1 {
            asset.references -= 1;
            return true;
        }
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
    fn release_should_keep_shared_asset_until_last_owner() {
        let mut registry = ImageAssetRegistry::new();
        let mut resources = ResourceManager::new();
        let handle = registry.register("shared".into(), &[255; 4], 1, 1, 0, &mut resources).unwrap();
        assert!(registry.retain(handle));
        assert!(registry.release(handle, &mut resources));
        assert!(registry.get(handle).is_some());
        assert_eq!(resources.current_usage_bytes(), 4);
        assert!(registry.release(handle, &mut resources));
        assert!(registry.get(handle).is_none());
        assert_eq!(resources.current_usage_bytes(), 0);
        assert!(!registry.retain(handle));
    }

    #[test]
    fn register_reuses_handle_for_same_key() {
        let mut registry = ImageAssetRegistry::new();
        let mut resources = ResourceManager::new();
        let bytes = vec![255u8; 2 * 2 * 4];

        let first = registry
            .register("logo.png".to_string(), &bytes, 2, 2, 1, &mut resources)
            .unwrap();
        let second = registry
            .register("logo.png".to_string(), &bytes, 2, 2, 2, &mut resources)
            .unwrap();

        assert_eq!(first, second);
        let asset = registry.get(first).unwrap();
        assert_eq!(asset.width, 2);
        assert_eq!(asset.height, 2);
        assert_eq!(asset.size_bytes(), bytes.len() as u64);
    }

    #[test]
    fn register_tracks_image_sprite_resources() {
        let mut registry = ImageAssetRegistry::new();
        let mut resources = ResourceManager::new();
        let bytes = vec![128u8; 4 * 4 * 4];

        let handle = registry
            .register("sprite.png".to_string(), &bytes, 4, 4, 1, &mut resources)
            .unwrap();

        assert_eq!(resources.resource_count(), 1);
        assert_eq!(resources.current_usage_bytes(), bytes.len() as u64);
        assert!(registry.touch(handle, 2, &mut resources));
        assert!(registry.release(handle, &mut resources));
        assert_eq!(resources.current_usage_bytes(), 0);
    }
}
