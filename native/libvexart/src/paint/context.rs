// native/libvexart/src/paint/context.rs
// Placeholder WgpuContext — real wgpu::Instance/Adapter/Device/Queue init lands in Slice 5.

/// Placeholder WGPU context.
/// Real initialization (Instance/Adapter/Device/Queue) lands in Slice 5.
pub struct WgpuContext {
    // TODO(Slice 5): wgpu::Instance, adapter, device, queue fields.
    _placeholder: (),
}

impl WgpuContext {
    /// Create a no-op stub context (Phase 2 only — Slice 5 provides real init).
    pub fn new_stub() -> Self {
        Self { _placeholder: () }
    }
}
