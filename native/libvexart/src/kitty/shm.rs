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
static KITTY_SHM_HANDLES: LazyLock<Mutex<HashMap<u64, KittyShmHandle>>> = LazyLock::new(|| {
    ensure_emergency_cleanup_registered();
    Mutex::new(HashMap::new())
});

static EMERGENCY_CLEANUP_INIT: std::sync::Once = std::sync::Once::new();

/// Emergency cleanup callback for C `libc::atexit`.
extern "C" fn atexit_shm_cleanup() {
    cleanup_all_shm_handles();
}

/// Ensures the emergency C atexit handler and Rust panic hook are registered.
/// Thread-safe and executes exactly once per process.
pub fn ensure_emergency_cleanup_registered() {
    EMERGENCY_CLEANUP_INIT.call_once(|| {
        // 1. Register C atexit handler so libc exit() / process.exit() cleans up.
        unsafe {
            nix::libc::atexit(atexit_shm_cleanup);
        }

        // 2. Register a panic hook (chaining to previous hook) so Rust panics clean up.
        let prev_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            cleanup_all_shm_handles();
            prev_hook(info);
        }));
    });
}

/// Unlink and release all active SHM handles remaining in `KITTY_SHM_HANDLES`
/// and all active slots in `SHM_RING_BUFFER`.
/// Safe to call at any time (e.g. at exit, panic hook, or manual teardown).
/// Recovers cleanly even if a registry mutex was poisoned by a panicked thread.
pub fn cleanup_all_shm_handles() {
    let mut handles = match KITTY_SHM_HANDLES.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    for (_, handle) in handles.drain() {
        let _ = shm_unlink(handle.name.as_c_str());
        // handle.fd is automatically closed when dropped
    }
    drop(handles);

    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.cleanup_all();
}

// ─── SHM Ring Buffer (Option A: Generaciones Fijas) ─────────────────────────

/// Number of slots in the fixed-pool ring buffer (N = 3).
pub const SHM_RING_SLOTS: usize = 3;

static NEXT_RING_GEN: AtomicU64 = AtomicU64::new(0);

/// A slot in the POSIX SHM ring buffer.
/// Tracks slot identity, generation, segment name, file descriptor, capacity,
/// in-use state, and monotonic handle.
#[derive(Debug)]
pub struct ShmRingSlot {
    pub slot_index: usize,
    pub generation: u64,
    pub name: Option<CString>,
    pub fd: Option<OwnedFd>,
    pub capacity: usize,
    pub in_use: bool,
    pub handle: u64,
}

impl ShmRingSlot {
    pub fn new(slot_index: usize) -> Self {
        Self::with_generation(slot_index, 0)
    }

    pub fn with_generation(slot_index: usize, start_gen: u64) -> Self {
        Self {
            slot_index,
            generation: start_gen,
            name: None,
            fd: None,
            capacity: 0,
            in_use: false,
            handle: 0,
        }
    }
}

/// Fixed-pool Ring Buffer (N = 3 slots) for Kitty SHM segments.
///
/// Prevents file leaks in `/dev/shm`, removes per-frame unbounded file creation,
/// ensures pre-emptive unlinking of old generations when slots cycle, and
/// guarantees symmetric cleanup on shutdown / atexit / panic.
pub struct ShmRingBuffer {
    slots: [ShmRingSlot; SHM_RING_SLOTS],
    current: usize,
}

impl ShmRingBuffer {
    pub const SLOTS: usize = SHM_RING_SLOTS;

    pub fn new() -> Self {
        let base_gen = NEXT_RING_GEN.fetch_add(1000, Ordering::Relaxed);
        Self {
            slots: std::array::from_fn(|i| ShmRingSlot::with_generation(i, base_gen)),
            current: SHM_RING_SLOTS.saturating_sub(1),
        }
    }

    pub fn slots(&self) -> &[ShmRingSlot; SHM_RING_SLOTS] {
        &self.slots
    }

    pub fn current(&self) -> usize {
        self.current
    }

    /// Acquire the next ring slot:
    /// 1. Advances ring slot `current = (current + 1) % N`.
    /// 2. Checks the slot: if it has a previous generation name, unlinks it (`shm_unlink`)
    ///    so stale files from non-unlinking terminals or crashed/aborted frames are guaranteed reclaimed.
    /// 3. Increments generation, formats the name `/vx-{pid:x}-s{slot:x}-g{gen:x}`
    ///    (keeping strictly under 31 bytes for POSIX and Kitty name limits).
    /// 4. Opens/creates the SHM segment with `shm_open`.
    /// 5. Truncates if needed to hold the payload.
    /// 6. Writes the data (mmap/memcpy/msync/munmap).
    /// 7. Records the handle so emergency exit / panic cleanup (`cleanup_all_shm_handles` /
    ///    `cleanup_shm_on_shutdown`) can unlink all slots.
    pub fn acquire(&mut self, data: &[u8]) -> Result<(usize, CString), i32> {
        if data.is_empty() {
            set_last_error("SHM payload must be non-empty");
            return Err(ERR_INVALID_ARG);
        }
        if data.len() > u32::MAX as usize {
            set_last_error("SHM payload exceeds u32 bound");
            return Err(ERR_INVALID_ARG);
        }

        // 1. Advance ring slot: current = (current + 1) % N
        self.current = (self.current + 1) % SHM_RING_SLOTS;
        let slot_idx = self.current;
        let slot = &mut self.slots[slot_idx];

        // 2. Unlink previous generation name in this slot if any.
        if let Some(ref prev_name) = slot.name {
            let _ = shm_unlink(prev_name.as_c_str());
        }
        slot.name = None;
        slot.fd = None; // Dropping OwnedFd closes descriptor
        slot.capacity = 0;
        slot.in_use = false;

        // 3. Increment generation, format name /vx-{pid:x}-s{slot:x}-g{gen:x}
        slot.generation = slot.generation.wrapping_add(1);
        if slot.generation == 0 {
            slot.generation = 1;
        }
        let pid = std::process::id();
        // Mask generation to u32 hex (8 hex chars max) to guarantee <= 25 bytes (< 31 bound).
        let name_str = format!(
            "/vx-{pid:x}-s{:x}-g{:x}",
            slot.slot_index,
            (slot.generation & 0xffff_ffff) as u32
        );
        if name_str.len() > 31 {
            set_last_error("SHM ring buffer name exceeds 31 bytes");
            return Err(ERR_KITTY_TRANSPORT);
        }
        let c_name = match CString::new(name_str) {
            Ok(s) => s,
            Err(_) => {
                set_last_error("SHM ring buffer name contains NUL");
                return Err(ERR_KITTY_TRANSPORT);
            }
        };

        // Pre-unlink just in case a stale segment with the exact same name existed
        let _ = shm_unlink(c_name.as_c_str());

        // 4. Open/create the SHM segment with shm_open
        let mode_bits = Mode::from_bits_truncate(0o600);
        let fd: OwnedFd = match shm_open(
            c_name.as_c_str(),
            OFlag::O_CREAT | OFlag::O_EXCL | OFlag::O_RDWR,
            mode_bits,
        ) {
            Ok(fd) => fd,
            Err(nix::errno::Errno::EEXIST) => {
                let _ = shm_unlink(c_name.as_c_str());
                match shm_open(
                    c_name.as_c_str(),
                    OFlag::O_CREAT | OFlag::O_RDWR,
                    mode_bits,
                ) {
                    Ok(fd) => fd,
                    Err(e) => {
                        set_last_error(format!("shm_open retry failed: {e}"));
                        return Err(ERR_KITTY_TRANSPORT);
                    }
                }
            }
            Err(e) => {
                set_last_error(format!("shm_open failed: {e}"));
                return Err(ERR_KITTY_TRANSPORT);
            }
        };

        // 5. Truncate if needed to hold the payload
        let data_len = data.len();
        if let Err(e) = ftruncate(&fd, data_len as nix::libc::off_t) {
            set_last_error(format!("ftruncate failed: {e}"));
            let _ = shm_unlink(c_name.as_c_str());
            return Err(ERR_KITTY_TRANSPORT);
        }
        slot.capacity = data_len;

        // 6. Write the data (mmap/memcpy/msync/munmap)
        let size = match NonZeroUsize::new(data_len) {
            Some(s) => s,
            None => {
                set_last_error("data_len is zero after validation");
                let _ = shm_unlink(c_name.as_c_str());
                return Err(ERR_KITTY_TRANSPORT);
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
                let _ = shm_unlink(c_name.as_c_str());
                return Err(ERR_KITTY_TRANSPORT);
            }
        };

        unsafe {
            std::ptr::copy_nonoverlapping(data.as_ptr(), mapped.as_ptr() as *mut u8, data_len);
        }

        if let Err(e) = unsafe { msync(mapped, data_len, MsFlags::MS_SYNC) } {
            set_last_error(format!("msync failed: {e}"));
            let _ = unsafe { munmap(mapped, data_len) };
            let _ = shm_unlink(c_name.as_c_str());
            return Err(ERR_KITTY_TRANSPORT);
        }

        if let Err(e) = unsafe { munmap(mapped, data_len) } {
            set_last_error(format!("munmap failed: {e}"));
            let _ = shm_unlink(c_name.as_c_str());
            return Err(ERR_KITTY_TRANSPORT);
        }

        // 7. Record handle and slot state
        let handle_id = NEXT_KITTY_HANDLE.fetch_add(1, Ordering::Relaxed);
        slot.handle = handle_id;
        slot.name = Some(c_name.clone());
        slot.fd = Some(fd);
        slot.in_use = true;

        Ok((slot_idx, c_name))
    }

    /// Mark slot in-flight after successful transport write.
    pub fn mark_in_flight(&mut self, slot_index: usize) {
        if let Some(slot) = self.slots.get_mut(slot_index) {
            slot.in_use = true;
        }
    }

    /// Immediately unlink and reset slot on write failure (fail-closed).
    pub fn fail_closed(&mut self, slot_index: usize) {
        if let Some(slot) = self.slots.get_mut(slot_index) {
            if let Some(ref name) = slot.name.take() {
                let _ = shm_unlink(name.as_c_str());
            }
            slot.fd = None;
            slot.capacity = 0;
            slot.in_use = false;
        }
    }

    /// Unlink and release all active ring buffer slots.
    pub fn cleanup_all(&mut self) {
        for slot in &mut self.slots {
            if let Some(ref name) = slot.name.take() {
                let _ = shm_unlink(name.as_c_str());
            }
            slot.fd = None;
            slot.capacity = 0;
            slot.in_use = false;
        }
    }
}

impl Default for ShmRingBuffer {
    fn default() -> Self {
        Self::new()
    }
}

static SHM_RING_BUFFER: LazyLock<Mutex<ShmRingBuffer>> = LazyLock::new(|| {
    ensure_emergency_cleanup_registered();
    Mutex::new(ShmRingBuffer::new())
});

/// Acquire the next ring slot from the global ring buffer and prepare payload data.
pub fn acquire_ring_slot(data: &[u8]) -> Result<(usize, CString), i32> {
    shm_prepare_ring(data)
}

/// Prepare payload data in the next available slot of the global SHM ring buffer.
pub fn shm_prepare_ring(data: &[u8]) -> Result<(usize, CString), i32> {
    ensure_emergency_cleanup_registered();
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.acquire(data)
}

/// Mark global ring buffer slot as in-flight after successful transport write.
pub fn shm_ring_mark_in_flight(slot_index: usize) {
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.mark_in_flight(slot_index);
}

/// Immediately unlink global ring buffer slot on transport write failure (fail-closed).
pub fn shm_ring_fail_closed(slot_index: usize) {
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.fail_closed(slot_index);
}

/// Clean up all SHM allocations (both ring buffer slots and individual handles).
pub fn cleanup_shm_on_shutdown() {
    cleanup_all_shm_handles();
}

/// Generate a unique monotonic POSIX SHM name for a frame or layer segment.
/// Uses the pattern `/vx-{pid:x}-{counter:x}` which fits within the 31-byte
/// POSIX and Kitty limits and eliminates collision races between frames.
pub fn generate_shm_name() -> String {
    let counter = NEXT_KITTY_SHM_NAME.fetch_add(1, Ordering::Relaxed);
    format!("/vx-{pid:x}-{counter:x}", pid = std::process::id())
}

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
    ensure_emergency_cleanup_registered();

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

/// Prepare a native RGBA payload in a private, short-lived POSIX SHM object.
///
/// The returned handle keeps the descriptor alive until the caller observes
/// consumption and releases it. The name is returned because Kitty's SHM
/// protocol addresses the object by name, while the handle is intentionally
/// opaque to FFI callers.
pub fn shm_prepare_native(data: &[u8]) -> Result<(u64, CString), i32> {
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
    let name_str = generate_shm_name();
    let name = CString::new(name_str).map_err(|_| {
        set_last_error("native SHM name contains NUL");
        ERR_INVALID_ARG
    })?;
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

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

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

    #[test]
    fn native_prepare_uses_unique_private_payload_and_consumption_probe() {
        let _lock = TEST_MUTEX.lock().unwrap();
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
    fn test_generate_shm_name_monotonic_and_bounded() {
        let name1 = generate_shm_name();
        let name2 = generate_shm_name();
        assert_ne!(name1, name2);
        assert!(name1.starts_with("/vx-"));
        assert!(name2.starts_with("/vx-"));
        assert!(name1.len() <= 31);
        assert!(name2.len() <= 31);
    }

    #[test]
    fn test_emergency_cleanup_unlinks_all_handles() {
        let _lock = TEST_MUTEX.lock().unwrap();
        let name_str = unique_shm_name();
        let data = vec![0x5au8; 64];
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
        assert_eq!(r, OK);
        assert_ne!(handle, 0);

        let c_name = CString::new(name_str).unwrap();
        let probe = shm_open(c_name.as_c_str(), OFlag::O_RDONLY, Mode::empty());
        assert!(probe.is_ok());
        drop(probe);

        cleanup_all_shm_handles();

        let probe_after = shm_open(c_name.as_c_str(), OFlag::O_RDONLY, Mode::empty());
        assert!(matches!(probe_after, Err(nix::errno::Errno::ENOENT)));
    }

    #[test]
    fn test_ring_buffer_advances_and_recycles_slots() {
        let mut ring = ShmRingBuffer::new();
        let payload_a = [1u8, 2, 3, 4];
        let payload_b = [5u8, 6, 7, 8];
        let payload_c = [9u8, 10, 11, 12];
        let payload_d = [13u8, 14, 15, 16];

        // Slot 0
        let (s0, name0) = ring.acquire(&payload_a).expect("acquire slot 0");
        assert_eq!(s0, 0);
        let g0 = ring.slots()[0].generation;
        assert!(name0.to_str().unwrap().contains(&format!("-s0-g{g0:x}")));
        assert!(shm_open(name0.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        // Slot 1
        let (s1, name1) = ring.acquire(&payload_b).expect("acquire slot 1");
        assert_eq!(s1, 1);
        let g1 = ring.slots()[1].generation;
        assert!(name1.to_str().unwrap().contains(&format!("-s1-g{g1:x}")));
        assert!(shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        // Slot 2
        let (s2, name2) = ring.acquire(&payload_c).expect("acquire slot 2");
        assert_eq!(s2, 2);
        let g2 = ring.slots()[2].generation;
        assert!(name2.to_str().unwrap().contains(&format!("-s2-g{g2:x}")));
        assert!(shm_open(name2.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        // All 3 exist simultaneously
        assert!(shm_open(name0.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
        assert!(shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
        assert!(shm_open(name2.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        // Slot 3 (wraps to slot 0) - recycling slot 0 MUST unlink name0!
        let (s3, name3) = ring.acquire(&payload_d).expect("acquire slot 0 gen 2");
        assert_eq!(s3, 0);
        let g3 = ring.slots()[0].generation;
        assert_eq!(g3, g0 + 1);
        assert!(name3.to_str().unwrap().contains(&format!("-s0-g{g3:x}")));
        assert_ne!(name0, name3);

        // Name 0 must now be unlinked (ENOENT)!
        let probe_old = shm_open(name0.as_c_str(), OFlag::O_RDONLY, Mode::empty());
        assert!(matches!(probe_old, Err(nix::errno::Errno::ENOENT)));

        // Name 3 (new generation of slot 0) must exist!
        assert!(shm_open(name3.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        // Slots 1 and 2 still exist
        assert!(shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
        assert!(shm_open(name2.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        // Cleanup all
        ring.cleanup_all();
        assert!(matches!(shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()), Err(nix::errno::Errno::ENOENT)));
        assert!(matches!(shm_open(name2.as_c_str(), OFlag::O_RDONLY, Mode::empty()), Err(nix::errno::Errno::ENOENT)));
        assert!(matches!(shm_open(name3.as_c_str(), OFlag::O_RDONLY, Mode::empty()), Err(nix::errno::Errno::ENOENT)));
    }

    #[test]
    fn test_ring_buffer_bounds_total_files_to_n() {
        let mut ring = ShmRingBuffer::new();
        let mut all_names = Vec::new();

        // Run through 15 acquisitions (5 cycles of N=3)
        for i in 0..15 {
            let data = vec![i as u8; 64];
            let (slot, name) = ring.acquire(&data).expect("acquire");
            assert_eq!(slot, i % SHM_RING_SLOTS);
            all_names.push(name);

            // Count how many files currently exist in SHM across all generated names
            let mut existing_count = 0;
            for n in &all_names {
                if let Ok(fd) = shm_open(n.as_c_str(), OFlag::O_RDONLY, Mode::empty()) {
                    existing_count += 1;
                    drop(fd);
                }
            }
            assert!(
                existing_count <= SHM_RING_SLOTS,
                "SHM files ({existing_count}) exceeded ring slots ({SHM_RING_SLOTS}) at step {i}"
            );
        }

        // Cleanup all
        ring.cleanup_all();
        let remaining = all_names
            .iter()
            .filter(|n| shm_open(n.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok())
            .count();
        assert_eq!(
            remaining, 0,
            "All ring buffer segments should be unlinked after cleanup"
        );
    }

    #[test]
    fn test_ring_buffer_fail_closed_unlinks_immediately() {
        let mut ring = ShmRingBuffer::new();
        let data = [42u8; 16];
        let (slot, name) = ring.acquire(&data).expect("acquire");
        assert!(shm_open(name.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
        assert!(ring.slots()[slot].in_use);

        ring.fail_closed(slot);
        let probe = shm_open(name.as_c_str(), OFlag::O_RDONLY, Mode::empty());
        assert!(matches!(probe, Err(nix::errno::Errno::ENOENT)));
        assert!(!ring.slots()[slot].in_use);
    }

    #[test]
    fn test_global_ring_buffer_prepare_and_cleanup_all() {
        let _lock = TEST_MUTEX.lock().unwrap();
        let data = [99u8; 32];
        let (slot0, name0) = shm_prepare_ring(&data).expect("global acquire 0");
        shm_ring_mark_in_flight(slot0);
        assert!(shm_open(name0.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        let (slot1, name1) = shm_prepare_ring(&data).expect("global acquire 1");
        shm_ring_mark_in_flight(slot1);
        assert!(shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());

        cleanup_all_shm_handles();

        assert!(matches!(
            shm_open(name0.as_c_str(), OFlag::O_RDONLY, Mode::empty()),
            Err(nix::errno::Errno::ENOENT)
        ));
        assert!(matches!(
            shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()),
            Err(nix::errno::Errno::ENOENT)
        ));
    }

    #[test]
    fn test_ring_buffer_name_under_31_bytes_for_large_values() {
        let mut slot = ShmRingSlot::new(2);
        slot.generation = 0xffff_ffff_u64;
        let pid = std::process::id();
        let name_str = format!(
            "/vx-{pid:x}-s{:x}-g{:x}",
            slot.slot_index,
            (slot.generation & 0xffff_ffff) as u32
        );
        assert!(name_str.len() <= 31);
    }
}
