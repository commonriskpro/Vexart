// paint/shaders/msdf_text.wgsl
// MSDF/SDF text rendering shader — Phase 2b (cmd_kind = 18).
// Per design §4.3, REQ-2B-203, task 4.3.
//
// Vertex stage: transforms each glyph quad (instance data) to screen NDC.
// Fragment stage: samples the atlas texture and applies smoothstep SDF anti-aliasing.
//
// For Phase 2b simplified SDF: single-channel (R) distance field threshold.
// True multi-channel MSDF upgrade is deferred to Phase 3+.
//
// Instance layout (MsdfGlyphInstance, 16 floats = 64 bytes):
//   @location(0) pos_size: vec4<f32>  — x, y, w, h  (NDC quad)
//   @location(1) uv_rect:  vec4<f32>  — uv_x, uv_y, uv_w, uv_h (atlas UV)
//   @location(2) color:    vec4<f32>  — r, g, b, a
//   @location(3) ids:      vec4<u32>  — atlas_id, pad0, pad1, pad2

@group(0) @binding(0) var t_atlas: texture_2d<f32>;
@group(0) @binding(1) var s_atlas: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pos_size: vec4<f32>,   // x, y, w, h (NDC position + size)
  @location(1) uv_rect:  vec4<f32>,   // uv_x, uv_y, uv_w, uv_h
  @location(2) color:    vec4<f32>,   // r, g, b, a
  @location(3) _ids:     vec4<u32>,   // atlas_id + 3 padding (unused in shader)
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

  // NDC position: top-left is (pos_size.x, pos_size.y), size is (pos_size.z, pos_size.w).
  // Y is flipped: NDC +y is up, but our glyph quads are specified top-down.
  let ndc_x = pos_size.x + local.x * pos_size.z;
  let ndc_y = pos_size.y - local.y * pos_size.w;

  // Atlas UV: top-left is (uv_rect.x, uv_rect.y), size is (uv_rect.z, uv_rect.w).
  let uv_x = uv_rect.x + local.x * uv_rect.z;
  let uv_y = uv_rect.y + local.y * uv_rect.w;

  var out: VSOut;
  out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  out.uv = vec2<f32>(uv_x, uv_y);
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  // Sample the atlas. For simplified SDF: distance is stored in the R channel.
  // For true MSDF: median(R,G,B) would be used. Phase 3+ upgrade path.
  let sampled = textureSample(t_atlas, s_atlas, in.uv);

  // SDF threshold: 0.5 is the boundary between inside and outside.
  // smoothstep gives a 1-pixel anti-aliased edge.
  // The width of the transition band controls edge sharpness vs AA quality.
  let dist = sampled.r;
  let alpha = smoothstep(0.4, 0.6, dist);

  // Modulate the glyph color alpha by the distance field alpha.
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
