struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
}

fn sd_round_rect(p: vec2<f32>, half_size: vec2<f32>, radius: f32) -> f32 {
  let q = abs(p) - (half_size - vec2<f32>(radius, radius));
  return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
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
  out.uv = uv;
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.params0 = params0;
  out.params1 = params1;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let radius = in.params0.x;
  let stroke_width = in.params0.y;
  let has_fill = in.params0.z;
  let has_stroke = in.params0.w;
  let size = in.params1.xy;
  let p = in.uv * size - size * 0.5;
  let half_size = size * 0.5;
  let sd = sd_round_rect(p, half_size, radius);
  let aa = 1.0;
  if (sd > aa) {
    discard;
  }
  if (has_stroke > 0.5 && sd >= -stroke_width - aa) {
    let alpha = select(1.0 - smoothstep(0.0, aa, sd), 1.0, sd <= 0.0);
    return vec4<f32>(in.stroke_color.rgb, in.stroke_color.a * alpha);
  }
  if (has_fill > 0.5) {
    let alpha = 1.0 - smoothstep(0.0, aa, sd);
    return vec4<f32>(in.fill_color.rgb, in.fill_color.a * alpha);
  }
  discard;
}
