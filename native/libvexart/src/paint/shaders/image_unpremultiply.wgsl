// image_unpremultiply.wgsl
// Convert a rendered target region (premultiplied RGBA) into a straight-alpha
// image before it enters the uploaded-image/compositor path.

@group(0) @binding(0) var t_source: texture_2d<f32>;
@group(0) @binding(1) var s_source: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) source_uv: vec4<f32>,
) -> VSOut {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );

  let uv = quad[vertex_index];
  var out: VSOut;
  out.position = vec4<f32>(rect.x + uv.x * rect.z, rect.y + uv.y * rect.w, 0.0, 1.0);
  out.uv = vec2<f32>(
    mix(source_uv.x, source_uv.z, uv.x),
    mix(source_uv.y, source_uv.w, uv.y),
  );
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(t_source, s_source, in.uv);
  let rgb = select(
    vec3<f32>(0.0),
    clamp(sampled.rgb / max(sampled.a, 0.000001), vec3<f32>(0.0), vec3<f32>(1.0)),
    sampled.a > 0.000001,
  );
  return vec4<f32>(rgb, sampled.a);
}
