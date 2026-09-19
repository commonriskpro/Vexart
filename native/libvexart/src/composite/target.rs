// native/libvexart/src/composite/target.rs
// Real offscreen target lifecycle: TargetRecord + TargetRegistry.
// Phase 2b Slice 1, task 1.1. Per design decision: "Target registry lives inside SHARED_PAINT".

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// Holds one offscreen GPU target: texture + view + MAP_READ readback buffer.
pub struct TargetRecord {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    /// Storage buffer for compute unpremultiply output (width * height * 4).
    pub storage_buffer: Option<wgpu::Buffer>,
    /// Double-buffered MAP_READ staging buffers (width * height * 4) for pipelined readback.
    pub staging_buffers: [Option<wgpu::Buffer>; 2],
    /// Current ping-pong staging buffer index (0 or 1).
    pub staging_index: usize,
    /// State tracking whether each staging slot is currently in the Mapped state.
    pub staging_mapped: [bool; 2],
    /// Pending async mapping receivers for double-buffered readback slots.
    pub staging_rx: [Option<std::sync::mpsc::Receiver<Result<(), wgpu::BufferAsyncError>>>; 2],
    /// Whether pipelined presentation is active for this target.
    pub is_pipelined: bool,
    /// Uniform buffer holding width and height for unpremultiply pass.
    pub uniform_buffer: Option<wgpu::Buffer>,
    /// Cached compute bind group for unpremultiply pass.
    pub compute_bind_group: Option<wgpu::BindGroup>,
    /// Cached sample bind group for sampling this target as a texture in composite passes.
    pub sample_bind_group: Option<wgpu::BindGroup>,
    pub width: u32,
    pub height: u32,
    /// Bytes per row padded to 256-byte WGPU alignment.
    pub padded_bytes_per_row: u32,
    /// Some(encoder) when a layer is active; None when rested.
    pub active_layer: Option<ActiveLayerRecord>,
    pub scissor: Option<[u32; 4]>,
}

/// State held while a layer is open (between begin_layer and end_layer).
pub struct ActiveLayerRecord {
    // pass MUST be declared before encoder so it drops first!
    pub pass: Option<wgpu::RenderPass<'static>>,
    pub encoder: wgpu::CommandEncoder,
    /// True until the first render pass has been issued (clears on first, loads on rest).
    pub first_pass: bool,
    /// LoadOp variant for the first render pass in this layer:
    /// 0 = Clear(transparent), non-zero = Load.
    pub first_load_mode: u32,
    /// RGBA8 packed clear color (used when first_load_mode == 0).
    pub clear_rgba: u32,
    pub scissor: Option<[u32; 4]>,
}

impl TargetRecord {
    pub fn new(
        texture: wgpu::Texture,
        view: wgpu::TextureView,
        readback_buffer: Option<wgpu::Buffer>,
        width: u32,
        height: u32,
        padded_bytes_per_row: u32,
    ) -> Self {
        Self {
            texture,
            view,
            storage_buffer: None,
            staging_buffers: [readback_buffer, None],
            staging_index: 0,
            staging_mapped: [false; 2],
            staging_rx: [None, None],
            is_pipelined: false,
            uniform_buffer: None,
            compute_bind_group: None,
            sample_bind_group: None,
            width,
            height,
            padded_bytes_per_row,
            active_layer: None,
            scissor: None,
        }
    }

    /// Construct a TargetRecord using an acquired pooled texture and view.
    pub fn new_with_texture(
        texture: wgpu::Texture,
        view: wgpu::TextureView,
        width: u32,
        height: u32,
    ) -> Option<Self> {
        let padded_bytes_per_row = (width.checked_mul(4)?.checked_add(255)?) & !255;
        Some(Self::new(
            texture,
            view,
            None,
            width,
            height,
            padded_bytes_per_row,
        ))
    }

    /// Deconstructs the TargetRecord, releasing internal passes and unmapping staging buffers,
    /// and returns the texture, view, width, and height for reuse in the texture pool.
    pub fn into_texture_and_view(mut self) -> (wgpu::Texture, wgpu::TextureView, u32, u32) {
        if let Some(mut layer) = self.active_layer.take() {
            layer.finish_pass();
        }
        self.compute_bind_group = None;
        self.sample_bind_group = None;
        self.unmap_all_staging();
        let width = self.width;
        let height = self.height;
        let mut this = std::mem::ManuallyDrop::new(self);
        // SAFETY: this is ManuallyDrop so TargetRecord::drop will not be called.
        // We extract texture and view, and explicitly drop all other fields that have Drop implementations.
        unsafe {
            let texture = std::ptr::read(&this.texture);
            let view = std::ptr::read(&this.view);
            std::ptr::drop_in_place(&mut this.storage_buffer);
            std::ptr::drop_in_place(&mut this.staging_buffers);
            std::ptr::drop_in_place(&mut this.staging_rx);
            std::ptr::drop_in_place(&mut this.uniform_buffer);
            (texture, view, width, height)
        }
    }

    /// Safely unmap a staging buffer slot if it is currently mapped.
    pub fn unmap_staging(&mut self, slot: usize) {
        if slot < 2 {
            self.staging_rx[slot] = None;
            if self.staging_mapped[slot] {
                if let Some(buf) = &self.staging_buffers[slot] {
                    buf.unmap();
                }
                self.staging_mapped[slot] = false;
            }
        }
    }

    /// Safely unmap all staging buffers. Called on drop and target recreation.
    pub fn unmap_all_staging(&mut self) {
        self.unmap_staging(0);
        self.unmap_staging(1);
    }

    /// Advance the ping-pong staging slot (alternating 0 and 1).
    /// Unmaps the target slot if it was previously mapped so it is ready for copy.
    pub fn advance_staging_slot(&mut self) -> usize {
        let slot = self.staging_index;
        self.staging_index = (self.staging_index + 1) % 2;
        self.unmap_staging(slot);
        slot
    }

    /// Access the primary staging buffer for backwards compatibility.
    pub fn readback_buffer(&self) -> Option<&wgpu::Buffer> {
        self.staging_buffers[0].as_ref()
    }

    /// Lazily allocate the MAP_READ readback buffer on first readback call.
    pub fn ensure_readback_buffer(&mut self, device: &wgpu::Device) -> &wgpu::Buffer {
        if self.staging_buffers[0].is_none() {
            let readback_size = (self.width as u64)
                .checked_mul(self.height as u64)
                .and_then(|px| px.checked_mul(4))
                .expect("overflow in readback_size");
            let buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-readback-staging-buffer-0"),
                size: readback_size,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            self.staging_buffers[0] = Some(buffer);
        }
        self.staging_buffers[0].as_ref().unwrap()
    }

    /// Ensure sample bind group is created and cached for texture sampling.
    pub fn ensure_sample_bind_group(
        &mut self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        sampler: &wgpu::Sampler,
    ) -> &wgpu::BindGroup {
        if self.sample_bind_group.is_none() {
            let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("vexart-target-sample-bind-group"),
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&self.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(sampler),
                    },
                ],
            });
            self.sample_bind_group = Some(bg);
        }
        self.sample_bind_group.as_ref().unwrap()
    }

    /// Lazily allocate the storage buffer, double-buffered MAP_READ staging buffers,
    /// uniform buffer, and compute bind group on first readback call.
    pub fn ensure_readback_buffers(
        &mut self,
        device: &wgpu::Device,
        bgl: &wgpu::BindGroupLayout,
    ) -> Option<(&wgpu::Buffer, &wgpu::Buffer, &wgpu::BindGroup)> {
        let size = (self.width as u64)
            .checked_mul(self.height as u64)?
            .checked_mul(4)?;

        if self.storage_buffer.is_none() {
            let storage_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("vexart-unpremultiply-storage-buffer"),
                size,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            });
            self.storage_buffer = Some(storage_buffer);
        }

        for i in 0..2 {
            if self.staging_buffers[i].is_none() {
                let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some(if i == 0 {
                        "vexart-readback-staging-buffer-0"
                    } else {
                        "vexart-readback-staging-buffer-1"
                    }),
                    size,
                    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                self.staging_buffers[i] = Some(staging_buffer);
            }
        }

        if self.uniform_buffer.is_none() {
            use wgpu::util::DeviceExt;
            let uniforms: [u32; 4] = [self.width, self.height, 0, 0];
            let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("vexart-unpremultiply-uniform-buffer"),
                contents: bytemuck::cast_slice(&uniforms),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            self.uniform_buffer = Some(uniform_buffer);
        }

        if self.compute_bind_group.is_none() {
            let storage_buffer = self.storage_buffer.as_ref().unwrap();
            let uniform_buffer = self.uniform_buffer.as_ref().unwrap();
            let compute_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("vexart-unpremultiply-bind-group"),
                layout: bgl,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&self.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: storage_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: uniform_buffer.as_entire_binding(),
                    },
                ],
            });
            self.compute_bind_group = Some(compute_bind_group);
        }

        self.unmap_staging(self.staging_index);
        Some((
            self.storage_buffer.as_ref().unwrap(),
            self.staging_buffers[self.staging_index].as_ref().unwrap(),
            self.compute_bind_group.as_ref().unwrap(),
        ))
    }

    pub fn set_scissor(&mut self, x: u32, y: u32, width: u32, height: u32) {
        self.scissor = Some([x, y, width, height]);
        if let Some(layer) = self.active_layer.as_mut() {
            layer.set_scissor(x, y, width, height);
        }
    }

    pub fn clear_scissor(&mut self) {
        self.scissor = None;
        if let Some(layer) = self.active_layer.as_mut() {
            layer.clear_scissor();
        }
    }
}

impl Drop for TargetRecord {
    fn drop(&mut self) {
        self.unmap_all_staging();
    }
}

impl ActiveLayerRecord {
    pub fn new(
        encoder: wgpu::CommandEncoder,
        first_load_mode: u32,
        clear_rgba: u32,
        scissor: Option<[u32; 4]>,
    ) -> Self {
        Self {
            pass: None,
            encoder,
            first_pass: true,
            first_load_mode,
            clear_rgba,
            scissor,
        }
    }

    /// Drop the persistent render pass (if any) so that other operations
    /// can open their own render passes on the same encoder.
    /// The next paint dispatch will lazily re-create the persistent pass.
    pub fn finish_pass(&mut self) {
        if let Some(pass) = self.pass.take() {
            drop(pass);
        }
    }

    pub fn set_scissor(&mut self, x: u32, y: u32, width: u32, height: u32) {
        self.scissor = Some([x, y, width, height]);
    }

    pub fn clear_scissor(&mut self) {
        self.scissor = None;
    }
}

/// Clamps a scissor rectangle [x, y, width, height] to target dimensions [target_width, target_height].
/// Returns None if the scissor rectangle is outside target bounds or has zero width or height.
pub fn clamp_scissor(scissor: [u32; 4], target_width: u32, target_height: u32) -> Option<[u32; 4]> {
    let [sx, sy, sw, sh] = scissor;
    if sx >= target_width || sy >= target_height || sw == 0 || sh == 0 {
        return None;
    }
    let clamped_w = sw.min(target_width - sx);
    let clamped_h = sh.min(target_height - sy);
    if clamped_w == 0 || clamped_h == 0 {
        return None;
    }
    Some([sx, sy, clamped_w, clamped_h])
}

/// Registry that owns all TargetRecord values by opaque u64 handle.
pub struct TargetRegistry {
    targets: HashMap<u64, TargetRecord>,
    next_handle: AtomicU64,
}

impl Default for TargetRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl TargetRegistry {
    pub fn new() -> Self {
        Self {
            targets: HashMap::new(),
            next_handle: AtomicU64::new(1), // 0 = null / default, start at 1
        }
    }

    pub fn stats(&self) -> (u32, u64) {
        let count = self.targets.len() as u32;
        let bytes: u64 = self
            .targets
            .values()
            .map(|t| (t.width as u64) * (t.height as u64) * 4)
            .sum();
        (count, bytes)
    }

    pub fn has_active_layers(&self) -> bool {
        self.targets
            .values()
            .any(|target| target.active_layer.is_some())
    }

    pub fn finish_active_passes(&mut self) {
        for target in self.targets.values_mut() {
            if let Some(layer) = target.active_layer.as_mut() {
                layer.finish_pass();
            }
        }
    }

    /// Allocate a new offscreen RGBA8 target of the given dimensions.
    /// Returns the opaque handle written to `out_handle`.
    pub fn create(
        &self,
        device: &wgpu::Device,
        width: u32,
        height: u32,
        out_handle: &mut u64,
    ) -> Option<TargetRecord> {
        let max_dim = device.limits().max_texture_dimension_2d;
        if width == 0 || height == 0 || width > max_dim || height > max_dim {
            return None;
        }

        let padded_bytes_per_row = (width.checked_mul(4)?.checked_add(255)?) & !255;

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("vexart-offscreen-target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
        *out_handle = handle;

        Some(TargetRecord::new(
            texture,
            view,
            None,
            width,
            height,
            padded_bytes_per_row,
        ))
    }

    /// Create a TargetRecord using provided texture and view.
    pub fn create_with_texture(
        &self,
        width: u32,
        height: u32,
        texture: wgpu::Texture,
        view: wgpu::TextureView,
        out_handle: &mut u64,
    ) -> Option<TargetRecord> {
        let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
        *out_handle = handle;
        TargetRecord::new_with_texture(texture, view, width, height)
    }

    /// Insert a TargetRecord that was created via `create()`.
    pub fn insert(&mut self, handle: u64, record: TargetRecord) {
        self.targets.insert(handle, record);
    }

    /// Remove a target and return the TargetRecord if it existed.
    pub fn remove(&mut self, handle: u64) -> Option<TargetRecord> {
        self.targets.remove(&handle)
    }

    /// Remove and drop a target. Returns true if the handle existed.
    pub fn destroy(&mut self, handle: u64) -> bool {
        self.remove(handle).is_some()
    }

    /// Immutable lookup.
    pub fn get(&self, handle: u64) -> Option<&TargetRecord> {
        self.targets.get(&handle)
    }

    /// Mutable lookup.
    pub fn get_mut(&mut self, handle: u64) -> Option<&mut TargetRecord> {
        self.targets.get_mut(&handle)
    }

    /// Begin a layer on the target: create a CommandEncoder and mark it active.
    /// Returns Err if the handle is invalid or a layer is already active.
    pub fn begin_layer(
        &mut self,
        device: &wgpu::Device,
        handle: u64,
        load_mode: u32,
        clear_rgba: u32,
    ) -> Result<(), i32> {
        use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE};
        let rec = self.targets.get_mut(&handle).ok_or(ERR_INVALID_HANDLE)?;
        if rec.active_layer.is_some() {
            return Err(ERR_INVALID_ARG); // layer already active
        }
        let encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("vexart-layer-encoder"),
        });
        rec.active_layer = Some(ActiveLayerRecord::new(
            encoder,
            load_mode,
            clear_rgba,
            rec.scissor,
        ));
        Ok(())
    }

    /// End a layer: submit the encoder to `queue` and return the target to rested state.
    /// Returns Err if the handle is invalid or no layer is active.
    pub fn end_layer(&mut self, queue: &wgpu::Queue, handle: u64) -> Result<(), i32> {
        use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE};
        let rec = self.targets.get_mut(&handle).ok_or(ERR_INVALID_HANDLE)?;
        let mut layer = rec.active_layer.take().ok_or(ERR_INVALID_ARG)?; // no active layer
        // Explicitly drop the render pass BEFORE finishing the encoder!
        layer.finish_pass();
        let cmd = layer.encoder.finish();
        queue.submit(std::iter::once(cmd));
        Ok(())
    }
}

#[cfg(test)]
#[path = "target_tests.rs"]
mod tests;
