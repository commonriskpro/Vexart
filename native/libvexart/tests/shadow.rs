// Focused GPU regression tests for analytic shadow offsets.
// Run with: `cargo test --features gpu-tests --test shadow`.

#![cfg(feature = "gpu-tests")]

use vexart::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
use vexart::ffi::panic::OK;
use vexart::paint::instances::BridgeShadowInstance;

const WIDTH: u32 = 64;
const HEIGHT: u32 = 64;
const BACKGROUND: [u8; 4] = [16, 16, 16, 255];

fn shadow_graph(instances: &[BridgeShadowInstance]) -> Vec<u8> {
    let body = bytemuck::cast_slice(instances);
    let payload_size = 8 + body.len();
    let mut graph = vec![0u8; 16 + payload_size];
    graph[0..4].copy_from_slice(&GRAPH_MAGIC.to_le_bytes());
    graph[4..8].copy_from_slice(&GRAPH_VERSION.to_le_bytes());
    graph[8..12].copy_from_slice(&1u32.to_le_bytes());
    graph[12..16].copy_from_slice(&(payload_size as u32).to_le_bytes());
    graph[16..18].copy_from_slice(&20u16.to_le_bytes());
    graph[18..20].copy_from_slice(&0u16.to_le_bytes());
    graph[20..24].copy_from_slice(&(body.len() as u32).to_le_bytes());
    graph[24..].copy_from_slice(body);
    graph
}

fn render_shadows(instances: &[BridgeShadowInstance]) -> Vec<u8> {
    let mut target = 0u64;
    let create = unsafe { vexart::vexart_composite_target_create(0, WIDTH, HEIGHT, &mut target) };
    assert_eq!(create, OK);
    assert_eq!(
        vexart::vexart_composite_target_begin_layer(
            0,
            target,
            0,
            (BACKGROUND[0] as u32) << 24
                | (BACKGROUND[1] as u32) << 16
                | (BACKGROUND[2] as u32) << 8
                | BACKGROUND[3] as u32,
        ),
        OK
    );
    let graph = shadow_graph(instances);
    let dispatch = unsafe {
        vexart::vexart_paint_dispatch(
            0,
            target,
            graph.as_ptr(),
            graph.len() as u32,
            std::ptr::null_mut(),
        )
    };
    assert_eq!(dispatch, OK);
    assert_eq!(vexart::vexart_composite_target_end_layer(0, target), OK);

    let mut pixels = vec![0u8; (WIDTH * HEIGHT * 4) as usize];
    assert_eq!(
        unsafe {
            vexart::vexart_composite_readback_rgba(
                0,
                target,
                pixels.as_mut_ptr(),
                pixels.len() as u32,
                std::ptr::null_mut(),
            )
        },
        OK
    );
    assert_eq!(vexart::vexart_composite_target_destroy(0, target), OK);
    pixels
}

fn pixel(pixels: &[u8], x: u32, y: u32) -> [u8; 4] {
    let offset = ((y * WIDTH + x) * 4) as usize;
    pixels[offset..offset + 4].try_into().unwrap()
}

fn create_shadow(
    source_x: f32,
    source_y: f32,
    box_w: f32,
    box_h: f32,
    offset_x: f32,
    offset_y: f32,
    blur: f32,
    radii: [f32; 4],
    color: [f32; 4],
) -> BridgeShadowInstance {
    let pad = blur.max(0.0).ceil() * 2.0;
    let quad_left = source_x + offset_x.min(0.0) - pad;
    let quad_top = source_y + offset_y.min(0.0) - pad;
    let quad_right = source_x + box_w + offset_x.max(0.0) + pad;
    let quad_bottom = source_y + box_h + offset_y.max(0.0) + pad;
    let quad_w = quad_right - quad_left;
    let quad_h = quad_bottom - quad_top;

    let ndc_x = (quad_left / WIDTH as f32) * 2.0 - 1.0;
    let ndc_y = 1.0 - (quad_top / HEIGHT as f32) * 2.0;
    let ndc_w = (quad_w / WIDTH as f32) * 2.0;
    let ndc_h = -((quad_h / HEIGHT as f32) * 2.0);

    BridgeShadowInstance {
        x: ndc_x,
        y: ndc_y,
        w: ndc_w,
        h: ndc_h,
        color_r: color[0],
        color_g: color[1],
        color_b: color[2],
        color_a: color[3],
        radius_tl: radii[0],
        radius_tr: radii[1],
        radius_br: radii[2],
        radius_bl: radii[3],
        box_w,
        box_h,
        offset_x,
        offset_y,
        blur,
        ..Default::default()
    }
}

fn shadow(color: [f32; 4], rect_top: f32, rect_height: f32, offset_y: f32) -> BridgeShadowInstance {
    BridgeShadowInstance {
        x: -0.25,
        y: 1.0 - rect_top / HEIGHT as f32 * 2.0,
        w: 0.5,
        h: -rect_height / HEIGHT as f32 * 2.0,
        color_r: color[0],
        color_g: color[1],
        color_b: color[2],
        color_a: color[3],
        box_w: 16.0,
        box_h: 12.0,
        offset_x: 0.0,
        offset_y,
        blur: 0.0,
        ..Default::default()
    }
}

#[test]
fn signed_shadow_offsets_follow_screen_y_direction() {
    let positive = render_shadows(&[shadow([1.0, 0.0, 0.0, 1.0], 20.0, 20.0, 8.0)]);
    let above = pixel(&positive, 32, 16);
    let below = pixel(&positive, 32, 32);
    assert_eq!(
        above, BACKGROUND,
        "+y shadow must not paint above its source"
    );
    assert!(below[0] > 200 && below[1] < 20 && below[2] < 20);

    let signed = render_shadows(&[
        shadow([1.0, 0.0, 0.0, 1.0], 20.0, 20.0, 8.0),
        shadow([0.0, 0.0, 1.0, 1.0], 12.0, 20.0, -8.0),
    ]);
    let negative_side = pixel(&signed, 32, 12);
    let positive_side = pixel(&signed, 32, 32);
    assert!(
        negative_side[2] > 200 && negative_side[0] < 20,
        "-y shadow must paint above its source"
    );
    assert!(
        positive_side[0] > 200 && positive_side[2] < 20,
        "+y shadow must paint below its source"
    );
}

#[test]
fn horizontal_negative_and_positive_offsets() {
    // Source box: 16x16 at (24, 24).
    // Positive horizontal offset: offset_x = 8.0, offset_y = 0.0 (spans x: 32..48, y: 24..40)
    let positive = render_shadows(&[create_shadow(
        24.0, 24.0, 16.0, 16.0,
        8.0, 0.0, 0.0,
        [0.0; 4],
        [1.0, 0.0, 0.0, 1.0],
    )]);
    let pos_left_outside = pixel(&positive, 28, 32);
    let pos_inside = pixel(&positive, 40, 32);
    let pos_right_outside = pixel(&positive, 52, 32);

    assert_eq!(
        pos_left_outside, BACKGROUND,
        "+x shadow must not paint to the left of the shifted shadow rect"
    );
    assert!(
        pos_inside[0] > 200 && pos_inside[1] < 20 && pos_inside[2] < 20,
        "+x shadow must paint inside the shifted shadow rect"
    );
    assert_eq!(
        pos_right_outside, BACKGROUND,
        "+x shadow must not paint to the right of the shifted shadow rect"
    );

    // Negative horizontal offset: offset_x = -8.0, offset_y = 0.0 (spans x: 16..32, y: 24..40)
    let negative = render_shadows(&[create_shadow(
        24.0, 24.0, 16.0, 16.0,
        -8.0, 0.0, 0.0,
        [0.0; 4],
        [0.0, 0.0, 1.0, 1.0],
    )]);
    let neg_left_outside = pixel(&negative, 12, 32);
    let neg_inside = pixel(&negative, 24, 32);
    let neg_right_outside = pixel(&negative, 36, 32);

    assert_eq!(
        neg_left_outside, BACKGROUND,
        "-x shadow must not paint to the left of the shifted shadow rect"
    );
    assert!(
        neg_inside[2] > 200 && neg_inside[0] < 20 && neg_inside[1] < 20,
        "-x shadow must paint inside the shifted shadow rect"
    );
    assert_eq!(
        neg_right_outside, BACKGROUND,
        "-x shadow must not paint to the right of the shifted shadow rect (un-offset source region)"
    );
}

#[test]
fn diagonal_negative_offsets() {
    // Source box: 16x16 at (24, 24).
    // Diagonal negative offset: offset_x = -8.0, offset_y = -8.0 (spans x: 16..32, y: 16..32)
    let diagonal = render_shadows(&[create_shadow(
        24.0, 24.0, 16.0, 16.0,
        -8.0, -8.0, 0.0,
        [0.0; 4],
        [0.0, 1.0, 0.0, 1.0],
    )]);

    let inside_diag = pixel(&diagonal, 24, 24);
    let orig_source_br = pixel(&diagonal, 36, 36);
    let outside_tl = pixel(&diagonal, 12, 12);
    let outside_bl = pixel(&diagonal, 24, 36);
    let outside_tr = pixel(&diagonal, 36, 24);

    assert!(
        inside_diag[1] > 200 && inside_diag[0] < 20 && inside_diag[2] < 20,
        "(-8, -8) shadow must paint inside shifted shadow rect"
    );
    assert_eq!(
        orig_source_br, BACKGROUND,
        "(-8, -8) shadow must not paint in bottom-right original source area"
    );
    assert_eq!(
        outside_tl, BACKGROUND,
        "(-8, -8) shadow must not paint outside top-left"
    );
    assert_eq!(
        outside_bl, BACKGROUND,
        "(-8, -8) shadow must not paint below shifted shadow rect"
    );
    assert_eq!(
        outside_tr, BACKGROUND,
        "(-8, -8) shadow must not paint to the right of shifted shadow rect"
    );
}

#[test]
fn blur_falloff_and_rounded_corner_radii() {
    // 1. Blur falloff verification
    // Source box: 16x16 at (24, 24), centered at (32, 32). Spans x: 24..40, y: 24..40.
    // blur = 4.0 (pad = 8.0, sigma = 2.0).
    let blurred = render_shadows(&[create_shadow(
        24.0, 24.0, 16.0, 16.0,
        0.0, 0.0, 4.0,
        [0.0; 4],
        [1.0, 0.0, 0.0, 1.0],
    )]);

    // Sample along y = 32 from inside out towards the right edge:
    // x = 32 (center), x = 40 (edge), x = 41 (dist 1), x = 43 (dist 3), x = 46 (dist 6), x = 58 (outside pad)
    let p_inside = pixel(&blurred, 32, 32)[0];
    let p_dist1 = pixel(&blurred, 41, 32)[0];
    let p_dist3 = pixel(&blurred, 43, 32)[0];
    let p_dist6 = pixel(&blurred, 46, 32)[0];
    let p_outside = pixel(&blurred, 58, 32);

    assert!(
        p_inside > 240,
        "Inside blurred shadow must have high alpha"
    );
    assert!(
        p_inside >= p_dist1,
        "Blur falloff: inside (center) >= dist 1"
    );
    assert!(
        p_dist1 > p_dist3,
        "Blur falloff: dist 1 > dist 3"
    );
    assert!(
        p_dist3 > p_dist6,
        "Blur falloff: dist 3 > dist 6"
    );
    assert!(
        p_dist6 >= BACKGROUND[0],
        "Blur falloff: dist 6 >= background"
    );
    assert_eq!(
        p_outside, BACKGROUND,
        "Point outside shadow pad must be background"
    );

    // 2. Fractional blur verification (pad alignment: ceil(2.5) * 2.0 == 6.0)
    let frac_blurred = render_shadows(&[create_shadow(
        24.0, 24.0, 16.0, 16.0,
        -4.0, -4.0, 2.5,
        [0.0; 4],
        [1.0, 0.0, 0.0, 1.0],
    )]);
    let p_frac_inside = pixel(&frac_blurred, 28, 28)[0];
    let p_frac_outside = pixel(&frac_blurred, 4, 4);
    assert!(
        p_frac_inside > 200,
        "Fractional blur must evaluate correctly inside shadow"
    );
    assert_eq!(
        p_frac_outside, BACKGROUND,
        "Fractional blur must not leak beyond calculated quad"
    );

    // 3. Rounded corner radii verification
    // Source box: 24x24 at (20, 20). Spans x: 20..44, y: 20..44.
    // Asymmetric radii: [10.0, 0.0, 0.0, 0.0] -> top-left is rounded with r=10.0,
    // top-right, bottom-right, bottom-left are sharp (r=0.0).
    let rounded = render_shadows(&[create_shadow(
        20.0, 20.0, 24.0, 24.0,
        0.0, 0.0, 0.0,
        [10.0, 0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, 1.0],
    )]);

    // Top-left corner: (20, 20) and (21, 21) are outside the r=10 arc (center of arc is 30, 30; dist to (21,21) is sqrt(162) ≈ 12.7 > 10)
    let tl_cutout = pixel(&rounded, 21, 21);
    let tl_corner = pixel(&rounded, 20, 20);

    // Sharp corners: (43, 21) is inside top-right, (43, 43) is inside bottom-right, (21, 43) is inside bottom-left
    let tr_sharp = pixel(&rounded, 43, 21);
    let br_sharp = pixel(&rounded, 43, 43);
    let bl_sharp = pixel(&rounded, 21, 43);

    assert_eq!(
        tl_corner, BACKGROUND,
        "Top-left corner with radius 10 must be carved out at (20, 20)"
    );
    assert!(
        tl_cutout[0] < 30,
        "Top-left cutout at (21, 21) must be near background (< 30) due to radius 10 curvature, got {:?}",
        tl_cutout
    );
    assert!(
        tr_sharp[0] > 200 && tr_sharp[1] < 20 && tr_sharp[2] < 20,
        "Top-right sharp corner (radius 0) must be painted"
    );
    assert!(
        br_sharp[0] > 200 && br_sharp[1] < 20 && br_sharp[2] < 20,
        "Bottom-right sharp corner (radius 0) must be painted"
    );
    assert!(
        bl_sharp[0] > 200 && bl_sharp[1] < 20 && bl_sharp[2] < 20,
        "Bottom-left sharp corner (radius 0) must be painted"
    );
}
