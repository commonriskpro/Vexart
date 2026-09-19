use super::*;
use std::mem;

fn force_write_failure(value: bool) {
    FORCE_WRITE_FAILURE.with(|failure| failure.set(value));
}

fn force_animation_support(value: Option<bool>) {
    FORCE_ANIMATION_SUPPORT.with(|c| c.set(value));
}

fn reset_hash_scan_count() {
    RGBA_HASH_SCANS.with(|scans| scans.set(0));
}

fn hash_scan_count() -> usize {
    RGBA_HASH_SCANS.with(|scans| scans.get())
}

#[test]
fn test_set_transport_mode_valid() {
    assert_eq!(set_transport_mode(0), OK);
    assert_eq!(set_transport_mode(2), OK);
}

#[test]
fn test_set_transport_mode_invalid() {
    assert_eq!(set_transport_mode(1), ERR_INVALID_ARG);
    assert_eq!(set_transport_mode(3), ERR_INVALID_ARG);
    assert_eq!(set_transport_mode(99), ERR_INVALID_ARG);
}

#[test]
fn test_transport_mode_thread_local() {
    // Set to shm (2), verify it reads back correctly.
    set_transport_mode(2);
    let mode = TRANSPORT_MODE.with(|c| c.get());
    assert_eq!(mode, 2);
    // Reset to direct.
    set_transport_mode(0);
    let mode = TRANSPORT_MODE.with(|c| c.get());
    assert_eq!(mode, 0);
}

#[test]
fn test_shm_compression_defaults_to_raw() {
    assert!(!shm_compression_enabled_value(None));
}

#[test]
fn test_shm_compression_can_be_forced() {
    assert!(shm_compression_enabled_value(Some("1".to_string())));
    assert!(shm_compression_enabled_value(Some("true".to_string())));
    assert!(shm_compression_enabled_value(Some("on".to_string())));
}

#[test]
fn test_shm_compression_rejects_disabled_values() {
    assert!(!shm_compression_enabled_value(Some("0".to_string())));
    assert!(!shm_compression_enabled_value(Some("false".to_string())));
    assert!(!shm_compression_enabled_value(Some("off".to_string())));
}

#[test]
fn test_failed_output_does_not_advance_frame() {
    let image_id = 40_004;
    let rgba = [0x10, 0x20, 0x30, 0xff];
    force_write_failure(true);

    assert_eq!(
        emit_direct_rgba_at(&rgba, 1, 1, image_id, 0, 0, 0),
        ERR_KITTY_TRANSPORT
    );
    assert!(image_frame(image_id).is_none());

    force_write_failure(false);
    forget_image_frame(image_id);
}

#[test]
fn test_shm_write_failure_unlinks_segment_fail_closed() {
    let image_id = 40_010;
    let rgba = [0x10, 0x20, 0x30, 0xff];
    force_write_failure(true);

    let (rc, _) = emit_shm_rgba_at_with_stats(&rgba, 1, 1, image_id, 0, 0, 0);
    assert_eq!(rc, ERR_KITTY_TRANSPORT);

    // Region in SHM mode (mode 2)
    let (rc_region, _) = emit_region_rgba_with_stats(&rgba, image_id, 0, 0, 1, 1, 2);
    assert_eq!(rc_region, ERR_KITTY_TRANSPORT);

    force_write_failure(false);
    forget_image_frame(image_id);
    cleanup_shm_on_shutdown();
}

#[test]
fn test_delete_clears_frame_and_geometry() {
    let image_id = 40_005;
    let rgba = [0x10, 0x20, 0x30, 0xff];
    let digest = payload_hash(&rgba, 1, 1, 0, 0, 0);
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 1, 1);
    record_payload(image_id, digest);

    forget_image_frame(image_id);

    assert!(image_frame(image_id).is_none());
    assert!(!payload_unchanged(image_id, digest));
    assert!(image_geometry(image_id).is_none());
}

#[test]
fn test_identical_payload_skips_direct_output() {
    let image_id = 40_001;
    let rgba = [0x10, 0x20, 0x30, 0xff];
    let digest = payload_hash(&rgba, 1, 1, 2, 3, 4);
    force_write_failure(true);
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 1, 1);
    record_payload(image_id, digest);

    assert_eq!(emit_direct_rgba_at(&rgba, 1, 1, image_id, 2, 3, 4), OK);

    force_write_failure(false);
    forget_image_frame(image_id);
}

#[test]
fn test_changed_pixels_attempt_output_and_keep_previous_digest_on_failure() {
    let image_id = 40_002;
    let previous = [0x10, 0x20, 0x30, 0xff];
    let changed = [0x11, 0x20, 0x30, 0xff];
    let previous_digest = payload_hash(&previous, 1, 1, 2, 3, 4);
    let changed_digest = payload_hash(&changed, 1, 1, 2, 3, 4);
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 1, 1);
    record_payload(image_id, previous_digest);
    force_write_failure(true);

    assert_eq!(
        emit_direct_rgba_at(&changed, 1, 1, image_id, 2, 3, 4),
        ERR_KITTY_TRANSPORT
    );
    assert!(!payload_unchanged(image_id, changed_digest));
    assert!(payload_unchanged(image_id, previous_digest));

    force_write_failure(false);
    forget_image_frame(image_id);
}

#[test]
fn test_changed_metadata_attempts_output() {
    let image_id = 40_003;
    let rgba = [0x10, 0x20, 0x30, 0xff];
    let previous_digest = payload_hash(&rgba, 1, 1, 2, 3, 4);
    let changed_digest = payload_hash(&rgba, 1, 1, 2, 4, 4);
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 1, 1);
    record_payload(image_id, previous_digest);
    force_write_failure(true);

    assert_eq!(
        emit_direct_rgba_at(&rgba, 1, 1, image_id, 2, 4, 4),
        ERR_KITTY_TRANSPORT
    );
    assert!(!payload_unchanged(image_id, changed_digest));
    assert!(payload_unchanged(image_id, previous_digest));

    force_write_failure(false);
    forget_image_frame(image_id);
}

#[test]
fn test_failed_output_does_not_commit_digest() {
    let image_id = 40_004;
    let rgba = [0x10, 0x20, 0x30, 0xff];
    let digest = payload_hash(&rgba, 1, 1, 0, 0, 0);
    force_write_failure(true);

    assert_eq!(
        emit_direct_rgba_at(&rgba, 1, 1, image_id, 0, 0, 0),
        ERR_KITTY_TRANSPORT
    );
    assert!(!payload_unchanged(image_id, digest));
    assert!(image_frame(image_id).is_none());

    force_write_failure(false);
    forget_image_frame(image_id);
}

#[test]
fn test_payload_cache_consumes_one_rgba_scan_per_attempt() {
    let image_id = 40_006;
    let previous = [0x10, 0x20, 0x30, 0xff];
    let changed = [0x11, 0x20, 0x30, 0xff];
    let previous_digest = payload_hash(&previous, 1, 1, 0, 0, 0);
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 1, 1);
    record_payload(image_id, previous_digest);
    reset_hash_scan_count();
    force_write_failure(false);

    assert_eq!(emit_direct_rgba_at(&changed, 1, 1, image_id, 0, 0, 0), OK);
    assert_eq!(hash_scan_count(), 1);

    // SHM mode performs zero hashing on RGBA buffer
    reset_hash_scan_count();
    let _ = emit_shm_rgba_at_with_stats(&changed, 1, 1, image_id, 0, 0, 0);
    assert_eq!(hash_scan_count(), 0);

    forget_image_frame(image_id);
    cleanup_shm_on_shutdown();
}

#[test]
fn test_dimension_change_requires_full_transmit() {
    let image_id = 40_007;
    force_animation_support(Some(true));
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 200, 120);

    assert!(!needs_full_transmit(image_id, 200, 120));
    assert!(needs_full_transmit(image_id, 320, 180));

    forget_image_frame(image_id);
    force_animation_support(None);
}

#[test]
fn test_animation_disabled_by_default_requires_full_transmit() {
    let image_id = 40_011;
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 200, 120);

    assert!(needs_full_transmit(image_id, 200, 120));

    forget_image_frame(image_id);
}

#[test]
fn test_failed_resize_transmit_preserves_previous_geometry() {
    let image_id = 40_008;
    let previous = [0x10, 0x20, 0x30, 0xff];
    let previous_digest = payload_hash(&previous, 1, 1, 0, 0, 0);
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 1, 1);
    record_payload(image_id, previous_digest);
    force_write_failure(true);

    assert_eq!(
        emit_direct_rgba_at(
            &[0x11, 0x20, 0x30, 0xff, 0x11, 0x20, 0x30, 0xff,],
            2,
            1,
            image_id,
            0,
            0,
            0,
        ),
        ERR_KITTY_TRANSPORT
    );
    assert_eq!(image_frame(image_id), Some(1));
    assert_eq!(image_geometry(image_id), Some((1, 1)));
    assert!(payload_unchanged(image_id, previous_digest));

    force_write_failure(false);
    forget_image_frame(image_id);
}

#[test]
fn test_region_patch_does_not_replace_root_geometry() {
    let image_id = 40_009;
    record_image_frame(image_id, None);
    record_image_geometry(image_id, 200, 120);
    force_write_failure(false);

    let result =
        emit_region_rgba_with_stats(&[0x10, 0x20, 0x30, 0xff], image_id, 8, 4, 1, 1, 0);
    assert_eq!(result.0, OK);
    assert_eq!(image_geometry(image_id), Some((200, 120)));

    forget_image_frame(image_id);
}

// ── NativePresentationStats struct tests (task 1.3) ────────────────────

/// Stats struct must be exactly 96 bytes for stable FFI across versions.
/// Layout: v1 64 bytes + phase-10 4×u64 native transfer metrics.
#[test]
fn test_native_presentation_stats_size() {
    assert_eq!(
        mem::size_of::<NativePresentationStats>(),
        96,
        "NativePresentationStats must be exactly 96 bytes"
    );
}

/// Stats struct must be C-repr (no padding holes that break alignment).
#[test]
fn test_native_presentation_stats_alignment() {
    // repr(C) + u32/u64 fields: align must be 8 (largest field is u64)
    assert_eq!(
        mem::align_of::<NativePresentationStats>(),
        8,
        "NativePresentationStats must have alignment 8"
    );
}

/// VERSION constant must be 2 after adding Phase 10 native transfer metrics.
#[test]
fn test_native_presentation_stats_version_constant() {
    assert_eq!(NativePresentationStats::VERSION, 2);
}

/// Mode constants have distinct values.
#[test]
fn test_native_presentation_stats_mode_constants() {
    assert_eq!(NativePresentationStats::MODE_UNKNOWN, 0);
    assert_eq!(NativePresentationStats::MODE_FINAL_FRAME, 1);
    assert_eq!(NativePresentationStats::MODE_LAYER, 2);
    assert_eq!(NativePresentationStats::MODE_REGION, 3);
    assert_eq!(NativePresentationStats::MODE_DELETE, 4);
}

/// Transport constants have distinct values matching set_transport_mode.
#[test]
fn test_native_presentation_stats_transport_constants() {
    assert_eq!(NativePresentationStats::TRANSPORT_DIRECT, 0);
    assert_eq!(NativePresentationStats::TRANSPORT_SHM, 2);
}

/// Flag constants are distinct bit positions.
#[test]
fn test_native_presentation_stats_flag_constants() {
    assert_eq!(NativePresentationStats::FLAG_NATIVE_USED, 1);
    assert_eq!(NativePresentationStats::FLAG_FALLBACK, 2);
    assert_eq!(NativePresentationStats::FLAG_VALID, 4);
    assert_eq!(NativePresentationStats::FLAG_COMPRESSED, 8);
}

/// Default stats have version=0 (uninitialized sentinel).
#[test]
fn test_native_presentation_stats_default() {
    let stats = NativePresentationStats::default();
    assert_eq!(stats.version, 0);
    assert_eq!(stats.rgba_bytes_read, 0);
    assert_eq!(stats.flags, 0);
}

/// delete_layer_native with null stats_out succeeds without crash.
#[test]
fn test_delete_layer_native_null_stats() {
    // Resetting transport to direct mode first.
    set_transport_mode(0);
    // delete_layer_native writes to stdout — in test env stdout may not exist.
    // We only verify it doesn't panic/segfault with null stats_out.
    // (Actual write may fail — that's OK in test.)
    let _ = unsafe { delete_layer_native(1, std::ptr::null_mut()) };
}

/// emit_region_native with null rgba returns ERR_KITTY_TRANSPORT.
#[test]
fn test_emit_region_native_null_rgba() {
    let rc =
        unsafe { emit_region_native(1, std::ptr::null(), 0, 0, 0, 0, 0, std::ptr::null_mut()) };
    assert_eq!(rc, ERR_KITTY_TRANSPORT);
}

#[test]
fn test_next_animation_frame_and_ping_pong_cycle() {
    assert_eq!(next_animation_frame(None), (1, 1, false));
    assert_eq!(next_animation_frame(Some(1)), (2, 1, false));
    assert_eq!(next_animation_frame(Some(2)), (1, 2, true));
    assert_eq!(next_animation_frame(Some(3)), (2, 1, true));

    let image_id = 99_001;
    // 1. Initial full transmit records None -> frame 1
    record_image_frame(image_id, None);
    assert_eq!(image_frame(image_id), Some(1));

    // 2. First update: existing=1 -> target=2, compose=1, is_replacement=false
    let (target, compose, is_replacement) = next_animation_frame(image_frame(image_id));
    assert_eq!((target, compose, is_replacement), (2, 1, false));
    record_image_frame(image_id, Some(target));
    assert_eq!(image_frame(image_id), Some(2));

    // 3. Second update: existing=2 -> target=1, compose=2, is_replacement=true
    let (target, compose, is_replacement) = next_animation_frame(image_frame(image_id));
    assert_eq!((target, compose, is_replacement), (1, 2, true));
    record_image_frame(image_id, Some(target));
    assert_eq!(image_frame(image_id), Some(3));

    // 4. Third update: existing=3 -> target=2, compose=1, is_replacement=true
    let (target, compose, is_replacement) = next_animation_frame(image_frame(image_id));
    assert_eq!((target, compose, is_replacement), (2, 1, true));
    record_image_frame(image_id, Some(target));
    assert_eq!(image_frame(image_id), Some(2));

    // 5. Fourth update: existing=2 -> target=1, compose=2, is_replacement=true
    let (target, compose, is_replacement) = next_animation_frame(image_frame(image_id));
    assert_eq!((target, compose, is_replacement), (1, 2, true));
    record_image_frame(image_id, Some(target));
    assert_eq!(image_frame(image_id), Some(3));

    forget_image_frame(image_id);
}

#[test]
fn test_animation_supported_detection() {
    assert!(animation_supported_from_env(Some("1")));
    assert!(!animation_supported_from_env(Some("0")));
    assert!(!animation_supported_from_env(None));
    assert!(!animation_supported_from_env(Some("true")));
    assert!(!animation_supported_from_env(Some("ghostty")));
    assert!(!animation_supported_from_env(Some("xterm-kitty")));
}
