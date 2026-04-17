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
  @location(0) rect: vec4<f32>,
  @location(1) opacity: vec4<f32>,
) -> VSOut {
  var quad_pos = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  var quad_uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  let uv = quad_uv[vertex_index];
  let pos = quad_pos[vertex_index];
  var out: VSOut;
  out.position = vec4<f32>(rect.x + pos.x * rect.z, rect.y + pos.y * rect.w, 0.0, 1.0);
  out.uv = uv;
  out.opacity = opacity.x;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, in.uv);
  return vec4<f32>(color.rgb, color.a * in.opacity);
}
