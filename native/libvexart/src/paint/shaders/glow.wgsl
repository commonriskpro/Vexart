struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) params: vec4<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) params: vec4<f32>,
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
  out.uv = uv * 2.0 - vec2<f32>(1.0, 1.0);
  out.color = color;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) {
    discard;
  }
  let intensity = clamp(in.params.x / 100.0, 0.0, 1.0);
  let power = mix(2.4, 0.8, intensity);
  let alpha = pow(max(0.0, 1.0 - d), power);
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
