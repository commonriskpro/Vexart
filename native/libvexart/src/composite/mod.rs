// native/libvexart/src/composite/mod.rs
// Composite module — merge + readback stubs. Real GPU impl lands in Slice 5.

pub mod readback;
pub mod target;

use crate::ffi::panic::OK;
use crate::types::FrameStats;

/// Phase 2 stub: merge layered targets to final composite.
pub fn composite_merge(
    _ctx: u64,
    _composite: &[u8],
    out_target: *mut u64,
    stats_out: *mut FrameStats,
) -> i32 {
    if !out_target.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *out_target = 0;
        }
    }
    if !stats_out.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *stats_out = FrameStats::default();
        }
    }
    OK
}

/// Phase 2 stub: full-target GPU→CPU readback.
pub fn readback_rgba(
    _ctx: u64,
    _target: u64,
    _dst: *mut u8,
    _dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    if !stats_out.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *stats_out = FrameStats::default();
        }
    }
    OK
}

/// Phase 2 stub: region GPU→CPU readback.
pub fn readback_region_rgba(
    _ctx: u64,
    _target: u64,
    _rect: &[u8],
    _dst: *mut u8,
    _dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    if !stats_out.is_null() {
        // SAFETY: caller guarantees valid pointer.
        unsafe {
            *stats_out = FrameStats::default();
        }
    }
    OK
}
