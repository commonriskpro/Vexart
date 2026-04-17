struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) p0c: vec4<f32>,
  @location(2) p1s: vec4<f32>,
  @location(3) color: vec4<f32>,
  @location(4) params: vec4<f32>,
}

fn quad_bezier(a: vec2<f32>, b: vec2<f32>, c: vec2<f32>, t: f32) -> vec2<f32> {
  let ab = mix(a, b, t);
  let bc = mix(b, c, t);
  return mix(ab, bc, t);
}

fn segment_distance(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let denom = max(dot(ab, ab), 0.0001);
  let t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  let q = a + ab * t;
  return length(p - q);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) p0c: vec4<f32>,
  @location(2) p1s: vec4<f32>,
  @location(3) color: vec4<f32>,
  @location(4) params: vec4<f32>,
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
  out.p0c = p0c;
  out.p1s = p1s;
  out.color = color;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.uv * in.p1s.zw;
  let p0 = in.p0c.xy;
  let c = in.p0c.zw;
  let p1 = in.p1s.xy;
  let stroke_half = max(0.5, in.params.x * 0.5);
  let aa = max(0.75, in.params.y);
  var min_dist = 1e9;
  var prev = p0;
  for (var i: u32 = 1u; i <= 32u; i = i + 1u) {
    let t = f32(i) / 32.0;
    let curr = quad_bezier(p0, c, p1, t);
    min_dist = min(min_dist, segment_distance(p, prev, curr));
    prev = curr;
  }
  if (min_dist > stroke_half + aa) {
    discard;
  }
  let alpha = 1.0 - smoothstep(stroke_half, stroke_half + aa, min_dist);
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
