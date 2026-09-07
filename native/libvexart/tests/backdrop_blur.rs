// Focused GPU regression test for the separable backdrop blur response.
// Run with: `cargo test --features gpu-tests --test backdrop_blur`.

#![cfg(feature = "gpu-tests")]

use vexart::ffi::panic::OK;

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

fn blur_source(source: &[u8], width: u32, blur_radius: f32) -> Vec<u8> {
    assert_eq!(source.len(), (width * 4) as usize);

    let mut image = 0u64;
    let upload = unsafe {
        vexart::vexart_paint_upload_image(
            0,
            source.as_ptr(),
            source.len() as u32,
            width,
            1,
            0,
            &mut image,
        )
    };
    assert_eq!(upload, OK);

    let params = [blur_radius, 100.0, 100.0, 100.0, 0.0, 0.0, 0.0, 0.0];
    let mut filtered = 0u64;
    let filter = unsafe {
        vexart::vexart_composite_image_filter_backdrop(
            0,
            image,
            params.as_ptr() as *const u8,
            std::mem::size_of_val(&params) as u32,
            &mut filtered,
        )
    };
    assert_eq!(filter, OK);

    let mut target = 0u64;
    let create = unsafe { vexart::vexart_composite_target_create(0, width, 1, &mut target) };
    assert_eq!(create, OK);
    assert_eq!(
        vexart::vexart_composite_target_begin_layer(0, target, 0, 0),
        OK
    );
    assert_eq!(
        vexart::vexart_composite_render_image_layer(
            0,
            target,
            filtered,
            0.0,
            0.0,
            width as f32,
            1.0,
            0,
            0,
        ),
        OK
    );
    assert_eq!(vexart::vexart_composite_target_end_layer(0, target), OK);

    let pixels = readback_target(target, width, 1);
    assert_eq!(vexart::vexart_composite_target_destroy(0, target), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, filtered), OK);
    assert_eq!(vexart::vexart_paint_remove_image(0, image), OK);
    pixels
}

#[test]
fn backdrop_blur_impulse_is_dense_symmetric_and_color_safe() {
    let width = 64u32;
    let center = width as usize / 2;
    let mut source = vec![0u8; (width * 4) as usize];
    source[center * 4..center * 4 + 4].copy_from_slice(&[255, 255, 255, 255]);
    let pixels = blur_source(&source, width, 8.0);
    let alpha = pixels
        .chunks_exact(4)
        .map(|pixel| pixel[3])
        .collect::<Vec<_>>();
    let red = pixels
        .chunks_exact(4)
        .map(|pixel| pixel[0])
        .collect::<Vec<_>>();

    for x in center - 8..=center + 8 {
        assert!(alpha[x] > 0, "blur response has a gap at x={x}");
        assert!(
            red[x] >= alpha[x].saturating_sub(2),
            "blur darkened white at x={x}"
        );
        assert_eq!(pixels[x * 4], pixels[x * 4 + 1]);
        assert_eq!(pixels[x * 4], pixels[x * 4 + 2]);
    }
    assert_eq!(
        alpha[center - 9],
        0,
        "response escaped the configured radius"
    );
    assert_eq!(
        alpha[center + 9],
        0,
        "response escaped the configured radius"
    );
    assert!(
        red[center - 1] > red[center - 8],
        "Gaussian response should decay from the impulse center"
    );
    assert!(
        red[center] >= red[center - 1],
        "center should be the strongest response"
    );
    for distance in 1..=8 {
        let left = red[center - distance] as i16;
        let right = red[center + distance] as i16;
        assert!(
            (left - right).abs() <= 2,
            "response is asymmetric at distance {distance}"
        );
    }

    let uniform = [31u8, 79, 127, 255].repeat(width as usize);
    let uniform_pixels = blur_source(&uniform, width, 8.0);
    for pixel in uniform_pixels.chunks_exact(4) {
        assert!(pixel[0].abs_diff(31) <= 1);
        assert!(pixel[1].abs_diff(79) <= 1);
        assert!(pixel[2].abs_diff(127) <= 1);
        assert_eq!(pixel[3], 255);
    }
}
