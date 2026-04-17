// native/libvexart/src/kitty/shm.rs
// POSIX SHM transport — real nix-based implementation.
// Ported from native/kitty-shm-helper/kitty_shm_helper.c (139 LOC).
// The C helper will be deleted in Slice 11J after Slice 9 wires the TS consumer.
// Per design §5.6, REQ-NB-006, proposal Kitty scope boundary.

use std::collections::HashMap;
use std::ffi::c_void;
use std::ffi::CString;
use std::num::NonZeroUsize;
use std::os::fd::OwnedFd;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

use nix::fcntl::OFlag;
use nix::sys::mman::{mmap, msync, munmap, shm_open, shm_unlink, MapFlags, MsFlags, ProtFlags};
use nix::sys::stat::Mode;
use nix::unistd::ftruncate;

use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};

// ─── Handle registry ──────────────────────────────────────────────────────

/// Owned handle for a POSIX SHM segment.
/// Dropping `fd` closes the file descriptor (RAII via OwnedFd).
/// `fd` is intentionally stored for RAII close — never read directly.
#[allow(dead_code)]
struct KittyShmHandle {
    fd: OwnedFd,
    name: CString,
}

static NEXT_KITTY_HANDLE: AtomicU64 = AtomicU64::new(1);
static KITTY_SHM_HANDLES: LazyLock<Mutex<HashMap<u64, KittyShmHandle>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// ─── Cleanup helper ───────────────────────────────────────────────────────

/// Best-effort cleanup on prepare error paths.
/// `mapped` is unmapped if Some; `fd` is dropped (closed) unconditionally (RAII).
/// `name` is unlinked unconditionally.
unsafe fn cleanup_on_error(
    name: &CString,
    _fd: OwnedFd, // dropped here → auto-closes
    mapped: Option<NonNull<c_void>>,
    size: usize,
) {
    if let Some(addr) = mapped {
        let _ = unsafe { munmap(addr, size) };
    }
    // fd is dropped by the caller passing ownership here → close() is automatic.
    let _ = shm_unlink(name.as_c_str());
}

// ─── shm_prepare ─────────────────────────────────────────────────────────

/// POSIX SHM prepare: shm_open → ftruncate → mmap → memcpy → msync → munmap → store handle.
///
/// Algorithm ported verbatim from `tge_kitty_shm_prepare` in kitty_shm_helper.c (L54-119).
/// Differences from the C version:
///   - OwnedFd instead of raw `int fd` (RAII close, no manual close() needed).
///   - CString + HashMap registry instead of raw pointer cast (safe handle storage).
///   - NUL-byte-in-name rejected explicitly (CString construction would otherwise panic).
///
/// # Safety
/// `name_ptr` must be valid for `name_len` bytes; `data_ptr` must be valid for `data_len` bytes;
/// `out_handle` must be a valid mutable pointer.
pub unsafe fn shm_prepare(
    name_ptr: *const u8,
    name_len: u32,
    data_ptr: *const u8,
    data_len: u32,
    mode: u32,
    out_handle: *mut u64,
) -> i32 {
    // 1. Validate inputs.
    if name_ptr.is_null()
        || name_len == 0
        || data_ptr.is_null()
        || data_len == 0
        || out_handle.is_null()
    {
        set_last_error("invalid arguments: null or zero-length pointer");
        return ERR_INVALID_ARG;
    }

    // 2. Build CString from name bytes; reject embedded NUL bytes.
    let name_bytes = unsafe { std::slice::from_raw_parts(name_ptr, name_len as usize) };
    let name: CString = match CString::new(name_bytes) {
        Ok(s) => s,
        Err(_) => {
            set_last_error("invalid SHM name (contains NUL)");
            return ERR_INVALID_ARG;
        }
    };

    // 3. Pre-cleanup: unlink any leftover segment with the same name (ignore errors).
    let _ = shm_unlink(name.as_c_str());

    // 4. Open: O_CREAT | O_EXCL | O_RDWR.
    let mode_bits = Mode::from_bits_truncate(mode as nix::libc::mode_t);
    let fd: OwnedFd = match shm_open(
        name.as_c_str(),
        OFlag::O_CREAT | OFlag::O_EXCL | OFlag::O_RDWR,
        mode_bits,
    ) {
        Ok(fd) => fd,
        Err(e) => {
            set_last_error(format!("shm_open failed: {e}"));
            return ERR_KITTY_TRANSPORT;
        }
    };

    // 5. Resize the segment.
    if let Err(e) = ftruncate(&fd, data_len as nix::libc::off_t) {
        set_last_error(format!("ftruncate failed: {e}"));
        // fd dropped → auto-close; unlink manually.
        let _ = shm_unlink(name.as_c_str());
        return ERR_KITTY_TRANSPORT;
    }

    // 6. Map the segment into our address space.
    let size = match NonZeroUsize::new(data_len as usize) {
        Some(s) => s,
        None => {
            set_last_error("data_len is zero after validation (internal error)");
            let _ = shm_unlink(name.as_c_str());
            return ERR_KITTY_TRANSPORT;
        }
    };

    let mapped: NonNull<c_void> = match unsafe {
        mmap(
            None,
            size,
            ProtFlags::PROT_READ | ProtFlags::PROT_WRITE,
            MapFlags::MAP_SHARED,
            &fd,
            0,
        )
    } {
        Ok(ptr) => ptr,
        Err(e) => {
            set_last_error(format!("mmap failed: {e}"));
            unsafe { cleanup_on_error(&name, fd, None, data_len as usize) };
            return ERR_KITTY_TRANSPORT;
        }
    };

    // 7. Copy caller data into the segment.
    unsafe {
        std::ptr::copy_nonoverlapping(data_ptr, mapped.as_ptr() as *mut u8, data_len as usize);
    }

    // 8. Sync to backing store.
    if let Err(e) = unsafe { msync(mapped, data_len as usize, MsFlags::MS_SYNC) } {
        set_last_error(format!("msync failed: {e}"));
        unsafe { cleanup_on_error(&name, fd, Some(mapped), data_len as usize) };
        return ERR_KITTY_TRANSPORT;
    }

    // 9. Unmap — we no longer need the mapping in our address space;
    //    the fd keeps the segment alive for the Kitty protocol consumer.
    if let Err(e) = unsafe { munmap(mapped, data_len as usize) } {
        set_last_error(format!("munmap failed: {e}"));
        unsafe { cleanup_on_error(&name, fd, None, data_len as usize) };
        return ERR_KITTY_TRANSPORT;
    }

    // 10. Register handle in the global registry.
    let handle_id = NEXT_KITTY_HANDLE.fetch_add(1, Ordering::Relaxed);
    KITTY_SHM_HANDLES
        .lock()
        .unwrap()
        .insert(handle_id, KittyShmHandle { fd, name });

    // 11. Return the handle to the caller.
    unsafe { *out_handle = handle_id };
    OK
}

// ─── shm_release ─────────────────────────────────────────────────────────

/// POSIX SHM release: look up handle → drop OwnedFd (auto-close) → optional shm_unlink.
///
/// Algorithm ported from `tge_kitty_shm_release` in kitty_shm_helper.c (L121-139).
/// Idempotent: unknown or already-released handles return OK silently.
pub fn shm_release(handle: u64, unlink_flag: u32) -> i32 {
    // Null handle: no-op.
    if handle == 0 {
        return OK;
    }

    // Remove from registry; if unknown, soft-fail.
    let entry = match KITTY_SHM_HANDLES.lock().unwrap().remove(&handle) {
        Some(e) => e,
        None => return OK,
    };

    // `entry.fd` is dropped here → auto-close(). No manual close() needed.

    // Optional unlink.
    if unlink_flag != 0 {
        if let Err(e) = shm_unlink(entry.name.as_c_str()) {
            // ENOENT is acceptable (already gone); any other error is reported.
            if e != nix::errno::Errno::ENOENT {
                set_last_error(format!("shm_unlink failed: {e}"));
                return ERR_KITTY_TRANSPORT;
            }
        }
    }

    OK
}

// ─── Unit tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique name per test invocation using process ID + monotonic counter.
    fn unique_shm_name() -> String {
        use std::sync::atomic::{AtomicU32, Ordering as O};
        static CTR: AtomicU32 = AtomicU32::new(1);
        let n = CTR.fetch_add(1, O::Relaxed);
        format!("/vexart_test_{}_{}", std::process::id(), n)
    }

    /// Cleanup guard: ensures `shm_unlink` is called on drop (even on panic).
    struct ShmCleanup(CString);
    impl Drop for ShmCleanup {
        fn drop(&mut self) {
            let _ = shm_unlink(self.0.as_c_str());
        }
    }

    #[test]
    fn test_shm_prepare_invalid_args_returns_err() {
        let data = [0u8; 4];
        let name = b"/vexart_test_invalid\0";
        let mut handle: u64 = 0;

        // null name_ptr
        let r = unsafe { shm_prepare(std::ptr::null(), 10, data.as_ptr(), 4, 0o600, &mut handle) };
        assert_eq!(
            r, ERR_INVALID_ARG,
            "null name_ptr should return ERR_INVALID_ARG"
        );

        // null data_ptr
        let r = unsafe { shm_prepare(name.as_ptr(), 10, std::ptr::null(), 4, 0o600, &mut handle) };
        assert_eq!(
            r, ERR_INVALID_ARG,
            "null data_ptr should return ERR_INVALID_ARG"
        );

        // zero name_len
        let r = unsafe { shm_prepare(name.as_ptr(), 0, data.as_ptr(), 4, 0o600, &mut handle) };
        assert_eq!(
            r, ERR_INVALID_ARG,
            "zero name_len should return ERR_INVALID_ARG"
        );

        // null out_handle
        let r = unsafe {
            shm_prepare(
                name.as_ptr(),
                10,
                data.as_ptr(),
                4,
                0o600,
                std::ptr::null_mut(),
            )
        };
        assert_eq!(
            r, ERR_INVALID_ARG,
            "null out_handle should return ERR_INVALID_ARG"
        );
    }

    #[test]
    fn test_shm_prepare_release_roundtrip() {
        let name_str = unique_shm_name();
        let _guard = ShmCleanup(CString::new(name_str.clone()).unwrap());

        let data = vec![0xabu8; 4096];
        let mut handle: u64 = 0;

        let r = unsafe {
            shm_prepare(
                name_str.as_ptr(),
                name_str.len() as u32,
                data.as_ptr(),
                data.len() as u32,
                0o600,
                &mut handle,
            )
        };
        assert_eq!(r, OK, "shm_prepare should return OK");
        assert_ne!(handle, 0, "handle should be non-zero");

        // Release with unlink.
        let r2 = shm_release(handle, 1);
        assert_eq!(r2, OK, "shm_release with unlink should return OK");

        // Re-prepare with same name — should succeed (segment was cleaned up).
        let mut handle2: u64 = 0;
        let r3 = unsafe {
            shm_prepare(
                name_str.as_ptr(),
                name_str.len() as u32,
                data.as_ptr(),
                data.len() as u32,
                0o600,
                &mut handle2,
            )
        };
        assert_eq!(r3, OK, "second shm_prepare after release should return OK");
        assert_ne!(handle2, 0, "second handle should be non-zero");

        // Cleanup second handle.
        let r4 = shm_release(handle2, 1);
        assert_eq!(r4, OK, "second shm_release should return OK");
    }

    #[test]
    fn test_shm_release_unknown_handle_returns_ok() {
        let r = shm_release(999_999_999, 0);
        assert_eq!(
            r, OK,
            "unknown handle should return OK (idempotent soft-fail)"
        );
    }

    #[test]
    fn test_shm_prepare_invalid_name_returns_err() {
        // Name with embedded NUL byte.
        let name_with_nul = b"/vexart\x00test";
        let data = [0u8; 4];
        let mut handle: u64 = 0;

        let r = unsafe {
            shm_prepare(
                name_with_nul.as_ptr(),
                name_with_nul.len() as u32,
                data.as_ptr(),
                4,
                0o600,
                &mut handle,
            )
        };
        assert_eq!(
            r, ERR_INVALID_ARG,
            "name with embedded NUL should return ERR_INVALID_ARG"
        );
    }
}
