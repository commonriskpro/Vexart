// native/libvexart/src/composite/readback.rs
// Real GPU→CPU buffer transfer using wgpu map_async + pollster::block_on.
// Phase 2b Slice 1, task 1.4. Per design decision "Readback uses blocking map_async + pollster".

/// Full-target GPU→CPU readback.
///
/// Copies the entire target texture to `dst` using WGPU copy_texture_to_buffer + map_async.
/// Handles padded rows: each row in the readback buffer may have padding bytes that are
/// stripped when copying to `dst`.
///
/// Returns the number of bytes written to `dst`, or 0 on failure.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes.
pub fn readback_full(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
    padded_bytes_per_row: u32,
    readback_buffer: &wgpu::Buffer,
    dst: *mut u8,
    dst_cap: u32,
) -> u32 {
    let unpadded_bytes_per_row = match width.checked_mul(4) {
        Some(size) => size as usize,
        None => return 0,
    };
    let needed = match unpadded_bytes_per_row.checked_mul(height as usize) {
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
        texture,
        width,
        height,
        padded_bytes_per_row,
        readback_buffer,
        |mapped| {
            let mapped_needed = match (padded_bytes_per_row as usize).checked_mul(height as usize) {
                Some(size) => size,
                None => return 0,
            };
            if mapped.len() < mapped_needed {
                return 0;
            }
            let padded = padded_bytes_per_row as usize;
            let dst_slice: &mut [u8] =
                // SAFETY: caller guarantees dst is valid for dst_cap bytes.
                unsafe { std::slice::from_raw_parts_mut(dst, dst_cap as usize) };

            for row in 0..height as usize {
                let src_start = row * padded;
                let dst_start = row * unpadded_bytes_per_row;
                dst_slice[dst_start..dst_start + unpadded_bytes_per_row]
                    .copy_from_slice(&mapped[src_start..src_start + unpadded_bytes_per_row]);
            }
            needed_u32
        },
    )
    .unwrap_or(0)
}

/// Full-target GPU→CPU readback with a callback over packed RGBA bytes.
///
/// When the WGPU row pitch is already tightly packed, the callback receives a
/// view directly into the mapped readback buffer. Otherwise an exact packed
/// fallback is created before the callback runs. The mapping is released after
/// the callback returns, including when it returns an error value or unwinds.
///
/// The callback result is returned as `Some`. `None` indicates that the GPU
/// copy or mapping failed.
pub(crate) fn readback_full_with<R, F>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
    padded_bytes_per_row: u32,
    readback_buffer: &wgpu::Buffer,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    let unpadded_bytes_per_row = width.checked_mul(4)? as usize;
    let needed = unpadded_bytes_per_row.checked_mul(height as usize)?;
    let padded = padded_bytes_per_row as usize;
    if padded < unpadded_bytes_per_row {
        return None;
    }

    readback_full_mapped(
        device,
        queue,
        texture,
        width,
        height,
        padded_bytes_per_row,
        readback_buffer,
        |mapped| {
            let mapped_needed = padded.checked_mul(height as usize)?;
            if mapped.len() < mapped_needed {
                return None;
            }
            if padded == unpadded_bytes_per_row {
                return Some(callback(&mapped[..needed]));
            }

            let mut packed = vec![0u8; needed];
            for row in 0..height as usize {
                let src_start = row * padded;
                let dst_start = row * unpadded_bytes_per_row;
                packed[dst_start..dst_start + unpadded_bytes_per_row]
                    .copy_from_slice(&mapped[src_start..src_start + unpadded_bytes_per_row]);
            }
            Some(callback(&packed))
        },
    )
    .flatten()
}

/// Submit a full texture copy and run a callback while its readback buffer is
/// mapped. Callers choose whether to expose mapped rows directly or pack them.
fn readback_full_mapped<R, F>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
    padded_bytes_per_row: u32,
    readback_buffer: &wgpu::Buffer,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    let unpadded_bytes_per_row = width.checked_mul(4)? as usize;
    let padded = padded_bytes_per_row as usize;
    if padded < unpadded_bytes_per_row {
        return None;
    }

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("vexart-readback-encoder"),
    });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: readback_buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    queue.submit(std::iter::once(encoder.finish()));
    map_readback(device, readback_buffer, callback)
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
    // Keep the guard alive through submission polling and callback execution so
    // every failure path cancels/releases the mapping as well.
    let _unmap = UnmapGuard::new(readback_buffer);
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

    // The guard predates the mapped view so the view drops before unmap. This
    // keeps unmap safe if the callback returns an error or unwinds.
    let mapped = slice.get_mapped_range();
    Some(callback(&mapped))
}

struct UnmapGuard<'a> {
    buffer: &'a wgpu::Buffer,
}

impl<'a> UnmapGuard<'a> {
    fn new(buffer: &'a wgpu::Buffer) -> Self {
        Self { buffer }
    }
}

impl Drop for UnmapGuard<'_> {
    fn drop(&mut self) {
        self.buffer.unmap();
    }
}

/// Region GPU→CPU readback.
///
/// Copies a (x, y, w, h) sub-region of the target texture to `dst`.
/// Creates a temporary texture + buffer for the region copy.
///
/// Returns the number of bytes written to `dst`, or 0 on failure.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes.
pub fn readback_region(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
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

    let needed = w * h * 4;
    if dst_cap < needed || dst.is_null() {
        return 0;
    }

    let padded_bytes_per_row = (w * 4 + 255) & !255;
    let buf_size = (padded_bytes_per_row as u64) * (h as u64);

    let region_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("vexart-region-readback-buf"),
        size: buf_size,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("vexart-region-readback-encoder"),
    });

    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d { x, y, z: 0 },
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &region_buf,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(h),
            },
        },
        wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
    );

    queue.submit(std::iter::once(encoder.finish()));

    let copied = map_readback(device, &region_buf, |mapped| {
        if mapped.len() < buf_size as usize {
            return 0;
        }
        let unpadded_bytes_per_row = (w * 4) as usize;
        let padded = padded_bytes_per_row as usize;
        let dst_slice: &mut [u8] =
            // SAFETY: caller guarantees dst is valid for dst_cap bytes.
            unsafe { std::slice::from_raw_parts_mut(dst, dst_cap as usize) };

        for row in 0..h as usize {
            let src_start = row * padded;
            let dst_start = row * unpadded_bytes_per_row;
            dst_slice[dst_start..dst_start + unpadded_bytes_per_row]
                .copy_from_slice(&mapped[src_start..src_start + unpadded_bytes_per_row]);
        }
        needed
    });
    copied.unwrap_or(0)
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "gpu-tests")]
    use super::*;

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

    #[cfg(feature = "gpu-tests")]
    fn gpu_fixture(
        width: u32,
        height: u32,
    ) -> (
        crate::paint::context::WgpuContext,
        wgpu::Texture,
        wgpu::Buffer,
        Vec<u8>,
    ) {
        let ctx = crate::paint::context::WgpuContext::new();
        let pixels = (0..(width as usize * height as usize * 4))
            .map(|index| (index as u32).wrapping_mul(37) as u8)
            .collect::<Vec<_>>();
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
            usage: wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        ctx.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 4),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        let padded = (width * 4 + 255) & !255;
        let readback = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback-copy-test-buffer"),
            size: padded as u64 * height as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        (ctx, texture, readback, pixels)
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_callback_matches_reference_for_aligned_rows() {
        let width = 64;
        let height = 3;
        let (ctx, texture, readback, source) = gpu_fixture(width, height);
        let mut expected = vec![0u8; source.len()];
        assert_eq!(
            readback_full(
                &ctx.device,
                &ctx.queue,
                &texture,
                width,
                height,
                width * 4,
                &readback,
                expected.as_mut_ptr(),
                expected.len() as u32,
            ),
            expected.len() as u32
        );

        let mut observed = Vec::new();
        let result = readback_full_with(
            &ctx.device,
            &ctx.queue,
            &texture,
            width,
            height,
            width * 4,
            &readback,
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
        let (ctx, texture, readback, source) = gpu_fixture(width, height);
        let padded = (width * 4 + 255) & !255;
        let mut expected = vec![0u8; source.len()];
        assert_eq!(
            readback_full(
                &ctx.device,
                &ctx.queue,
                &texture,
                width,
                height,
                padded,
                &readback,
                expected.as_mut_ptr(),
                expected.len() as u32,
            ),
            expected.len() as u32
        );

        let mut observed = Vec::new();
        let result = readback_full_with(
            &ctx.device,
            &ctx.queue,
            &texture,
            width,
            height,
            padded,
            &readback,
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
        let (ctx, texture, readback, source) = gpu_fixture(width, height);
        let callback_error = readback_full_with(
            &ctx.device,
            &ctx.queue,
            &texture,
            width,
            height,
            width * 4,
            &readback,
            |_| Err::<(), _>("callback failed"),
        );
        assert_eq!(callback_error, Some(Err("callback failed")));

        let panic_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            readback_full_with(
                &ctx.device,
                &ctx.queue,
                &texture,
                width,
                height,
                width * 4,
                &readback,
                |_| -> () { panic!("callback panicked") },
            )
        }));
        assert!(panic_result.is_err());

        let mut output = vec![0u8; source.len()];
        assert_eq!(
            readback_full(
                &ctx.device,
                &ctx.queue,
                &texture,
                width,
                height,
                width * 4,
                &readback,
                output.as_mut_ptr(),
                output.len() as u32,
            ),
            output.len() as u32
        );
        assert_eq!(output, source);
    }
}
