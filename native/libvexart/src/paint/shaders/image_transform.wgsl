struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) opacity: f32,
  // Signed object-fit inset/crop fractions. Positive values crop the source
  // (cover); negative values inset the destination (contain). Zero means
  // stretch/fill. These are packed in the transform instance's two padding
  // lanes so the existing 48-byte image transform ABI remains unchanged.
  @location(2) fit: vec2<f32>,
}

@group(0) @binding(0) var image_tex: texture_2d<f32>;
@group(0) @binding(1) var image_sampler: sampler;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) p0: vec4<f32>,
  @location(1) p1: vec4<f32>,
  @location(2) opacity: f32,
  @location(3) fit: vec2<f32>,
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
  out.opacity = opacity;
  out.fit = fit;
  return out;
}

fn fit_uv(local_uv: vec2<f32>, fit: vec2<f32>) -> vec2<f32> {
  // Positive offsets describe a centered source crop (objectFit=cover).
  if (fit.x > 0.0 || fit.y > 0.0) {
    // The destination spans the centered source interval [fit, 1-fit].
    return fit + local_uv * (vec2<f32>(1.0, 1.0) - fit * 2.0);
  }

  // Negative offsets describe a centered destination inset (objectFit=contain).
  // Pixels outside the inset are transparent letterbox pixels.
  let inset = -fit;
  if (inset.x > 0.0 || inset.y > 0.0) {
    if (local_uv.x < inset.x || local_uv.x > 1.0 - inset.x
      || local_uv.y < inset.y || local_uv.y > 1.0 - inset.y) {
      discard;
    }
    return (local_uv - inset) / (vec2<f32>(1.0, 1.0) - inset * 2.0);
  }
  return local_uv;
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
  let color = textureSample(image_tex, image_sampler, fit_uv(in.uv, in.fit));
  let coverage = edge_coverage(in);
  return vec4<f32>(color.rgb, color.a * in.opacity * coverage);
}

// Source targets already store premultiplied RGB. Scale both channels by the
// transform opacity/coverage before using premultiplied blend factors.
@fragment
fn fs_premultiplied(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, fit_uv(in.uv, in.fit));
  let factor = in.opacity * edge_coverage(in);
  return vec4<f32>(color.rgb * factor, color.a * factor);
}
