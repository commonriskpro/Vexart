struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
}

fn sd_regular_polygon(p: vec2<f32>, sides: f32, radius: f32) -> f32 {
  let n = max(sides, 3.0);
  let a = atan2(p.y, p.x) + 3.141592653589793;
  let b = 6.283185307179586 / n;
  return cos(floor(0.5 + a / b) * b - a) * length(p) - radius;
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
  out.uv = uv * 2.0 - vec2<f32>(1.0, 1.0);
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.params0 = params0;
  out.params1 = params1;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let stroke_norm = in.params0.x;
  let has_fill = in.params0.y;
  let has_stroke = in.params0.z;
  let sides = in.params0.w;
  let rotation = radians(in.params1.x);
  let c = cos(rotation);
  let s = sin(rotation);
  let p = vec2<f32>(
    in.uv.x * c - in.uv.y * s,
    in.uv.x * s + in.uv.y * c,
  );
  let sd = sd_regular_polygon(p, sides, 1.0);
  if (sd > 0.0) { discard; }
  if (has_stroke > 0.5 && sd >= -stroke_norm) {
    return in.stroke_color;
  }
  if (has_fill > 0.5) {
    return in.fill_color;
  }
  discard;
}
