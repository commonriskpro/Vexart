struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) opacity: f32,
}

@group(0) @binding(0) var image_tex: texture_2d<f32>;
@group(0) @binding(1) var image_sampler: sampler;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) p0: vec4<f32>,
  @location(1) p1: vec4<f32>,
  @location(2) opacity: vec4<f32>,
) -> VSOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(p0.x, p0.y),
    vec2<f32>(p0.z, p0.w),
    vec2<f32>(p1.x, p1.y),
    vec2<f32>(p1.x, p1.y),
    vec2<f32>(p0.z, p0.w),
    vec2<f32>(p1.z, p1.w),
  );
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  var out: VSOut;
  out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  out.uv = uvs[vertex_index];
  out.opacity = opacity.x;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, in.uv);
  return vec4<f32>(color.rgb, color.a * in.opacity);
}
