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

#[test]
fn test_bridge_shadow_instance_size_is_80_bytes() {
    assert_eq!(std::mem::size_of::<BridgeShadowInstance>(), 80);
}

#[test]
fn test_bridge_shadow_instance_pod_roundtrip() {
    let inst = BridgeShadowInstance {
        x: -1.0,
        y: 1.0,
        w: 2.0,
        h: -2.0,
        color_r: 0.0,
        color_g: 0.0,
        color_b: 0.0,
        color_a: 0.4,
        radius_tl: 16.0,
        radius_tr: 16.0,
        radius_br: 16.0,
        radius_bl: 16.0,
        box_w: 200.0,
        box_h: 100.0,
        offset_x: 0.0,
        offset_y: 8.0,
        blur: 12.0,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    let bytes: &[u8] = cast_slice(std::slice::from_ref(&inst));
    let back: &[BridgeShadowInstance] = cast_slice(bytes);
    assert_eq!(back[0].offset_y, 8.0);
    assert_eq!(back[0].blur, 12.0);
}

// ── Phase 2b Slice 4 — MsdfGlyphInstance tests ──────────────────────────

#[test]
fn test_msdf_glyph_instance_size_is_64_bytes() {
    // MsdfGlyphInstance must be exactly 64 bytes:
    // 12 f32 (48 bytes) + 4 u32 (16 bytes) = 64 bytes.
    // This ensures the vertex buffer stride matches the WGSL @location layout.
    assert_eq!(std::mem::size_of::<MsdfGlyphInstance>(), 64);
}

#[test]
fn test_msdf_glyph_instance_pod_roundtrip() {
    let inst = MsdfGlyphInstance {
        x: -0.5,
        y: 0.75,
        w: 0.1,
        h: 0.15,
        uv_x: 0.0,
        uv_y: 0.0,
        uv_w: 0.0625, // 64/1024
        uv_h: 0.0625,
        color_r: 1.0,
        color_g: 0.9,
        color_b: 0.8,
        color_a: 1.0,
        atlas_id: 3,
        msdf_flag: 0,
        _pad1: 0,
        _pad2: 0,
    };

    let bytes: &[u8] = cast_slice(std::slice::from_ref(&inst));
    assert_eq!(bytes.len(), 64, "MsdfGlyphInstance must be 64 bytes");

    let back: &[MsdfGlyphInstance] = cast_slice(bytes);
    assert_eq!(back[0].atlas_id, 3);
    assert!((back[0].x - (-0.5)).abs() < f32::EPSILON);
    assert!((back[0].color_r - 1.0).abs() < f32::EPSILON);
    assert!((back[0].uv_w - 0.0625).abs() < f32::EPSILON);
}

#[test]
fn test_msdf_glyph_instance_zeroable() {
    // bytemuck::Zeroable: all-zeros must be valid (Pod derives Zeroable).
    // Use Default which is derived alongside Zeroable (Default = zeroed for Pod types).
    let inst = MsdfGlyphInstance::default();
    assert_eq!(inst.atlas_id, 0);
    assert_eq!(inst.x, 0.0);
    assert_eq!(inst.msdf_flag, 0);
    // Verify bytemuck cast_slice works on a zero instance.
    let bytes: &[u8] = bytemuck::bytes_of(&inst);
    assert!(bytes.iter().all(|&b| b == 0));
}

#[test]
fn test_msdf_glyph_instance_default_is_zeroed() {
    let inst = MsdfGlyphInstance::default();
    let bytes: &[u8] = cast_slice(std::slice::from_ref(&inst));
    assert!(bytes.iter().all(|&b| b == 0), "Default must be all zeros");
}

// ── Phase 2b Slice 5 — SelfFilterInstance tests ─────────────────────────

#[test]
fn test_self_filter_instance_size_is_48_bytes() {
    // SelfFilterInstance must be exactly 48 bytes:
    // 12 f32 (rect[4] + brightness + contrast + saturate + grayscale +
    //         invert + sepia + hue_rotate_deg + _pad) = 12 × 4 = 48 bytes.
    // This matches BackdropFilterInstance layout (design §5 Decision).
    assert_eq!(std::mem::size_of::<SelfFilterInstance>(), 48);
}

#[test]
fn test_self_filter_instance_pod_roundtrip() {
    let inst = SelfFilterInstance {
        x: -0.5,
        y: -0.5,
        w: 1.0,
        h: 1.0,
        brightness: 150.0, // 150% — brighter
        contrast: 100.0,   // identity
        saturate: 80.0,    // desaturate slightly
        grayscale: 0.0,    // identity
        invert: 0.0,       // identity
        sepia: 0.0,        // identity
        hue_rotate_deg: 45.0,
        _pad: 0.0,
    };

    let bytes: &[u8] = cast_slice(std::slice::from_ref(&inst));
    assert_eq!(bytes.len(), 48, "SelfFilterInstance must be 48 bytes");

    let back: &[SelfFilterInstance] = cast_slice(bytes);
    assert!((back[0].x - (-0.5)).abs() < f32::EPSILON);
    assert!((back[0].brightness - 150.0).abs() < f32::EPSILON);
    assert!((back[0].hue_rotate_deg - 45.0).abs() < f32::EPSILON);
    assert_eq!(back[0]._pad, 0.0);
}

#[test]
fn test_self_filter_instance_zeroable() {
    // bytemuck::Zeroable: all-zeros must be valid (derived alongside Pod).
    let inst = SelfFilterInstance::default();
    assert_eq!(inst.x, 0.0);
    assert_eq!(inst.brightness, 0.0);
    assert_eq!(inst._pad, 0.0);
    // Verify bytemuck cast works on a zero instance.
    let bytes: &[u8] = bytemuck::bytes_of(&inst);
    assert!(bytes.iter().all(|&b| b == 0));
}

#[test]
fn test_self_filter_instance_matches_backdrop_filter_size() {
    // REQ-2B-403: self_filter uses same uniform layout as backdrop_filter.
    // Both must be 48 bytes for the shader to read the vertex attributes correctly.
    assert_eq!(
        std::mem::size_of::<SelfFilterInstance>(),
        std::mem::size_of::<BackdropFilterInstance>(),
        "SelfFilterInstance and BackdropFilterInstance must have the same size"
    );
}
