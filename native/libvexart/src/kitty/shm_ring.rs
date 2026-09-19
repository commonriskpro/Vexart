// native/libvexart/src/kitty/shm_ring.rs
// POSIX SHM ring buffer slot state machine and allocation lifecycle.

use std::ffi::CString;
use std::num::NonZeroUsize;
use std::os::fd::OwnedFd;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

use nix::fcntl::OFlag;
use nix::sys::stat::Mode;

use super::shm_posix::{
    posix_ftruncate, posix_mmap_fixed, posix_mmap_shared, posix_munmap, posix_shm_open,
    posix_shm_probe, posix_shm_unlink,
};
use crate::ffi::error::set_last_error;
use crate::ffi::panic::{ERR_INVALID_ARG, ERR_KITTY_TRANSPORT, ERR_SHM_RING_FULL};

/// Number of slots in the fixed-pool ring buffer (N = 3).
pub const SHM_RING_SLOTS: usize = 3;

static NEXT_RING_GEN: AtomicU64 = AtomicU64::new(0);

/// A slot in the POSIX SHM ring buffer.
#[derive(Debug)]
pub struct ShmRingSlot {
    pub slot_index: usize,
    pub generation: u64,
    pub name: Option<CString>,
    pub fd: Option<OwnedFd>,
    pub mapped_ptr: Option<NonNull<u8>>,
    pub mapped_capacity: usize,
    pub capacity: usize,
    pub in_use: bool,
    pub handle: u64,
}

unsafe impl Send for ShmRingSlot {}
unsafe impl Sync for ShmRingSlot {}

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
            mapped_ptr: None,
            mapped_capacity: 0,
            capacity: 0,
            in_use: false,
            handle: 0,
        }
    }
}

/// Fixed-pool Ring Buffer (N = 3 slots) for Kitty SHM segments.
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

    pub fn acquire(&mut self, data: &[u8]) -> Result<(usize, CString), i32> {
        if data.is_empty() {
            set_last_error("SHM payload must be non-empty");
            return Err(ERR_INVALID_ARG);
        }
        if data.len() > u32::MAX as usize {
            set_last_error("SHM payload exceeds u32 bound");
            return Err(ERR_INVALID_ARG);
        }

        let mut available = None;
        for offset in 1..=SHM_RING_SLOTS {
            let index = (self.current + offset) % SHM_RING_SLOTS;
            let slot = &self.slots[index];
            if let Some(name) = &slot.name {
                match posix_shm_probe(name.as_c_str()) {
                    Ok(true) => continue,
                    Ok(false) => {},
                    Err(error) => {
                        set_last_error(format!("SHM consumption probe failed: {error}"));
                        return Err(ERR_KITTY_TRANSPORT);
                    }
                }
            }
            available = Some(index);
            break;
        }
        let Some(slot_idx) = available else {
            set_last_error("SHM ring is awaiting terminal consumption; use the owned frame presenter for asynchronous backpressure");
            return Err(ERR_SHM_RING_FULL);
        };
        self.current = slot_idx;
        let slot = &mut self.slots[slot_idx];
        slot.name = None;
        slot.fd = None;
        slot.capacity = 0;
        slot.in_use = false;

        slot.generation = slot.generation.wrapping_add(1);
        if slot.generation == 0 {
            slot.generation = 1;
        }
        let pid = std::process::id();
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

        let _ = posix_shm_unlink(c_name.as_c_str());

        let mode_bits = Mode::from_bits_truncate(0o600);
        let fd: OwnedFd = match posix_shm_open(
            c_name.as_c_str(),
            OFlag::O_CREAT | OFlag::O_EXCL | OFlag::O_RDWR,
            mode_bits,
        ) {
            Ok(fd) => fd,
            Err(nix::errno::Errno::EEXIST) => {
                let _ = posix_shm_unlink(c_name.as_c_str());
                match posix_shm_open(
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

        let data_len = data.len();
        if let Err(e) = posix_ftruncate(&fd, data_len) {
            set_last_error(format!("ftruncate failed: {e}"));
            let _ = posix_shm_unlink(c_name.as_c_str());
            return Err(ERR_KITTY_TRANSPORT);
        }
        slot.capacity = data_len;

        let size = match NonZeroUsize::new(data_len) {
            Some(s) => s,
            None => {
                set_last_error("data_len is zero after validation");
                let _ = posix_shm_unlink(c_name.as_c_str());
                return Err(ERR_KITTY_TRANSPORT);
            }
        };

        let mapped = if let Some(existing_ptr) = slot.mapped_ptr {
            if data_len <= slot.mapped_capacity {
                match unsafe { posix_mmap_fixed(existing_ptr, size, &fd) } {
                    Ok(ptr) => ptr,
                    Err(e) => {
                        set_last_error(format!("mmap fixed failed: {e}"));
                        let _ = posix_shm_unlink(c_name.as_c_str());
                        return Err(ERR_KITTY_TRANSPORT);
                    }
                }
            } else {
                unsafe {
                    let _ = posix_munmap(existing_ptr.cast(), slot.mapped_capacity);
                }
                match unsafe { posix_mmap_shared(size, &fd) } {
                    Ok(ptr) => {
                        slot.mapped_capacity = data_len;
                        ptr
                    }
                    Err(e) => {
                        slot.mapped_ptr = None;
                        slot.mapped_capacity = 0;
                        set_last_error(format!("mmap realloc failed: {e}"));
                        let _ = posix_shm_unlink(c_name.as_c_str());
                        return Err(ERR_KITTY_TRANSPORT);
                    }
                }
            }
        } else {
            match unsafe { posix_mmap_shared(size, &fd) } {
                Ok(ptr) => {
                    slot.mapped_capacity = data_len;
                    ptr
                }
                Err(e) => {
                    set_last_error(format!("mmap initial failed: {e}"));
                    let _ = posix_shm_unlink(c_name.as_c_str());
                    return Err(ERR_KITTY_TRANSPORT);
                }
            }
        };

        slot.mapped_ptr = Some(mapped.cast());

        unsafe {
            std::ptr::copy_nonoverlapping(data.as_ptr(), mapped.as_ptr() as *mut u8, data_len);
        }

        let handle_id = super::shm_posix::NEXT_KITTY_HANDLE.fetch_add(1, Ordering::Relaxed);
        slot.handle = handle_id;
        slot.name = Some(c_name.clone());
        slot.fd = Some(fd);
        slot.in_use = true;

        Ok((slot_idx, c_name))
    }

    pub fn mark_in_flight(&mut self, slot_index: usize) {
        if let Some(slot) = self.slots.get_mut(slot_index) {
            slot.in_use = true;
        }
    }

    pub fn fail_closed(&mut self, slot_index: usize) {
        if let Some(slot) = self.slots.get_mut(slot_index) {
            if let Some(ref name) = slot.name.take() {
                let _ = posix_shm_unlink(name.as_c_str());
            }
            if let Some(ptr) = slot.mapped_ptr.take() {
                unsafe {
                    let _ = posix_munmap(ptr.cast(), slot.mapped_capacity);
                }
            }
            slot.fd = None;
            slot.capacity = 0;
            slot.mapped_capacity = 0;
            slot.in_use = false;
        }
    }

    pub fn cleanup_all(&mut self) {
        for slot in &mut self.slots {
            if let Some(ref name) = slot.name.take() {
                let _ = posix_shm_unlink(name.as_c_str());
            }
            if let Some(ptr) = slot.mapped_ptr.take() {
                unsafe {
                    let _ = posix_munmap(ptr.cast(), slot.mapped_capacity);
                }
            }
            slot.fd = None;
            slot.capacity = 0;
            slot.mapped_capacity = 0;
            slot.in_use = false;
        }
    }

    pub fn is_drained(&self) -> bool {
        for slot in &self.slots {
            if let Some(ref name) = slot.name {
                match posix_shm_probe(name.as_c_str()) {
                    Ok(true) => return false,
                    Ok(false) => continue,
                    Err(_) => return false,
                }
            }
        }
        true
    }
}

impl Drop for ShmRingBuffer {
    fn drop(&mut self) {
        self.cleanup_all();
    }
}

impl Default for ShmRingBuffer {
    fn default() -> Self {
        Self::new()
    }
}

pub static SHM_RING_BUFFER: LazyLock<Mutex<ShmRingBuffer>> = LazyLock::new(|| {
    super::ensure_emergency_cleanup_registered();
    Mutex::new(ShmRingBuffer::new())
});

pub fn cleanup_global_ring() {
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.cleanup_all();
}

pub fn acquire_ring_slot(data: &[u8]) -> Result<(usize, CString), i32> {
    shm_prepare_ring(data)
}

pub fn shm_prepare_ring(data: &[u8]) -> Result<(usize, CString), i32> {
    super::ensure_emergency_cleanup_registered();
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.acquire(data)
}

pub fn shm_ring_is_drained() -> bool {
    let ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.is_drained()
}

pub fn shm_ring_mark_in_flight(slot_index: usize) {
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.mark_in_flight(slot_index);
}

pub fn shm_ring_fail_closed(slot_index: usize) {
    let mut ring = match SHM_RING_BUFFER.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    ring.fail_closed(slot_index);
}
