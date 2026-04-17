// backdrop_blur.wgsl
// Backdrop blur — NEW GPU pipeline (Slice 5b, cmd_kind = 15).
// Replaces apply_box_blur_rgba (bridge L2427-2480).
//
// SIMPLIFICATION: single-pass 9x9 box blur (radius=4).
// TODO(phase-2b): upgrade to 2-pass separable Gaussian (H+V ping-pong) for
// better quality and O(radius) instead of O(radius^2) per pixel.
// Requires PaintContext to own intermediate ping-pong textures.

@group(0) @binding(0) var t_source: texture_2d<f32>;
@group(0) @binding(1) var s_source: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) blur_radius: f32,
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
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(t_source));
  // Clamp radius to avoid excessively large samples.
  let r = clamp(in.blur_radius, 0.0, 32.0);
  // 9-tap box kernel step size in UV space.
  let step = r / dims;

  // 9-tap box blur: sample center + 8 neighbours at ±step.
  var sum = vec4<f32>(0.0);
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>(-step.x, -step.y));
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>( 0.0,    -step.y));
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>( step.x, -step.y));
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>(-step.x,  0.0   ));
  sum += textureSample(t_source, s_source, in.uv);
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>( step.x,  0.0   ));
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>(-step.x,  step.y));
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>( 0.0,     step.y));
  sum += textureSample(t_source, s_source, in.uv + vec2<f32>( step.x,  step.y));
  return sum / 9.0;
}
