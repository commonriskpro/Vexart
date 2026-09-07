// backdrop_blur.wgsl
// Backdrop blur — NEW GPU pipeline (Slice 5b, cmd_kind = 15).
// Replaces apply_box_blur_rgba (bridge L2427-2480).
//
// The compositor runs this pipeline twice (horizontal, then vertical) with a
// bounded separable Gaussian kernel. A one-pass sparse kernel creates visible
// copies of an impulse between its taps, while this keeps the work O(radius)
// per pass and the response dense at every pixel.

@group(0) @binding(0) var t_source: texture_2d<f32>;
@group(0) @binding(1) var s_source: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) blur_radius: f32,
  @location(2) blur_axis: f32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) blur_pad: vec4<f32>,
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
  // Convert NDC rect to UV space [0,1] for texture sampling.
  // rect.x/rect.z are NDC coordinates; map to [0,1] UV.
  out.uv = vec2<f32>(
    (rect.x + 1.0 + uv.x * rect.z) * 0.5,
    (1.0 - rect.y - uv.y * rect.w) * 0.5,
  );
  out.blur_radius = blur_pad.x;
  // 0 = horizontal pass, 1 = vertical pass.
  out.blur_axis = blur_pad.y;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(t_source));
  let r = clamp(in.blur_radius, 0.0, 32.0);
  let sigma = max(r * 0.5, 0.75);
  // Keep samples about one pixel apart: radius 8 uses 8 samples per side,
  // while radius 32 reaches the fixed 32-iteration bound.
  let sample_count = max(1.0, ceil(r));
  let step_px = select(0.0, r / sample_count, r > 0.0);
  let axis = select(vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0), in.blur_axis >= 0.5);

  let center = textureSample(t_source, s_source, in.uv);
  // Images use straight-alpha RGBA. Accumulate premultiplied color and
  // alpha independently, then unpremultiply so translucent blur edges keep
  // their source color instead of developing dark fringes.
  var premul_sum = center.rgb * center.a;
  var alpha_sum = center.a;
  var weight_sum = 1.0;
  // A maximum of 32 iterations on each side bounds the work at 65 samples
  // per pass while retaining approximately one-pixel spacing.
  for (var i: i32 = 1; i <= 32; i = i + 1) {
    let distance = f32(i) * step_px;
    if (distance > r) {
      break;
    }
    let normalized = distance / sigma;
    let weight = exp(-0.5 * normalized * normalized);
    let offset = axis * (distance / dims);
    let minus = textureSample(t_source, s_source, in.uv - offset);
    let plus = textureSample(t_source, s_source, in.uv + offset);
    premul_sum += (minus.rgb * minus.a + plus.rgb * plus.a) * weight;
    alpha_sum += (minus.a + plus.a) * weight;
    weight_sum += 2.0 * weight;
  }
  let alpha = alpha_sum / weight_sum;
  let rgb = select(vec3<f32>(0.0), premul_sum / max(alpha_sum, 0.000001), alpha_sum > 0.000001);
  return vec4<f32>(rgb, alpha);
}
