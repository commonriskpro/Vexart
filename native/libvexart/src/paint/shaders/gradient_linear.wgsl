struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) box: vec2<f32>,
  @location(2) radius: f32,
  @location(3) from_color: vec4<f32>,
  @location(4) to_color: vec4<f32>,
  @location(5) dir: vec2<f32>,
}

fn rounded_mask(local: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
  if (radius <= 0.0) {
    return 1.0;
  }
  let r = min(radius, min(size.x, size.y) * 0.5);
  let q = abs(local - size * 0.5) - (size * 0.5 - vec2<f32>(r, r));
  let outside = length(max(q, vec2<f32>(0.0, 0.0))) - r;
  return select(0.0, 1.0, outside <= 0.0);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) box_radius: vec4<f32>,
  @location(2) from_color: vec4<f32>,
  @location(3) to_color: vec4<f32>,
  @location(4) dir_pad: vec4<f32>,
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
  out.box = box_radius.xy;
  out.radius = box_radius.z;
  out.from_color = from_color;
  out.to_color = to_color;
  out.dir = normalize(vec2<f32>(dir_pad.x, dir_pad.y));
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let mask = rounded_mask(in.uv * in.box, in.box, in.radius);
  if (mask <= 0.0) {
    discard;
  }
  let centered = in.uv - vec2<f32>(0.5, 0.5);
  let t = clamp(dot(centered, in.dir) + 0.5, 0.0, 1.0);
  return mix(in.from_color, in.to_color, t) * mask;
}
