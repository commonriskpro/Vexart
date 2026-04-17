// native/libvexart/src/composite/target.rs
// Offscreen target lifecycle. Real GPU target creation lands in Slice 5.

/// Placeholder offscreen render target.
pub struct OffscreenTarget {
    // TODO(Slice 5): wgpu::Texture, wgpu::TextureView for offscreen compositing.
    _placeholder: (),
}

impl OffscreenTarget {
    pub fn new_stub() -> Self {
        Self { _placeholder: () }
    }
}
