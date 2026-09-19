use super::*;

#[test]
fn test_target_set_reset_scissor_invalid_args() {
    let mut pctx = PaintContext::new();
    assert_eq!(target_set_scissor(&mut pctx, 0, 10, 10, 50, 50), ERR_INVALID_ARG);
    assert_eq!(target_reset_scissor(&mut pctx, 0), ERR_INVALID_ARG);
    assert_eq!(target_set_scissor(&mut pctx, 999999, 10, 10, 50, 50), ERR_INVALID_HANDLE);
    assert_eq!(target_reset_scissor(&mut pctx, 999999), ERR_INVALID_HANDLE);
}

#[test]
fn test_target_set_reset_scissor_valid() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);
    assert_ne!(handle, 0);

    assert_eq!(target_set_scissor(&mut pctx, handle, 5, 10, 20, 30), OK);
    assert_eq!(pctx.targets.get(handle).unwrap().scissor, Some([5, 10, 20, 30]));

    assert_eq!(target_reset_scissor(&mut pctx, handle), OK);
    assert_eq!(pctx.targets.get(handle).unwrap().scissor, None);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn test_rect_parse_from_bytes() {
    // Verify the 4×u32 rect parse in readback_region_rgba.
    let mut rect = [0u8; 16];
    rect[0..4].copy_from_slice(&10u32.to_le_bytes());
    rect[4..8].copy_from_slice(&20u32.to_le_bytes());
    rect[8..12].copy_from_slice(&50u32.to_le_bytes());
    rect[12..16].copy_from_slice(&30u32.to_le_bytes());

    let rx = u32::from_le_bytes([rect[0], rect[1], rect[2], rect[3]]);
    let ry = u32::from_le_bytes([rect[4], rect[5], rect[6], rect[7]]);
    let rw = u32::from_le_bytes([rect[8], rect[9], rect[10], rect[11]]);
    let rh = u32::from_le_bytes([rect[12], rect[13], rect[14], rect[15]]);

    assert_eq!(rx, 10);
    assert_eq!(ry, 20);
    assert_eq!(rw, 50);
    assert_eq!(rh, 30);
}

#[test]
fn readback_rgba_should_fail_when_buffer_is_too_small() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 100];
    // 64 * 64 * 4 = 16384 bytes needed; capacity 100 is too small.
    let status = readback_rgba(
        &mut pctx,
        handle,
        buf.as_mut_ptr(),
        100,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_rgba_should_fail_when_dimensions_overflow() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 16];

    // Case 1: width * height overflows u32
    pctx.targets.get_mut(handle).unwrap().width = u32::MAX;
    let status1 = readback_rgba(
        &mut pctx,
        handle,
        buf.as_mut_ptr(),
        u32::MAX,
        std::ptr::null_mut(),
    );
    assert_eq!(status1, ERR_INVALID_ARG);

    // Case 2: (width * height) * 4 overflows u32
    pctx.targets.get_mut(handle).unwrap().width = 1 << 30;
    pctx.targets.get_mut(handle).unwrap().height = 1;
    let status2 = readback_rgba(
        &mut pctx,
        handle,
        buf.as_mut_ptr(),
        u32::MAX,
        std::ptr::null_mut(),
    );
    assert_eq!(status2, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_region_rgba_should_fail_on_overflow_or_buffer_too_small() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 64];

    // Buffer too small: region 10x10 requires 400 bytes, buffer capacity is 64
    let mut rect_small = [0u8; 16];
    rect_small[8..12].copy_from_slice(&10u32.to_le_bytes()); // w = 10
    rect_small[12..16].copy_from_slice(&10u32.to_le_bytes()); // h = 10

    let status_small = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_small,
        buf.as_mut_ptr(),
        64,
        std::ptr::null_mut(),
    );
    assert_eq!(status_small, ERR_INVALID_ARG);

    // Target with overflow dimensions in region
    pctx.targets.get_mut(handle).unwrap().width = u32::MAX;
    pctx.targets.get_mut(handle).unwrap().height = u32::MAX;
    let mut rect_overflow = [0u8; 16];
    rect_overflow[8..12].copy_from_slice(&u32::MAX.to_le_bytes()); // rw = u32::MAX
    rect_overflow[12..16].copy_from_slice(&u32::MAX.to_le_bytes()); // rh = u32::MAX

    let status_overflow = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_overflow,
        buf.as_mut_ptr(),
        u32::MAX,
        std::ptr::null_mut(),
    );
    assert_eq!(status_overflow, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

fn make_test_rect(x: u32, y: u32, w: u32, h: u32) -> [u8; 16] {
    let mut rect = [0u8; 16];
    rect[0..4].copy_from_slice(&x.to_le_bytes());
    rect[4..8].copy_from_slice(&y.to_le_bytes());
    rect[8..12].copy_from_slice(&w.to_le_bytes());
    rect[12..16].copy_from_slice(&h.to_le_bytes());
    rect
}

#[test]
fn readback_region_rgba_should_fail_when_dimensions_are_zero() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 256];

    // rw == 0
    let rect_zero_w = make_test_rect(0, 0, 0, 10);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_zero_w,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // rh == 0
    let rect_zero_h = make_test_rect(0, 0, 10, 0);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_zero_h,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // both zero
    let rect_both_zero = make_test_rect(0, 0, 0, 0);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_both_zero,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_region_rgba_should_fail_when_origin_is_out_of_bounds() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 256];

    // rx == tw (64)
    let rect_rx_eq_tw = make_test_rect(64, 0, 4, 4);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_rx_eq_tw,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // rx > tw (100 > 64)
    let rect_rx_gt_tw = make_test_rect(100, 0, 4, 4);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_rx_gt_tw,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // ry == th (64)
    let rect_ry_eq_th = make_test_rect(0, 64, 4, 4);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_ry_eq_th,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // ry > th (100 > 64)
    let rect_ry_gt_th = make_test_rect(0, 100, 4, 4);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_ry_gt_th,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_region_rgba_should_fail_when_region_exceeds_bounds_preventing_silent_clamping() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 1024];

    // rx < tw but rx + rw > tw (60 + 10 = 70 > 64)
    let rect_x_overflow = make_test_rect(60, 0, 10, 10);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_x_overflow,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // ry < th but ry + rh > th (0, 60 + 10 = 70 > 64)
    let rect_y_overflow = make_test_rect(0, 60, 10, 10);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_y_overflow,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // rx = 0, rw > tw (65 > 64)
    let rect_w_overflow = make_test_rect(0, 0, 65, 10);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_w_overflow,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // ry = 0, rh > th (65 > 64)
    let rect_h_overflow = make_test_rect(0, 0, 10, 65);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_h_overflow,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_region_rgba_should_fail_on_arithmetic_overflow() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    let mut buf = vec![0u8; 64];

    // rx + rw overflows u32
    let rect_rx_overflow = make_test_rect(u32::MAX, 0, 1, 1);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_rx_overflow,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // ry + rh overflows u32
    let rect_ry_overflow = make_test_rect(0, u32::MAX, 1, 1);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_ry_overflow,
        buf.as_mut_ptr(),
        buf.len() as u32,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // Byte calculation overflow (rw * rh * 4 overflows u32)
    // Set target dimensions large to pass bounds check first.
    pctx.targets.get_mut(handle).unwrap().width = u32::MAX;
    pctx.targets.get_mut(handle).unwrap().height = u32::MAX;

    let rect_mul_overflow = make_test_rect(0, 0, u32::MAX, u32::MAX);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_mul_overflow,
        buf.as_mut_ptr(),
        u32::MAX,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    let rect_bytes_overflow = make_test_rect(0, 0, 1 << 30, 1);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_bytes_overflow,
        buf.as_mut_ptr(),
        u32::MAX,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_region_rgba_should_fail_when_dst_cap_is_smaller_than_needed() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    // rw = 10, rh = 10 requires 10 * 10 * 4 = 400 bytes.
    let rect = make_test_rect(0, 0, 10, 10);
    let mut buf = vec![0u8; 400];

    // Capacity 399 < 400
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect,
        buf.as_mut_ptr(),
        399,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    // Capacity 0 < 400
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect,
        buf.as_mut_ptr(),
        0,
        std::ptr::null_mut(),
    );
    assert_eq!(status, ERR_INVALID_ARG);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn readback_region_rgba_should_succeed_for_valid_bounded_region() {
    let mut pctx = PaintContext::new();
    let mut handle = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle);
    assert_eq!(rc, OK);

    // Interior sub-region: x=10, y=10, w=20, h=20 (right=30 <= 64, bottom=30 <= 64)
    let rect = make_test_rect(10, 10, 20, 20);
    let needed = 20 * 20 * 4;
    let mut buf = vec![0u8; needed as usize];
    let mut stats = FrameStats::default();

    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect,
        buf.as_mut_ptr(),
        needed,
        &mut stats,
    );
    assert_eq!(status, OK);

    // Edge-aligned region touching boundary: x=44, y=44, w=20, h=20 (right=64 == tw, bottom=64 == th)
    let rect_edge = make_test_rect(44, 44, 20, 20);
    let status = readback_region_rgba(
        &mut pctx,
        handle,
        &rect_edge,
        buf.as_mut_ptr(),
        needed,
        std::ptr::null_mut(),
    );
    assert_eq!(status, OK);

    assert_eq!(target_destroy(&mut pctx, handle), OK);
}

#[test]
fn test_target_create_destroy_pool_reuse() {
    let mut pctx = PaintContext::new();
    assert_eq!(pctx.texture_pool.available_count(), 0);

    let mut handle1 = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle1);
    assert_eq!(rc, OK);
    assert_eq!(pctx.texture_pool.available_count(), 0);

    let rc = target_destroy(&mut pctx, handle1);
    assert_eq!(rc, OK);
    assert_eq!(pctx.texture_pool.available_count(), 1);
    assert_eq!(pctx.texture_pool.count_for_key(64, 64), 1);

    let mut handle2 = 0u64;
    let rc = target_create(&mut pctx, 64, 64, &mut handle2);
    assert_eq!(rc, OK);
    // Should have reused the pooled texture:
    assert_eq!(pctx.texture_pool.available_count(), 0);

    let rc = target_destroy(&mut pctx, handle2);
    assert_eq!(rc, OK);
    assert_eq!(pctx.texture_pool.available_count(), 1);
}

#[test]
fn test_blur_intermediate_texture_pooled() {
    let mut pctx = PaintContext::new();
    let rgba = vec![255u8; 32 * 32 * 4];
    let handle = crate::paint::alloc_image_handle();
    assert!(crate::upload_image_record(&mut pctx, handle, &rgba, 32, 32));

    assert_eq!(pctx.texture_pool.available_count(), 0);

    let blur_result = render_blur_image(&mut pctx, handle, 2.0);
    assert!(blur_result.is_ok());

    // The horizontal pass mid_texture should have been released back to the pool:
    assert_eq!(pctx.texture_pool.available_count(), 1);
    assert_eq!(pctx.texture_pool.count_for_key(32, 32), 1);

    // When removing the blurred image result, it should also return its texture to the pool:
    let blur_handle = blur_result.unwrap();
    remove_temp_image(&mut pctx, blur_handle);
    assert_eq!(pctx.texture_pool.available_count(), 2);
}
