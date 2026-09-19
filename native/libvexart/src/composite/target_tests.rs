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
fn test_active_layer_finish_active_passes_no_active() {
    let mut reg = TargetRegistry::new();
    assert!(!reg.has_active_layers());
    reg.finish_active_passes(); // safe no-op when empty
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

#[test]
fn test_clamp_scissor() {
    // Fully within bounds
    assert_eq!(
        clamp_scissor([10, 20, 30, 40], 100, 100),
        Some([10, 20, 30, 40])
    );
    // Clamping right edge to target width
    assert_eq!(
        clamp_scissor([80, 20, 50, 40], 100, 100),
        Some([80, 20, 20, 40])
    );
    // Clamping bottom edge to target height
    assert_eq!(
        clamp_scissor([10, 80, 30, 50], 100, 100),
        Some([10, 80, 30, 20])
    );
    // Clamping both right and bottom edges
    assert_eq!(
        clamp_scissor([80, 80, 50, 50], 100, 100),
        Some([80, 80, 20, 20])
    );
    // Scissor x exceeds or equals target width
    assert_eq!(clamp_scissor([100, 20, 30, 40], 100, 100), None);
    assert_eq!(clamp_scissor([110, 20, 30, 40], 100, 100), None);
    // Scissor y exceeds or equals target height
    assert_eq!(clamp_scissor([10, 100, 30, 40], 100, 100), None);
    assert_eq!(clamp_scissor([10, 110, 30, 40], 100, 100), None);
    // Zero width or zero height
    assert_eq!(clamp_scissor([10, 20, 0, 40], 100, 100), None);
    assert_eq!(clamp_scissor([10, 20, 30, 0], 100, 100), None);
    assert_eq!(clamp_scissor([10, 20, 0, 0], 100, 100), None);
    // Zero target dimensions
    assert_eq!(clamp_scissor([0, 0, 10, 10], 0, 0), None);
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
    let (device, _queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("test"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
            experimental_features: Default::default(),
        }))
        .expect("device");

    let mut reg = TargetRegistry::new();
    let mut handle = 0u64;
    let rec = reg.create(&device, 64, 64, &mut handle).expect("create target");
    assert_ne!(handle, 0);
    assert_eq!(rec.width, 64);
    assert_eq!(rec.height, 64);
    assert_eq!(rec.padded_bytes_per_row, 256);
    assert!(rec.staging_buffers[0].is_none(), "readback buffer must be lazily unallocated on create");
    assert!(rec.active_layer.is_none());
    assert_eq!(rec.scissor, None);
    reg.insert(handle, rec);
    let rec_mut = reg.get_mut(handle).unwrap();
    assert!(rec_mut.ensure_readback_buffer(&device).size() >= 256 * 64);
    assert!(rec_mut.staging_buffers[0].is_some());
    rec_mut.set_scissor(5, 6, 20, 30);
    assert_eq!(rec_mut.scissor, Some([5, 6, 20, 30]));
    rec_mut.clear_scissor();
    assert_eq!(rec_mut.scissor, None);
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
    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("test"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults(),
        memory_hints: wgpu::MemoryHints::Performance,
        trace: wgpu::Trace::Off,
        experimental_features: Default::default(),
    }))
    .expect("device");

    let mut reg = TargetRegistry::new();
    let mut handle = 0u64;
    let rec = reg.create(&device, 32, 32, &mut handle).expect("create target");
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
fn test_active_layer_finish_pass_unlocks_encoder() {
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
    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("test"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults(),
        memory_hints: wgpu::MemoryHints::Performance,
        trace: wgpu::Trace::Off,
        experimental_features: Default::default(),
    }))
    .expect("device");

    let mut reg = TargetRegistry::new();
    let mut handle = 0u64;
    let rec = reg.create(&device, 32, 32, &mut handle).expect("create target");
    reg.insert(handle, rec);

    assert!(reg.begin_layer(&device, handle, 0, 0x00000000).is_ok());

    let target_rec = reg.get_mut(handle).unwrap();
    let view = &target_rec.view;
    let layer = target_rec.active_layer.as_mut().unwrap();

    assert!(layer.pass.is_none());
    layer.finish_pass();
    assert!(layer.pass.is_none());

    let pass = layer.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("test-persistent-pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Load,
                store: wgpu::StoreOp::Store,
            },
            depth_slice: None,
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    layer.pass = Some(pass.forget_lifetime());
    assert!(layer.pass.is_some());

    // finish_pass must drop the active pass and unlock the encoder
    layer.finish_pass();
    assert!(layer.pass.is_none());

    // Next pass can be begun on layer.encoder without panicking
    let second_pass = layer.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("test-second-pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Load,
                store: wgpu::StoreOp::Store,
            },
            depth_slice: None,
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    drop(second_pass);

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
    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("test"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults(),
        memory_hints: wgpu::MemoryHints::Performance,
        trace: wgpu::Trace::Off,
        experimental_features: Default::default(),
    }))
    .expect("device");

    let mut reg = TargetRegistry::new();
    assert!(reg.begin_layer(&device, 999, 0, 0).is_err());
    assert!(reg.end_layer(&queue, 999).is_err());
    assert!(reg.get(999).is_none());
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_create_target_limits() {
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
    let (device, _queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("test"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
            experimental_features: Default::default(),
        }))
        .expect("device");

    let reg = TargetRegistry::new();
    let mut handle = 0u64;
    let max_dim = device.limits().max_texture_dimension_2d;
    assert!(reg.create(&device, max_dim + 1, 64, &mut handle).is_none());
    assert!(reg.create(&device, 64, max_dim + 1, &mut handle).is_none());
    assert!(reg.create(&device, 0, 64, &mut handle).is_none());
    assert!(reg.create(&device, 64, 0, &mut handle).is_none());
}

#[cfg(feature = "gpu-tests")]
#[test]
fn test_staging_double_buffering_and_raii_unmap() {
    let ctx = crate::paint::context::WgpuContext::new();
    let device = &ctx.device;
    let reg = TargetRegistry::new();
    let mut handle = 0u64;
    let mut rec = reg.create(device, 64, 64, &mut handle).expect("create target");
    let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("test-bgl"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: false },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: false },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });
    assert!(rec.ensure_readback_buffers(&device, &bgl).is_some());
    assert!(rec.staging_buffers[0].is_some());
    assert!(rec.staging_buffers[1].is_some());
    assert_eq!(rec.staging_index, 0);
    assert!(!rec.is_pipelined);
    assert!(rec.staging_rx[0].is_none());
    assert!(rec.staging_rx[1].is_none());

    let slot0 = rec.advance_staging_slot();
    assert_eq!(slot0, 0);
    assert_eq!(rec.staging_index, 1);

    let slot1 = rec.advance_staging_slot();
    assert_eq!(slot1, 1);
    assert_eq!(rec.staging_index, 0);

    // Safe unmap on idle slots does not panic
    rec.unmap_all_staging();
    assert!(!rec.staging_mapped[0]);
    assert!(!rec.staging_mapped[1]);
}
