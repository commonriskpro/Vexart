// native/libvexart/src/resource/mod.rs
// ResourceManager: unified GPU memory budget with priority-based LRU eviction.
// Per ARCHITECTURE.md §8.1, REQ-2B-701/702/703/704.
//
// Implementation notes (Phase 2b):
//   - Uses HashMap (single-threaded is fine per task 6.2 note; DashMap deferred to Phase 3).
//   - ResourceKey is u64 (same handle type as image/target handles).
//   - WgpuHandle is an enum that stores the GPU resource identity without owning it.
//     Ownership stays with the subsystem that created the resource.
//   - Default budget: 512MB (REQ-2B-703 / ARCHITECTURE §8.3).
//   - Minimum budget: 32MB (enforced in set_budget).

pub mod stats;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// Default memory budget: 512MB.
pub const DEFAULT_BUDGET_BYTES: u64 = 512 * 1024 * 1024;

/// Minimum allowed budget: 32MB (per ARCHITECTURE §8.3).
pub const MIN_BUDGET_BYTES: u64 = 32 * 1024 * 1024;

/// Unique key for a resource. Matches the FFI handle type (u64).
pub type ResourceKey = u64;

/// GPU resource kinds tracked by ResourceManager.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResourceKind {
    LayerTarget,
    TerminalImage,
    FontAtlas,
    GlyphAtlas,
    ImageSprite,
    TransformSprite,
    BackdropSprite,
}

/// A lightweight GPU resource handle that stores identity without taking ownership.
/// Ownership stays with the subsystem (TargetRegistry, AtlasRegistry, images HashMap, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WgpuHandle {
    /// No GPU resource (placeholder / sentinel).
    None,
    /// A handle by numeric ID (e.g. image handles, atlas font_id).
    Id(u64),
}

/// Metadata for an evicted GPU resource returned or tracked by ResourceManager.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvictedResource {
    pub key: ResourceKey,
    pub kind: ResourceKind,
    pub size_bytes: u64,
    pub gpu_handle: WgpuHandle,
}

/// Metadata for a single GPU-resident resource tracked by ResourceManager.
#[derive(Debug)]
pub struct Resource {
    pub kind: ResourceKind,
    /// Size in bytes on the GPU.
    pub size_bytes: u64,
    /// Frame number when this resource was last used.
    pub last_used_frame: u64,
    /// GPU handle (lightweight identity, not ownership).
    pub gpu_handle: WgpuHandle,
}

/// Unified GPU memory manager with priority-based LRU eviction.
///
/// All GPU-resident assets (layer targets, font atlases, glyph atlases, image sprites,
/// transform sprites, backdrop sprites) are registered here so the engine can enforce
/// a global memory budget.
///
/// # Usage pattern
///
/// 1. `register(key, kind, size_bytes)` — called when a GPU resource is allocated.
/// 2. `touch(key, current_frame)` — called each frame when a resource is used.
/// 3. `end_frame(current_frame)` — called at frame end to demote untouched resources.
/// 4. `try_allocate(size_bytes)` — called before allocating a new resource; triggers eviction if over budget.
/// 5. `remove(key)` — called when a resource is explicitly freed.
pub struct ResourceManager {
    /// Configured memory budget in bytes.
    pub budget_bytes: u64,
    /// Current GPU memory usage in bytes (atomic for observe-without-lock from FFI stats).
    pub current_usage: AtomicU64,
    /// Peak usage ever observed (updated on register).
    pub high_water_mark: AtomicU64,
    /// Resource registry: handle → Resource.
    pub resources: HashMap<ResourceKey, Resource>,
    /// Resources evicted in the most recent frame (reset each frame).
    pub evictions_last_frame: u32,
    /// Total resources evicted since startup.
    pub evictions_total: u64,
    /// Metadata of resources evicted in the most recent `try_allocate` call.
    pub last_evicted: Vec<EvictedResource>,
}

impl ResourceManager {
    /// Create a new manager with the default or environment-configured budget.
    pub fn new() -> Self {
        let budget = std::env::var("VEXART_VRAM_BUDGET_MB")
            .ok()
            .and_then(|val| val.parse::<u64>().ok())
            .map(|mb| mb * 1024 * 1024)
            .unwrap_or(DEFAULT_BUDGET_BYTES);
        Self::with_budget(budget)
    }

    /// Create a manager with a specific budget in bytes.
    pub fn with_budget(budget_bytes: u64) -> Self {
        let budget = budget_bytes.max(MIN_BUDGET_BYTES);
        Self {
            budget_bytes: budget,
            current_usage: AtomicU64::new(0),
            high_water_mark: AtomicU64::new(0),
            resources: HashMap::new(),
            evictions_last_frame: 0,
            evictions_total: 0,
            last_evicted: Vec::new(),
        }
    }

    /// Set a new budget. Enforces minimum of 32MB.
    /// Does NOT trigger eviction — caller should call `try_allocate(0)` after if desired.
    pub fn set_budget(&mut self, budget_bytes: u64) {
        self.budget_bytes = budget_bytes.max(MIN_BUDGET_BYTES);
    }

    /// Register a new GPU resource with the manager.
    ///
    /// The resource starts at `Visible` priority (it was just created/used).
    /// Returns the updated `current_usage` after registration.
    pub fn register(
        &mut self,
        key: ResourceKey,
        kind: ResourceKind,
        size_bytes: u64,
        current_frame: u64,
        gpu_handle: WgpuHandle,
    ) -> u64 {
        // If key already exists (e.g. re-registration), remove old size first.
        if let Some(old) = self.resources.remove(&key) {
            self.current_usage
                .fetch_sub(old.size_bytes, Ordering::Relaxed);
        }

        self.resources.insert(
            key,
            Resource {
                kind,
                size_bytes,
                last_used_frame: current_frame,
                gpu_handle,
            },
        );

        let usage = self.current_usage.fetch_add(size_bytes, Ordering::Relaxed) + size_bytes;

        // Update high-water mark.
        let prev_hwm = self.high_water_mark.load(Ordering::Relaxed);
        if usage > prev_hwm {
            self.high_water_mark.store(usage, Ordering::Relaxed);
        }

        usage
    }

    /// Mark a resource as used in the current frame (promotes to Visible).
    pub fn touch(&mut self, key: ResourceKey, current_frame: u64) {
        if let Some(r) = self.resources.get_mut(&key) {
            r.last_used_frame = current_frame;
        }
    }

    /// Remove a resource (GPU resource is being freed by the owning subsystem).
    ///
    /// Returns the size_bytes of the removed resource, or 0 if not found.
    pub fn remove(&mut self, key: ResourceKey) -> u64 {
        if let Some(r) = self.resources.remove(&key) {
            self.current_usage
                .fetch_sub(r.size_bytes, Ordering::Relaxed);
            r.size_bytes
        } else {
            0
        }
    }

    /// End-of-frame pass.
    pub fn end_frame(&mut self, _current_frame: u64) {}

    /// Check if reserving `size_bytes` would remain within the memory budget.
    ///
    /// Returns `Ok(())` if `current_usage + size_bytes <= budget_bytes`.
    /// Returns `Err(ERR_OUT_OF_BUDGET)` if budget would be exceeded or addition overflows.
    pub fn try_reserve(&mut self, size_bytes: u64) -> Result<(), i32> {
        let current = self.current_usage.load(Ordering::Relaxed);
        let needed = match current.checked_add(size_bytes) {
            Some(n) => n,
            None => return Err(crate::ffi::panic::ERR_OUT_OF_BUDGET),
        };

        if needed <= self.budget_bytes {
            Ok(())
        } else {
            Err(crate::ffi::panic::ERR_OUT_OF_BUDGET)
        }
    }

    /// Attempt to allocate `size_bytes` of new GPU memory.
    ///
    /// Disarmed: simply records the allocation without evicting.
    /// If budget is exceeded, logs a warning with `eprintln!` but still succeeds.
    pub fn try_allocate(&mut self, size_bytes: u64) -> Result<(), ()> {
        let current = self.current_usage.load(Ordering::Relaxed);
        if let Some(needed) = current.checked_add(size_bytes) {
            if needed > self.budget_bytes {
                eprintln!(
                    "vexart: VRAM budget exceeded (needed: {} bytes, budget: {} bytes)",
                    needed, self.budget_bytes
                );
            }
        }
        Ok(())
    }

    /// Take the metadata of resources evicted in the most recent `try_allocate` call.
    pub fn take_last_evicted(&mut self) -> Vec<EvictedResource> {
        std::mem::take(&mut self.last_evicted)
    }

    /// Look up metadata for an evicted resource from the most recent `try_allocate` call.
    pub fn get_evicted_resource(&self, key: ResourceKey) -> Option<&EvictedResource> {
        self.last_evicted.iter().find(|e| e.key == key)
    }

    /// Reset the per-frame eviction counter. Call at the start of each frame.
    pub fn begin_frame(&mut self) {
        self.evictions_last_frame = 0;
    }

    /// Total number of resources currently registered.
    pub fn resource_count(&self) -> usize {
        self.resources.len()
    }

    /// Current usage in bytes.
    pub fn current_usage_bytes(&self) -> u64 {
        self.current_usage.load(Ordering::Relaxed)
    }
}

impl Default for ResourceManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: register a resource and return it.
    fn reg(mgr: &mut ResourceManager, key: u64, kind: ResourceKind, mb: u64, frame: u64) {
        mgr.register(key, kind, mb * 1024 * 1024, frame, WgpuHandle::Id(key));
    }

    #[test]
    fn test_create_use_lifecycle() {
        let mut mgr = ResourceManager::new();
        assert_eq!(mgr.current_usage_bytes(), 0);

        // Register a 10MB FontAtlas.
        reg(&mut mgr, 1, ResourceKind::FontAtlas, 10, 0);
        assert_eq!(mgr.current_usage_bytes(), 10 * 1024 * 1024);
        assert_eq!(mgr.resource_count(), 1);

        // Touch it in frame 1.
        mgr.touch(1, 1);
        let r = &mgr.resources[&1];
        assert_eq!(r.last_used_frame, 1);

        // Remove it.
        let freed = mgr.remove(1);
        assert_eq!(freed, 10 * 1024 * 1024);
        assert_eq!(mgr.current_usage_bytes(), 0);
        assert_eq!(mgr.resource_count(), 0);
    }

    #[test]
    fn test_try_allocate_warns_and_succeeds_over_budget() {
        let mut mgr = ResourceManager::with_budget(50 * 1024 * 1024);
        reg(&mut mgr, 1, ResourceKind::LayerTarget, 40, 0);
        assert_eq!(mgr.current_usage_bytes(), 40 * 1024 * 1024);

        // 40MB + 20MB = 60MB > 50MB budget -> should warn but succeed with Ok(())
        let result = mgr.try_allocate(20 * 1024 * 1024);
        assert_eq!(result, Ok(()));
        // Resources should remain untouched
        assert_eq!(mgr.resource_count(), 1);
        assert_eq!(mgr.current_usage_bytes(), 40 * 1024 * 1024);
    }

    #[test]
    fn test_high_water_mark_tracked() {
        let mut mgr = ResourceManager::new();
        reg(&mut mgr, 1, ResourceKind::FontAtlas, 50, 0);
        assert_eq!(
            mgr.high_water_mark.load(Ordering::Relaxed),
            50 * 1024 * 1024
        );

        mgr.remove(1);
        // Usage dropped but high_water_mark should still be 50MB.
        assert_eq!(
            mgr.high_water_mark.load(Ordering::Relaxed),
            50 * 1024 * 1024
        );
    }

    #[test]
    fn test_set_budget_min_enforced() {
        let mut mgr = ResourceManager::new();
        mgr.set_budget(1); // below minimum
        assert_eq!(mgr.budget_bytes, MIN_BUDGET_BYTES);
    }

    #[test]
    fn test_begin_frame_resets_evictions_last_frame() {
        let mut mgr = ResourceManager::with_budget(50 * 1024 * 1024);
        mgr.evictions_last_frame = 5;
        mgr.begin_frame();
        assert_eq!(mgr.evictions_last_frame, 0);
    }

    #[test]
    fn test_try_reserve_returns_err_out_of_budget_when_exceeding_budget() {
        let mut mgr = ResourceManager::with_budget(MIN_BUDGET_BYTES); // 32MB
        assert_eq!(mgr.try_reserve(10 * 1024 * 1024), Ok(()));

        // Fill 30MB
        reg(&mut mgr, 1, ResourceKind::LayerTarget, 30, 0);
        assert_eq!(mgr.current_usage_bytes(), 30 * 1024 * 1024);

        // 30MB + 2MB = 32MB <= 32MB -> Ok
        assert_eq!(mgr.try_reserve(2 * 1024 * 1024), Ok(()));

        // 30MB + 3MB = 33MB > 32MB -> Err(ERR_OUT_OF_BUDGET)
        assert_eq!(
            mgr.try_reserve(3 * 1024 * 1024),
            Err(crate::ffi::panic::ERR_OUT_OF_BUDGET)
        );

        // Checked arithmetic overflow check
        assert_eq!(
            mgr.try_reserve(u64::MAX),
            Err(crate::ffi::panic::ERR_OUT_OF_BUDGET)
        );
    }

    #[test]
    fn test_vram_budget_env_var() {
        std::env::set_var("VEXART_VRAM_BUDGET_MB", "256");
        let mgr = ResourceManager::new();
        assert_eq!(mgr.budget_bytes, 256 * 1024 * 1024);
        std::env::remove_var("VEXART_VRAM_BUDGET_MB");

        let default_mgr = ResourceManager::new();
        assert_eq!(default_mgr.budget_bytes, DEFAULT_BUDGET_BYTES);
    }
}
