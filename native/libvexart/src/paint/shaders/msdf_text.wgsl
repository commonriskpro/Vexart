// paint/shaders/msdf_text.wgsl
// MSDF text rendering shader — Phase 2b (cmd_kind = 18).
// Per design §4.3, REQ-2B-203, DEC-008.
//
// Vertex stage: transforms each glyph quad (instance data) to screen NDC.
// Fragment stage: multi-channel signed distance field (MSDF) rendering.
//
// MSDF encodes the distance to glyph edges in 3 channels (R, G, B).
// The median of the 3 channels gives the true signed distance.
// smoothstep + fwidth() reconstruct sharp anti-aliased edges at ANY size
// from a single atlas texture.
//
// Instance layout (MsdfGlyphInstance, 16 floats = 64 bytes):
//   @location(0) pos_size: vec4<f32>  — x, y, w, h  (NDC quad)
//   @location(1) uv_rect:  vec4<f32>  — uv_x, uv_y, uv_w, uv_h (atlas UV)
//   @location(2) color:    vec4<f32>  — r, g, b, a
//   @location(3) ids:      vec4<u32>  — atlas_id, msdf_flag, pad1, pad2
//
// ids.y (msdf_flag): 0 = legacy bitmap atlas (alpha channel), 1 = MSDF atlas (RGB median).

@group(0) @binding(0) var t_atlas: texture_2d<f32>;
@group(0) @binding(1) var s_atlas: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) msdf_flag: u32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pos_size: vec4<f32>,   // x, y, w, h (NDC position + size)
  @location(1) uv_rect:  vec4<f32>,   // uv_x, uv_y, uv_w, uv_h
  @location(2) color:    vec4<f32>,   // r, g, b, a
  @location(3) ids:      vec4<u32>,   // atlas_id, msdf_flag, pad, pad
) -> VSOut {
  // 2-triangle quad (6 vertices, CCW).
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );

  let local = quad[vertex_index];

  // NDC position: same convention as rect shader — x,y is top-left corner in NDC,
  // w,h are signed sizes (h is typically negative for top-down layout).
  let ndc_x = pos_size.x + local.x * pos_size.z;
  let ndc_y = pos_size.y + local.y * pos_size.w;

  // Atlas UV: top-left is (uv_rect.x, uv_rect.y), size is (uv_rect.z, uv_rect.w).
  let uv_x = uv_rect.x + local.x * uv_rect.z;
  let uv_y = uv_rect.y + local.y * uv_rect.w;

  var out: VSOut;
  out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  out.uv = vec2<f32>(uv_x, uv_y);
  out.color = color;
  out.msdf_flag = ids.y;
  return out;
}

// Median of three values — the core MSDF operation.
// median(R, G, B) recovers the true signed distance from the multi-channel encoding.
fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(t_atlas, s_atlas, in.uv);

  if in.msdf_flag == 0u {
    // Legacy bitmap atlas path: glyph coverage is in the alpha channel.
    // Kept for backward compatibility with existing bitmap atlases.
    return vec4<f32>(in.color.rgb, in.color.a * sampled.a);
  }

  // ── MSDF path ──
  // The atlas encodes signed distances in R, G, B channels.
  // Values are normalized: 0.5 = on the edge, >0.5 = inside, <0.5 = outside.

  // 1. Recover the true signed distance from the 3-channel encoding.
  let sd = median3(sampled.r, sampled.g, sampled.b);

  // 2. Compute screen-space distance for resolution-independent anti-aliasing.
  // fwidth(sd) = |dFdx(sd)| + |dFdy(sd)| — how much `sd` changes per screen pixel.
  // This automatically adapts: large glyphs → sharp edges, small glyphs → smooth AA.
  let screen_px_range = fwidth(sd);

  // 3. Smoothstep anti-aliasing around the 0.5 threshold (the edge).
  // The smoothstep width is proportional to screen_px_range for pixel-perfect AA.
  let alpha = smoothstep(0.5 - screen_px_range, 0.5 + screen_px_range, sd);

  // 4. Discard fully transparent fragments (optimization).
  if alpha < 0.004 {
    discard;
  }

  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
