struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) radii: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
}

fn corner_radius(p: vec2<f32>, radii: vec4<f32>) -> f32 {
  if (p.x >= 0.0 && p.y < 0.0) { return radii.y; }
  if (p.x >= 0.0 && p.y >= 0.0) { return radii.z; }
  if (p.x < 0.0 && p.y >= 0.0) { return radii.w; }
  return radii.x;
}

fn sd_round_rect_corners(p: vec2<f32>, half_size: vec2<f32>, radii: vec4<f32>) -> f32 {
  let radius = corner_radius(p, radii);
  let q = abs(p) - (half_size - vec2<f32>(radius, radius));
  return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) radii: vec4<f32>,
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
  out.color = color;
  out.radii = radii;
  out.params0 = params0;
  out.params1 = params1;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let size = in.params0.xy;
  let offset = in.params0.zw;
  let blur = max(in.params1.x, 0.0);
  let pad = blur * 2.0;
  let expanded = size + vec2<f32>(abs(offset.x) + pad * 2.0, abs(offset.y) + pad * 2.0);
  let shadow_origin = vec2<f32>(max(offset.x, 0.0) + pad, max(offset.y, 0.0) + pad);
  let shadow_center = shadow_origin + size * 0.5;
  let p = in.uv * expanded - shadow_center;
  let half_size = size * 0.5;
  let sd = sd_round_rect_corners(p, half_size, in.radii);
  let aa = 1.0;
  let sigma = max(blur * 0.5, 0.75);
  let dist = max(sd, 0.0);
  let edge = smoothstep(-aa, 0.0, sd);
  let alpha = exp(-(dist * dist) / (2.0 * sigma * sigma)) * edge;
  if (alpha <= 0.001) {
    discard;
  }
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
