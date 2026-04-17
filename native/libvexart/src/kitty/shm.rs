// native/libvexart/src/kitty/shm.rs
// POSIX SHM transport stubs for Phase 2 Slice 2.
// Real nix-based implementation (shm_open + ftruncate + mmap + memcpy + munmap) lands in Slice 7.
// Per design §5.6, REQ-NB-006.

#[allow(unused_imports)]
use nix::sys::mman;

use crate::ffi::panic::OK;

/// Phase 2 Slice 2 stub: shm_open + ftruncate + mmap + memcpy + munmap.
/// Real implementation lands in Slice 7.
///
/// # Safety
/// All pointer args must be valid for their respective lengths.
pub unsafe fn shm_prepare(
    _name_ptr: *const u8,
    _name_len: u32,
    _data_ptr: *const u8,
    _data_len: u32,
    _mode: u32,
    out_handle: *mut u64,
) -> i32 {
    if !out_handle.is_null() {
        *out_handle = 0;
    }
    OK
}

/// Phase 2 Slice 2 stub: close(fd) + optional shm_unlink(name).
/// Real implementation lands in Slice 7.
pub fn shm_release(_handle: u64, _unlink_flag: u32) -> i32 {
    OK
}
