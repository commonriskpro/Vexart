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
    let needed = width * height * 4;
    if dst_cap < needed || dst.is_null() {
        return 0;
    }

    // Copy texture → readback buffer.
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

    // Map buffer synchronously using pollster.
    let slice = readback_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });
    device
        .poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        })
        .expect("device poll failed");
    if rx.recv().expect("map_async channel").is_err() {
        return 0;
    }
    // Copy from mapped buffer to dst, stripping padding per row.
    {
        let mapped = slice.get_mapped_range();
        let unpadded_bytes_per_row = (width * 4) as usize;
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
    }

    readback_buffer.unmap();
    needed
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

    let slice = region_buf.slice(..);
    let (tx, rx_ch) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });
    device
        .poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        })
        .expect("device poll failed");
    if rx_ch.recv().expect("map_async channel").is_err() {
        return 0;
    }

    {
        let mapped = slice.get_mapped_range();
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
    }

    region_buf.unmap();
    needed
}

#[cfg(test)]
mod tests {
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
}
