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
use std::time::{SystemTime, UNIX_EPOCH};

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
static NEXT_KITTY_SHM_NAME: LazyLock<AtomicU64> = LazyLock::new(|| {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos() as u64);
    AtomicU64::new(seed)
});
static KITTY_SHM_HANDLES: LazyLock<Mutex<HashMap<u64, KittyShmHandle>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[cfg(test)]
pub(crate) static TEST_SHM_MUTEX: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

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
    register_shm_atexit();

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
        .unwrap_or_else(|e| e.into_inner())
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
    let entry = match KITTY_SHM_HANDLES
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&handle)
    {
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

// ─── Cleanup all / atexit ──────────────────────────────────────────────────

extern "C" fn shm_atexit_cleanup() {
    shm_cleanup_all();
}

static REGISTER_ATEXIT: std::sync::Once = std::sync::Once::new();

pub fn register_shm_atexit() {
    REGISTER_ATEXIT.call_once(|| {
        unsafe {
            nix::libc::atexit(shm_atexit_cleanup);
        }
    });
}

/// Unlink all active POSIX SHM segments and close their descriptors.
/// Returns the number of segments cleaned up.
pub fn shm_cleanup_all() -> usize {
    let mut registry = KITTY_SHM_HANDLES
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let mut count = 0;
    for (_handle, entry) in registry.drain() {
        let _ = shm_unlink(entry.name.as_c_str());
        count += 1;
    }
    count
}

/// Prepare a native RGBA payload in a private, short-lived POSIX SHM object.
///
/// The returned handle keeps the descriptor alive until the caller observes
/// consumption and releases it. The name is returned because Kitty's SHM
/// protocol addresses the object by name, while the handle is intentionally
/// opaque to FFI callers.
pub fn shm_prepare_native(data: &[u8]) -> Result<(u64, CString), i32> {
    register_shm_atexit();

    if data.is_empty() {
        set_last_error("native SHM payload must be non-empty");
        return Err(ERR_INVALID_ARG);
    }
    if data.len() > u32::MAX as usize {
        set_last_error("native SHM payload exceeds the u32 FFI length bound");
        return Err(ERR_INVALID_ARG);
    }

    // `/vx-<pid>-<counter>` stays below the POSIX SHM name limit even on
    // 64-bit hosts. The monotonic counter prevents concurrent frame calls
    // from reusing an object name.
    let counter = NEXT_KITTY_SHM_NAME.fetch_add(1, Ordering::Relaxed);
    let name = CString::new(format!("/vx-{pid:x}-{counter:x}", pid = std::process::id())).map_err(
        |_| {
            set_last_error("native SHM name contains NUL");
            ERR_INVALID_ARG
        },
    )?;
    if name.as_bytes().len() > 31 {
        set_last_error("native SHM name exceeds the 31-byte Kitty bound");
        return Err(ERR_INVALID_ARG);
    }

    let mut handle = 0;
    // SAFETY: `name` and `data` remain alive and immutable for the duration
    // of the call, and `&mut handle` is valid writable storage.
    let rc = unsafe {
        shm_prepare(
            name.as_ptr().cast(),
            name.as_bytes().len() as u32,
            data.as_ptr(),
            data.len() as u32,
            0o600,
            &mut handle,
        )
    };
    if rc != OK {
        return Err(rc);
    }
    Ok((handle, name))
}

/// Return whether the terminal has unlinked a registered SHM object.
///
/// `0` means the name still exists, `1` means it has been consumed/unlinked,
/// and a negative error code means the handle is unknown or probing failed.
pub fn shm_is_consumed(handle: u64) -> i32 {
    if handle == 0 {
        set_last_error("invalid SHM handle");
        return ERR_INVALID_ARG;
    }
    let name = {
        let registry = KITTY_SHM_HANDLES.lock().unwrap_or_else(|e| e.into_inner());
        let Some(entry) = registry.get(&handle) else {
            set_last_error(format!("unknown SHM handle {handle}"));
            return ERR_INVALID_ARG;
        };
        entry.name.clone()
    };

    match shm_open(name.as_c_str(), OFlag::O_RDONLY, Mode::empty()) {
        Ok(fd) => {
            drop(fd);
            0
        }
        Err(nix::errno::Errno::ENOENT) => 1,
        Err(error) => {
            set_last_error(format!("shm_open probe failed: {error}"));
            ERR_KITTY_TRANSPORT
        }
    }
}

// ─── Unit tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use nix::sys::stat::fstat;
    use std::os::fd::AsRawFd;

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
        let _test_lock = TEST_SHM_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
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

    #[test]
    fn native_prepare_uses_unique_private_payload_and_consumption_probe() {
        let _test_lock = TEST_SHM_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let first = shm_prepare_native(&[1, 2, 3, 4]).unwrap();
        let second = shm_prepare_native(&[5, 6, 7, 8]).unwrap();
        assert_ne!(first.1, second.1);
        assert!(first.1.as_bytes().len() <= 31);
        assert!(second.1.as_bytes().len() <= 31);

        let fd = shm_open(first.1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).unwrap();
        let metadata = fstat(fd.as_raw_fd()).unwrap();
        assert_eq!(metadata.st_mode & 0o777, 0o600);
        let mapped = unsafe {
            mmap(
                None,
                NonZeroUsize::new(4).unwrap(),
                ProtFlags::PROT_READ,
                MapFlags::MAP_SHARED,
                &fd,
                0,
            )
            .unwrap()
        };
        // SAFETY: the mapping is valid for exactly four bytes until munmap.
        let bytes = unsafe { std::slice::from_raw_parts(mapped.as_ptr().cast::<u8>(), 4) };
        assert_eq!(bytes, [1, 2, 3, 4]);
        unsafe { munmap(mapped, 4).unwrap() };
        drop(fd);
        assert_eq!(shm_is_consumed(first.0), 0);

        // A terminal consumes the object by unlinking its name while the
        // producer's descriptor remains registered and open.
        shm_unlink(first.1.as_c_str()).unwrap();
        assert_eq!(shm_is_consumed(first.0), 1);
        assert_eq!(shm_release(first.0, 1), OK);
        assert_eq!(shm_release(second.0, 1), OK);
    }

    #[test]
    fn consumption_probe_rejects_unknown_handles() {
        assert_eq!(shm_is_consumed(0), ERR_INVALID_ARG);
        assert_eq!(shm_is_consumed(u64::MAX), ERR_INVALID_ARG);
    }

    #[test]
    fn test_shm_cleanup_all() {
        let _test_lock = TEST_SHM_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let first = shm_prepare_native(&[10, 20, 30, 40]).unwrap();
        let second = shm_prepare_native(&[50, 60, 70, 80]).unwrap();

        assert_eq!(shm_is_consumed(first.0), 0);
        assert_eq!(shm_is_consumed(second.0), 0);

        let cleaned = shm_cleanup_all();
        assert!(cleaned >= 2);

        // Segments should be unlinked
        assert!(shm_open(first.1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_err());
        assert!(shm_open(second.1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_err());

        // Further cleanup returns 0
        assert_eq!(shm_cleanup_all(), 0);
    }
}
