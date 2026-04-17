// native/libvexart/src/composite/readback.rs
// GPU→CPU buffer transfer. Real impl lands in Slice 5.

/// Phase 2 stub: blocking GPU→CPU readback.
/// Real implementation in Slice 5 uses wgpu::Buffer + map_async + pollster::block_on.
pub fn readback_full(_device: &(), _texture: &(), _dst: *mut u8, _dst_cap: u32) -> u32 {
    // TODO(Slice 5): implement GPU readback.
    0
}

/// Phase 2 stub: region GPU→CPU readback.
pub fn readback_region(
    _device: &(),
    _texture: &(),
    _x: u32,
    _y: u32,
    _w: u32,
    _h: u32,
    _dst: *mut u8,
    _dst_cap: u32,
) -> u32 {
    // TODO(Slice 5): implement region readback.
    0
}
