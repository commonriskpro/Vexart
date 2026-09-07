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
