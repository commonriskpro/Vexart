// native/libvexart/src/resource/eviction.rs
// LRU eviction walk for ResourceManager.
// Per ARCHITECTURE.md §8.2, REQ-2B-703.
//
// Eviction order: Cold first, then Recent, never Visible.
// Proceeds until current_usage ≤ budget_bytes.

use super::{Priority, Resource, ResourceKey};
use std::collections::HashMap;

/// Result of an eviction run.
pub struct EvictionResult {
    /// Keys that were evicted (in order of eviction).
    pub evicted: Vec<ResourceKey>,
    /// Bytes freed by eviction.
    pub bytes_freed: u64,
}

/// Walk `resources` and select which keys to evict to bring `current_usage` down to `budget_bytes`.
///
/// Eviction order:
///   1. All Cold resources sorted by `last_used_frame` ascending (oldest first).
///   2. All Recent resources sorted by `last_used_frame` ascending (oldest first).
///   3. Never evict Visible resources.
///
/// If after exhausting Cold + Recent the budget is still exceeded, the result contains
/// only what could be evicted — the caller must handle the over-budget condition.
pub fn select_eviction_targets(
    resources: &HashMap<ResourceKey, Resource>,
    current_usage: u64,
    budget_bytes: u64,
) -> EvictionResult {
    if current_usage <= budget_bytes {
        return EvictionResult {
            evicted: vec![],
            bytes_freed: 0,
        };
    }

    let needed = current_usage - budget_bytes;

    // Gather Cold candidates sorted by last_used_frame (LRU first).
    let mut cold: Vec<(ResourceKey, u64)> = resources
        .iter()
        .filter(|(_, r)| r.priority == Priority::Cold)
        .map(|(k, r)| (*k, r.last_used_frame))
        .collect();
    cold.sort_by_key(|(_, frame)| *frame);

    // Gather Recent candidates sorted by last_used_frame (LRU first).
    let mut recent: Vec<(ResourceKey, u64)> = resources
        .iter()
        .filter(|(_, r)| r.priority == Priority::Recent)
        .map(|(k, r)| (*k, r.last_used_frame))
        .collect();
    recent.sort_by_key(|(_, frame)| *frame);

    let mut evicted = Vec::new();
    let mut freed = 0u64;

    // Evict Cold first, then Recent.
    let candidates = cold.into_iter().chain(recent.into_iter());
    for (key, _) in candidates {
        if freed >= needed {
            break;
        }
        if let Some(r) = resources.get(&key) {
            freed += r.size_bytes;
            evicted.push(key);
        }
    }

    EvictionResult {
        evicted,
        bytes_freed: freed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resource::{ResourceKind, WgpuHandle};

    fn make_resource(priority: Priority, last_used_frame: u64, size_bytes: u64) -> Resource {
        Resource {
            kind: ResourceKind::ImageSprite,
            size_bytes,
            priority,
            last_used_frame,
            gpu_handle: WgpuHandle::None,
            seconds_since_last_use: 0.0,
        }
    }

    #[test]
    fn test_no_eviction_when_under_budget() {
        let mut map = HashMap::new();
        map.insert(1u64, make_resource(Priority::Cold, 0, 10 * 1024 * 1024));
        let result = select_eviction_targets(&map, 50 * 1024 * 1024, 128 * 1024 * 1024);
        assert!(result.evicted.is_empty());
        assert_eq!(result.bytes_freed, 0);
    }

    #[test]
    fn test_evicts_cold_before_recent() {
        let mut map = HashMap::new();
        // Cold resource: 10MB, frame 1
        map.insert(1u64, make_resource(Priority::Cold, 1, 10 * 1024 * 1024));
        // Recent resource: 10MB, frame 2
        map.insert(2u64, make_resource(Priority::Recent, 2, 10 * 1024 * 1024));

        // Budget: 100MB, current_usage: 120MB → need to free 20MB
        let result = select_eviction_targets(&map, 120 * 1024 * 1024, 100 * 1024 * 1024);
        // Should evict Cold first (key 1), then Recent if still needed.
        assert!(result.evicted.contains(&1u64));
        // Only 10MB freed from Cold — still 10MB over budget → also evicts Recent.
        assert!(result.evicted.contains(&2u64));
        assert_eq!(result.bytes_freed, 20 * 1024 * 1024);
    }

    #[test]
    fn test_cold_resources_evicted_lru_order() {
        let mut map = HashMap::new();
        // Three Cold resources with different last_used_frame values.
        map.insert(10u64, make_resource(Priority::Cold, 5, 5 * 1024 * 1024));
        map.insert(20u64, make_resource(Priority::Cold, 3, 5 * 1024 * 1024));
        map.insert(30u64, make_resource(Priority::Cold, 7, 5 * 1024 * 1024));

        // Need to free just 6MB → should evict only the 2 oldest (frame 3, then frame 5).
        let result = select_eviction_targets(&map, 134 * 1024 * 1024, 128 * 1024 * 1024);
        // frame 3 (key 20) evicted first, then frame 5 (key 10) if needed.
        assert!(result.evicted.contains(&20u64));
    }

    #[test]
    fn test_visible_resources_never_evicted() {
        let mut map = HashMap::new();
        map.insert(1u64, make_resource(Priority::Visible, 100, 100 * 1024 * 1024));
        map.insert(2u64, make_resource(Priority::Cold, 0, 1 * 1024 * 1024));

        // Budget exceeded — only Cold should be evicted, not Visible.
        let result = select_eviction_targets(&map, 200 * 1024 * 1024, 128 * 1024 * 1024);
        assert!(!result.evicted.contains(&1u64), "Visible must not be evicted");
        assert!(result.evicted.contains(&2u64), "Cold should be evicted");
    }

    #[test]
    fn test_eviction_stops_when_budget_met() {
        let mut map = HashMap::new();
        // 3 Cold resources each 10MB.
        map.insert(1u64, make_resource(Priority::Cold, 1, 10 * 1024 * 1024));
        map.insert(2u64, make_resource(Priority::Cold, 2, 10 * 1024 * 1024));
        map.insert(3u64, make_resource(Priority::Cold, 3, 10 * 1024 * 1024));

        // Only 10MB over budget → only 1 resource needs eviction.
        let result = select_eviction_targets(&map, 138 * 1024 * 1024, 128 * 1024 * 1024);
        assert_eq!(result.evicted.len(), 1, "should evict exactly 1 resource");
        assert_eq!(result.bytes_freed, 10 * 1024 * 1024);
    }
}
