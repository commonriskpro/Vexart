// native/libvexart/src/kitty/shm_posix.rs
// POSIX shared memory primitives, safe syscall wrappers, and handle registry.

use std::collections::HashMap;
use std::ffi::{c_void, CStr, CString};
use std::num::NonZeroUsize;
use std::os::fd::OwnedFd;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use nix::fcntl::OFlag;
use nix::sys::mman::{mmap, munmap, shm_open, shm_unlink, MapFlags, ProtFlags};
use nix::sys::stat::Mode;
use nix::unistd::ftruncate;

use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, OK};

// ─── POSIX syscall wrappers ────────────────────────────────────────────────

pub fn posix_shm_open(
    name: &CStr,
    flags: OFlag,
    mode: Mode,
) -> Result<OwnedFd, nix::errno::Errno> {
    shm_open(name, flags, mode)
}

pub fn posix_shm_unlink(name: &CStr) -> Result<(), nix::errno::Errno> {
    shm_unlink(name)
}

pub fn posix_shm_probe(name: &CStr) -> Result<bool, nix::errno::Errno> {
    match shm_open(name, OFlag::O_RDONLY, Mode::empty()) {
        Ok(_) => Ok(true),
        Err(nix::errno::Errno::ENOENT) => Ok(false),
        Err(err) => Err(err),
    }
}

pub fn posix_ftruncate(fd: &OwnedFd, length: usize) -> Result<(), nix::errno::Errno> {
    ftruncate(fd, length as nix::libc::off_t)
}

pub unsafe fn posix_mmap_shared(
    size: NonZeroUsize,
    fd: &OwnedFd,
) -> Result<NonNull<c_void>, nix::errno::Errno> {
    mmap(
        None,
        size,
        ProtFlags::PROT_READ | ProtFlags::PROT_WRITE,
        MapFlags::MAP_SHARED,
        fd,
        0,
    )
}

pub unsafe fn posix_mmap_fixed(
    existing: NonNull<u8>,
    size: NonZeroUsize,
    fd: &OwnedFd,
) -> Result<NonNull<c_void>, nix::errno::Errno> {
    mmap(
        NonZeroUsize::new(existing.as_ptr() as usize),
        size,
        ProtFlags::PROT_READ | ProtFlags::PROT_WRITE,
        MapFlags::MAP_SHARED | MapFlags::MAP_FIXED,
        fd,
        0,
    )
}

pub unsafe fn posix_munmap(addr: NonNull<c_void>, size: usize) -> Result<(), nix::errno::Errno> {
    munmap(addr, size)
}

// ─── Handle registry ──────────────────────────────────────────────────────

/// Owned handle for a POSIX SHM segment.
/// Dropping `fd` closes the file descriptor (RAII via OwnedFd).
#[allow(dead_code)]
pub struct KittyShmHandle {
    pub fd: OwnedFd,
    pub name: CString,
}

pub static NEXT_KITTY_HANDLE: AtomicU64 = AtomicU64::new(1);
pub static NEXT_KITTY_SHM_NAME: LazyLock<AtomicU64> = LazyLock::new(|| {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos() as u64);
    AtomicU64::new(seed)
});
pub static KITTY_SHM_HANDLES: LazyLock<Mutex<HashMap<u64, KittyShmHandle>>> = LazyLock::new(|| {
    super::ensure_emergency_cleanup_registered();
    Mutex::new(HashMap::new())
});

/// Unlink and release all active SHM handles in `KITTY_SHM_HANDLES`.
pub fn cleanup_handle_registry() {
    let mut handles = match KITTY_SHM_HANDLES.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    for (_, handle) in handles.drain() {
        let _ = shm_unlink(handle.name.as_c_str());
        // handle.fd is automatically closed when dropped
    }
}

/// Generate a unique monotonic POSIX SHM name for a frame or layer segment.
/// Uses the pattern `/vx-{pid:x}-{counter:x}` which fits within the 31-byte
/// POSIX and Kitty limits and eliminates collision races between frames.
pub fn generate_shm_name() -> String {
    let counter = NEXT_KITTY_SHM_NAME.fetch_add(1, Ordering::Relaxed);
    format!("/vx-{pid:x}-{counter:x}", pid = std::process::id())
}

/// Best-effort cleanup on prepare error paths.
pub unsafe fn cleanup_on_error(
    name: &CString,
    _fd: OwnedFd, // dropped here → auto-closes
    mapped: Option<NonNull<c_void>>,
    size: usize,
) {
    if let Some(addr) = mapped {
        let _ = unsafe { munmap(addr, size) };
    }
    let _ = shm_unlink(name.as_c_str());
}

/// POSIX SHM prepare: shm_open → ftruncate → mmap → memcpy → munmap → store handle.
pub unsafe fn shm_prepare(
    name_ptr: *const u8,
    name_len: u32,
    data_ptr: *const u8,
    data_len: u32,
    mode: u32,
    out_handle: *mut u64,
) -> i32 {
    super::ensure_emergency_cleanup_registered();

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

    // 8. Unmap
    if let Err(e) = unsafe { munmap(mapped, data_len as usize) } {
        set_last_error(format!("munmap failed: {e}"));
        unsafe { cleanup_on_error(&name, fd, None, data_len as usize) };
        return ERR_KITTY_TRANSPORT;
    }

    // 9. Register handle in the global registry.
    let handle_id = NEXT_KITTY_HANDLE.fetch_add(1, Ordering::Relaxed);
    KITTY_SHM_HANDLES
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(handle_id, KittyShmHandle { fd, name });

    // 10. Return handle to caller.
    unsafe { *out_handle = handle_id };
    OK
}

/// POSIX SHM release: look up handle → drop OwnedFd (auto-close) → optional shm_unlink.
pub fn shm_release(handle: u64, unlink_flag: u32) -> i32 {
    if handle == 0 {
        return OK;
    }

    let entry = match KITTY_SHM_HANDLES
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&handle)
    {
        Some(e) => e,
        None => return OK,
    };

    if unlink_flag != 0 {
        if let Err(e) = shm_unlink(entry.name.as_c_str()) {
            if e != nix::errno::Errno::ENOENT {
                set_last_error(format!("shm_unlink failed: {e}"));
                return ERR_KITTY_TRANSPORT;
            }
        }
    }

    OK
}

/// Prepare a native RGBA payload in a private, short-lived POSIX SHM object.
pub fn shm_prepare_native(data: &[u8]) -> Result<(u64, CString), i32> {
    if data.is_empty() {
        set_last_error("native SHM payload must be non-empty");
        return Err(ERR_INVALID_ARG);
    }
    if data.len() > u32::MAX as usize {
        set_last_error("native SHM payload exceeds the u32 FFI length bound");
        return Err(ERR_INVALID_ARG);
    }

    let name_str = generate_shm_name();
    let name = CString::new(name_str).map_err(|_| {
        set_last_error("native SHM name contains NUL");
        ERR_INVALID_ARG
    })?;
    if name.as_bytes().len() > 31 {
        set_last_error("native SHM name exceeds the 31-byte Kitty bound");
        return Err(ERR_INVALID_ARG)
    }

    let mut handle = 0;
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
