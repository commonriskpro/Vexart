struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) params0: vec4<f32>,
  @location(2) warm: vec4<f32>,
  @location(3) neutral: vec4<f32>,
  @location(4) cool: vec4<f32>,
}

fn hash21(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(hash21(p), hash21(p + vec2<f32>(19.19, 7.13)));
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) params0: vec4<f32>,
  @location(2) warm: vec4<f32>,
  @location(3) neutral: vec4<f32>,
  @location(4) cool: vec4<f32>,
) -> VSOut {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
  );
  let uv = quad[vertex_index];
  var out: VSOut;
  out.position = vec4<f32>(rect.x + uv.x * rect.z, rect.y + uv.y * rect.w, 0.0, 1.0);
  out.uv = uv;
  out.params0 = params0;
  out.warm = warm;
  out.neutral = neutral;
  out.cool = cool;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let seed = in.params0.x;
  let count = max(1.0, in.params0.y);
  let cluster_count = max(0.0, in.params0.z);
  let cluster_stars = max(0.0, in.params0.w);
  let density = count / 1200.0;
  let cell = floor(in.uv * vec2<f32>(160.0, 90.0));
  let local = fract(in.uv * vec2<f32>(160.0, 90.0)) - 0.5;
  let rnd = hash22(cell + seed);
  let star = smoothstep(0.03 + density * 0.1, 0.0, length(local - (rnd - 0.5) * 0.8)) * step(1.0 - density, rnd.x);
  let cluster_density = (cluster_count * cluster_stars) / 12000.0;
  let cluster = hash21(floor(in.uv * vec2<f32>(28.0, 16.0)) + seed * 1.7);
  let cluster_boost = smoothstep(1.0 - cluster_density, 1.0, cluster);
  let twinkle = 0.65 + 0.35 * sin((rnd.x + rnd.y + seed) * 32.0);
  let warmth = hash21(cell + vec2<f32>(seed * 2.1, seed * 0.7));
  let color = mix(in.neutral, mix(in.warm, in.cool, step(0.55, warmth)), step(0.2, abs(warmth - 0.5)));
  let alpha = clamp((star + cluster_boost * star * 0.6) * twinkle, 0.0, 1.0);
  return vec4<f32>(color.rgb, color.a * alpha);
}
