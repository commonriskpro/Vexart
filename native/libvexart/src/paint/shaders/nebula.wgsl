struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) params0: vec4<f32>,
  @location(2) params1: vec4<f32>,
  @location(3) stop0: vec4<f32>,
  @location(4) stop1: vec4<f32>,
  @location(5) stop2: vec4<f32>,
  @location(6) stop3: vec4<f32>,
  @location(7) stopa: vec4<f32>,
}

fn hash21(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p_in: vec2<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var p = p_in;
  var value = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 6; i = i + 1) {
    if (i >= octaves) { break; }
    value = value + noise(p) * amp;
    p = p * lacunarity;
    amp = amp * gain;
  }
  return value;
}

fn sample_gradient(t: f32, stop0: vec4<f32>, stop1: vec4<f32>, stop2: vec4<f32>, stop3: vec4<f32>, stopa: vec4<f32>) -> vec4<f32> {
  if (t <= stop0.x) { return vec4<f32>(stop0.y, stop0.z, stop0.w, stopa.x); }
  if (t <= stop1.x) {
    let u = clamp((t - stop0.x) / max(0.0001, stop1.x - stop0.x), 0.0, 1.0);
    return mix(vec4<f32>(stop0.y, stop0.z, stop0.w, stopa.x), vec4<f32>(stop1.y, stop1.z, stop1.w, stopa.y), u);
  }
  if (t <= stop2.x) {
    let u = clamp((t - stop1.x) / max(0.0001, stop2.x - stop1.x), 0.0, 1.0);
    return mix(vec4<f32>(stop1.y, stop1.z, stop1.w, stopa.y), vec4<f32>(stop2.y, stop2.z, stop2.w, stopa.z), u);
  }
  let u = clamp((t - stop2.x) / max(0.0001, stop3.x - stop2.x), 0.0, 1.0);
  return mix(vec4<f32>(stop2.y, stop2.z, stop2.w, stopa.z), vec4<f32>(stop3.y, stop3.z, stop3.w, stopa.w), u);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) params0: vec4<f32>,
  @location(2) params1: vec4<f32>,
  @location(3) stop0: vec4<f32>,
  @location(4) stop1: vec4<f32>,
  @location(5) stop2: vec4<f32>,
  @location(6) stop3: vec4<f32>,
  @location(7) stopa: vec4<f32>,
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
  out.params1 = params1;
  out.stop0 = stop0;
  out.stop1 = stop1;
  out.stop2 = stop2;
  out.stop3 = stop3;
  out.stopa = stopa;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let seed = in.params0.x;
  let scale = max(1.0, in.params0.y);
  let octaves = i32(max(1.0, in.params0.z));
  let gain = clamp(in.params0.w, 0.1, 0.95);
  let lacunarity = max(1.1, in.params1.x);
  let warp = in.params1.y;
  let detail = in.params1.z;
  let dust = in.params1.w;
  var p = in.uv * scale / 64.0 + vec2<f32>(seed * 0.13, seed * 0.29);
  let warp_x = fbm(p + vec2<f32>(5.2, 1.3), octaves, lacunarity, gain);
  let warp_y = fbm(p + vec2<f32>(1.7, 9.2), octaves, lacunarity, gain);
  p = p + vec2<f32>(warp_x, warp_y) * warp;
  let density = clamp(fbm(p, octaves, lacunarity, gain) * detail + noise(p * 2.7) * dust * 0.25, 0.0, 1.0);
  return sample_gradient(density, in.stop0, in.stop1, in.stop2, in.stop3, in.stopa);
}
