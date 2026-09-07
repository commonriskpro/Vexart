struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) opacity: f32,
}

@group(0) @binding(0) var image_tex: texture_2d<f32>;
@group(0) @binding(1) var image_sampler: sampler;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) p0: vec4<f32>,
  @location(1) p1: vec4<f32>,
  @location(2) opacity: vec4<f32>,
) -> VSOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(p0.x, p0.y),
    vec2<f32>(p0.z, p0.w),
    vec2<f32>(p1.x, p1.y),
    vec2<f32>(p1.x, p1.y),
    vec2<f32>(p0.z, p0.w),
    vec2<f32>(p1.z, p1.w),
  );
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  var out: VSOut;
  out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  out.uv = uvs[vertex_index];
  out.opacity = opacity.x;
  return out;
}

fn edge_coverage(in: VSOut) -> f32 {
  // A transformed quad is rasterized with one sample per pixel. Without an
  // explicit coverage ramp, a rotated sprite has hard stair-stepped edges
  // even though the source texture itself is linearly filtered. Keep exact
  // coverage for axis-aligned quads: rasterization already gives those edges
  // pixel-exact coverage, and fading UV boundaries would make opaque viewports
  // visibly transparent at their perimeter.
  let du_dx = dpdx(in.uv.x);
  let du_dy = dpdy(in.uv.x);
  let dv_dx = dpdx(in.uv.y);
  let dv_dy = dpdy(in.uv.y);
  let eps = 0.000001;
  let axis_aligned =
    abs(du_dy) + abs(dv_dx) <= eps ||
    abs(du_dx) + abs(dv_dy) <= eps;
  let edge_u = min(in.uv.x, 1.0 - in.uv.x);
  let edge_v = min(in.uv.y, 1.0 - in.uv.y);
  let coverage_u = smoothstep(0.0, max(fwidth(in.uv.x), 0.0001), edge_u);
  let coverage_v = smoothstep(0.0, max(fwidth(in.uv.y), 0.0001), edge_v);
  return select(coverage_u * coverage_v, 1.0, axis_aligned);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, in.uv);
  let coverage = edge_coverage(in);
  return vec4<f32>(color.rgb, color.a * in.opacity * coverage);
}

// Source targets already store premultiplied RGB. Scale both channels by the
// transform opacity/coverage before using premultiplied blend factors.
@fragment
fn fs_premultiplied(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, in.uv);
  let factor = in.opacity * edge_coverage(in);
  return vec4<f32>(color.rgb * factor, color.a * factor);
}
