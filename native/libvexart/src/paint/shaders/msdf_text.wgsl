// paint/shaders/msdf_text.wgsl
// Dual-mode text rendering shader — Phase 2b (cmd_kind = 18).
// Per design §4.3, REQ-2B-203, task 4.3.
//
// Supports two atlas modes via ids.y (msdf_flag):
//   mode 0 = bitmap atlas: alpha-channel coverage (supersampled, GPU-filtered)
//   mode 1 = MSDF atlas: RGB median + smoothstep for resolution-independent AA
//
// Instance layout (MsdfGlyphInstance, 16 floats = 64 bytes):
//   @location(0) pos_size: vec4<f32>  — x, y, w, h  (NDC quad)
//   @location(1) uv_rect:  vec4<f32>  — uv_x, uv_y, uv_w, uv_h (atlas UV)
//   @location(2) color:    vec4<f32>  — r, g, b, a
//   @location(3) ids:      vec4<u32>  — atlas_id, msdf_flag, pad1, pad2

@group(0) @binding(0) var t_atlas: texture_2d<f32>;
@group(0) @binding(1) var s_atlas: sampler;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) mode: u32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) pos_size: vec4<f32>,   // x, y, w, h (NDC position + size)
  @location(1) uv_rect:  vec4<f32>,   // uv_x, uv_y, uv_w, uv_h
  @location(2) color:    vec4<f32>,   // r, g, b, a
  @location(3) ids:      vec4<u32>,   // atlas_id, msdf_flag, pad1, pad2
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

  // NDC position: x,y is top-left corner in NDC, w,h are signed sizes.
  let ndc_x = pos_size.x + local.x * pos_size.z;
  let ndc_y = pos_size.y + local.y * pos_size.w;

  // Atlas UV: top-left is (uv_rect.x, uv_rect.y), size is (uv_rect.z, uv_rect.w).
  let uv_x = uv_rect.x + local.x * uv_rect.z;
  let uv_y = uv_rect.y + local.y * uv_rect.w;

  var out: VSOut;
  out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  out.uv = vec2<f32>(uv_x, uv_y);
  out.color = color;
  out.mode = ids.y;  // 0 = bitmap, 1 = MSDF
  return out;
}

fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(t_atlas, s_atlas, in.uv);

  var alpha: f32;
  if (in.mode == 1u) {
    // MSDF mode: compute distance from RGB channels using median-of-three.
    let sd = median3(sampled.r, sampled.g, sampled.b);
    // Screen-space derivative for resolution-independent anti-aliasing.
    let screen_px_distance = fwidth(sd);
    // Smoothstep around the 0.5 threshold (SDF convention: 0.5 = on edge).
    alpha = smoothstep(0.5 - screen_px_distance, 0.5 + screen_px_distance, sd);
  } else {
    // Bitmap mode: glyph coverage in alpha channel (supersampled, GPU-filtered).
    alpha = sampled.a;
  }

  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
