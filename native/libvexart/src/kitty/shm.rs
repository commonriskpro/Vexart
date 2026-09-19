// native/libvexart/src/kitty/shm.rs
// POSIX SHM transport facade — coordinates POSIX handles, ring buffer, and emergency cleanup.

#[path = "shm_posix.rs"]
pub mod shm_posix;
#[path = "shm_ring.rs"]
pub mod shm_ring;

pub use shm_posix::{
    generate_shm_name, shm_is_consumed, shm_prepare, shm_prepare_native, shm_release,
    KittyShmHandle,
};
pub use shm_ring::{
    acquire_ring_slot, shm_prepare_ring, shm_ring_fail_closed, shm_ring_is_drained,
    shm_ring_mark_in_flight, ShmRingBuffer, ShmRingSlot, SHM_RING_SLOTS,
};

pub use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, ERR_SHM_RING_FULL, OK};

// Re-exports for unit tests and internal callers
#[doc(hidden)]
pub use nix::fcntl::OFlag;
#[doc(hidden)]
pub use nix::sys::mman::{mmap, munmap, shm_open, shm_unlink, MapFlags, ProtFlags};
#[doc(hidden)]
pub use nix::sys::stat::Mode;
#[doc(hidden)]
pub use std::ffi::CString;
#[doc(hidden)]
pub use std::num::NonZeroUsize;
#[doc(hidden)]
pub use std::sync::Mutex;

static EMERGENCY_CLEANUP_INIT: std::sync::Once = std::sync::Once::new();

extern "C" fn atexit_shm_cleanup() {
    cleanup_all_shm_handles();
}

/// Ensures the emergency C atexit handler and Rust panic hook are registered.
/// Thread-safe and executes exactly once per process.
pub fn ensure_emergency_cleanup_registered() {
    EMERGENCY_CLEANUP_INIT.call_once(|| {
        unsafe {
            nix::libc::atexit(atexit_shm_cleanup);
        }

        let prev_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            cleanup_all_shm_handles();
            prev_hook(info);
        }));
    });
}

/// Unlink and release all active SHM handles remaining in `KITTY_SHM_HANDLES`
/// and all active slots in `SHM_RING_BUFFER`.
pub fn cleanup_all_shm_handles() {
    shm_posix::cleanup_handle_registry();
    shm_ring::cleanup_global_ring();
}

/// Clean up all SHM allocations (both ring buffer slots and individual handles).
pub fn cleanup_shm_on_shutdown() {
    cleanup_all_shm_handles();
}

#[cfg(test)]
#[path = "shm_tests.rs"]
mod tests;
