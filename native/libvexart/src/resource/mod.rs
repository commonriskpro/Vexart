// native/libvexart/src/resource/mod.rs
// ResourceManager: unified GPU memory budget with priority-based LRU eviction.
// Per ARCHITECTURE.md §8.1, REQ-2B-701/702/703/704.
//
// Implementation notes (Phase 2b):
//   - Uses HashMap (single-threaded is fine per task 6.2 note; DashMap deferred to Phase 3).
//   - ResourceKey is u64 (same handle type as image/target handles).
//   - WgpuHandle is an enum that stores the GPU resource identity without owning it.
//     Ownership stays with the subsystem that created the resource.
//   - Default budget: 128MB (REQ-2B-703 / ARCHITECTURE §8.3).
//   - Minimum budget: 32MB (enforced in set_budget).

pub mod eviction;
pub mod priority;
pub mod stats;

pub use priority::Priority;

use eviction::select_eviction_targets;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Default memory budget: 128MB.
pub const DEFAULT_BUDGET_BYTES: u64 = 128 * 1024 * 1024;

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
    CanvasDisplayList,
    TransformSprite,
    BackdropSprite,
}

/// A lightweight GPU resource handle that stores identity without taking ownership.
/// Ownership stays with the subsystem (TargetRegistry, AtlasRegistry, images HashMap, etc.).
#[derive(Debug, Clone, Copy)]
pub enum WgpuHandle {
    /// No GPU resource (placeholder / sentinel).
    None,
    /// A handle by numeric ID (e.g. image handles, atlas font_id).
    Id(u64),
}

/// Metadata for a single GPU-resident resource tracked by ResourceManager.
#[derive(Debug)]
pub struct Resource {
    pub kind: ResourceKind,
    /// Size in bytes on the GPU.
    pub size_bytes: u64,
    /// Current eviction priority.
    pub priority: Priority,
    /// Frame number when this resource was last used.
    pub last_used_frame: u64,
    /// GPU handle (lightweight identity, not ownership).
    pub gpu_handle: WgpuHandle,
    /// Seconds since last use — updated at frame end for demotion timing.
    pub seconds_since_last_use: f64,
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
    /// Monotonic clock start for seconds-since-use calculations.
    startup: Instant,
}

impl ResourceManager {
    /// Create a new manager with the default 128MB budget.
    pub fn new() -> Self {
        Self::with_budget(DEFAULT_BUDGET_BYTES)
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
            startup: Instant::now(),
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
                priority: Priority::Visible,
                last_used_frame: current_frame,
                gpu_handle,
                seconds_since_last_use: 0.0,
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
            r.priority = r.priority.promote_to_visible();
            r.last_used_frame = current_frame;
            r.seconds_since_last_use = 0.0;
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

    /// End-of-frame pass: demote resources that were not touched this frame.
    ///
    /// - Visible → Recent for resources not touched in `current_frame`.
    /// - Recent → Cold for resources idle for >5 seconds.
    pub fn end_frame(&mut self, current_frame: u64) {
        let elapsed = self.startup.elapsed().as_secs_f64();
        for r in self.resources.values_mut() {
            let secs = elapsed - (r.last_used_frame as f64 * 0.016); // approx 16ms/frame
            r.seconds_since_last_use = secs.max(0.0);
            r.priority = priority::compute_end_frame_priority(
                r.priority,
                r.last_used_frame,
                current_frame,
                r.seconds_since_last_use,
            );
        }
    }

    /// Attempt to allocate `size_bytes` of new GPU memory.
    ///
    /// If adding `size_bytes` would exceed the budget, eviction runs first.
    ///
    /// Returns `Ok(())` if allocation is feasible (after potential eviction).
    /// Returns `Err(evicted_keys)` if even after eviction the budget would be exceeded
    /// (i.e. only Visible resources remain and they collectively exceed the budget).
    ///
    /// The caller is responsible for actually calling `remove()` on evicted keys
    /// to free the GPU resources, then `register()` for the new one.
    pub fn try_allocate(&mut self, size_bytes: u64) -> Result<Vec<ResourceKey>, Vec<ResourceKey>> {
        let current = self.current_usage.load(Ordering::Relaxed);
        let needed = current + size_bytes;

        if needed <= self.budget_bytes {
            return Ok(vec![]); // No eviction needed.
        }

        // Need to evict to make room.
        let result = select_eviction_targets(&self.resources, needed, self.budget_bytes);
        let evicted = result.evicted.clone();
        let freed = result.bytes_freed;

        // Remove evicted resources from the registry.
        for key in &evicted {
            self.remove(*key);
        }

        self.evictions_last_frame += evicted.len() as u32;
        self.evictions_total += evicted.len() as u64;

        // Check if enough was freed.
        let after = self.current_usage.load(Ordering::Relaxed) + size_bytes;
        if after <= self.budget_bytes || freed >= (needed - self.budget_bytes) {
            Ok(evicted)
        } else {
            // Still over budget — only Visible resources remain.
            Err(evicted)
        }
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
        assert_eq!(r.priority, Priority::Visible);
        assert_eq!(r.last_used_frame, 1);

        // Remove it.
        let freed = mgr.remove(1);
        assert_eq!(freed, 10 * 1024 * 1024);
        assert_eq!(mgr.current_usage_bytes(), 0);
        assert_eq!(mgr.resource_count(), 0);
    }

    #[test]
    fn test_eviction_respects_visible_priority() {
        // Budget: 50MB.
        // Visible resource: 40MB (key 1, stays Visible throughout).
        // Cold resource: 10MB (key 2).
        // Try to allocate 20MB → total 70MB > 50MB → need to free 20MB.
        // Cold (10MB) freed first, then Recent needed if still over budget.
        // Visible (key 1) must NEVER be evicted regardless.
        let mut mgr = ResourceManager::with_budget(50 * 1024 * 1024);

        // Register Visible 40MB resource.
        reg(&mut mgr, 1, ResourceKind::LayerTarget, 40, 10);
        // Ensure it's Visible by touching it at the current frame.
        mgr.touch(1, 10);
        assert_eq!(mgr.resources[&1].priority, Priority::Visible, "key 1 must be Visible");

        // Register Cold 10MB resource directly.
        reg(&mut mgr, 2, ResourceKind::ImageSprite, 10, 0);
        mgr.resources.get_mut(&2).unwrap().priority = Priority::Cold;

        // usage = 50MB = budget. Try to allocate 20MB more → over budget.
        let result = mgr.try_allocate(20 * 1024 * 1024);
        match result {
            Ok(evicted) | Err(evicted) => {
                // Visible resource (key 1) must NEVER be in the evicted list.
                assert!(!evicted.contains(&1), "Visible resource must NOT be evicted");
            }
        }
    }

    #[test]
    fn test_priority_demotion_after_frames() {
        let mut mgr = ResourceManager::new();
        reg(&mut mgr, 1, ResourceKind::ImageSprite, 10, 0);
        assert_eq!(mgr.resources[&1].priority, Priority::Visible);

        // end_frame at frame 5 (resource was touched at frame 0, not touched in frame 5).
        mgr.end_frame(5);
        // Should be Recent now (was Visible, not used in frame 5).
        assert_eq!(
            mgr.resources[&1].priority,
            Priority::Recent,
            "should demote Visible → Recent after end_frame"
        );
    }

    #[test]
    fn test_eviction_cold_before_recent() {
        let mut mgr = ResourceManager::with_budget(50 * 1024 * 1024);

        // Register two resources.
        reg(&mut mgr, 1, ResourceKind::ImageSprite, 30, 0);
        reg(&mut mgr, 2, ResourceKind::ImageSprite, 30, 0);

        // Manually set priorities.
        mgr.resources.get_mut(&1).unwrap().priority = Priority::Cold;
        mgr.resources.get_mut(&2).unwrap().priority = Priority::Recent;

        // Try to allocate 1MB more → need to free 11MB from 60MB to reach 50MB.
        let result = mgr.try_allocate(1 * 1024 * 1024);
        match result {
            Ok(evicted) | Err(evicted) => {
                // Cold (key 1) should be evicted first.
                assert!(evicted.contains(&1), "Cold should be evicted first");
            }
        }
    }

    #[test]
    fn test_high_water_mark_tracked() {
        let mut mgr = ResourceManager::new();
        reg(&mut mgr, 1, ResourceKind::FontAtlas, 50, 0);
        assert_eq!(mgr.high_water_mark.load(Ordering::Relaxed), 50 * 1024 * 1024);

        mgr.remove(1);
        // Usage dropped but high_water_mark should still be 50MB.
        assert_eq!(mgr.high_water_mark.load(Ordering::Relaxed), 50 * 1024 * 1024);
    }

    #[test]
    fn test_set_budget_min_enforced() {
        let mut mgr = ResourceManager::new();
        mgr.set_budget(1); // below minimum
        assert_eq!(mgr.budget_bytes, MIN_BUDGET_BYTES);
    }

    #[test]
    fn test_begin_frame_resets_evictions_last_frame() {
        // Budget: 50MB, resource: 40MB Cold. Try to allocate 20MB → total 60MB > 50MB → evict.
        let mut mgr = ResourceManager::with_budget(50 * 1024 * 1024);
        reg(&mut mgr, 1, ResourceKind::ImageSprite, 40, 0);
        mgr.resources.get_mut(&1).unwrap().priority = Priority::Cold;
        let _ = mgr.try_allocate(20 * 1024 * 1024);
        assert!(mgr.evictions_last_frame > 0, "should have evicted");

        mgr.begin_frame();
        assert_eq!(mgr.evictions_last_frame, 0);
    }

    #[test]
    fn test_evictions_total_cumulative() {
        // Use 100MB budget with 60MB resource to force eviction of Cold.
        let mut mgr = ResourceManager::with_budget(100 * 1024 * 1024);
        // Register 60MB Cold resource.
        reg(&mut mgr, 1, ResourceKind::ImageSprite, 60, 0);
        mgr.resources.get_mut(&1).unwrap().priority = Priority::Cold;
        // Try to allocate 60MB more → total 120MB > 100MB budget → evict Cold.
        let _ = mgr.try_allocate(60 * 1024 * 1024);
        let total_after_first = mgr.evictions_total;
        assert!(total_after_first > 0, "should have evicted something");

        // Register another Cold resource and evict again.
        reg(&mut mgr, 2, ResourceKind::ImageSprite, 60, 0);
        mgr.resources.get_mut(&2).unwrap().priority = Priority::Cold;
        let _ = mgr.try_allocate(60 * 1024 * 1024);
        assert!(mgr.evictions_total > total_after_first, "evictions_total should grow");
    }
}
