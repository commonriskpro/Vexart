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

    // A fourth producer must leave all three pending names untouched.
    assert!(ring.acquire(&payload_d).is_err());
    assert!(shm_open(name0.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
    assert!(shm_open(name1.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
    assert!(shm_open(name2.as_c_str(), OFlag::O_RDONLY, Mode::empty()).is_ok());
    // The real consumer reads then unlinks. Only now is slot 0 reusable.
    shm_unlink(name0.as_c_str()).unwrap();
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
    let mut all_names: Vec<CString> = Vec::new();

    // Run through 15 acquisitions (5 cycles of N=3)
    for i in 0..15 {
        let data = vec![i as u8; 64];
        if i >= SHM_RING_SLOTS {
            // A terminal acknowledges this older generation by unlinking.
            shm_unlink(all_names[i - SHM_RING_SLOTS].as_c_str()).unwrap();
        }
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

#[test]
fn test_ring_buffer_saturation_returns_err_shm_ring_full() {
    let mut ring = ShmRingBuffer::new();
    assert!(ring.is_drained());

    let p0 = [1u8; 16];
    let p1 = [2u8; 16];
    let p2 = [3u8; 16];
    let p3 = [4u8; 16];

    let (_, name0) = ring.acquire(&p0).expect("slot 0");
    let (_, name1) = ring.acquire(&p1).expect("slot 1");
    let (_, name2) = ring.acquire(&p2).expect("slot 2");

    assert!(!ring.is_drained());

    // Saturated: all 3 slots still awaiting terminal consumption
    let err = ring.acquire(&p3);
    assert_eq!(err, Err(ERR_SHM_RING_FULL));

    // Terminal unlinks slot 0
    shm_unlink(name0.as_c_str()).unwrap();
    assert!(!ring.is_drained()); // slots 1 and 2 still active

    // Now acquire succeeds into slot 0
    let (slot_recycled, name_recycled) = ring.acquire(&p3).expect("recycled slot 0");
    assert_eq!(slot_recycled, 0);

    // Clean up remaining
    shm_unlink(name1.as_c_str()).unwrap();
    shm_unlink(name2.as_c_str()).unwrap();
    shm_unlink(name_recycled.as_c_str()).unwrap();
    assert!(ring.is_drained());
}

#[test]
fn test_ring_buffer_persistent_mapping_realloc() {
    let mut ring = ShmRingBuffer::new();
    let small_payload = vec![0x42u8; 64];
    let large_payload = vec![0x99u8; 1024];
    let smaller_payload = vec![0x11u8; 128];

    // Slot 0 initial allocation (64 bytes)
    let (s0, name0) = ring.acquire(&small_payload).expect("initial acquire");
    assert_eq!(s0, 0);
    assert_eq!(ring.slots()[0].mapped_capacity, 64);
    assert!(ring.slots()[0].mapped_ptr.is_some());

    shm_unlink(name0.as_c_str()).unwrap();

    // Slot 1 and 2 to advance past
    let (_s1, n1) = ring.acquire(&small_payload).unwrap();
    let (_s2, n2) = ring.acquire(&small_payload).unwrap();
    shm_unlink(n1.as_c_str()).unwrap();
    shm_unlink(n2.as_c_str()).unwrap();

    // Slot 0 realloc with larger payload (1024 bytes > 64)
    let (s0_b, name0_b) = ring.acquire(&large_payload).expect("larger acquire");
    assert_eq!(s0_b, 0);
    assert_eq!(ring.slots()[0].mapped_capacity, 1024);

    shm_unlink(name0_b.as_c_str()).unwrap();

    let (_s1_b, n1_b) = ring.acquire(&small_payload).unwrap();
    let (_s2_b, n2_b) = ring.acquire(&small_payload).unwrap();
    shm_unlink(n1_b.as_c_str()).unwrap();
    shm_unlink(n2_b.as_c_str()).unwrap();

    // Slot 0 reuse with smaller payload (128 bytes <= 1024): keeps mapped_capacity
    let (s0_c, name0_c) = ring.acquire(&smaller_payload).expect("smaller acquire");
    assert_eq!(s0_c, 0);
    assert_eq!(ring.slots()[0].mapped_capacity, 1024);

    shm_unlink(name0_c.as_c_str()).unwrap();
    ring.cleanup_all();
    assert!(ring.is_drained());
}
