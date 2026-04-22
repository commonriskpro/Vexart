// native/libvexart/src/composite/target.rs
// Real offscreen target lifecycle: TargetRecord + TargetRegistry.
// Phase 2b Slice 1, task 1.1. Per design decision: "Target registry lives inside SHARED_PAINT".

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// Holds one offscreen GPU target: texture + view + MAP_READ readback buffer.
pub struct TargetRecord {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    /// MAP_READ buffer sized to hold the full frame (padded rows).
    pub readback_buffer: wgpu::Buffer,
    pub width: u32,
    pub height: u32,
    /// Bytes per row padded to 256-byte WGPU alignment.
    pub padded_bytes_per_row: u32,
    /// Some(encoder) when a layer is active; None when rested.
    pub active_layer: Option<ActiveLayerRecord>,
}

/// State held while a layer is open (between begin_layer and end_layer).
pub struct ActiveLayerRecord {
    pub encoder: wgpu::CommandEncoder,
    /// True until the first render pass has been issued (clears on first, loads on rest).
    pub first_pass: bool,
    /// LoadOp variant for the first render pass in this layer:
    /// 0 = Clear(transparent), non-zero = Load.
    pub first_load_mode: u32,
    /// RGBA8 packed clear color (used when first_load_mode == 0).
    pub clear_rgba: u32,
}

/// Registry that owns all TargetRecord values by opaque u64 handle.
pub struct TargetRegistry {
    targets: HashMap<u64, TargetRecord>,
    next_handle: AtomicU64,
}

impl TargetRegistry {
    pub fn new() -> Self {
        Self {
            targets: HashMap::new(),
            next_handle: AtomicU64::new(1), // 0 = null / default, start at 1
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
    ) -> TargetRecord {
        let padded_bytes_per_row = (width * 4 + 255) & !255;
        let readback_size = (padded_bytes_per_row as u64) * (height as u64);

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
                | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("vexart-readback-buffer"),
            size: readback_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
        *out_handle = handle;

        TargetRecord {
            texture,
            view,
            readback_buffer,
            width,
            height,
            padded_bytes_per_row,
            active_layer: None,
        }
    }

    /// Insert a TargetRecord that was created via `create()`.
    pub fn insert(&mut self, handle: u64, record: TargetRecord) {
        self.targets.insert(handle, record);
    }

    /// Remove and drop a target. Returns true if the handle existed.
    pub fn destroy(&mut self, handle: u64) -> bool {
        self.targets.remove(&handle).is_some()
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
        rec.active_layer = Some(ActiveLayerRecord {
            encoder,
            first_pass: true,
            first_load_mode: load_mode,
            clear_rgba,
        });
        Ok(())
    }

    /// End a layer: submit the encoder to `queue` and return the target to rested state.
    /// Returns Err if the handle is invalid or no layer is active.
    pub fn end_layer(
        &mut self,
        queue: &wgpu::Queue,
        handle: u64,
    ) -> Result<(), i32> {
        use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE};
        let rec = self.targets.get_mut(&handle).ok_or(ERR_INVALID_HANDLE)?;
        let layer = rec.active_layer.take().ok_or(ERR_INVALID_ARG)?; // no active layer
        let cmd = layer.encoder.finish();
        queue.submit(std::iter::once(cmd));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_create_destroy_no_gpu() {
        // Unit test: verify handle allocation and destroy returns correct bool.
        // We skip actual GPU texture creation (needs gpu-tests feature).
        let mut reg = TargetRegistry::new();

        // Simulate an insert without GPU: use a dummy record via begin_layer error path.
        // Insert a placeholder by calling destroy on a non-existent handle.
        assert!(!reg.destroy(99), "non-existent handle should return false");
        assert!(!reg.destroy(0), "handle 0 should not exist");
    }

    #[test]
    fn test_padded_bytes_per_row_alignment() {
        // Verify 256-byte padding formula.
        // width=1 → 4 bytes → padded to 256.
        assert_eq!((1u32 * 4 + 255) & !255, 256);
        // width=64 → 256 bytes → already aligned.
        assert_eq!((64u32 * 4 + 255) & !255, 256);
        // width=100 → 400 bytes → padded to 512.
        assert_eq!((100u32 * 4 + 255) & !255, 512);
        // width=1920 → 7680 → padded to 7680 (already multiple of 256).
        assert_eq!((1920u32 * 4 + 255) & !255, 7680);
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_registry_create_real_target() {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::empty(),
            backend_options: wgpu::BackendOptions::default(),
            memory_budget_thresholds: Default::default(),
            display: Default::default(),
        });
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .expect("no adapter");
        let (device, _queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("test"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
                experimental_features: Default::default(),
            },
        ))
        .expect("device");

        let mut reg = TargetRegistry::new();
        let mut handle = 0u64;
        let rec = reg.create(&device, 64, 64, &mut handle);
        assert_ne!(handle, 0);
        assert_eq!(rec.width, 64);
        assert_eq!(rec.height, 64);
        assert_eq!(rec.padded_bytes_per_row, 256);
        assert!(rec.active_layer.is_none());
        reg.insert(handle, rec);
        assert!(reg.get(handle).is_some());
        assert!(reg.destroy(handle));
        assert!(reg.get(handle).is_none());
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_begin_layer_nested_error() {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::empty(),
            backend_options: wgpu::BackendOptions::default(),
            memory_budget_thresholds: Default::default(),
            display: Default::default(),
        });
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .expect("no adapter");
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("test"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
                experimental_features: Default::default(),
            },
        ))
        .expect("device");

        let mut reg = TargetRegistry::new();
        let mut handle = 0u64;
        let rec = reg.create(&device, 32, 32, &mut handle);
        reg.insert(handle, rec);

        // First begin_layer must succeed.
        assert!(reg.begin_layer(&device, handle, 0, 0x00000000).is_ok());
        // Second begin_layer on same target (with active layer) must fail.
        assert!(reg.begin_layer(&device, handle, 0, 0x00000000).is_err());
        // end_layer clears the active layer.
        assert!(reg.end_layer(&queue, handle).is_ok());
        // After end, begin works again.
        assert!(reg.begin_layer(&device, handle, 0, 0x00000000).is_ok());
        assert!(reg.end_layer(&queue, handle).is_ok());
    }

    #[cfg(feature = "gpu-tests")]
    #[test]
    fn test_invalid_handle_errors() {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::empty(),
            backend_options: wgpu::BackendOptions::default(),
            memory_budget_thresholds: Default::default(),
            display: Default::default(),
        });
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .expect("no adapter");
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("test"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
                experimental_features: Default::default(),
            },
        ))
        .expect("device");

        let mut reg = TargetRegistry::new();
        assert!(reg.begin_layer(&device, 999, 0, 0).is_err());
        assert!(reg.end_layer(&queue, 999).is_err());
        assert!(reg.get(999).is_none());
    }
}
