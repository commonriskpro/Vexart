// backdrop_filter.wgsl
// Backdrop filter — NEW GPU pipeline (Slice 5b, cmd_kind = 16).
// Replaces apply_backdrop_filters_rgba (bridge L2481-2579).
// Applies 7 ops in this exact order (matching bridge):
//   1. brightness (multiply RGB by brightness/100)
//   2. contrast   (curve: ((v - 0.5) * contrast/100 + 0.5), per channel)
//   3. saturate   (luma + (rgb - luma) * saturate/100)
//   4. grayscale  (mix rgb toward luma by grayscale/100)
//   5. invert     (mix rgb toward (1 - rgb) by invert/100)
//   6. sepia      (3x3 matrix blend by sepia/100)
//   7. hue_rotate (3x3 rotation matrix from cos/sin of degrees)
//
// Convention: 100 = identity for brightness/contrast/saturate;
//             0   = identity for grayscale/invert/sepia/hue_rotate_deg.

@group(0) @binding(0) var t_source: texture_2d<f32>;
@group(0) @binding(1) var s_source: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) brightness: f32,
  @location(2) contrast: f32,
  @location(3) saturate: f32,
  @location(4) grayscale: f32,
  @location(5) invert: f32,
  @location(6) sepia: f32,
  @location(7) hue_rotate_deg: f32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) params0: vec4<f32>,  // brightness, contrast, saturate, grayscale
  @location(2) params1: vec4<f32>,  // invert, sepia, hue_rotate_deg, _pad
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
  // Map NDC quad UV → texture UV [0,1].
  out.uv = vec2<f32>(
    (rect.x + 1.0 + uv.x * rect.z) * 0.5,
    (1.0 - rect.y - uv.y * rect.w) * 0.5,
  );
  out.brightness    = params0.x;
  out.contrast      = params0.y;
  out.saturate      = params0.z;
  out.grayscale     = params0.w;
  out.invert        = params1.x;
  out.sepia         = params1.y;
  out.hue_rotate_deg = params1.z;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(t_source, s_source, in.uv);
  var r = sampled.r;
  var g = sampled.g;
  var b = sampled.b;
  let a = sampled.a;

  // 1. Brightness: multiply by brightness/100 (100 = identity).
  if (in.brightness != 100.0) {
    let f = in.brightness / 100.0;
    r *= f;
    g *= f;
    b *= f;
  }

  // 2. Contrast: ((v - 0.5) * factor + 0.5) where factor = contrast/100 (100 = identity).
  if (in.contrast != 100.0) {
    let f = in.contrast / 100.0;
    r = (r - 0.5) * f + 0.5;
    g = (g - 0.5) * f + 0.5;
    b = (b - 0.5) * f + 0.5;
  }

  // Luma for ops 3 and 4 (computed after brightness/contrast).
  let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // 3. Saturate: luma + (rgb - luma) * saturate/100 (100 = identity).
  if (in.saturate != 100.0) {
    let f = in.saturate / 100.0;
    r = luma + (r - luma) * f;
    g = luma + (g - luma) * f;
    b = luma + (b - luma) * f;
  }

  // 4. Grayscale: mix rgb toward luma by grayscale/100 (0 = identity).
  if (in.grayscale != 0.0) {
    let f = clamp(in.grayscale / 100.0, 0.0, 1.0);
    r = mix(r, luma, f);
    g = mix(g, luma, f);
    b = mix(b, luma, f);
  }

  // 5. Invert: mix rgb toward (1 - rgb) by invert/100 (0 = identity).
  if (in.invert != 0.0) {
    let f = clamp(in.invert / 100.0, 0.0, 1.0);
    r = mix(r, 1.0 - r, f);
    g = mix(g, 1.0 - g, f);
    b = mix(b, 1.0 - b, f);
  }

  // 6. Sepia: 3x3 matrix blend by sepia/100 (0 = identity).
  // Matrix from bridge L2556-2562.
  if (in.sepia != 0.0) {
    let f = clamp(in.sepia / 100.0, 0.0, 1.0);
    let sr = (r * 0.393) + (g * 0.769) + (b * 0.189);
    let sg = (r * 0.349) + (g * 0.686) + (b * 0.168);
    let sb = (r * 0.272) + (g * 0.534) + (b * 0.131);
    r = mix(r, sr, f);
    g = mix(g, sg, f);
    b = mix(b, sb, f);
  }

  // 7. Hue rotate: 3x3 rotation matrix (0 = identity).
  // Matrix coefficients from bridge L2497-2510.
  if (in.hue_rotate_deg != 0.0) {
    let rad = in.hue_rotate_deg * 0.017453292519943295; // pi/180
    let c = cos(rad);
    let s = sin(rad);
    let m0 = 0.213 + c * 0.787 - s * 0.213;
    let m1 = 0.715 - c * 0.715 - s * 0.715;
    let m2 = 0.072 - c * 0.072 + s * 0.928;
    let m3 = 0.213 - c * 0.213 + s * 0.143;
    let m4 = 0.715 + c * 0.285 + s * 0.140;
    let m5 = 0.072 - c * 0.072 - s * 0.283;
    let m6 = 0.213 - c * 0.213 - s * 0.787;
    let m7 = 0.715 - c * 0.715 + s * 0.715;
    let m8 = 0.072 + c * 0.928 + s * 0.072;
    let nr = r * m0 + g * m1 + b * m2;
    let ng = r * m3 + g * m4 + b * m5;
    let nb = r * m6 + g * m7 + b * m8;
    r = nr;
    g = ng;
    b = nb;
  }

  return vec4<f32>(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), a);
}
