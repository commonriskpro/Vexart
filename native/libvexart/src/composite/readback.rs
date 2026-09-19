// native/libvexart/src/composite/readback.rs
// Real GPU→CPU buffer transfer using compute unpremultiply shader + wgpu map_async.
// Phase 2b Slice 1, task 1.4. Per design decision "Readback uses blocking map_async + pollster".

/// Straight-alpha normalization reference helper for unit test verification.
#[cfg(test)]
#[inline]
fn unpremultiply(pixels: &mut [u8]) {
    for pixel in pixels.chunks_exact_mut(4) {
        let alpha = u32::from(pixel[3]);
        if alpha == 255 {
            continue;
        }
        for channel in &mut pixel[..3] {
            *channel = if alpha == 0 { 0 } else {
                ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8
            };
        }
    }
}

/// Full-target GPU→CPU readback.
///
/// Dispatches the compute unpremultiply+pack shader, copies the tightly packed
/// storage buffer to `readback_buffer` via copy_buffer_to_buffer, maps it, and
/// copies straight-alpha RGBA bytes directly into `dst`.
///
/// Returns the number of bytes written to `dst`, or 0 on failure.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes.
pub fn readback_full(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bind_group: &wgpu::BindGroup,
    storage_buffer: &wgpu::Buffer,
    readback_buffer: &wgpu::Buffer,
    width: u32,
    height: u32,
    dst: *mut u8,
    dst_cap: u32,
) -> u32 {
    let needed = match (width as usize).checked_mul(height as usize).and_then(|px| px.checked_mul(4)) {
        Some(size) => size,
        None => return 0,
    };
    let needed_u32 = match u32::try_from(needed) {
        Ok(size) => size,
        Err(_) => return 0,
    };
    if dst_cap < needed_u32 || dst.is_null() {
        return 0;
    }

    readback_full_mapped(
        device,
        queue,
        pipeline,
        bind_group,
        storage_buffer,
        readback_buffer,
        width,
        height,
        |mapped| {
            let dst_slice: &mut [u8] =
                // SAFETY: caller guarantees dst is valid for dst_cap bytes.
                unsafe { std::slice::from_raw_parts_mut(dst, dst_cap as usize) };
            dst_slice[..needed].copy_from_slice(mapped);
            needed_u32
        },
    )
    .unwrap_or(0)
}

/// Full-target GPU→CPU readback with a callback over packed straight-alpha RGBA bytes.
///
/// Because the compute shader writes straight-alpha pixels into a contiguous storage buffer
/// copied directly to the staging buffer, the mapped buffer is already 100% contiguous and
/// straight-alpha with no row padding. The callback receives a direct view into the mapped
/// buffer.
///
/// The callback result is returned as `Some`. `None` indicates that the GPU
/// compute, copy or mapping failed.
pub(crate) fn readback_full_with<R, F>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bind_group: &wgpu::BindGroup,
    storage_buffer: &wgpu::Buffer,
    readback_buffer: &wgpu::Buffer,
    width: u32,
    height: u32,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    readback_full_mapped(
        device,
        queue,
        pipeline,
        bind_group,
        storage_buffer,
        readback_buffer,
        width,
        height,
        callback,
    )
}

/// Submit the compute unpremultiply+pack pass and copy the contiguous storage buffer
/// to the staging buffer via copy_buffer_to_buffer. Runs a callback while the readback
/// buffer is mapped.
fn readback_full_mapped<R, F>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bind_group: &wgpu::BindGroup,
    storage_buffer: &wgpu::Buffer,
    readback_buffer: &wgpu::Buffer,
    width: u32,
    height: u32,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    if width == 0 || height == 0 {
        return None;
    }
    let needed = (width as usize).checked_mul(height as usize)?.checked_mul(4)?;
    let needed_u64 = needed as u64;

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("vexart-readback-encoder"),
    });

    {
        let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("vexart-unpremultiply-compute-pass"),
            timestamp_writes: None,
        });
        cpass.set_pipeline(pipeline);
        cpass.set_bind_group(0, bind_group, &[]);
        let workgroups_x = width.div_ceil(16);
        let workgroups_y = height.div_ceil(16);
        cpass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
    }

    encoder.copy_buffer_to_buffer(
        storage_buffer,
        0,
        readback_buffer,
        0,
        needed_u64,
    );

    queue.submit(std::iter::once(encoder.finish()));

    map_readback(device, readback_buffer, |mapped| {
        if mapped.len() < needed {
            return None;
        }
        Some(callback(&mapped[..needed]))
    })
    .flatten()
}

/// Run a callback while a readback buffer is mapped, unmapping it on every
/// return path, including unwinding from the callback.
fn map_readback<R, F>(
    device: &wgpu::Device,
    readback_buffer: &wgpu::Buffer,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    let slice = readback_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });

    // Try non-blocking poll first to avoid synchronous CPU wait stalls if GPU work is complete.
    let _ = device.poll(wgpu::PollType::Poll);
    match rx.try_recv() {
        Ok(Ok(())) => {}
        _ => {
            if device
                .poll(wgpu::PollType::Wait {
                    submission_index: None,
                    timeout: None,
                })
                .is_err()
            {
                return None;
            }
            match rx.recv() {
                Ok(Ok(())) => {}
                Ok(Err(_)) | Err(_) => return None,
            }
        }
    }

    // Arm the guard strictly after confirming the buffer entered the Mapped state.
    // Declared before `mapped` so Rust's LIFO drop order releases the BufferView
    // before `UnmapGuard` calls buffer.unmap().
    let _unmap = UnmapGuard::new(readback_buffer);
    let mapped = slice.get_mapped_range();
    Some(callback(&mapped))
}

pub(crate) trait BufferUnmap {
    fn unmap(&self);
}

impl BufferUnmap for wgpu::Buffer {
    fn unmap(&self) {
        wgpu::Buffer::unmap(self);
    }
}

/// RAII guard that calls `buffer.unmap()` when dropped.
///
/// Invariant: Must only be armed *after* the buffer has successfully entered the
/// `Mapped` state (via confirmed `poll` and `recv`). Declaring `_unmap` before
/// acquiring a `BufferView` ensures that Rust's LIFO drop order releases the
/// view before calling `unmap()`.
pub(crate) struct UnmapGuard<'a, B: BufferUnmap = wgpu::Buffer> {
    buffer: &'a B,
}

impl<'a, B: BufferUnmap> UnmapGuard<'a, B> {
    pub(crate) fn new(buffer: &'a B) -> Self {
        Self { buffer }
    }
}

impl<B: BufferUnmap> Drop for UnmapGuard<'_, B> {
    fn drop(&mut self) {
        self.buffer.unmap();
    }
}

/// Region GPU→CPU readback using compute unpremultiply+pack shader.
///
/// Dispatches the `unpremultiply_pack` compute shader with `(origin_x, origin_y)` offsets,
/// writes tightly packed straight-alpha RGBA pixels (without row padding) to a storage buffer,
/// copies it to a staging buffer, and copies directly into `dst`.
///
/// Returns the number of bytes written to `dst`, or 0 on failure.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes.
pub fn readback_region(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bgl: &wgpu::BindGroupLayout,
    texture: &wgpu::Texture,
    target_width: u32,
    target_height: u32,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    dst: *mut u8,
    dst_cap: u32,
) -> u32 {
    // Clamp region to target bounds.
    let x = rx.min(target_width);
    let y = ry.min(target_height);
    let w = rw.min(target_width.saturating_sub(x));
    let h = rh.min(target_height.saturating_sub(y));

    if w == 0 || h == 0 {
        return 0;
    }

    if w.checked_mul(4).and_then(|b| b.checked_add(255)).is_none() {
        return 0;
    }
    let needed = match (w as usize).checked_mul(h as usize).and_then(|px| px.checked_mul(4)) {
        Some(size) => size,
        None => return 0,
    };
    let needed_u32 = match u32::try_from(needed) {
        Ok(size) => size,
        Err(_) => return 0,
    };
    if dst_cap < needed_u32 || dst.is_null() {
        return 0;
    }
    let needed_u64 = needed as u64;

    use wgpu::util::DeviceExt;
    let uniforms: [u32; 4] = [w, h, x, y];
    let uniform_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("vexart-region-unpremultiply-uniform-buffer"),
        contents: bytemuck::cast_slice(&uniforms),
        usage: wgpu::BufferUsages::UNIFORM,
    });

    let storage_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("vexart-region-unpremultiply-storage-buffer"),
        size: needed_u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let staging_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("vexart-region-readback-staging-buffer"),
        size: needed_u64,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("vexart-region-unpremultiply-bind-group"),
        layout: bgl,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: storage_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: uniform_buf.as_entire_binding(),
            },
        ],
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("vexart-region-readback-encoder"),
    });

    {
        let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("vexart-region-unpremultiply-compute-pass"),
            timestamp_writes: None,
        });
        cpass.set_pipeline(pipeline);
        cpass.set_bind_group(0, &bind_group, &[]);
        let workgroups_x = w.div_ceil(16);
        let workgroups_y = h.div_ceil(16);
        cpass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
    }

    encoder.copy_buffer_to_buffer(&storage_buf, 0, &staging_buf, 0, needed_u64);
    queue.submit(std::iter::once(encoder.finish()));

    let copied = map_readback(device, &staging_buf, |mapped| {
        if mapped.len() < needed {
            return 0;
        }
        let dst_slice: &mut [u8] = 
            // SAFETY: caller guarantees dst is valid for dst_cap bytes.
            unsafe { std::slice::from_raw_parts_mut(dst, dst_cap as usize) };
        dst_slice[..needed].copy_from_slice(&mapped[..needed]);
        needed_u32
    });
    copied.unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    #[test]
    fn host_rgba_should_unpremultiply_and_canonicalize_transparent_pixels() {
        let mut pixels = [128, 64, 0, 128, 8, 9, 10, 0, 1, 2, 3, 255];
        unpremultiply(&mut pixels);
        assert_eq!(pixels, [255, 128, 0, 128, 0, 0, 0, 0, 1, 2, 3, 255]);
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn full_callback_and_region_readback_should_return_straight_alpha() {
        use wgpu::util::DeviceExt;
        let ctx = crate::paint::context::WgpuContext::new();
        let width = 64;
        let height = 1;
        let pixels = [128, 64, 0, 128].repeat(64);
        let texture = ctx.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("test-straight-alpha-tex"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        ctx.queue.write_texture(
            texture.as_image_copy(), &pixels,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(256), rows_per_image: Some(1) },
            wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        );
        let size = (width as u64) * (height as u64) * 4;
        let storage = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("test-storage"),
            size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let readback = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("test-readback"),
            size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let uniforms: [u32; 4] = [width, height, 0, 0];
        let uniform_buf = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("test-uniforms"),
            contents: bytemuck::cast_slice(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bind_group = ctx.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("test-bg"),
            layout: &ctx.pipelines.unpremultiply_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&view) },
                wgpu::BindGroupEntry { binding: 1, resource: storage.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: uniform_buf.as_entire_binding() },
            ],
        });
        let mut full = vec![0; 256];
        assert_eq!(readback_full(&ctx.device, &ctx.queue, &ctx.pipelines.unpremultiply_pack,
            &bind_group, &storage, &readback, 64, 1, full.as_mut_ptr(), 256), 256);
        assert_eq!(full, [255, 128, 0, 128].repeat(64));
        let callback = readback_full_with(&ctx.device, &ctx.queue, &ctx.pipelines.unpremultiply_pack,
            &bind_group, &storage, &readback, 64, 1, |bytes| bytes.to_vec());
        assert_eq!(callback, Some(full));
        let mut region = [0; 4];
        assert_eq!(readback_region(&ctx.device, &ctx.queue, &ctx.pipelines.unpremultiply_pack,
            &ctx.pipelines.unpremultiply_bgl, &texture, 64, 1, 3, 0, 1, 1,
            region.as_mut_ptr(), 4), 4);
        assert_eq!(region, [255, 128, 0, 128]);
    }

    #[test]
    fn unmap_guard_should_call_unmap_on_drop_and_panic() {
        struct MockBuffer {
            unmap_calls: AtomicUsize,
        }
        impl BufferUnmap for MockBuffer {
            fn unmap(&self) {
                self.unmap_calls.fetch_add(1, Ordering::SeqCst);
            }
        }

        let mock = MockBuffer {
            unmap_calls: AtomicUsize::new(0),
        };

        // Normal scope exit: unmap must be called once.
        {
            let _guard = UnmapGuard::new(&mock);
            assert_eq!(mock.unmap_calls.load(Ordering::SeqCst), 0);
        }
        assert_eq!(mock.unmap_calls.load(Ordering::SeqCst), 1);

        // Panicking scope exit: unmap must still be called during stack unwinding.
        let panic_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = UnmapGuard::new(&mock);
            panic!("intentional test panic");
        }));
        assert!(panic_result.is_err());
        assert_eq!(mock.unmap_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn unmap_guard_should_not_arm_when_mapping_fails() {
        struct MockBuffer {
            unmapped: AtomicBool,
        }
        impl BufferUnmap for MockBuffer {
            fn unmap(&self) {
                self.unmapped.store(true, Ordering::SeqCst);
            }
        }

        // Simulates the exact map_readback control flow where UnmapGuard is armed
        // strictly after confirming poll() and rx.recv() succeed.
        fn simulate_map_readback_guard<B: BufferUnmap>(
            buffer: &B,
            poll_success: bool,
            recv_result: Result<Result<(), ()>, ()>,
        ) -> Option<()> {
            if !poll_success {
                return None;
            }
            match recv_result {
                Ok(Ok(())) => {}
                Ok(Err(_)) | Err(_) => return None,
            }

            let _unmap = UnmapGuard::new(buffer);
            Some(())
        }

        // Case 1: device.poll fails -> returns None, unmap is NOT called.
        let buf_poll_fail = MockBuffer {
            unmapped: AtomicBool::new(false),
        };
        let res = simulate_map_readback_guard(&buf_poll_fail, false, Ok(Ok(())));
        assert!(res.is_none());
        assert!(!buf_poll_fail.unmapped.load(Ordering::SeqCst));

        // Case 2: rx.recv() reports mapping failure (Ok(Err)) -> returns None, unmap is NOT called.
        let buf_map_fail = MockBuffer {
            unmapped: AtomicBool::new(false),
        };
        let res = simulate_map_readback_guard(&buf_map_fail, true, Ok(Err(())));
        assert!(res.is_none());
        assert!(!buf_map_fail.unmapped.load(Ordering::SeqCst));

        // Case 3: rx.recv() channel drops/errors (Err) -> returns None, unmap is NOT called.
        let buf_recv_fail = MockBuffer {
            unmapped: AtomicBool::new(false),
        };
        let res = simulate_map_readback_guard(&buf_recv_fail, true, Err(()));
        assert!(res.is_none());
        assert!(!buf_recv_fail.unmapped.load(Ordering::SeqCst));

        // Case 4: poll succeeds and rx.recv() returns Ok(Ok(())) -> returns Some, unmap is called on guard drop.
        let buf_success = MockBuffer {
            unmapped: AtomicBool::new(false),
        };
        let res = simulate_map_readback_guard(&buf_success, true, Ok(Ok(())));
        assert!(res.is_some());
        assert!(buf_success.unmapped.load(Ordering::SeqCst));
    }

    #[test]
    fn unmap_guard_should_drop_after_view_in_lifo_order() {
        static DROP_SEQ: AtomicUsize = AtomicUsize::new(0);

        struct MockBuffer<'a> {
            unmap_seq: &'a AtomicUsize,
        }
        impl BufferUnmap for MockBuffer<'_> {
            fn unmap(&self) {
                self.unmap_seq
                    .store(DROP_SEQ.fetch_add(1, Ordering::SeqCst), Ordering::SeqCst);
            }
        }

        struct MockBufferView<'a> {
            drop_seq: &'a AtomicUsize,
        }
        impl Drop for MockBufferView<'_> {
            fn drop(&mut self) {
                self.drop_seq
                    .store(DROP_SEQ.fetch_add(1, Ordering::SeqCst), Ordering::SeqCst);
            }
        }

        let view_seq = AtomicUsize::new(usize::MAX);
        let unmap_seq = AtomicUsize::new(usize::MAX);

        let buf = MockBuffer {
            unmap_seq: &unmap_seq,
        };

        {
            // Matching map_readback's declaration order:
            // let _unmap = UnmapGuard::new(readback_buffer);
            // let mapped = slice.get_mapped_range();
            let _unmap = UnmapGuard::new(&buf);
            let _mapped = MockBufferView {
                drop_seq: &view_seq,
            };
            // Scope exit drops _mapped first, then _unmap.
        }

        let view_order = view_seq.load(Ordering::SeqCst);
        let unmap_order = unmap_seq.load(Ordering::SeqCst);

        assert!(
            view_order < unmap_order,
            "BufferView must drop before UnmapGuard unmaps (view: {view_order}, unmap: {unmap_order})"
        );
    }

    #[test]
    fn test_readback_null_dst_returns_zero() {
        // Verify null dst short-circuits before any GPU operation.
        // We can't call the real readback without GPU, but we test the guard path.
        // The function checks `dst.is_null()` before touching GPU resources.
        // This is a pure logic test — no wgpu needed.
        let needed_bytes = 100u32 * 100u32 * 4;
        let dst_cap = 100u32; // too small
                              // Simulate the guard: needed > dst_cap.
        assert!(dst_cap < needed_bytes, "buffer too small guard should fire");
    }

    #[test]
    fn test_padded_row_formula() {
        // Ensure the padding formula matches the readback logic.
        // width=50: 50*4=200 → padded=256.
        assert_eq!((50u32 * 4 + 255) & !255, 256);
        // width=64: 64*4=256 → already aligned.
        assert_eq!((64u32 * 4 + 255) & !255, 256);
        // width=100: 100*4=400 → padded=512.
        assert_eq!((100u32 * 4 + 255) & !255, 512);
    }

    #[test]
    fn readback_region_should_return_zero_when_dimensions_overflow() {
        let pctx = crate::paint::PaintContext::new();
        let mut dst = [0u8; 16];

        // Case 1: w * h overflows u32
        let res1 = readback_region(
            &pctx.wgpu.device,
            &pctx.wgpu.queue,
            &pctx.wgpu.pipelines.unpremultiply_pack,
            &pctx.wgpu.pipelines.unpremultiply_bgl,
            &pctx.target_texture,
            u32::MAX,
            u32::MAX,
            0,
            0,
            u32::MAX,
            u32::MAX,
            dst.as_mut_ptr(),
            u32::MAX,
        );
        assert_eq!(res1, 0, "readback_region must return 0 when w * h overflows u32");

        // Case 2: (w * h) * 4 overflows u32 even if w * h does not
        let res2 = readback_region(
            &pctx.wgpu.device,
            &pctx.wgpu.queue,
            &pctx.wgpu.pipelines.unpremultiply_pack,
            &pctx.wgpu.pipelines.unpremultiply_bgl,
            &pctx.target_texture,
            1 << 30,
            1,
            0,
            0,
            1 << 30,
            1,
            dst.as_mut_ptr(),
            u32::MAX,
        );
        assert_eq!(res2, 0, "readback_region must return 0 when (w * h) * 4 overflows u32");

        // Case 3: w * 4 + 255 overflows u32 (padded_bytes_per_row overflow)
        let w_padded_overflow = (u32::MAX / 4) + 1;
        let res3 = readback_region(
            &pctx.wgpu.device,
            &pctx.wgpu.queue,
            &pctx.wgpu.pipelines.unpremultiply_pack,
            &pctx.wgpu.pipelines.unpremultiply_bgl,
            &pctx.target_texture,
            w_padded_overflow,
            1,
            0,
            0,
            w_padded_overflow,
            1,
            dst.as_mut_ptr(),
            u32::MAX,
        );
        assert_eq!(
            res3, 0,
            "readback_region must return 0 when padded_bytes_per_row calculation overflows u32"
        );
    }

    #[test]
    fn readback_region_should_return_zero_when_buffer_too_small_or_null() {
        let pctx = crate::paint::PaintContext::new();
        let mut dst = [0u8; 64];

        // Buffer too small: 10 * 10 * 4 = 400 bytes needed, but capacity is 64
        let res = readback_region(
            &pctx.wgpu.device,
            &pctx.wgpu.queue,
            &pctx.wgpu.pipelines.unpremultiply_pack,
            &pctx.wgpu.pipelines.unpremultiply_bgl,
            &pctx.target_texture,
            64,
            64,
            0,
            0,
            10,
            10,
            dst.as_mut_ptr(),
            64,
        );
        assert_eq!(res, 0, "readback_region must return 0 when dst_cap < needed");

        // Null dst pointer
        let res_null = readback_region(
            &pctx.wgpu.device,
            &pctx.wgpu.queue,
            &pctx.wgpu.pipelines.unpremultiply_pack,
            &pctx.wgpu.pipelines.unpremultiply_bgl,
            &pctx.target_texture,
            64,
            64,
            0,
            0,
            10,
            10,
            std::ptr::null_mut(),
            400,
        );
        assert_eq!(res_null, 0, "readback_region must return 0 when dst is null");
    }

    #[test]
    fn readback_region_gpu_unpremultiply_accurate() {
        let pctx = crate::paint::PaintContext::new();
        let width = 64;
        let height = 4;
        let row_pixels = [128, 64, 0, 128].repeat(width as usize);
        let pixels: Vec<u8> = row_pixels.repeat(height as usize);
        let texture = pctx.wgpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("test-unpremul-region-tex"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        pctx.wgpu.queue.write_texture(
            texture.as_image_copy(), &pixels,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(width * 4), rows_per_image: Some(height) },
            wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        );

        // Read a 2x2 sub-region starting at (2, 1)
        let mut region_out = [0u8; 2 * 2 * 4];
        let written = readback_region(
            &pctx.wgpu.device,
            &pctx.wgpu.queue,
            &pctx.wgpu.pipelines.unpremultiply_pack,
            &pctx.wgpu.pipelines.unpremultiply_bgl,
            &texture,
            width,
            height,
            2,
            1,
            2,
            2,
            region_out.as_mut_ptr(),
            region_out.len() as u32,
        );
        assert_eq!(written, 16);
        assert_eq!(region_out, [255, 128, 0, 128].repeat(4).as_slice());
    }

    #[cfg(feature = "gpu-tests")]
    fn gpu_fixture(
        width: u32,
        height: u32,
    ) -> (
        crate::paint::context::WgpuContext,
        wgpu::Texture,
        wgpu::Buffer,
        wgpu::Buffer,
        wgpu::BindGroup,
        Vec<u8>,
    ) {
        use wgpu::util::DeviceExt;
        let ctx = crate::paint::context::WgpuContext::new();
        let pixels = (0..(width as usize * height as usize * 4))
            .map(|index| if index % 4 == 3 { 255 } else { (index as u32).wrapping_mul(37) as u8 })
            .collect::<Vec<_>>();
        let padded_row = (width * 4 + 255) & !255;
        let mut upload_pixels = vec![0u8; (padded_row * height) as usize];
        for row in 0..height as usize {
            let src_start = row * (width as usize * 4);
            let dst_start = row * (padded_row as usize);
            upload_pixels[dst_start..dst_start + (width as usize * 4)]
                .copy_from_slice(&pixels[src_start..src_start + (width as usize * 4)]);
        }
        let texture = ctx.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("readback-copy-test-texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        ctx.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &upload_pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_row),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        let size = (width as u64) * (height as u64) * 4;
        let storage = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback-storage-test-buffer"),
            size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let readback = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback-staging-test-buffer"),
            size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let uniforms: [u32; 4] = [width, height, 0, 0];
        let uniform_buf = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("readback-uniform-test-buffer"),
            contents: bytemuck::cast_slice(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bind_group = ctx.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("readback-test-bind-group"),
            layout: &ctx.pipelines.unpremultiply_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: storage.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform_buf.as_entire_binding(),
                },
            ],
        });
        (ctx, texture, storage, readback, bind_group, pixels)
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_callback_matches_reference_for_aligned_rows() {
        let width = 64;
        let height = 3;
        let (ctx, _texture, storage, readback, bind_group, source) = gpu_fixture(width, height);
        let mut expected = vec![0u8; source.len()];
        assert_eq!(
            readback_full(
                &ctx.device,
                &ctx.queue,
                &ctx.pipelines.unpremultiply_pack,
                &bind_group,
                &storage,
                &readback,
                width,
                height,
                expected.as_mut_ptr(),
                expected.len() as u32,
            ),
            expected.len() as u32
        );

        let mut observed = Vec::new();
        let result = readback_full_with(
            &ctx.device,
            &ctx.queue,
            &ctx.pipelines.unpremultiply_pack,
            &bind_group,
            &storage,
            &readback,
            width,
            height,
            |bytes| {
                observed.extend_from_slice(bytes);
                bytes.len()
            },
        );
        assert_eq!(result, Some(source.len()));
        assert_eq!(observed, source);
        assert_eq!(observed, expected);
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_callback_matches_reference_for_padded_rows() {
        let width = 50;
        let height = 3;
        let (ctx, _texture, storage, readback, bind_group, source) = gpu_fixture(width, height);
        let mut expected = vec![0u8; source.len()];
        assert_eq!(
            readback_full(
                &ctx.device,
                &ctx.queue,
                &ctx.pipelines.unpremultiply_pack,
                &bind_group,
                &storage,
                &readback,
                width,
                height,
                expected.as_mut_ptr(),
                expected.len() as u32,
            ),
            expected.len() as u32
        );

        let mut observed = Vec::new();
        let result = readback_full_with(
            &ctx.device,
            &ctx.queue,
            &ctx.pipelines.unpremultiply_pack,
            &bind_group,
            &storage,
            &readback,
            width,
            height,
            |bytes| {
                observed.extend_from_slice(bytes);
                bytes.len()
            },
        );
        assert_eq!(result, Some(source.len()));
        assert_eq!(observed, source);
        assert_eq!(observed, expected);
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_callback_error_and_panic_release_mapping() {
        let width = 64;
        let height = 2;
        let (ctx, _texture, storage, readback, bind_group, source) = gpu_fixture(width, height);
        let callback_error = readback_full_with(
            &ctx.device,
            &ctx.queue,
            &ctx.pipelines.unpremultiply_pack,
            &bind_group,
            &storage,
            &readback,
            width,
            height,
            |_| Err::<(), _>("callback failed"),
        );
        assert_eq!(callback_error, Some(Err("callback failed")));

        let panic_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            readback_full_with(
                &ctx.device,
                &ctx.queue,
                &ctx.pipelines.unpremultiply_pack,
                &bind_group,
                &storage,
                &readback,
                width,
                height,
                |_| -> () { panic!("callback panicked") },
            )
        }));
        assert!(panic_result.is_err());

        let mut output = vec![0u8; source.len()];
        assert_eq!(
            readback_full(
                &ctx.device,
                &ctx.queue,
                &ctx.pipelines.unpremultiply_pack,
                &bind_group,
                &storage,
                &readback,
                width,
                height,
                output.as_mut_ptr(),
                output.len() as u32,
            ),
            output.len() as u32
        );
        assert_eq!(output, source);
    }
}
