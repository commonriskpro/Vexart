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
#[allow(dead_code)]
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

/// Submit compute unpremultiply+pack pass and copy storage buffer to staging buffer.
/// Calls map_async and returns a channel receiver for the completion result.
pub fn submit_readback_gpu_pass(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bind_group: &wgpu::BindGroup,
    storage_buffer: &wgpu::Buffer,
    staging_buffer: &wgpu::Buffer,
    width: u32,
    height: u32,
) -> Option<std::sync::mpsc::Receiver<Result<(), wgpu::BufferAsyncError>>> {
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
        staging_buffer,
        0,
        needed_u64,
    );

    queue.submit(std::iter::once(encoder.finish()));

    let slice = staging_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });

    Some(rx)
}

/// Consume a staging buffer slot whose map_async was previously initiated.
///
/// Tries non-blocking poll first to avoid CPU wait stalls when GPU work is already
/// complete; falls back to device.poll(Wait) if needed. Runs the callback over
/// the mapped bytes and safely unmaps the buffer upon return via UnmapGuard.
pub fn consume_staging_slot<R, F>(
    device: &wgpu::Device,
    staging_buffer: &wgpu::Buffer,
    rx: std::sync::mpsc::Receiver<Result<(), wgpu::BufferAsyncError>>,
    needed: usize,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
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
    // Declared before mapped so Rust's LIFO drop order releases the BufferView
    // before UnmapGuard calls buffer.unmap().
    let _unmap = UnmapGuard::new(staging_buffer);
    let slice = staging_buffer.slice(..);
    let mapped = slice.get_mapped_range();
    if mapped.len() < needed {
        return None;
    }
    Some(callback(&mapped[..needed]))
}

/// Full-target GPU→CPU readback helper using submit_readback_gpu_pass and consume_staging_slot.
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
    let needed = (width as usize).checked_mul(height as usize)?.checked_mul(4)?;
    let rx = submit_readback_gpu_pass(
        device,
        queue,
        pipeline,
        bind_group,
        storage_buffer,
        readback_buffer,
        width,
        height,
    )?;
    consume_staging_slot(device, readback_buffer, rx, needed, callback)
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

/// Reusable GPU buffer pool for regional readback passes.
///
/// Eliminates per-frame buffer allocation thrashing (uniform, storage, and staging)
/// and enables double-buffering ping-pong across regional damage dispatches.
pub struct RegionalReadbackPool {
    pub uniform_buffer: wgpu::Buffer,
    pub storage_buffer: wgpu::Buffer,
    pub staging_buffers: [wgpu::Buffer; 2],
    pub staging_rx: [Option<std::sync::mpsc::Receiver<Result<(), wgpu::BufferAsyncError>>>; 2],
    pub staging_index: usize,
    pub capacity_bytes: u64,
}

impl RegionalReadbackPool {
    /// Default initial capacity: 1MB (512x512x4 RGBA bytes).
    pub const DEFAULT_CAPACITY_BYTES: u64 = 512 * 512 * 4;

    /// Create a new regional readback pool with the specified initial capacity.
    pub fn new(device: &wgpu::Device, initial_capacity_bytes: u64) -> Self {
        let capacity = initial_capacity_bytes.max(1024 * 1024);
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("vexart-regional-pool-uniform-buffer"),
            size: 16,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let storage_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("vexart-regional-pool-storage-buffer"),
            size: capacity,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let staging_buffers = [
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-regional-pool-staging-buffer-0"),
                size: capacity,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-regional-pool-staging-buffer-1"),
                size: capacity,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
        ];

        Self {
            uniform_buffer,
            storage_buffer,
            staging_buffers,
            staging_rx: [None, None],
            staging_index: 0,
            capacity_bytes: capacity,
        }
    }

    /// Ensure buffers have at least needed_bytes capacity, geometrically growing if necessary.
    pub fn ensure_capacity(&mut self, device: &wgpu::Device, needed_bytes: u64) {
        if needed_bytes <= self.capacity_bytes {
            return;
        }

        let mut new_capacity = self.capacity_bytes.max(1024 * 1024);
        while new_capacity < needed_bytes {
            new_capacity = match new_capacity.checked_mul(2) {
                Some(cap) => cap,
                None => {
                    new_capacity = needed_bytes;
                    break;
                }
            };
        }

        self.storage_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("vexart-regional-pool-storage-buffer"),
            size: new_capacity,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        self.staging_buffers = [
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-regional-pool-staging-buffer-0"),
                size: new_capacity,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-regional-pool-staging-buffer-1"),
                size: new_capacity,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
        ];

        self.staging_rx = [None, None];
        self.staging_index = 0;
        self.capacity_bytes = new_capacity;
    }

    /// Advance the ping-pong staging slot (alternating 0 and 1) and reset the slot's receiver.
    pub fn advance_staging_slot(&mut self) -> usize {
        let slot = self.staging_index;
        self.staging_index = (self.staging_index + 1) % 2;
        self.staging_rx[slot] = None;
        slot
    }
}

/// Region GPU→CPU readback using pooled buffers and compute unpremultiply+pack shader,
/// executing a callback directly over the mapped staging memory with zero intermediate copies.
pub fn readback_region_with<R, F>(
    pool: &mut RegionalReadbackPool,
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bgl: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    target_width: u32,
    target_height: u32,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    callback: F,
) -> Option<R>
where
    F: FnOnce(&[u8]) -> R,
{
    // Clamp region to target bounds.
    let x = rx.min(target_width);
    let y = ry.min(target_height);
    let w = rw.min(target_width.saturating_sub(x));
    let h = rh.min(target_height.saturating_sub(y));

    if w == 0 || h == 0 {
        return None;
    }

    if w.checked_mul(4).and_then(|b| b.checked_add(255)).is_none() {
        return None;
    }
    let needed = (w as usize).checked_mul(h as usize)?.checked_mul(4)?;
    let needed_u64 = needed as u64;

    pool.ensure_capacity(device, needed_u64);

    let uniforms: [u32; 4] = [w, h, x, y];
    queue.write_buffer(&pool.uniform_buffer, 0, bytemuck::cast_slice(&uniforms));

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("vexart-region-unpremultiply-bind-group"),
        layout: bgl,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: pool.storage_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: pool.uniform_buffer.as_entire_binding(),
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

    let slot = pool.advance_staging_slot();
    encoder.copy_buffer_to_buffer(&pool.storage_buffer, 0, &pool.staging_buffers[slot], 0, needed_u64);
    queue.submit(std::iter::once(encoder.finish()));

    let slice = pool.staging_buffers[slot].slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });
    pool.staging_rx[slot] = Some(rx);

    let rx = pool.staging_rx[slot].take()?;
    consume_staging_slot(device, &pool.staging_buffers[slot], rx, needed, callback)
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
    pool: &mut RegionalReadbackPool,
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::ComputePipeline,
    bgl: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
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

    readback_region_with(
        pool,
        device,
        queue,
        pipeline,
        bgl,
        view,
        target_width,
        target_height,
        rx,
        ry,
        rw,
        rh,
        |mapped| {
            let dst_slice: &mut [u8] =
                // SAFETY: caller guarantees dst is valid for dst_cap bytes.
                unsafe { std::slice::from_raw_parts_mut(dst, dst_cap as usize) };
            dst_slice[..needed].copy_from_slice(&mapped[..needed]);
            needed_u32
        },
    )
    .unwrap_or(0)
}

#[cfg(test)]
#[path = "readback_tests.rs"]
mod tests;
