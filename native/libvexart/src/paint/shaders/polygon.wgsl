struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
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

  let n_sides = clamp(u32(sides + 0.5), 3u, 16u);
  let n_f = f32(n_sides);
  let two_pi = 6.283185307179586;

  var max_halfplane: f32 = -1e9;
  var min_dist: f32 = 1e9;

  for (var k: u32 = 0u; k < n_sides; k = k + 1u) {
    let a0 = two_pi * f32(k) / n_f;
    let a1 = two_pi * f32(k + 1u) / n_f;
    let va = vec2<f32>(cos(a0), sin(a0));
    let vb = vec2<f32>(cos(a1), sin(a1));

    let ba = vb - va;
    let pa = p - va;
    let len_sq = dot(ba, ba);
    let edge_len = sqrt(len_sq);
    let normal = vec2<f32>(ba.y, -ba.x) / edge_len;

    let halfplane = dot(pa, normal);
    max_halfplane = max(max_halfplane, halfplane);

    let t = clamp(dot(pa, ba) / len_sq, 0.0, 1.0);
    let seg_dist = length(pa - ba * t);
    min_dist = min(min_dist, seg_dist);
  }

  var sd: f32;
  if (max_halfplane <= 0.0) {
    sd = max_halfplane;
  } else {
    sd = min_dist;
  }

  let delta = max(fwidth(sd), 0.0001);
  let outer_alpha = 1.0 - smoothstep(-delta * 0.5, delta * 0.5, sd);
  let inner_alpha = smoothstep(-stroke_norm - delta * 0.5, -stroke_norm + delta * 0.5, sd);

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
