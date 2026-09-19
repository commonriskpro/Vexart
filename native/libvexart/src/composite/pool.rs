// native/libvexart/src/composite/pool.rs
// Texture pooling for offscreen targets and intermediate effect surfaces.
// Item 3 of Phase 3 from ARCHITECTURE-AUDIT.md.

use std::collections::HashMap;

pub const DEFAULT_MAX_POOL_BYTES: usize = 64 * 1024 * 1024; // 64 MB
pub const DEFAULT_MAX_TEXTURES_PER_KEY: usize = 4;
pub const DEFAULT_FRAME_TTL: u64 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct TexturePoolKey {
    pub width: u32,
    pub height: u32,
}

pub struct PooledTexture {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub last_used_frame: u64,
    pub byte_size: usize,
}

pub struct TexturePool {
    pub available: HashMap<TexturePoolKey, Vec<PooledTexture>>,
    pub total_bytes: usize,
    pub max_bytes: usize,
    pub max_textures_per_key: usize,
    pub frame_ttl: u64,
}

impl Default for TexturePool {
    fn default() -> Self {
        Self::new()
    }
}

impl TexturePool {
    pub fn new() -> Self {
        Self {
            available: HashMap::new(),
            total_bytes: 0,
            max_bytes: DEFAULT_MAX_POOL_BYTES,
            max_textures_per_key: DEFAULT_MAX_TEXTURES_PER_KEY,
            frame_ttl: DEFAULT_FRAME_TTL,
        }
    }

    /// Acquires a texture and its default view matching the given width and height.
    /// If an available texture exists in the pool, it is popped and returned.
    /// Otherwise, a new texture is created with unified usages:
    /// RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC | COPY_DST.
    pub fn acquire(
        &mut self,
        device: &wgpu::Device,
        width: u32,
        height: u32,
        _current_frame: u64,
    ) -> (wgpu::Texture, wgpu::TextureView) {
        let key = TexturePoolKey { width, height };
        if let std::collections::hash_map::Entry::Occupied(mut entry) = self.available.entry(key) {
            let list = entry.get_mut();
            if let Some(pooled) = list.pop() {
                self.total_bytes = self.total_bytes.saturating_sub(pooled.byte_size);
                if list.is_empty() {
                    entry.remove();
                }
                return (pooled.texture, pooled.view);
            }
        }

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("vexart-pooled-texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    /// Releases a texture and view back to the pool for reuse.
    /// If the list for key already has >= max_textures_per_key or total_bytes + byte_size > max_bytes,
    /// the texture is dropped immediately.
    pub fn release(
        &mut self,
        texture: wgpu::Texture,
        view: wgpu::TextureView,
        width: u32,
        height: u32,
        current_frame: u64,
    ) {
        let key = TexturePoolKey { width, height };
        let byte_size = (width as usize)
            .saturating_mul(height as usize)
            .saturating_mul(4);

        let count = self.available.get(&key).map_or(0, |v| v.len());
        if count >= self.max_textures_per_key
            || self.total_bytes.saturating_add(byte_size) > self.max_bytes
        {
            drop((texture, view));
            return;
        }

        self.total_bytes = self.total_bytes.saturating_add(byte_size);
        self.available.entry(key).or_default().push(PooledTexture {
            texture,
            view,
            last_used_frame: current_frame,
            byte_size,
        });
    }

    /// Evicts textures where current_frame.saturating_sub(pooled.last_used_frame) > self.frame_ttl.
    /// Also removes empty key entries and updates total_bytes.
    pub fn trim_unused(&mut self, current_frame: u64) {
        let ttl = self.frame_ttl;
        let mut freed_bytes: usize = 0;
        self.available.retain(|_key, list| {
            list.retain(|pooled| {
                let age = current_frame.saturating_sub(pooled.last_used_frame);
                if age > ttl {
                    freed_bytes = freed_bytes.saturating_add(pooled.byte_size);
                    false
                } else {
                    true
                }
            });
            !list.is_empty()
        });
        self.total_bytes = self.total_bytes.saturating_sub(freed_bytes);
    }

    /// Drains all pooled textures and resets total_bytes = 0.
    pub fn clear(&mut self) {
        self.available.clear();
        self.total_bytes = 0;
    }

    /// Total number of pooled textures across all resolutions.
    pub fn available_count(&self) -> usize {
        self.available.values().map(|v| v.len()).sum()
    }

    /// Count of pooled textures for a specific resolution.
    pub fn count_for_key(&self, width: u32, height: u32) -> usize {
        self.available
            .get(&TexturePoolKey { width, height })
            .map_or(0, |v| v.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paint::context::WgpuContext;

    #[test]
    fn test_pool_key_equality_and_hash() {
        use std::collections::HashSet;
        let k1 = TexturePoolKey { width: 100, height: 200 };
        let k2 = TexturePoolKey { width: 100, height: 200 };
        let k3 = TexturePoolKey { width: 200, height: 100 };
        assert_eq!(k1, k2);
        assert_ne!(k1, k3);

        let mut set = HashSet::new();
        set.insert(k1);
        assert!(set.contains(&k2));
        assert!(!set.contains(&k3));
    }

    #[test]
    fn test_texture_pool_acquire_and_release() {
        let wgpu = WgpuContext::new();
        let mut pool = TexturePool::new();

        assert_eq!(pool.available_count(), 0);
        assert_eq!(pool.total_bytes, 0);

        // Acquire new texture
        let (tex1, view1) = pool.acquire(&wgpu.device, 64, 64, 1);
        assert_eq!(pool.available_count(), 0);
        assert_eq!(pool.total_bytes, 0);

        // Release to pool
        pool.release(tex1, view1, 64, 64, 1);
        assert_eq!(pool.available_count(), 1);
        assert_eq!(pool.count_for_key(64, 64), 1);
        assert_eq!(pool.total_bytes, 64 * 64 * 4);

        // Acquire again - should reuse pooled texture
        let (_tex2, _view2) = pool.acquire(&wgpu.device, 64, 64, 2);
        assert_eq!(pool.available_count(), 0);
        assert_eq!(pool.count_for_key(64, 64), 0);
        assert_eq!(pool.total_bytes, 0);
    }

    #[test]
    fn test_texture_pool_max_textures_per_key() {
        let wgpu = WgpuContext::new();
        let mut pool = TexturePool::new();
        pool.max_textures_per_key = 2;

        let (t1, v1) = pool.acquire(&wgpu.device, 32, 32, 1);
        let (t2, v2) = pool.acquire(&wgpu.device, 32, 32, 1);
        let (t3, v3) = pool.acquire(&wgpu.device, 32, 32, 1);

        pool.release(t1, v1, 32, 32, 1);
        pool.release(t2, v2, 32, 32, 1);
        assert_eq!(pool.count_for_key(32, 32), 2);
        assert_eq!(pool.total_bytes, 2 * (32 * 32 * 4));

        // Third release should be dropped because max_textures_per_key is 2
        pool.release(t3, v3, 32, 32, 1);
        assert_eq!(pool.count_for_key(32, 32), 2);
        assert_eq!(pool.total_bytes, 2 * (32 * 32 * 4));
    }

    #[test]
    fn test_texture_pool_max_bytes() {
        let wgpu = WgpuContext::new();
        let mut pool = TexturePool::new();
        // 32*32*4 = 4096 bytes per texture. Set max_bytes to 6000.
        pool.max_bytes = 6000;

        let (t1, v1) = pool.acquire(&wgpu.device, 32, 32, 1);
        let (t2, v2) = pool.acquire(&wgpu.device, 32, 32, 1);

        pool.release(t1, v1, 32, 32, 1);
        assert_eq!(pool.available_count(), 1);
        assert_eq!(pool.total_bytes, 4096);

        // Second texture would bring total to 8192 > 6000, so it gets dropped.
        pool.release(t2, v2, 32, 32, 1);
        assert_eq!(pool.available_count(), 1);
        assert_eq!(pool.total_bytes, 4096);
    }

    #[test]
    fn test_texture_pool_trim_unused() {
        let wgpu = WgpuContext::new();
        let mut pool = TexturePool::new();
        pool.frame_ttl = 10;

        let (t1, v1) = pool.acquire(&wgpu.device, 32, 32, 1);
        let (t2, v2) = pool.acquire(&wgpu.device, 32, 32, 1);

        pool.release(t1, v1, 32, 32, 5);
        pool.release(t2, v2, 32, 32, 15);
        assert_eq!(pool.available_count(), 2);
        assert_eq!(pool.total_bytes, 2 * 4096);

        // At frame 14:
        // t1 age is 14 - 5 = 9 <= 10 -> kept
        // t2 age is 14 - 15 = 0 <= 10 -> kept
        pool.trim_unused(14);
        assert_eq!(pool.available_count(), 2);
        assert_eq!(pool.total_bytes, 2 * 4096);

        // At frame 16:
        // t1 age is 16 - 5 = 11 > 10 -> evicted
        // t2 age is 16 - 15 = 1 <= 10 -> kept
        pool.trim_unused(16);
        assert_eq!(pool.available_count(), 1);
        assert_eq!(pool.total_bytes, 4096);

        // At frame 26:
        // t2 age is 26 - 15 = 11 > 10 -> evicted
        pool.trim_unused(26);
        assert_eq!(pool.available_count(), 0);
        assert_eq!(pool.total_bytes, 0);
    }

    #[test]
    fn test_texture_pool_clear() {
        let wgpu = WgpuContext::new();
        let mut pool = TexturePool::new();

        let (t1, v1) = pool.acquire(&wgpu.device, 32, 32, 1);
        let (t2, v2) = pool.acquire(&wgpu.device, 64, 64, 1);

        pool.release(t1, v1, 32, 32, 1);
        pool.release(t2, v2, 64, 64, 1);
        assert_eq!(pool.available_count(), 2);
        assert!(pool.total_bytes > 0);

        pool.clear();
        assert_eq!(pool.available_count(), 0);
        assert_eq!(pool.total_bytes, 0);
    }
}
