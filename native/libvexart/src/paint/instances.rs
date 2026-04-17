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

// ─── Bridge-layout structs for Slice 5a pipeline port ─────────────────────
// These mirror the exact field layout from native/wgpu-canvas-bridge/src/lib.rs.
// They are used directly by the pipeline VertexBufferLayout in Slice 5a.
// Slice 9 may reconcile with the engine TS struct shape.

/// Mirrors bridge RectFillInstance (8 floats: x,y,w,h + r,g,b,a).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeRectInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

/// Mirrors bridge CircleInstance (16 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeCircleInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub fill_r: f32,
    pub fill_g: f32,
    pub fill_b: f32,
    pub fill_a: f32,
    pub stroke_r: f32,
    pub stroke_g: f32,
    pub stroke_b: f32,
    pub stroke_a: f32,
    pub stroke_norm: f32,
    pub has_fill: f32,
    pub has_stroke: f32,
    pub _pad0: f32,
}

/// Mirrors bridge PolygonInstance (20 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgePolygonInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub fill_r: f32,
    pub fill_g: f32,
    pub fill_b: f32,
    pub fill_a: f32,
    pub stroke_r: f32,
    pub stroke_g: f32,
    pub stroke_b: f32,
    pub stroke_a: f32,
    pub stroke_norm: f32,
    pub has_fill: f32,
    pub has_stroke: f32,
    pub sides: f32,
    pub rotation_deg: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Mirrors bridge BezierInstance (20 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeBezierInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub x0: f32,
    pub y0: f32,
    pub cx: f32,
    pub cy: f32,
    pub x1: f32,
    pub y1: f32,
    pub size_x: f32,
    pub size_y: f32,
    pub color_r: f32,
    pub color_g: f32,
    pub color_b: f32,
    pub color_a: f32,
    pub stroke_width: f32,
    pub aa_width: f32,
    pub _pad0: f32,
    pub _pad1: f32,
}

/// Mirrors bridge ShapeRectInstance (20 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeShapeRectInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub fill_r: f32,
    pub fill_g: f32,
    pub fill_b: f32,
    pub fill_a: f32,
    pub stroke_r: f32,
    pub stroke_g: f32,
    pub stroke_b: f32,
    pub stroke_a: f32,
    pub radius: f32,
    pub stroke_width: f32,
    pub has_fill: f32,
    pub has_stroke: f32,
    pub size_x: f32,
    pub size_y: f32,
    pub _pad0: f32,
    pub _pad1: f32,
}

/// Mirrors bridge ShapeRectCornersInstance (24 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeShapeRectCornersInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub fill_r: f32,
    pub fill_g: f32,
    pub fill_b: f32,
    pub fill_a: f32,
    pub stroke_r: f32,
    pub stroke_g: f32,
    pub stroke_b: f32,
    pub stroke_a: f32,
    pub radius_tl: f32,
    pub radius_tr: f32,
    pub radius_br: f32,
    pub radius_bl: f32,
    pub stroke_width: f32,
    pub has_fill: f32,
    pub has_stroke: f32,
    pub size_x: f32,
    pub size_y: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Mirrors bridge GlowInstance (12 floats: x,y,w,h + color(rgba) + intensity + 3 pad).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeGlowInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub color_r: f32,
    pub color_g: f32,
    pub color_b: f32,
    pub color_a: f32,
    pub intensity: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Mirrors bridge NebulaInstance (32 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeNebulaInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub seed: f32,
    pub scale: f32,
    pub octaves: f32,
    pub gain: f32,
    pub lacunarity: f32,
    pub warp: f32,
    pub detail: f32,
    pub dust: f32,
    pub stop0_pos: f32,
    pub stop0_r: f32,
    pub stop0_g: f32,
    pub stop0_b: f32,
    pub stop0_a: f32,
    pub stop1_pos: f32,
    pub stop1_r: f32,
    pub stop1_g: f32,
    pub stop1_b: f32,
    pub stop1_a: f32,
    pub stop2_pos: f32,
    pub stop2_r: f32,
    pub stop2_g: f32,
    pub stop2_b: f32,
    pub stop2_a: f32,
    pub stop3_pos: f32,
    pub stop3_r: f32,
    pub stop3_g: f32,
    pub stop3_b: f32,
    pub stop3_a: f32,
}

/// Mirrors bridge StarfieldInstance (24 floats: x,y,w,h + params0(seed,count,cluster_count,cluster_stars) + warm(rgba) + neutral(rgba) + cool(rgba) + 4 pad).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeStarfieldInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub seed: f32,
    pub count: f32,
    pub cluster_count: f32,
    pub cluster_stars: f32,
    pub warm_r: f32,
    pub warm_g: f32,
    pub warm_b: f32,
    pub warm_a: f32,
    pub neutral_r: f32,
    pub neutral_g: f32,
    pub neutral_b: f32,
    pub neutral_a: f32,
    pub cool_r: f32,
    pub cool_g: f32,
    pub cool_b: f32,
    pub cool_a: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
    pub _pad3: f32,
}

/// Mirrors bridge ImageInstance (8 floats: x,y,w,h + opacity + 3 pad).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeImageInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub opacity: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Mirrors bridge ImageTransformInstance (12 floats: p0(4 floats) + p1(4 floats) + opacity + 3 pad).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeImageTransformInstance {
    pub p0x: f32,
    pub p0y: f32,
    pub p1x: f32,
    pub p1y: f32,
    pub p2x: f32,
    pub p2y: f32,
    pub p3x: f32,
    pub p3y: f32,
    pub opacity: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Mirrors bridge LinearGradientInstance (20 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeLinearGradientInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub box_w: f32,
    pub box_h: f32,
    pub radius: f32,
    pub _pad0: f32,
    pub from_r: f32,
    pub from_g: f32,
    pub from_b: f32,
    pub from_a: f32,
    pub to_r: f32,
    pub to_g: f32,
    pub to_b: f32,
    pub to_a: f32,
    pub dir_x: f32,
    pub dir_y: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Mirrors bridge RadialGradientInstance (20 floats).
/// Mirrors bridge layout for Slice 5a port; Slice 9 may reconcile with engine TS struct shape.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BridgeRadialGradientInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub box_w: f32,
    pub box_h: f32,
    pub radius: f32,
    pub _pad0: f32,
    pub from_r: f32,
    pub from_g: f32,
    pub from_b: f32,
    pub from_a: f32,
    pub to_r: f32,
    pub to_g: f32,
    pub to_b: f32,
    pub to_a: f32,
    pub _pad1: f32,
    pub _pad2: f32,
    pub _pad3: f32,
    pub _pad4: f32,
}

// ─── Slice 5b — NEW GPU pipeline instance structs ─────────────────────────

/// Conic gradient instance (cmd_kind = 14).
/// 20 floats: rect + box_dims + corner_radius + colors + start_angle.
/// Mirrors LinearGradientInstance shape with start_angle replacing dir_x/dir_y.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct ConicGradientInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub box_w: f32,
    pub box_h: f32,
    pub radius: f32,
    pub _pad0: f32,
    pub from_r: f32,
    pub from_g: f32,
    pub from_b: f32,
    pub from_a: f32,
    pub to_r: f32,
    pub to_g: f32,
    pub to_b: f32,
    pub to_a: f32,
    pub start_angle: f32, // radians
    pub _pad1: f32,
    pub _pad2: f32,
    pub _pad3: f32,
}

/// Backdrop blur instance (cmd_kind = 15).
/// 8 floats: NDC rect + blur_radius + 3 pad.
/// Samples source texture and applies single-pass box blur.
/// TODO(5b): upgrade to 2-pass separable Gaussian in Phase 2b (requires ping-pong textures).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BackdropBlurInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub blur_radius: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

/// Backdrop filter instance (cmd_kind = 16).
/// 12 floats: NDC rect + 7 filter params + 1 pad.
/// All values use convention: 100 = identity for brightness/contrast/saturate;
/// 0 = identity for grayscale/invert/sepia/hue_rotate_deg.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct BackdropFilterInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub saturate: f32,
    pub grayscale: f32,
    pub invert: f32,
    pub sepia: f32,
    pub hue_rotate_deg: f32,
    pub _pad: f32,
}

/// Image mask instance (cmd_kind = 17).
/// 16 floats: NDC rect + mask region + radii + mode.
/// mode: 0.0 = uniform radius, 1.0 = per-corner radius.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Pod, Zeroable)]
pub struct ImageMaskInstance {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub mask_x: f32,
    pub mask_y: f32,
    pub mask_w: f32,
    pub mask_h: f32,
    pub radius_uniform: f32,
    pub radius_tl: f32,
    pub radius_tr: f32,
    pub radius_br: f32,
    pub radius_bl: f32,
    pub mode: f32, // 0.0 = uniform, 1.0 = per-corner
    pub _pad0: f32,
    pub _pad1: f32,
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
