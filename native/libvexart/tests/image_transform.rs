// Focused GPU regression tests for the transformed-image coverage shader.
// Run with: `cargo test --features gpu-tests --test image_transform`.

#![cfg(feature = "gpu-tests")]

use vexart::ffi::panic::OK;
use vexart::paint::instances::BridgeImageTransformInstance;

fn readback_target(target: u64, width: u32, height: u32) -> Vec<u8> {
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let result = unsafe {
        vexart::vexart_composite_readback_rgba(
            0,
            target,
            pixels.as_mut_ptr(),
            pixels.len() as u32,
            std::ptr::null_mut(),
        )
    };
    assert_eq!(result, OK);
    pixels
}

fn render_transformed_image(
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
    instance: BridgeImageTransformInstance,
) -> Vec<u8> {
    let source = vec![255u8, 0, 0, 255].repeat((source_width * source_height) as usize);
    let mut image = 0u64;
    let upload = unsafe {
        vexart::vexart_paint_upload_image(
            0,
            source.as_ptr(),
            source.len() as u32,
            source_width,
            source_height,
            0,
            &mut image,
        )
    };
    assert_eq!(upload, OK);

    let mut target = 0u64;
    let create = unsafe {
        vexart::vexart_composite_target_create(0, target_width, target_height, &mut target)
    };
    assert_eq!(create, OK);
    assert_eq!(
        vexart::vexart_composite_target_begin_layer(0, target, 0, 0),
        OK
    );

    let params = bytemuck::bytes_of(&instance);
    let render = unsafe {
        vexart::vexart_composite_render_image_transform_layer(0, target, image, params.as_ptr(), 0)
    };
    assert_eq!(render, OK);
    assert_eq!(vexart::vexart_composite_target_end_layer(0, target), OK);

    let pixels = readback_target(target, target_width, target_height);
    assert_eq!(vexart::vexart_composite_target_destroy(0, target), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, image), OK);
    pixels
}

#[test]
fn transformed_image_identity_preserves_opaque_edges() {
    let pixels = render_transformed_image(
        4,
        4,
        8,
        8,
        BridgeImageTransformInstance {
            p0x: -1.0,
            p0y: 1.0,
            p1x: 1.0,
            p1y: 1.0,
            p2x: -1.0,
            p2y: -1.0,
            p3x: 1.0,
            p3y: -1.0,
            opacity: 1.0,
            ..Default::default()
        },
    );

    assert!(
        pixels
            .chunks_exact(4)
            .all(|pixel| pixel == [255, 0, 0, 255]),
        "identity transformed image must remain opaque at every target edge"
    );
}

#[test]
fn transformed_image_ninety_degree_rotation_preserves_opaque_edges() {
    let pixels = render_transformed_image(
        32,
        16,
        64,
        64,
        BridgeImageTransformInstance {
            // A 32×16 image rotated 90° around the 64×64 target center.
            p0x: 0.25,
            p0y: 0.5,
            p1x: 0.25,
            p1y: -0.5,
            p2x: -0.25,
            p2y: 0.5,
            p3x: -0.25,
            p3y: -0.5,
            opacity: 1.0,
            ..Default::default()
        },
    );

    let alpha = pixels
        .chunks_exact(4)
        .map(|pixel| pixel[3])
        .filter(|&value| value != 0)
        .collect::<Vec<_>>();
    assert_eq!(
        alpha.len(),
        32 * 16,
        "90° rotation must cover the expected rectangle"
    );
    assert!(
        alpha.iter().all(|&value| value == 255),
        "axis-aligned 90° rotation must not introduce edge transparency"
    );
}

#[test]
fn transformed_image_diagonal_rotation_produces_coverage_ramp() {
    let diagonal = std::f32::consts::FRAC_1_SQRT_2;
    let pixels = render_transformed_image(
        32,
        32,
        64,
        64,
        BridgeImageTransformInstance {
            // A 32×32 image rotated 45° around the 64×64 target center.
            p0x: 0.0,
            p0y: diagonal,
            p1x: diagonal,
            p1y: 0.0,
            p2x: -diagonal,
            p2y: 0.0,
            p3x: 0.0,
            p3y: -diagonal,
            opacity: 1.0,
            ..Default::default()
        },
    );

    let mut partial = false;
    let mut opaque = false;
    for pixel in pixels.chunks_exact(4) {
        match pixel[3] {
            1..=254 => partial = true,
            255 => opaque = true,
            _ => {}
        }
    }
    assert!(
        partial,
        "diagonal transform must retain analytic edge coverage"
    );
    assert!(
        opaque,
        "diagonal transform must retain fully covered interior pixels"
    );
}
