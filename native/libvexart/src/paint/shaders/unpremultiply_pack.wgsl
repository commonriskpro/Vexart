// unpremultiply_pack.wgsl
// GPU compute shader: read premultiplied RGBA target (with optional regional origin offset),
// convert to straight-alpha RGBA, pack into little-endian u32 pixels, and write to a contiguous 1D output buffer.

struct Uniforms {
    width: u32,
    height: u32,
    origin_x: u32,
    origin_y: u32,
}

@group(0) @binding(0) var t_input: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_buffer: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= uniforms.width || id.y >= uniforms.height) {
        return;
    }

    let coord = vec2<i32>(i32(id.x + uniforms.origin_x), i32(id.y + uniforms.origin_y));
    let pixel = textureLoad(t_input, coord, 0);
    let a = pixel.a;
    let rgb = select(
        vec3<f32>(0.0),
        clamp(pixel.rgb / max(a, 0.000001), vec3<f32>(0.0), vec3<f32>(1.0)),
        a > 0.000001,
    );

    let r = u32(clamp(rgb.r * 255.0 + 0.5, 0.0, 255.0));
    let g = u32(clamp(rgb.g * 255.0 + 0.5, 0.0, 255.0));
    let b = u32(clamp(rgb.b * 255.0 + 0.5, 0.0, 255.0));
    let a_u32 = u32(clamp(a * 255.0 + 0.5, 0.0, 255.0));

    let packed = r | (g << 8u) | (b << 16u) | (a_u32 << 24u);
    output_buffer[id.y * uniforms.width + id.x] = packed;
}
