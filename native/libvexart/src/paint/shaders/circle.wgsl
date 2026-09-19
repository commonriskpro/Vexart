struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params: vec4<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params: vec4<f32>,
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
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let dist = length(in.uv);
  let stroke_norm = in.params.x;
  let has_fill = in.params.y;
  let has_stroke = in.params.z;

  let delta = max(fwidth(dist), 0.0001);
  let outer_alpha = 1.0 - smoothstep(1.0 - delta * 0.5, 1.0 + delta * 0.5, dist);

  let stroke_edge = max(0.0, 1.0 - stroke_norm);
  let inner_alpha = smoothstep(stroke_edge - delta * 0.5, stroke_edge + delta * 0.5, dist);

  var color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

  if (has_stroke > 0.5 && has_fill > 0.5) {
    let mixed = mix(in.fill_color, in.stroke_color, inner_alpha);
    color = vec4<f32>(mixed.rgb, mixed.a * outer_alpha);
  } else if (has_stroke > 0.5) {
    let stroke_cov = outer_alpha * inner_alpha;
    color = vec4<f32>(in.stroke_color.rgb, in.stroke_color.a * stroke_cov);
  } else if (has_fill > 0.5) {
    color = vec4<f32>(in.fill_color.rgb, in.fill_color.a * outer_alpha);
  }

  return color;
}
