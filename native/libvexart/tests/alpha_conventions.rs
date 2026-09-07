// Focused GPU regression tests for target/image alpha conventions.
// Run with: `cargo test --features gpu-tests --test alpha_conventions`.

#![cfg(feature = "gpu-tests")]

use vexart::ffi::panic::OK;
use vexart::paint::instances::BridgeImageTransformInstance;

const WIDTH: u32 = 4;
const HEIGHT: u32 = 4;

fn readback_target_size(target: u64, width: u32, height: u32) -> Vec<u8> {
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

fn readback_target(target: u64) -> Vec<u8> {
    readback_target_size(target, WIDTH, HEIGHT)
}

fn upload_uniform(rgba: [u8; 4]) -> u64 {
    let source = rgba.repeat((WIDTH * HEIGHT) as usize);
    let mut image = 0u64;
    let result = unsafe {
        vexart::vexart_paint_upload_image(
            0,
            source.as_ptr(),
            source.len() as u32,
            WIDTH,
            HEIGHT,
            0,
            &mut image,
        )
    };
    assert_eq!(result, OK);
    image
}

fn render_image(image: u64, clear_rgba: u32) -> u64 {
    let mut target = 0u64;
    let result = unsafe { vexart::vexart_composite_target_create(0, WIDTH, HEIGHT, &mut target) };
    assert_eq!(result, OK);
    assert_eq!(
        vexart::vexart_composite_target_begin_layer(0, target, 0, clear_rgba),
        OK
    );
    assert_eq!(
        vexart::vexart_composite_render_image_layer(
            0,
            target,
            image,
            0.0,
            0.0,
            WIDTH as f32,
            HEIGHT as f32,
            0,
            clear_rgba,
        ),
        OK
    );
    assert_eq!(vexart::vexart_composite_target_end_layer(0, target), OK);
    target
}

fn copy_target(target: u64) -> u64 {
    let mut image = 0u64;
    let result = unsafe {
        vexart::vexart_composite_copy_region_to_image(0, target, 0, 0, WIDTH, HEIGHT, &mut image)
    };
    assert_eq!(result, OK);
    image
}

fn copy_image(image: u64) -> u64 {
    let target = render_image(image, 0x00000000);
    let copied = copy_target(target);
    assert_eq!(vexart::vexart_composite_target_destroy(0, target), OK);
    copied
}

fn render_and_read(image: u64, clear_rgba: u32) -> Vec<u8> {
    let target = render_image(image, clear_rgba);
    let pixels = readback_target(target);
    assert_eq!(vexart::vexart_composite_target_destroy(0, target), OK);
    pixels
}

fn render_target_transform(
    source_target: u64,
    width: u32,
    height: u32,
    clear_rgba: u32,
    instance: BridgeImageTransformInstance,
) -> Vec<u8> {
    let mut target = 0u64;
    let create = unsafe { vexart::vexart_composite_target_create(0, width, height, &mut target) };
    assert_eq!(create, OK);
    assert_eq!(
        vexart::vexart_composite_target_begin_layer(0, target, 0, clear_rgba),
        OK
    );

    let params = bytemuck::bytes_of(&instance);
    let update = unsafe {
        vexart::vexart_composite_update_uniform(
            0,
            target,
            source_target,
            params.as_ptr(),
            clear_rgba,
        )
    };
    assert_eq!(update, OK);
    assert_eq!(vexart::vexart_composite_target_end_layer(0, target), OK);

    let pixels = readback_target_size(target, width, height);
    assert_eq!(vexart::vexart_composite_target_destroy(0, target), OK);
    pixels
}

fn render_target_over(source_target: u64, clear_rgba: u32, opacity: f32) -> Vec<u8> {
    render_target_transform(
        source_target,
        WIDTH,
        HEIGHT,
        clear_rgba,
        BridgeImageTransformInstance {
            p0x: -1.0,
            p0y: -1.0,
            p1x: 1.0,
            p1y: -1.0,
            p2x: -1.0,
            p2y: 1.0,
            p3x: 1.0,
            p3y: 1.0,
            opacity,
            ..Default::default()
        },
    )
}

fn filter_image(image: u64) -> u64 {
    let params = [
        f32::NAN,
        f32::NAN,
        f32::NAN,
        f32::NAN,
        100.0,
        f32::NAN,
        f32::NAN,
        f32::NAN,
    ];
    let mut filtered = 0u64;
    let result = unsafe {
        vexart::vexart_composite_image_filter_backdrop(
            0,
            image,
            params.as_ptr() as *const u8,
            std::mem::size_of_val(&params) as u32,
            &mut filtered,
        )
    };
    assert_eq!(result, OK);
    filtered
}

fn mask_image(image: u64) -> u64 {
    let params = [0.0f32, 0.0, 0.0, 0.0, 0.0, 0.0];
    let mut masked = 0u64;
    let result = unsafe {
        vexart::vexart_composite_image_mask_rounded_rect(
            0,
            image,
            params.as_ptr() as *const u8,
            &mut masked,
        )
    };
    assert_eq!(result, OK);
    masked
}

fn center(pixels: &[u8]) -> [u8; 4] {
    let offset = ((HEIGHT / 2 * WIDTH + WIDTH / 2) * 4) as usize;
    pixels[offset..offset + 4].try_into().unwrap()
}

fn expect_near(actual: [u8; 4], expected: [u8; 4], tolerance: u8) {
    for (actual, expected) in actual.into_iter().zip(expected) {
        assert!(
            actual.abs_diff(expected) <= tolerance,
            "actual {actual} differs from expected {expected}"
        );
    }
}

#[test]
fn target_copies_filters_and_masks_preserve_straight_image_color() {
    let source = upload_uniform([200, 100, 50, 128]);
    let source_target = render_image(source, 0x00000000);
    let copied = copy_target(source_target);

    // A target stores the source once-premultiplied after its first image
    // composite. Copying it back to an image must restore straight RGBA.
    expect_near(
        center(&render_and_read(copied, 0x00000000)),
        [100, 50, 25, 128],
        2,
    );

    let copied_again = copy_image(copied);
    expect_near(
        center(&render_and_read(copied_again, 0x0a141eff)),
        [105, 60, 40, 255],
        3,
    );

    // Retained compositing reads another target directly, so its premultiplied
    // source needs premultiplied blend factors rather than the straight-image
    // factors used by uploaded/copied images.
    expect_near(
        center(&render_target_over(source_target, 0x0a141eff, 1.0)),
        [105, 60, 40, 255],
        3,
    );
    expect_near(
        center(&render_target_over(source_target, 0x0a141eff, 0.5)),
        [58, 40, 35, 255],
        3,
    );

    let diagonal = std::f32::consts::FRAC_1_SQRT_2;
    let rotated = render_target_transform(
        source_target,
        8,
        8,
        0x0a141eff,
        BridgeImageTransformInstance {
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
    let rotated_pixels = rotated.chunks_exact(4).collect::<Vec<_>>();
    assert!(
        rotated_pixels
            .iter()
            .any(|pixel| pixel[2] > 30 && pixel[2] < 40),
        "rotated premultiplied target must retain a partial edge ramp"
    );
    assert!(
        rotated_pixels.iter().all(|pixel| pixel[2] >= 30),
        "premultiplied rotated target must not darken the destination blue channel"
    );

    let filtered = filter_image(copied);
    expect_near(
        center(&render_and_read(filtered, 0x0a141eff)),
        [63, 68, 73, 255],
        4,
    );

    let masked = mask_image(copied);
    expect_near(
        center(&render_and_read(masked, 0x0a141eff)),
        [105, 60, 40, 255],
        3,
    );

    assert_eq!(
        vexart::vexart_composite_target_destroy(0, source_target),
        OK
    );
    assert_eq!(vexart::vexart_paint_remove_image(0, masked), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, filtered), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, copied_again), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, copied), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, source), OK);
}
