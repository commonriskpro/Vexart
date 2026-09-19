struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) p0c: vec4<f32>,
  @location(2) p1s: vec4<f32>,
  @location(3) color: vec4<f32>,
  @location(4) params: vec4<f32>,
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

  let e0 = c - p0;
  let e1 = p1 - p0;
  let ep = p - p0;
  let det = e0.x * e1.y - e0.y * e1.x;

  var dist: f32;
  if (abs(det) < 0.0001) {
    // Collinear control points: fallback to line segment distance
    dist = segment_distance(p, p0, p1);
  } else {
    // Loop-Blinn implicit formulation:
    // Map p to canonical (u, v) affine coordinates where curve is u^2 - v = 0.
    let w1 = (ep.x * e1.y - ep.y * e1.x) / det;
    let w2 = (e0.x * ep.y - e0.y * ep.x) / det;

    let u = 0.5 * w1 + w2;
    let v = w2;

    let f = u * u - v;
    let grad = vec2<f32>(dpdx(f), dpdy(f));
    let grad_len = max(length(grad), 0.0001);
    let dist_curve = abs(f) / grad_len;

    if (u < 0.0) {
      dist = length(p - p0);
    } else if (u > 1.0) {
      dist = length(p - p1);
    } else {
      dist = dist_curve;
    }
  }

  let alpha = 1.0 - smoothstep(stroke_half, stroke_half + aa, dist);
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
