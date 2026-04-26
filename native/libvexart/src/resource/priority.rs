// native/libvexart/src/resource/priority.rs
// Priority enum + promotion/demotion logic for ResourceManager.
// Per ARCHITECTURE.md §8.1, REQ-2B-702.

/// Priority tier for GPU-resident resources.
///
/// - `Visible`: resource was used in the current frame (highest priority).
/// - `Recent`: resource was used within the last 5 seconds but not this frame.
/// - `Cold`: resource has not been used for >5 seconds (eligible for eviction).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    /// Resource was used in the current frame. Never evicted.
    Visible = 2,
    /// Resource was used within the last 5 seconds. Evicted after Cold resources.
    Recent = 1,
    /// Resource has not been used for >5 seconds. Evicted first.
    Cold = 0,
}

/// Number of frames after which a Visible resource demotes to Recent.
/// One frame = one call to `ResourceManager::end_frame()`.
const FRAMES_BEFORE_RECENT: u64 = 1;

/// Number of seconds after which a Recent resource demotes to Cold.
pub const SECONDS_BEFORE_COLD: f64 = 5.0;

impl Priority {
    /// Demote one level: Visible → Recent, Recent → Cold, Cold stays Cold.
    pub fn demote(self) -> Self {
        match self {
            Priority::Visible => Priority::Recent,
            Priority::Recent => Priority::Cold,
            Priority::Cold => Priority::Cold,
        }
    }

    /// Promote to Visible (used when a resource is touched in a frame).
    pub fn promote_to_visible(self) -> Self {
        Priority::Visible
    }
}

/// Determines the new priority for a resource at frame end, based on frames and seconds idle.
///
/// - If used this frame (`last_used_frame == current_frame`): stays Visible.
/// - If not used this frame and currently Visible: demotes to Recent, recording idle start.
/// - If Recent and idle for >5 seconds (`idle_seconds >= SECONDS_BEFORE_COLD`): demotes to Cold.
/// - Otherwise: no change.
pub fn compute_end_frame_priority(
    current: Priority,
    last_used_frame: u64,
    current_frame: u64,
    seconds_since_last_use: f64,
) -> Priority {
    match current {
        Priority::Visible => {
            if last_used_frame.saturating_add(FRAMES_BEFORE_RECENT) > current_frame {
                // Used this frame — stay Visible.
                Priority::Visible
            } else {
                // Not used this frame — demote to Recent.
                Priority::Recent
            }
        }
        Priority::Recent => {
            if seconds_since_last_use >= SECONDS_BEFORE_COLD {
                Priority::Cold
            } else {
                Priority::Recent
            }
        }
        Priority::Cold => Priority::Cold,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_demote_visible_to_recent() {
        assert_eq!(Priority::Visible.demote(), Priority::Recent);
    }

    #[test]
    fn test_demote_recent_to_cold() {
        assert_eq!(Priority::Recent.demote(), Priority::Cold);
    }

    #[test]
    fn test_demote_cold_stays_cold() {
        assert_eq!(Priority::Cold.demote(), Priority::Cold);
    }

    #[test]
    fn test_promote_to_visible() {
        assert_eq!(Priority::Cold.promote_to_visible(), Priority::Visible);
        assert_eq!(Priority::Recent.promote_to_visible(), Priority::Visible);
        assert_eq!(Priority::Visible.promote_to_visible(), Priority::Visible);
    }

    #[test]
    fn test_end_frame_visible_used_this_frame_stays_visible() {
        // last_used_frame = current_frame → stays Visible
        let p = compute_end_frame_priority(Priority::Visible, 10, 10, 0.0);
        assert_eq!(p, Priority::Visible);
    }

    #[test]
    fn test_end_frame_visible_not_used_demotes_to_recent() {
        // last_used_frame = 8, current_frame = 10 → demotes to Recent
        let p = compute_end_frame_priority(Priority::Visible, 8, 10, 0.5);
        assert_eq!(p, Priority::Recent);
    }

    #[test]
    fn test_end_frame_recent_short_idle_stays_recent() {
        // Only 2 seconds idle — stays Recent
        let p = compute_end_frame_priority(Priority::Recent, 5, 10, 2.0);
        assert_eq!(p, Priority::Recent);
    }

    #[test]
    fn test_end_frame_recent_long_idle_demotes_to_cold() {
        // 6 seconds idle → demotes to Cold
        let p = compute_end_frame_priority(Priority::Recent, 5, 10, 6.0);
        assert_eq!(p, Priority::Cold);
    }

    #[test]
    fn test_end_frame_cold_stays_cold() {
        let p = compute_end_frame_priority(Priority::Cold, 0, 100, 999.0);
        assert_eq!(p, Priority::Cold);
    }

    #[test]
    fn test_priority_ordering() {
        // Visible > Recent > Cold (higher priority = larger value)
        assert!(Priority::Visible > Priority::Recent);
        assert!(Priority::Recent > Priority::Cold);
    }
}
