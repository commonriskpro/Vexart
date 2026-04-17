// native/libvexart/src/text/mod.rs
// DEC-011 text stubs — Phase 2 no-op text rendering.
// First call to dispatch emits exactly one stderr warning.
// Per design §5.5 and REQ-NB-005.

use crate::ffi::panic::{ERR_INVALID_ARG, OK};
use crate::types::FrameStats;
use std::sync::atomic::{AtomicBool, Ordering};

/// AtomicBool guard: true after first dispatch call has emitted the warning.
static TEXT_WARNING_EMITTED: AtomicBool = AtomicBool::new(false);

/// Phase 2 stub: success no-op; no atlas loaded.
///
/// # Safety
/// Pointer args must be valid for their respective lengths.
pub unsafe fn load_atlas(_ctx: u64, _atlas_ptr: *const u8, _atlas_len: u32, _font_id: u32) -> i32 {
    OK
}

/// Phase 2 stub: success no-op. First call emits exactly one DEC-011 stderr warning.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
pub unsafe fn dispatch(
    _ctx: u64,
    _glyphs_ptr: *const u8,
    _glyphs_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    // First call emits the DEC-011 warning; subsequent calls are silent.
    if TEXT_WARNING_EMITTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        eprintln!(
            "[vexart] text rendering disabled during Phase 2 (DEC-011) — MSDF lands in Phase 2b"
        );
    }
    if !stats_out.is_null() {
        *stats_out = FrameStats::default();
    }
    OK
}

/// Phase 2 stub: writes 0.0 to both out_w and out_h. Returns ERR_INVALID_ARG if either pointer is null.
///
/// # Safety
/// out_w and out_h must be valid mutable f32 pointers when non-null.
pub unsafe fn measure(
    _ctx: u64,
    _text_ptr: *const u8,
    _text_len: u32,
    _font_id: u32,
    _font_size: f32,
    out_w: *mut f32,
    out_h: *mut f32,
) -> i32 {
    if out_w.is_null() || out_h.is_null() {
        return ERR_INVALID_ARG;
    }
    *out_w = 0.0;
    *out_h = 0.0;
    OK
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn reset_warning_flag() {
        TEXT_WARNING_EMITTED.store(false, Ordering::SeqCst);
    }

    #[test]
    fn test_dispatch_returns_ok() {
        reset_warning_flag();
        let code = unsafe { dispatch(0, std::ptr::null(), 0, std::ptr::null_mut()) };
        assert_eq!(code, OK);
        // reset for other tests
        reset_warning_flag();
    }

    #[test]
    fn test_measure_writes_zeros() {
        let mut w = 99.0f32;
        let mut h = 99.0f32;
        let code = unsafe { measure(0, std::ptr::null(), 0, 0, 12.0, &mut w, &mut h) };
        assert_eq!(code, OK);
        assert_eq!(w, 0.0);
        assert_eq!(h, 0.0);
    }

    #[test]
    fn test_measure_null_out_w_returns_err() {
        let mut h = 0.0f32;
        let code = unsafe {
            measure(
                0,
                std::ptr::null(),
                0,
                0,
                12.0,
                std::ptr::null_mut(),
                &mut h,
            )
        };
        assert_eq!(code, ERR_INVALID_ARG);
    }

    #[test]
    fn test_measure_null_out_h_returns_err() {
        let mut w = 0.0f32;
        let code = unsafe {
            measure(
                0,
                std::ptr::null(),
                0,
                0,
                12.0,
                &mut w,
                std::ptr::null_mut(),
            )
        };
        assert_eq!(code, ERR_INVALID_ARG);
    }

    #[test]
    fn test_load_atlas_returns_ok() {
        let code = unsafe { load_atlas(0, std::ptr::null(), 0, 0) };
        assert_eq!(code, OK);
    }
}
