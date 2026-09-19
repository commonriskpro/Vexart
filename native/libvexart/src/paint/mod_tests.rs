use super::*;
use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
use crate::ffi::panic::ERR_INVALID_ARG;
#[cfg(feature = "gpu-tests")]
use crate::ffi::panic::OK;

/// Helper: build a minimal graph buffer for a single command.
fn make_graph_buf(cmd_kind: u16, payload: &[u8]) -> Vec<u8> {
    let cmd_prefix_size = 8usize;
    let total_payload = cmd_prefix_size + payload.len();

    let mut buf = vec![0u8; 16 + total_payload];
    // Header
    buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    buf[8..12].copy_from_slice(&1u32.to_le_bytes()); // cmd_count = 1
    buf[12..16].copy_from_slice(&(total_payload as u32).to_le_bytes());
    // Command prefix at offset 16
    buf[16..18].copy_from_slice(&cmd_kind.to_le_bytes());
    buf[18..20].copy_from_slice(&0u16.to_le_bytes()); // flags = 0
    buf[20..24].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    // Payload
    buf[24..24 + payload.len()].copy_from_slice(payload);
    buf
}

#[test]
fn test_dispatch_prohibits_image_cmd_kinds_9_and_10() {
    let mut ctx = PaintContext::new();

    // cmd_kind 9 (image)
    let payload9 = vec![0u8; std::mem::size_of::<instances::BridgeImageInstance>()];
    let buf9 = make_graph_buf(9, &payload9);
    assert_eq!(ctx.dispatch(0, &buf9, std::ptr::null_mut()), ERR_INVALID_ARG);

    let len = crate::ffi::error::vexart_get_last_error_length();
    assert!(len > 0);
    let mut err_buf = vec![0u8; len as usize];
    let copied = crate::ffi::error::vexart_copy_last_error(err_buf.as_mut_ptr(), len);
    assert_eq!(copied, len);
    let err_msg = std::str::from_utf8(&err_buf).expect("valid utf-8 error message");
    assert_eq!(
        err_msg,
        "paint_dispatch: image commands (kinds 9, 10) are prohibited in geometry paint graph; use composite image layers (vexart_composite_render_image_layer)"
    );

    // cmd_kind 10 (image_transform)
    let payload10 = vec![0u8; std::mem::size_of::<instances::BridgeImageTransformInstance>()];
    let buf10 = make_graph_buf(10, &payload10);
    assert_eq!(ctx.dispatch(0, &buf10, std::ptr::null_mut()), ERR_INVALID_ARG);
}

#[test]
fn test_dispatch_prohibits_image_command_in_multi_command_graph() {
    let mut ctx = PaintContext::new();

    let rect_size = std::mem::size_of::<instances::BridgeRectInstance>();
    let img_size = std::mem::size_of::<instances::BridgeImageInstance>();
    let total_payload = (8 + rect_size) + (8 + img_size);
    let mut buf = vec![0u8; 16 + total_payload];

    // Header
    buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    buf[8..12].copy_from_slice(&2u32.to_le_bytes()); // cmd_count = 2
    buf[12..16].copy_from_slice(&(total_payload as u32).to_le_bytes());

    let mut off = 16usize;
    // Cmd 1: Rect (kind 0)
    buf[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
    buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());
    off += 8 + rect_size;

    // Cmd 2: Image (kind 9)
    buf[off..off + 2].copy_from_slice(&9u16.to_le_bytes());
    buf[off + 4..off + 8].copy_from_slice(&(img_size as u32).to_le_bytes());

    let result = ctx.dispatch(0, &buf, std::ptr::null_mut());
    assert_eq!(result, ERR_INVALID_ARG);
}

// ─── Slice 5a test ──────────────────────────────────────────────────────

#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_single_rect_returns_ok() {
    // Build a minimal graph buffer with 1 rect command (cmd_kind = 0).
    let instance_size = std::mem::size_of::<instances::BridgeRectInstance>();
    let payload = vec![0u8; instance_size];
    let buf = make_graph_buf(0, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(result, OK);
}

// ─── Slice 5b tests ─────────────────────────────────────────────────────

/// 5b.6: gradient_conic visual smoke test.
/// Dispatch a full-span 360° conic gradient (red→blue) over a 32×32 target.
/// The pipeline must not panic and dispatch must return OK.
/// Visual correctness (purple midpoint) is verified via the pixel at (16,0)
/// in the rendered texture but requires readback — for this smoke test
/// we verify only that dispatch succeeds.
#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_gradient_conic_returns_ok() {
    let instance = instances::ConicGradientInstance {
        // Full NDC rect (-1,-1)→(2,2) spanning the whole 32×32 target.
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        box_w: 32.0,
        box_h: 32.0,
        radius: 0.0,
        _pad0: 0.0,
        // from_color = red (1,0,0,1)
        from_r: 1.0,
        from_g: 0.0,
        from_b: 0.0,
        from_a: 1.0,
        // to_color = blue (0,0,1,1)
        to_r: 0.0,
        to_g: 0.0,
        to_b: 1.0,
        to_a: 1.0,
        start_angle: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
        _pad3: 0.0,
    };
    let payload = bytemuck::bytes_of(&instance).to_vec();
    let buf = make_graph_buf(14, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(result, OK, "gradient_conic dispatch should return OK");
}

/// 5b.7: backdrop_blur — uniform-color preservation.
/// A uniform solid color under box blur stays the same colour.
/// We verify dispatch returns OK (readback would confirm colour preservation).
#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_backdrop_blur_returns_ok() {
    let instance = instances::BackdropBlurInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        blur_radius: 4.0,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    let payload = bytemuck::bytes_of(&instance).to_vec();
    let buf = make_graph_buf(15, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(result, OK, "backdrop_blur dispatch should return OK");
}

/// 5b.8: backdrop_filter brightness and invert correctness.
/// Dispatch with brightness=50 and then with invert=100 — both must return OK.
#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_backdrop_filter_brightness_returns_ok() {
    let instance = instances::BackdropFilterInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        brightness: 50.0, // 50% brightness
        contrast: 100.0,  // identity
        saturate: 100.0,  // identity
        grayscale: 0.0,   // identity
        invert: 0.0,      // identity
        sepia: 0.0,       // identity
        hue_rotate_deg: 0.0,
        _pad: 0.0,
    };
    let payload = bytemuck::bytes_of(&instance).to_vec();
    let buf = make_graph_buf(16, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(
        result, OK,
        "backdrop_filter brightness dispatch should return OK"
    );
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_backdrop_filter_invert_returns_ok() {
    let instance = instances::BackdropFilterInstance {
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        brightness: 100.0, // identity
        contrast: 100.0,   // identity
        saturate: 100.0,   // identity
        grayscale: 0.0,    // identity
        invert: 100.0,     // full invert
        sepia: 0.0,
        hue_rotate_deg: 0.0,
        _pad: 0.0,
    };
    let payload = bytemuck::bytes_of(&instance).to_vec();
    let buf = make_graph_buf(16, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(
        result, OK,
        "backdrop_filter invert dispatch should return OK"
    );
}

/// 5b.9: image_mask corner alpha cut.
/// Dispatch image_mask with radius_uniform=10 over a 40×40 mask rect.
/// The pipeline must not panic and dispatch returns OK.
#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_image_mask_returns_ok() {
    let instance = instances::ImageMaskInstance {
        // Source image NDC rect: full target
        x: -1.0,
        y: -1.0,
        w: 2.0,
        h: 2.0,
        // Mask region: center 40×40 px (on a 64×64 target → NDC ~[-0.625, -0.625] 1.25×1.25)
        mask_x: -0.625,
        mask_y: -0.625,
        mask_w: 1.25,
        mask_h: 1.25,
        radius_uniform: 10.0,
        radius_tl: 0.0,
        radius_tr: 0.0,
        radius_br: 0.0,
        radius_bl: 0.0,
        mode: 0.0, // uniform
        _pad0: 0.0,
        _pad1: 0.0,
    };
    let payload = bytemuck::bytes_of(&instance).to_vec();
    let buf = make_graph_buf(17, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(result, OK, "image_mask dispatch should return OK");
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_shadow_returns_ok() {
    let instance = instances::BridgeShadowInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        color_r: 0.0,
        color_g: 0.0,
        color_b: 0.0,
        color_a: 0.4,
        radius_tl: 16.0,
        radius_tr: 16.0,
        radius_br: 16.0,
        radius_bl: 16.0,
        box_w: 64.0,
        box_h: 32.0,
        offset_x: 0.0,
        offset_y: 6.0,
        blur: 12.0,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    let payload = bytemuck::bytes_of(&instance).to_vec();
    let buf = make_graph_buf(20, &payload);

    let mut ctx = PaintContext::new();
    let result = ctx.dispatch(1, &buf, std::ptr::null_mut());
    assert_eq!(result, OK, "shadow dispatch should return OK");
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_vertex_buffer_alloc_expansion_and_cooldown_decay() {
    let mut ctx = PaintContext::new();

    // 1. Verify initial state
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);
    assert_eq!(ctx.vertex_buffer_offset, 0);
    assert_eq!(ctx.vertex_buffer_idle_frames, 0);
    assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 0);

    // 2. Normal allocation under base capacity
    let off0 = ctx.alloc_vertex_space(100);
    assert_eq!(off0, 0);
    assert_eq!(ctx.vertex_buffer_offset, 100);
    assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 100);

    // Second allocation: aligns to 16 bytes (100 -> 112)
    let off1 = ctx.alloc_vertex_space(200);
    assert_eq!(off1, 112);
    assert_eq!(ctx.vertex_buffer_offset, 312);
    assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 312);
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);

    // Complete normal frame
    ctx.on_frame_complete();
    assert_eq!(ctx.vertex_buffer_offset, 0);
    assert_eq!(ctx.vertex_buffer_peak_frame_bytes, 0);
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);
    assert_eq!(ctx.vertex_buffer_idle_frames, 0);

    // 3. Elastic expansion: exceed base capacity
    let big_size = BASE_VERTEX_BUFFER_CAPACITY + 1024;
    let big_off = ctx.alloc_vertex_space(big_size);
    assert_eq!(big_off, 0);
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
    assert_eq!(ctx.vertex_buffer_peak_frame_bytes, big_size);

    // Frame complete with peak exceeding base capacity -> idle_frames remains 0
    ctx.on_frame_complete();
    assert_eq!(ctx.vertex_buffer_offset, 0);
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
    assert_eq!(ctx.vertex_buffer_idle_frames, 0);

    // 4. Cooldown decay: run 119 frames under base capacity
    for frame in 1..VERTEX_BUFFER_COOLDOWN_FRAMES {
        let off = ctx.alloc_vertex_space(512);
        assert_eq!(off, 0);
        ctx.on_frame_complete();
        assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
        assert_eq!(ctx.vertex_buffer_idle_frames, frame);
    }

    // Frame 120 (reaches VERTEX_BUFFER_COOLDOWN_FRAMES) -> triggers cooldown decay back to base!
    let off = ctx.alloc_vertex_space(512);
    assert_eq!(off, 0);
    ctx.on_frame_complete();
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY);
    assert_eq!(ctx.vertex_buffer_idle_frames, 0);
    assert_eq!(ctx.vertex_buffer_offset, 0);
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_vertex_buffer_hysteresis_resets_on_spike() {
    let mut ctx = PaintContext::new();

    // Expand to 4MB
    ctx.alloc_vertex_space(BASE_VERTEX_BUFFER_CAPACITY + 1024);
    ctx.on_frame_complete();
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);

    // 10 idle frames
    for _ in 0..10 {
        ctx.alloc_vertex_space(64);
        ctx.on_frame_complete();
    }
    assert_eq!(ctx.vertex_buffer_idle_frames, 10);

    // Spike frame exceeding base capacity resets idle counter
    ctx.alloc_vertex_space(BASE_VERTEX_BUFFER_CAPACITY + 512);
    ctx.on_frame_complete();
    assert_eq!(ctx.vertex_buffer_capacity, BASE_VERTEX_BUFFER_CAPACITY * 2);
    assert_eq!(ctx.vertex_buffer_idle_frames, 0);
}

#[cfg(feature = "gpu-tests")]
#[test]
fn nested_layer_submission_should_preserve_pending_vertex_allocations() {
    let mut ctx = PaintContext::new();
    let mut outer = 0;
    let mut inner = 0;
    assert_eq!(crate::composite::target_create(&mut ctx, 64, 64, &mut outer), OK);
    assert_eq!(crate::composite::target_create(&mut ctx, 64, 64, &mut inner), OK);
    assert_eq!(crate::composite::target_begin_layer(&mut ctx, outer, 0, 0), OK);
    let red = instances::BridgeRectInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        r: 1.0,
        a: 1.0,
        ..Default::default()
    };
    let graph = make_graph_buf(0, bytemuck::bytes_of(&red));
    assert_eq!(ctx.dispatch(outer, &graph, std::ptr::null_mut()), OK);
    assert_eq!(crate::composite::target_begin_layer(&mut ctx, inner, 0, 0), OK);
    assert_eq!(ctx.dispatch(inner, &graph, std::ptr::null_mut()), OK);
    assert_eq!(crate::composite::target_end_layer(&mut ctx, inner), OK);
    // A later upload must not overwrite the unsubmitted red background.
    let blue = instances::BridgeRectInstance {
        x: 0.0,
        w: 1.0,
        r: 0.0,
        b: 1.0,
        ..red
    };
    let graph = make_graph_buf(0, bytemuck::bytes_of(&blue));
    // Standalone submissions also must preserve the pending parent ranges.
    assert_eq!(ctx.dispatch(inner, &graph, std::ptr::null_mut()), OK);
    assert_eq!(ctx.dispatch(outer, &graph, std::ptr::null_mut()), OK);
    assert_eq!(crate::composite::target_end_layer(&mut ctx, outer), OK);
    assert_eq!(ctx.vertex_buffer_offset, 0);
    let mut pixels = vec![0; 64 * 64 * 4];
    assert_eq!(
        crate::composite::readback_rgba(
            &mut ctx,
            outer,
            pixels.as_mut_ptr(),
            pixels.len() as u32,
            std::ptr::null_mut()
        ),
        OK
    );
    let left = (32 * 64 + 16) * 4;
    let right = (32 * 64 + 48) * 4;
    assert_eq!(&pixels[left..left + 4], &[255, 0, 0, 255]);
    assert_eq!(&pixels[right..right + 4], &[0, 0, 255, 255]);
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_dispatch_multi_batch_pipeline_switching_and_ring_reset() {
    let mut ctx = PaintContext::new();

    // Build a multi-command graph: 1 rect (kind 0) + 1 circle (kind 3) + 1 rect (kind 0)
    let rect_size = std::mem::size_of::<instances::BridgeRectInstance>();
    let circle_size = std::mem::size_of::<instances::BridgeCircleInstance>();

    let total_payload = (8 + rect_size) + (8 + circle_size) + (8 + rect_size);
    let mut buf = vec![0u8; 16 + total_payload];

    // Header
    buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    buf[8..12].copy_from_slice(&3u32.to_le_bytes()); // cmd_count = 3
    buf[12..16].copy_from_slice(&(total_payload as u32).to_le_bytes());

    let mut off = 16usize;
    // Cmd 1: Rect (kind 0)
    buf[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
    buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());
    off += 8 + rect_size;

    // Cmd 2: Circle (kind 3)
    buf[off..off + 2].copy_from_slice(&3u16.to_le_bytes());
    buf[off + 4..off + 8].copy_from_slice(&(circle_size as u32).to_le_bytes());
    off += 8 + circle_size;

    // Cmd 3: Rect (kind 0)
    buf[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
    buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());

    let mut stats = FrameStats::default();
    let result = ctx.dispatch(0, &buf, &mut stats);

    assert_eq!(result, OK);
    assert_eq!(stats.draw_calls, 3);
    assert_eq!(stats.primitives, 3);
    // Offset must be reset to 0 by on_frame_complete() in standalone dispatch
    assert_eq!(ctx.vertex_buffer_offset, 0);
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_persistent_render_pass_across_layer_dispatches() {
    let mut ctx = PaintContext::new();
    let mut target = 0u64;
    assert_eq!(crate::composite::target_create(&mut ctx, 64, 64, &mut target), OK);

    // 1. Begin layer: encoder is created, pass starts as None
    assert_eq!(crate::composite::target_begin_layer(&mut ctx, target, 0, 0x00000000), OK);
    {
        let rec = ctx.targets.get(target).unwrap();
        let layer = rec.active_layer.as_ref().unwrap();
        assert!(layer.pass.is_none(), "Render pass must start as None (lazy creation)");
        assert!(layer.first_pass, "first_pass flag must be true initially");
    }

    // 2. Dispatch 1: Red rect covering left half (x=-1.0, y=1.0, w=1.0, h=-2.0)
    let red_rect = instances::BridgeRectInstance {
        x: -1.0,
        y: 1.0,
        w: 1.0,
        h: -2.0,
        r: 1.0,
        g: 0.0,
        b: 0.0,
        a: 1.0,
        ..Default::default()
    };
    let graph1 = make_graph_buf(0, bytemuck::bytes_of(&red_rect));
    let mut stats1 = FrameStats::default();
    assert_eq!(ctx.dispatch(target, &graph1, &mut stats1), OK);
    assert_eq!(stats1.draw_calls, 1);
    assert_eq!(stats1.primitives, 1);

    // Verify pass is now Some (lazily created) and first_pass is false
    {
        let rec = ctx.targets.get(target).unwrap();
        let layer = rec.active_layer.as_ref().unwrap();
        assert!(layer.pass.is_some(), "Render pass must be Some after first dispatch");
        assert!(!layer.first_pass, "first_pass must be false after first pass creation");
    }

    // 3. Dynamic scissor update on active layer
    assert_eq!(
        crate::composite::target_set_scissor(&mut ctx, target, 32, 0, 32, 64),
        OK
    );

    // 4. Dispatch 2: Green rect covering full NDC (-1.0, 1.0, 2.0, -2.0)
    // With scissor (32..64, 0..64), only the right half will receive green!
    let green_rect = instances::BridgeRectInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        r: 0.0,
        g: 1.0,
        b: 0.0,
        a: 1.0,
        ..Default::default()
    };
    let graph2 = make_graph_buf(0, bytemuck::bytes_of(&green_rect));
    let mut stats2 = FrameStats::default();
    assert_eq!(ctx.dispatch(target, &graph2, &mut stats2), OK);
    assert_eq!(stats2.draw_calls, 1);
    assert_eq!(stats2.primitives, 1);

    // Verify pass is STILL Some (reused without dropping)
    {
        let rec = ctx.targets.get(target).unwrap();
        let layer = rec.active_layer.as_ref().unwrap();
        assert!(layer.pass.is_some(), "Render pass must persist across dispatches");
    }

    // 5. Reset scissor
    assert_eq!(crate::composite::target_reset_scissor(&mut ctx, target), OK);

    // 6. End layer: explicitly drops pass, finishes encoder, submits to queue
    assert_eq!(crate::composite::target_end_layer(&mut ctx, target), OK);

    // Verify active layer is cleared
    {
        let rec = ctx.targets.get(target).unwrap();
        assert!(rec.active_layer.is_none(), "active_layer must be None after end_layer");
    }

    // 7. Readback and verify pixel contents:
    // Left half (16, 32) must be pure red (255, 0, 0, 255)
    // Right half (48, 32) must be pure green (0, 255, 0, 255)
    let mut pixels = vec![0u8; 64 * 64 * 4];
    assert_eq!(
        crate::composite::readback_rgba(
            &mut ctx,
            target,
            pixels.as_mut_ptr(),
            pixels.len() as u32,
            std::ptr::null_mut()
        ),
        OK
    );
    let left_pixel_idx = (32 * 64 + 16) * 4;
    let right_pixel_idx = (32 * 64 + 48) * 4;
    assert_eq!(&pixels[left_pixel_idx..left_pixel_idx + 4], &[255, 0, 0, 255]);
    assert_eq!(&pixels[right_pixel_idx..right_pixel_idx + 4], &[0, 255, 0, 255]);
}

#[test]
fn test_pruned_nebula_and_starfield_stride() {
    // Kinds 7 (nebula) and 8 (starfield) have been pruned and must return stride 0.
    assert_eq!(instance_stride_for_kind(7), 0);
    assert_eq!(instance_stride_for_kind(8), 0);
}

#[test]
fn test_lazy_pipelines_cold_start() {
    let ctx = PaintContext::new();

    // Verify that all 4 lazy pipelines are initially uncompiled (None)
    assert!(ctx.wgpu.pipelines.circle.get().is_none());
    assert!(ctx.wgpu.pipelines.polygon.get().is_none());
    assert!(ctx.wgpu.pipelines.bezier.get().is_none());
    assert!(ctx.wgpu.pipelines.gradient_conic.get().is_none());

    // Access circle lazily
    let circle_pipeline = ctx.wgpu.pipelines.get_circle(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(ctx.wgpu.pipelines.circle.get().is_some());

    // Second access returns the same pointer
    let circle_pipeline_again = ctx.wgpu.pipelines.get_circle(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(std::ptr::eq(circle_pipeline, circle_pipeline_again));

    // Access polygon lazily
    let poly_pipeline = ctx.wgpu.pipelines.get_polygon(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(ctx.wgpu.pipelines.polygon.get().is_some());
    let poly_pipeline_again = ctx.wgpu.pipelines.get_polygon(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(std::ptr::eq(poly_pipeline, poly_pipeline_again));

    // Access bezier lazily
    let bezier_pipeline = ctx.wgpu.pipelines.get_bezier(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(ctx.wgpu.pipelines.bezier.get().is_some());
    let bezier_pipeline_again = ctx.wgpu.pipelines.get_bezier(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(std::ptr::eq(bezier_pipeline, bezier_pipeline_again));

    // Access gradient_conic lazily
    let conic_pipeline = ctx.wgpu.pipelines.get_gradient_conic(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(ctx.wgpu.pipelines.gradient_conic.get().is_some());
    let conic_pipeline_again = ctx.wgpu.pipelines.get_gradient_conic(
        &ctx.wgpu.device,
        wgpu::TextureFormat::Rgba8Unorm,
        None,
    );
    assert!(std::ptr::eq(conic_pipeline, conic_pipeline_again));
}

#[test]
fn test_instream_scissor_stride() {
    assert_eq!(instance_stride_for_kind(CMD_SCISSOR_SET), 16);
}

#[test]
fn test_instream_scissor_dispatch_lifecycle() {
    let mut ctx = PaintContext::new();
    let mut target = 0u64;
    assert_eq!(crate::composite::target_create(&mut ctx, 64, 64, &mut target), OK);
    assert_eq!(crate::composite::target_begin_layer(&mut ctx, target, 0, 0), OK);

    // Build a multi-command graph:
    // 1. Rect: full red
    // 2. Scissor: (32, 0, 32, 64)
    // 3. Rect: full green
    // 4. Scissor reset: (0, 0, 0, 0)
    let rect_size = std::mem::size_of::<instances::BridgeShapeRectInstance>();
    let scissor_size = 16usize;
    let total_payload = (8 + rect_size) + (8 + scissor_size) + (8 + rect_size) + (8 + scissor_size);
    let mut buf = vec![0u8; 16 + total_payload];

    buf[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    buf[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    buf[8..12].copy_from_slice(&4u32.to_le_bytes()); // cmd_count = 4
    buf[12..16].copy_from_slice(&(total_payload as u32).to_le_bytes());

    let mut off = 16usize;

    // Cmd 1: ShapeRect red
    let red_rect = instances::BridgeShapeRectInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        fill_r: 1.0,
        fill_g: 0.0,
        fill_b: 0.0,
        fill_a: 1.0,
        has_fill: 1.0,
        ..Default::default()
    };
    buf[off..off + 2].copy_from_slice(&1u16.to_le_bytes()); // cmd_kind = 1
    buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());
    buf[off + 8..off + 8 + rect_size].copy_from_slice(bytemuck::bytes_of(&red_rect));
    off += 8 + rect_size;

    // Cmd 2: Scissor (32, 0, 32, 64)
    buf[off..off + 2].copy_from_slice(&21u16.to_le_bytes()); // cmd_kind = 21
    buf[off + 4..off + 8].copy_from_slice(&(scissor_size as u32).to_le_bytes());
    buf[off + 8..off + 12].copy_from_slice(&32u32.to_le_bytes());
    buf[off + 12..off + 16].copy_from_slice(&0u32.to_le_bytes());
    buf[off + 16..off + 20].copy_from_slice(&32u32.to_le_bytes());
    buf[off + 20..off + 24].copy_from_slice(&64u32.to_le_bytes());
    off += 8 + scissor_size;

    // Cmd 3: ShapeRect green
    let green_rect = instances::BridgeShapeRectInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        fill_r: 0.0,
        fill_g: 1.0,
        fill_b: 0.0,
        fill_a: 1.0,
        has_fill: 1.0,
        ..Default::default()
    };
    buf[off..off + 2].copy_from_slice(&1u16.to_le_bytes()); // cmd_kind = 1
    buf[off + 4..off + 8].copy_from_slice(&(rect_size as u32).to_le_bytes());
    buf[off + 8..off + 8 + rect_size].copy_from_slice(bytemuck::bytes_of(&green_rect));
    off += 8 + rect_size;

    // Cmd 4: Reset scissor (0, 0, 0, 0)
    buf[off..off + 2].copy_from_slice(&21u16.to_le_bytes()); // cmd_kind = 21
    buf[off + 4..off + 8].copy_from_slice(&(scissor_size as u32).to_le_bytes());
    buf[off + 8..off + 12].copy_from_slice(&0u32.to_le_bytes());
    buf[off + 12..off + 16].copy_from_slice(&0u32.to_le_bytes());
    buf[off + 16..off + 20].copy_from_slice(&0u32.to_le_bytes());
    buf[off + 20..off + 24].copy_from_slice(&0u32.to_le_bytes());

    let mut stats = FrameStats::default();
    assert_eq!(ctx.dispatch(target, &buf, &mut stats), OK);
    assert_eq!(stats.draw_calls, 2);
    assert_eq!(stats.primitives, 2);

    assert_eq!(crate::composite::target_end_layer(&mut ctx, target), OK);

    let mut pixels = vec![0u8; 64 * 64 * 4];
    assert_eq!(
        crate::composite::readback_rgba(
            &mut ctx,
            target,
            pixels.as_mut_ptr(),
            pixels.len() as u32,
            std::ptr::null_mut()
        ),
        OK
    );

    // Left half (16, 32) must be red (255, 0, 0, 255)
    let left_pixel_idx = (32 * 64 + 16) * 4;
    assert_eq!(&pixels[left_pixel_idx..left_pixel_idx + 4], &[255, 0, 0, 255]);

    // Right half (48, 32) must be green (0, 255, 0, 255)
    let right_pixel_idx = (32 * 64 + 48) * 4;
    assert_eq!(&pixels[right_pixel_idx..right_pixel_idx + 4], &[0, 255, 0, 255]);

    assert_eq!(crate::composite::target_destroy(&mut ctx, target), OK);
}
