use super::*;
use crate::ffi::panic::ERR_INVALID_HANDLE;

static TEST_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn test_context_destroy_cleans_all_registries() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    // Register an image asset
    let rgba = [255u8; 16];
    let meta = [2u32, 2u32];
    let mut handle = 0u64;
    let rc = unsafe {
        vexart_image_asset_register(
            1,
            "test.png".as_ptr(),
            8,
            rgba.as_ptr(),
            16,
            meta.as_ptr() as *const u8,
            &mut handle,
        )
    };
    assert_eq!(rc, OK);
    assert_ne!(handle, 0);

    // Create a target and set scissor to verify teardown drains it
    {
        let mut target = 0u64;
        let rc = unsafe { vexart_composite_target_create(1, 32, 32, &mut target) };
        assert_eq!(rc, OK);
        assert_ne!(target, 0);
        let rc = vexart_composite_target_set_scissor(1, target, 5, 5, 10, 10);
        assert_eq!(rc, OK);
    }

    // Destroy context
    let rc = vexart_context_destroy(1);
    assert_eq!(rc, OK);

    // Verify SHARED_PAINT was drained
    {
        let paint_guard = lock_or_recover(&SHARED_PAINT);
        assert!(paint_guard.is_none());
    }

    // Verify frame counter and stats were reset
    assert_eq!(FRAME_COUNT.load(Ordering::Relaxed), 1);
    assert_eq!(BUDGET_BYTES.load(Ordering::Relaxed), DEFAULT_BUDGET_BYTES);
    assert_eq!(HIGH_WATER_MARK.load(Ordering::Relaxed), 0);
}

#[test]
fn test_target_scissor_invalid_args() {
    let _lock = lock_or_recover(&TEST_LOCK);
    assert_eq!(
        vexart_composite_target_set_scissor(1, 0, 10, 10, 50, 50),
        ERR_INVALID_ARG
    );
    assert_eq!(
        vexart_composite_target_reset_scissor(1, 0),
        ERR_INVALID_ARG
    );
    assert_eq!(
        vexart_composite_target_set_scissor(1, 999999, 10, 10, 50, 50),
        ERR_INVALID_HANDLE
    );
    assert_eq!(
        vexart_composite_target_reset_scissor(1, 999999),
        ERR_INVALID_HANDLE
    );
}

#[test]
fn test_target_scissor_lifecycle() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 100, 100, &mut target) };
    assert_eq!(rc, OK);
    assert_ne!(target, 0);

    // Initial target has no scissor
    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        let rec = pctx.targets.get(target).unwrap();
        assert_eq!(rec.scissor, None);
    }

    // Set scissor
    let rc = vexart_composite_target_set_scissor(1, target, 10, 20, 30, 40);
    assert_eq!(rc, OK);

    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        let rec = pctx.targets.get(target).unwrap();
        assert_eq!(rec.scissor, Some([10, 20, 30, 40]));
    }

    // Begin layer — active layer inherits scissor
    let rc = vexart_composite_target_begin_layer(1, target, 0, 0);
    assert_eq!(rc, OK);

    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        let rec = pctx.targets.get(target).unwrap();
        let layer = rec.active_layer.as_ref().unwrap();
        assert_eq!(layer.scissor, Some([10, 20, 30, 40]));
    }

    // Update scissor while layer is active
    let rc = vexart_composite_target_set_scissor(1, target, 5, 5, 50, 50);
    assert_eq!(rc, OK);

    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        let rec = pctx.targets.get(target).unwrap();
        assert_eq!(rec.scissor, Some([5, 5, 50, 50]));
        let layer = rec.active_layer.as_ref().unwrap();
        assert_eq!(layer.scissor, Some([5, 5, 50, 50]));
    }

    // Reset scissor while layer is active
    let rc = vexart_composite_target_reset_scissor(1, target);
    assert_eq!(rc, OK);

    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        let rec = pctx.targets.get(target).unwrap();
        assert_eq!(rec.scissor, None);
        let layer = rec.active_layer.as_ref().unwrap();
        assert_eq!(layer.scissor, None);
    }

    // End layer
    let rc = vexart_composite_target_end_layer(1, target);
    assert_eq!(rc, OK);

    // Destroy target
    let rc = vexart_composite_target_destroy(1, target);
    assert_eq!(rc, OK);
}

#[test]
fn test_allocation_exceeding_budget_warns_and_succeeds() {
    let _lock = lock_or_recover(&TEST_LOCK);
    // Set budget to 32MB (the minimum allowed)
    let rc = vexart_resource_set_budget(1, 32);
    assert_eq!(rc, OK);

    // Attempt to create a target exceeding 32MB (4000 × 3000 × 4 = 48,000,000 bytes ≈ 45.7MB)
    // With eviction disarmed, this succeeds without error.
    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 4000, 3000, &mut target) };
    assert_eq!(rc, OK);
    assert_ne!(target, 0);

    // Symmetrically release target
    let rc = vexart_composite_target_destroy(1, target);
    assert_eq!(rc, OK);

    // Reset context to default state
    let rc = vexart_context_destroy(1);
    assert_eq!(rc, OK);
}

#[test]
fn test_copy_region_to_image_clamps_vram_reservation() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 100, 100, &mut target) };
    assert_eq!(rc, OK);

    let mut out_image = 0u64;
    // Request x=50, y=50, w=2000, h=2000 -> clamped cw=50, ch=50 -> bytes = 10,000
    let rc = unsafe {
        vexart_composite_copy_region_to_image(1, target, 50, 50, 2000, 2000, &mut out_image)
    };
    assert_eq!(rc, OK);
    assert_ne!(out_image, 0);

    // Verify image size in PaintContext is exactly 10,000 bytes (not 16MB)
    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        let img = &pctx.images[&out_image];
        assert_eq!(img.width, 50);
        assert_eq!(img.height, 50);
        assert_eq!(img.size_bytes(), 10_000);
    }

    let _ = vexart_context_destroy(1);
}

#[test]
fn test_image_asset_lifecycle_in_paint_context() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    let rgba = [255u8; 16];
    let meta = [2u32, 2u32];
    let mut handle = 0u64;
    let rc = unsafe {
        vexart_image_asset_register(
            1,
            "asset.png".as_ptr(),
            9,
            rgba.as_ptr(),
            16,
            meta.as_ptr() as *const u8,
            &mut handle,
        )
    };
    assert_eq!(rc, OK);
    assert_ne!(handle, 0);

    // Verify touch
    assert_eq!(vexart_image_asset_touch(1, handle), OK);
    assert_eq!(vexart_image_asset_touch(1, 999999), ERR_INVALID_ARG);

    // Retain increments refcount
    assert_eq!(vexart_image_asset_retain(handle), OK);
    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        assert_eq!(pctx.images[&handle].references, 2);
    }

    // Release decrements refcount, image still exists
    assert_eq!(vexart_image_asset_release(handle), OK);
    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        assert_eq!(pctx.images[&handle].references, 1);
    }

    // Second release frees image
    assert_eq!(vexart_image_asset_release(handle), OK);
    {
        let guard = lock_or_recover(&SHARED_PAINT);
        let pctx = guard.as_ref().unwrap();
        assert!(!pctx.images.contains_key(&handle));
    }

    // Third release returns ERR_INVALID_ARG
    assert_eq!(vexart_image_asset_release(handle), ERR_INVALID_ARG);
    assert_eq!(vexart_image_asset_retain(handle), ERR_INVALID_ARG);

    let _ = vexart_context_destroy(1);
}

#[test]
fn test_resource_stats_reports_images_and_targets() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    let rgba = [255u8; 16];
    let meta = [2u32, 2u32];
    let mut img_handle = 0u64;
    let rc = unsafe {
        vexart_image_asset_register(
            1,
            "asset.png".as_ptr(),
            9,
            rgba.as_ptr(),
            16,
            meta.as_ptr() as *const u8,
            &mut img_handle,
        )
    };
    assert_eq!(rc, OK);

    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 10, 10, &mut target) };
    assert_eq!(rc, OK);

    let mut buf = [0u8; 1024];
    let mut used = 0u32;
    let rc = unsafe {
        vexart_resource_get_stats(1, buf.as_mut_ptr(), buf.len() as u32, &mut used)
    };
    assert_eq!(rc, OK);
    let json_str = std::str::from_utf8(&buf[..used as usize]).unwrap();
    assert!(json_str.contains("\"ImageSprite\":{\"count\":1,\"bytes\":16}"));
    assert!(json_str.contains("\"LayerTarget\":{\"count\":1,\"bytes\":400}"));
    assert!(json_str.contains("\"currentUsage\":416"));

    let _ = vexart_composite_target_destroy(1, target);
    let _ = vexart_image_asset_release(img_handle);
    let _ = vexart_context_destroy(1);
}

#[test]
fn test_frame_presentation_advances_frame_counter() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    let initial_frame = FRAME_COUNT.load(Ordering::Relaxed);
    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 10, 10, &mut target) };
    assert_eq!(rc, OK);

    // Advance presentation
    let advanced = advance_presentation_frame();
    assert_eq!(advanced, initial_frame);
    assert_eq!(FRAME_COUNT.load(Ordering::Relaxed), initial_frame + 1);

    let _ = vexart_context_destroy(1);
    assert_eq!(FRAME_COUNT.load(Ordering::Relaxed), 1);
}

#[test]
fn test_shm_ring_ffi_emit_and_drain_lifecycle() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    assert_eq!(vexart_kitty_shm_is_drained(), 1);

    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 8, 8, &mut target) };
    assert_eq!(rc, OK);

    let mut stats = types::NativePresentationStats::default();
    let rc = unsafe { vexart_kitty_emit_frame_shm_ring(1, target, 77771, &mut stats) };
    assert_eq!(rc, OK);
    assert_eq!(stats.transport, types::NativePresentationStats::TRANSPORT_SHM);
    assert_eq!(stats.kitty_bytes_emitted, 8 * 8 * 4);
    assert_ne!(stats.total_us, 0);
    assert_eq!(vexart_kitty_shm_is_drained(), 0);

    // Placeholder ring emit
    let params: [u32; 5] = [77772, 1, 5, 5, 1];
    let mut placeholder_stats = types::NativePresentationStats::default();
    let rc = unsafe {
        vexart_kitty_emit_placeholder_shm_ring(
            1,
            target,
            params.as_ptr(),
            20,
            &mut placeholder_stats,
        )
    };
    assert_eq!(rc, OK);
    assert_eq!(placeholder_stats.transport, types::NativePresentationStats::TRANSPORT_SHM);
    assert_eq!(vexart_kitty_shm_is_drained(), 0);

    // Cleanup drains everything
    assert_eq!(vexart_kitty_shm_cleanup_all(), OK);
    assert_eq!(vexart_kitty_shm_is_drained(), 1);

    let _ = vexart_context_destroy(1);
}

#[test]
fn test_font_render_batch_invalid_args() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let mut stats: u32 = 999;
    let rc = unsafe { vexart_font_render_batch(1, 0, std::ptr::null(), 0, &mut stats) };
    assert_eq!(rc, ERR_INVALID_ARG);
    assert_eq!(stats, 0);

    let bad_magic = [0u8; 16];
    let rc = unsafe { vexart_font_render_batch(1, 0, bad_magic.as_ptr(), 16, &mut stats) };
    assert_eq!(rc, ERR_INVALID_ARG);
}

#[test]
fn test_font_render_batch_empty_items() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let mut header = [0u8; 16];
    header[0..4].copy_from_slice(&0x56585458u32.to_le_bytes());
    header[4..8].copy_from_slice(&1u32.to_le_bytes());
    header[8..12].copy_from_slice(&0u32.to_le_bytes());
    header[12..16].copy_from_slice(&16u32.to_le_bytes());

    let mut stats: u32 = 999;
    let rc = unsafe { vexart_font_render_batch(1, 0, header.as_ptr(), 16, &mut stats) };
    assert_eq!(rc, OK);
    assert_eq!(stats, 0);
}

#[test]
fn test_font_render_batch_multiple_items() {
    let _lock = lock_or_recover(&TEST_LOCK);
    let _ = vexart_context_destroy(1);

    let mut target = 0u64;
    let rc = unsafe { vexart_composite_target_create(1, 200, 100, &mut target) };
    assert_eq!(rc, OK);

    let mut buf = Vec::new();
    // Reserve header
    buf.extend_from_slice(&0x56585458u32.to_le_bytes()); // magic
    buf.extend_from_slice(&1u32.to_le_bytes()); // version
    buf.extend_from_slice(&2u32.to_le_bytes()); // item_count = 2
    buf.extend_from_slice(&0u32.to_le_bytes()); // total_bytes placeholder

    let mut encode_item = |x: f32, y: f32, font_size: f32, family: &str, text: &str| {
        buf.extend_from_slice(&x.to_le_bytes());
        buf.extend_from_slice(&y.to_le_bytes());
        buf.extend_from_slice(&font_size.to_le_bytes());
        buf.extend_from_slice(&20.0f32.to_le_bytes()); // line_height
        buf.extend_from_slice(&500.0f32.to_le_bytes()); // max_width
        buf.extend_from_slice(&0xFFFFFFFFu32.to_le_bytes()); // color_rgba
        buf.extend_from_slice(&400u16.to_le_bytes()); // weight
        buf.extend_from_slice(&0u16.to_le_bytes()); // flags
        buf.extend_from_slice(&(family.len() as u16).to_le_bytes());
        buf.extend_from_slice(&(text.len() as u16).to_le_bytes());
        buf.extend_from_slice(family.as_bytes());
        buf.extend_from_slice(text.as_bytes());
    };

    encode_item(10.0, 10.0, 16.0, "sans-serif", "Hello");
    encode_item(10.0, 35.0, 16.0, "sans-serif", "World");

    let total_bytes = buf.len() as u32;
    buf[12..16].copy_from_slice(&total_bytes.to_le_bytes());

    let mut stats: u32 = 0;
    let rc = unsafe {
        vexart_font_render_batch(1, target, buf.as_ptr(), total_bytes, &mut stats)
    };
    assert_eq!(rc, OK);
    assert_eq!(stats, 10); // "Hello" (5) + "World" (5) = 10 glyphs

    let _ = vexart_context_destroy(1);
}
