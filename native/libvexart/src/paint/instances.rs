// native/libvexart/src/paint/instances.rs
// #[repr(C)] Pod + Zeroable instance structs for each WGPU render pipeline.
// Populated in Slice 5 with real field layouts matching shader expectations.

use bytemuck::{Pod, Zeroable};

/// Solid/SDF rectangle instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct RectInstance {
    pub rect: [f32; 4],         // x, y, w, h
    pub corner_radii: [f32; 4], // tl, tr, br, bl
    pub color: u32,             // RGBA8888
    pub border_color: u32,
    pub border_width: f32,
    pub scissor_id: u32,
}

/// Circle / ellipse instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct CircleInstance {
    pub rect: [f32; 4], // bounding box
    pub color: u32,
    pub border_color: u32,
    pub border_width: f32,
    pub _pad: u32,
}

/// Anti-aliased line instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct LineInstance {
    pub p0: [f32; 2],
    pub p1: [f32; 2],
    pub color: u32,
    pub width: f32,
    pub _pad: [u32; 2],
}

/// Quadratic bezier instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BezierInstance {
    pub p0: [f32; 2],
    pub p1: [f32; 2],
    pub p2: [f32; 2],
    pub color: u32,
    pub width: f32,
}

/// Gradient (linear or radial, 2-stop) instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct GradientInstance {
    pub rect: [f32; 4],
    pub color_from: u32,
    pub color_to: u32,
    pub angle_or_radius: f32, // angle for linear (degrees), radius for radial
    pub kind: u32,            // 0 = linear, 1 = radial
}

/// Outer glow / halo instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct GlowInstance {
    pub rect: [f32; 4],
    pub color: u32,
    pub radius: f32,
    pub intensity: f32,
    pub _pad: u32,
}

/// Drop shadow or inset shadow instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct ShadowInstance {
    pub rect: [f32; 4],
    pub color: u32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub blur: f32,
}

/// Backdrop blur source instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BlurSourceInstance {
    pub rect: [f32; 4],
    pub radius: f32,
    pub _pad: [u32; 3],
}

/// Backdrop filter (brightness/contrast/saturate/etc.) instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct FilterInstance {
    pub rect: [f32; 4],
    pub kind: u32,  // filter kind enum
    pub value: f32, // filter parameter
    pub _pad: [u32; 2],
}

/// CSS blend mode instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BlendInstance {
    pub rect: [f32; 4],
    pub mode: u32,
    pub _pad: [u32; 3],
}

/// Image render instance.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct ImageInstance {
    pub rect: [f32; 4],
    pub image_handle: u64, // GPU texture handle
    pub uv: [f32; 4],      // u0, v0, u1, v1
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytemuck::cast_slice;

    #[test]
    fn test_rect_instance_pod_roundtrip() {
        let inst = RectInstance {
            rect: [1.0, 2.0, 100.0, 50.0],
            corner_radii: [8.0, 8.0, 8.0, 8.0],
            color: 0xff0000ff,
            border_color: 0x000000ff,
            border_width: 2.0,
            scissor_id: 0,
        };
        let bytes: &[u8] = cast_slice(std::slice::from_ref(&inst));
        assert_eq!(bytes.len(), std::mem::size_of::<RectInstance>());
        let back: &[RectInstance] = cast_slice(bytes);
        assert_eq!(back[0].color, 0xff0000ff);
    }

    #[test]
    fn test_shadow_instance_pod_roundtrip() {
        let inst = ShadowInstance {
            rect: [0.0, 0.0, 200.0, 100.0],
            color: 0x00000060,
            offset_x: 0.0,
            offset_y: 4.0,
            blur: 12.0,
        };
        let bytes: &[u8] = cast_slice(std::slice::from_ref(&inst));
        let back: &[ShadowInstance] = cast_slice(bytes);
        assert_eq!(back[0].blur, 12.0);
    }
}
