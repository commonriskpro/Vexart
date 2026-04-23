// image_mask.wgsl
// Image mask — NEW GPU pipeline (Slice 5b, cmd_kind = 17).
// Replaces apply_rounded_rect_mask_rgba (bridge L2580-2633) and
//           apply_rounded_rect_corners_mask_rgba (bridge L2634-2699).
// Single shader with mode branch:
//   mode == 0.0 → uniform radius (radius_uniform for all 4 corners)
//   mode == 1.0 → per-corner (radius_tl, radius_tr, radius_br, radius_bl)
// Uses SDF rounded-rect mask with smoothstep for anti-aliased edges.
// Samples source texture and cuts corners by multiplying alpha.

@group(0) @binding(0) var t_source: texture_2d<f32>;
@group(0) @binding(1) var s_source: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,        // texture UV for source sampling
  @location(1) local_uv: vec2<f32>,  // UV relative to mask region [0,1]
  @location(3) radii: vec4<f32>,     // tl, tr, br, bl (all uniform if mode==0)
}

/// SDF for a rounded rectangle.
/// p     — pixel position relative to rect centre
/// hs    — half-size (half width, half height)
/// radii — (tl, tr, br, bl) corner radii
fn sd_rounded_rect(p: vec2<f32>, hs: vec2<f32>, radii: vec4<f32>) -> f32 {
  var r = radii;
  // x > 0 → right side: use right-column radii.
  if (p.x > 0.0) {
    r.x = r.y; // tr replaces tl
    r.w = r.z; // br replaces bl
  }
  // y > 0 → bottom: use bottom-row radius.
  let radius = select(r.w, r.x, p.y <= 0.0);
  let q = abs(p) - hs + vec2<f32>(radius, radius);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0, 0.0))) - radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,      // NDC rect: x, y, w, h (source image)
  @location(1) mask_rect: vec4<f32>, // NDC mask rect: mask_x, mask_y, mask_w, mask_h
  @location(2) radii_u_tl_tr_br: vec4<f32>, // radius_uniform, radius_tl, radius_tr, radius_br
  @location(3) radii_bl_mode_pad: vec4<f32>, // radius_bl, mode, _pad0, _pad1
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
  // Clip-space vertex.
  out.position = vec4<f32>(rect.x + uv.x * rect.z, rect.y + uv.y * rect.w, 0.0, 1.0);
  // Texture UV [0,1]: convert NDC to UV.
  out.uv = vec2<f32>(
    (rect.x + 1.0 + uv.x * rect.z) * 0.5,
    (1.0 - rect.y - uv.y * rect.w) * 0.5,
  );
  // Local UV within the mask region [0,1].
  out.local_uv = uv;
  let mode = radii_bl_mode_pad.y;
  let r_uniform = radii_u_tl_tr_br.x;
  if (mode < 0.5) {
    // Uniform mode: broadcast radius_uniform to all corners.
    out.radii = vec4<f32>(r_uniform, r_uniform, r_uniform, r_uniform);
  } else {
    // Per-corner mode.
    out.radii = vec4<f32>(
      radii_u_tl_tr_br.y,  // tl
      radii_u_tl_tr_br.z,  // tr
      radii_u_tl_tr_br.w,  // br
      radii_bl_mode_pad.x, // bl
    );
  }
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(t_source, s_source, in.uv);

  // Use source image pixel dimensions so corner radii remain in px.
  let size_px = vec2<f32>(textureDimensions(t_source));
  let hs = size_px * 0.5;
  let p = (in.local_uv - vec2<f32>(0.5, 0.5)) * size_px;

  let dist = sd_rounded_rect(p, hs, in.radii);

  // Anti-aliased mask: smoothstep over ~1px band.
  // dist < 0 → inside, dist > 0 → outside.
  let mask_alpha = clamp(-dist, 0.0, 1.0);
  if (mask_alpha <= 0.0) {
    discard;
  }

  return vec4<f32>(sampled.rgb, sampled.a * mask_alpha);
}
