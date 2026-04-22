// native/libvexart/src/resource/stats.rs
// ResourceStats struct + serialization for FFI export.
// Per ARCHITECTURE.md §8.4, REQ-2B-704.

use super::{ResourceKind, ResourceManager};
use std::collections::HashMap;

/// Per-kind count + bytes summary.
#[derive(Debug, Default, Clone)]
pub struct KindStats {
    pub count: u32,
    pub bytes: u64,
}

/// Full resource statistics snapshot.
///
/// Exposed via `vexart_resource_get_stats` FFI as a JSON-encoded buffer.
/// Matches the TypeScript `ResourceStats` type in ARCHITECTURE.md §8.4.
#[derive(Debug, Default, Clone)]
pub struct ResourceStats {
    /// Configured budget in bytes.
    pub budget_bytes: u64,
    /// Current GPU memory usage in bytes.
    pub current_usage: u64,
    /// Peak usage ever observed.
    pub high_water_mark: u64,
    /// Per-kind breakdown.
    pub resources_by_kind: HashMap<String, KindStats>,
    /// Resources evicted in the most recent frame.
    pub evictions_last_frame: u32,
    /// Total resources evicted since startup.
    pub evictions_total: u64,
}

impl ResourceStats {
    /// Encode the stats as a compact JSON string for the FFI buffer.
    ///
    /// Format: `{"budgetBytes":N,"currentUsage":N,...}`
    /// Uses manual JSON construction to avoid a serde dependency for just this struct.
    pub fn to_json(&self) -> String {
        let mut kind_json = String::new();
        let mut first = true;
        for (kind, stats) in &self.resources_by_kind {
            if !first {
                kind_json.push(',');
            }
            first = false;
            kind_json.push_str(&format!(
                "\"{}\":{{\"count\":{},\"bytes\":{}}}",
                kind, stats.count, stats.bytes
            ));
        }

        format!(
            "{{\"budgetBytes\":{},\"currentUsage\":{},\"highWaterMark\":{},\
             \"resourcesByKind\":{{{}}},\"evictionsLastFrame\":{},\"evictionsTotal\":{}}}",
            self.budget_bytes,
            self.current_usage,
            self.high_water_mark,
            kind_json,
            self.evictions_last_frame,
            self.evictions_total,
        )
    }
}

/// Build a `ResourceStats` snapshot from a `ResourceManager`.
pub fn collect_stats(mgr: &ResourceManager) -> ResourceStats {
    use std::sync::atomic::Ordering;

    let current = mgr.current_usage.load(Ordering::Relaxed);
    let high_wm = mgr.high_water_mark.load(Ordering::Relaxed);

    let mut by_kind: HashMap<String, KindStats> = HashMap::new();
    for (_, resource) in &mgr.resources {
        let key = resource_kind_name(resource.kind);
        let entry = by_kind.entry(key.to_string()).or_default();
        entry.count += 1;
        entry.bytes += resource.size_bytes;
    }

    ResourceStats {
        budget_bytes: mgr.budget_bytes,
        current_usage: current,
        high_water_mark: high_wm,
        resources_by_kind: by_kind,
        evictions_last_frame: mgr.evictions_last_frame,
        evictions_total: mgr.evictions_total,
    }
}

/// Human-readable name for a ResourceKind (matches TypeScript enum strings).
fn resource_kind_name(kind: ResourceKind) -> &'static str {
    match kind {
        ResourceKind::LayerTarget => "LayerTarget",
        ResourceKind::FontAtlas => "FontAtlas",
        ResourceKind::GlyphAtlas => "GlyphAtlas",
        ResourceKind::ImageSprite => "ImageSprite",
        ResourceKind::TransformSprite => "TransformSprite",
        ResourceKind::BackdropSprite => "BackdropSprite",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_stats_to_json() {
        let mut stats = ResourceStats {
            budget_bytes: 134_217_728, // 128MB
            current_usage: 36_700_160, // 35MB
            high_water_mark: 104_857_600, // 100MB
            resources_by_kind: HashMap::new(),
            evictions_last_frame: 2,
            evictions_total: 15,
        };
        stats.resources_by_kind.insert(
            "FontAtlas".to_string(),
            KindStats { count: 3, bytes: 15_728_640 },
        );
        stats.resources_by_kind.insert(
            "ImageSprite".to_string(),
            KindStats { count: 5, bytes: 20_971_520 },
        );

        let json = stats.to_json();
        // Verify key fields are present in the JSON.
        assert!(json.contains("\"budgetBytes\":134217728"), "budget_bytes in JSON: {json}");
        assert!(json.contains("\"currentUsage\":36700160"), "current_usage in JSON: {json}");
        assert!(json.contains("\"highWaterMark\":104857600"), "high_water_mark in JSON: {json}");
        assert!(json.contains("\"evictionsLastFrame\":2"), "evictions_last_frame in JSON: {json}");
        assert!(json.contains("\"evictionsTotal\":15"), "evictions_total in JSON: {json}");
        assert!(json.contains("\"FontAtlas\""), "FontAtlas in JSON: {json}");
        assert!(json.contains("\"ImageSprite\""), "ImageSprite in JSON: {json}");
    }
}
