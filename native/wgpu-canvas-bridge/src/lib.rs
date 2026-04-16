use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Instant;

use bytemuck::{Pod, Zeroable};
use wgpu::{util::DeviceExt, Buffer, Device, Queue, RenderPipeline, Texture, TextureFormat, TextureUsages, COPY_BYTES_PER_ROW_ALIGNMENT};

const ABI_VERSION: u32 = 5;
const BRIDGE_VERSION: u32 = 6;

const STATUS_SUCCESS: u32 = 0;
const STATUS_INVALID_ARGUMENT: u32 = 2;
const STATUS_INVALID_HANDLE: u32 = 3;
const STATUS_INTERNAL_ERROR: u32 = 5;

#[repr(C)]
pub struct TgeWgpuBridgeInfo {
    pub abi_version: u32,
    pub bridge_version: u32,
    pub available: u32,
    pub reserved: u32,
}

#[repr(C)]
pub struct TgeWgpuCanvasInitOptions {
    pub power_preference: u32,
    pub backend_preference: u32,
    pub enable_validation: u32,
    pub reserved: u32,
}

#[repr(C)]
pub struct TgeWgpuCanvasTargetDescriptor {
    pub width: u32,
    pub height: u32,
    pub format: u32,
    pub reserved: u32,
}

#[repr(C)]
pub struct TgeWgpuCanvasImageDescriptor {
    pub width: u32,
    pub height: u32,
    pub reserved0: u32,
    pub reserved1: u32,
}

#[repr(C)]
pub struct TgeWgpuCanvasFrameStats {
    pub gpu_ms: f64,
    pub readback_ms: f64,
    pub total_ms: f64,
}

#[repr(C)]
pub struct TgeWgpuBackdropFilterParams {
    pub blur: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub saturate: f32,
    pub grayscale: f32,
    pub invert: f32,
    pub sepia: f32,
    pub hue_rotate: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct RectFillInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct ImageInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    opacity: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct GlyphInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    u: f32,
    v: f32,
    uw: f32,
    vh: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
    opacity: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct ImageTransformInstance {
    p0x: f32,
    p0y: f32,
    p1x: f32,
    p1y: f32,
    p2x: f32,
    p2y: f32,
    p3x: f32,
    p3y: f32,
    opacity: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct LinearGradientInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    box_w: f32,
    box_h: f32,
    radius: f32,
    _pad0: f32,
    from_r: f32,
    from_g: f32,
    from_b: f32,
    from_a: f32,
    to_r: f32,
    to_g: f32,
    to_b: f32,
    to_a: f32,
    dir_x: f32,
    dir_y: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct RadialGradientInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    box_w: f32,
    box_h: f32,
    radius: f32,
    _pad0: f32,
    from_r: f32,
    from_g: f32,
    from_b: f32,
    from_a: f32,
    to_r: f32,
    to_g: f32,
    to_b: f32,
    to_a: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
    _pad4: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct CircleInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    fill_r: f32,
    fill_g: f32,
    fill_b: f32,
    fill_a: f32,
    stroke_r: f32,
    stroke_g: f32,
    stroke_b: f32,
    stroke_a: f32,
    stroke_norm: f32,
    has_fill: f32,
    has_stroke: f32,
    _pad0: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct PolygonInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    fill_r: f32,
    fill_g: f32,
    fill_b: f32,
    fill_a: f32,
    stroke_r: f32,
    stroke_g: f32,
    stroke_b: f32,
    stroke_a: f32,
    stroke_norm: f32,
    has_fill: f32,
    has_stroke: f32,
    sides: f32,
    rotation_deg: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct BezierInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x1: f32,
    y1: f32,
    size_x: f32,
    size_y: f32,
    color_r: f32,
    color_g: f32,
    color_b: f32,
    color_a: f32,
    stroke_width: f32,
    aa_width: f32,
    _pad0: f32,
    _pad1: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct ShapeRectInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    fill_r: f32,
    fill_g: f32,
    fill_b: f32,
    fill_a: f32,
    stroke_r: f32,
    stroke_g: f32,
    stroke_b: f32,
    stroke_a: f32,
    radius: f32,
    stroke_width: f32,
    has_fill: f32,
    has_stroke: f32,
    size_x: f32,
    size_y: f32,
    _pad0: f32,
    _pad1: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct ShapeRectCornersInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    fill_r: f32,
    fill_g: f32,
    fill_b: f32,
    fill_a: f32,
    stroke_r: f32,
    stroke_g: f32,
    stroke_b: f32,
    stroke_a: f32,
    radius_tl: f32,
    radius_tr: f32,
    radius_br: f32,
    radius_bl: f32,
    stroke_width: f32,
    has_fill: f32,
    has_stroke: f32,
    size_x: f32,
    size_y: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct GlowInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color_r: f32,
    color_g: f32,
    color_b: f32,
    color_a: f32,
    intensity: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct NebulaInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    seed: f32,
    scale: f32,
    octaves: f32,
    gain: f32,
    lacunarity: f32,
    warp: f32,
    detail: f32,
    dust: f32,
    stop0_pos: f32,
    stop0_r: f32,
    stop0_g: f32,
    stop0_b: f32,
    stop0_a: f32,
    stop1_pos: f32,
    stop1_r: f32,
    stop1_g: f32,
    stop1_b: f32,
    stop1_a: f32,
    stop2_pos: f32,
    stop2_r: f32,
    stop2_g: f32,
    stop2_b: f32,
    stop2_a: f32,
    stop3_pos: f32,
    stop3_r: f32,
    stop3_g: f32,
    stop3_b: f32,
    stop3_a: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct StarfieldInstance {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    seed: f32,
    count: f32,
    cluster_count: f32,
    cluster_stars: f32,
    warm_r: f32,
    warm_g: f32,
    warm_b: f32,
    warm_a: f32,
    neutral_r: f32,
    neutral_g: f32,
    neutral_b: f32,
    neutral_a: f32,
    cool_r: f32,
    cool_g: f32,
    cool_b: f32,
    cool_a: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

#[derive(Clone)]
struct ContextRecord {
    _power_preference: u32,
    _backend_preference: u32,
    _enable_validation: u32,
    device: Device,
    queue: Queue,
    rect_pipeline: RenderPipeline,
    circle_pipeline: RenderPipeline,
    polygon_pipeline: RenderPipeline,
    bezier_pipeline: RenderPipeline,
    shape_rect_pipeline: RenderPipeline,
    shape_rect_corners_pipeline: RenderPipeline,
    glow_pipeline: RenderPipeline,
    nebula_pipeline: RenderPipeline,
    starfield_pipeline: RenderPipeline,
    linear_gradient_pipeline: RenderPipeline,
    radial_gradient_pipeline: RenderPipeline,
    image_bind_group_layout: wgpu::BindGroupLayout,
    image_pipeline: RenderPipeline,
    glyph_pipeline: RenderPipeline,
    image_transform_pipeline: RenderPipeline,
}

struct TargetRecord {
    context_handle: u64,
    width: u32,
    height: u32,
    _format: TextureFormat,
    texture: Texture,
    readback: Buffer,
    padded_bytes_per_row: u32,
    region_readback: Option<Buffer>,
    region_readback_size: u64,
    active_layer: Option<ActiveLayerRecord>,
}

struct ActiveLayerRecord {
    encoder: wgpu::CommandEncoder,
    first_pass: bool,
    first_load_mode: u32,
    clear_rgba: u32,
}

struct ImageRecord {
    context_handle: u64,
    width: u32,
    height: u32,
    rgba: Vec<u8>,
    _texture: Texture,
    _sampler: wgpu::Sampler,
    bind_group: wgpu::BindGroup,
}

static LAST_ERROR: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));
static NEXT_CONTEXT_HANDLE: AtomicU64 = AtomicU64::new(1);
static NEXT_TARGET_HANDLE: AtomicU64 = AtomicU64::new(1);
static NEXT_IMAGE_HANDLE: AtomicU64 = AtomicU64::new(1);
static CONTEXTS: LazyLock<Mutex<HashMap<u64, ContextRecord>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static TARGETS: LazyLock<Mutex<HashMap<u64, TargetRecord>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static IMAGES: LazyLock<Mutex<HashMap<u64, ImageRecord>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn set_last_error(message: &str) {
    if let Ok(mut value) = LAST_ERROR.lock() {
        value.clear();
        value.push_str(message);
    }
}

fn clear_last_error() {
    set_last_error("");
}

fn bridge_available() -> bool {
    true
}

fn write_stats(stats: *mut TgeWgpuCanvasFrameStats, gpu_ms: f64, readback_ms: f64, total_ms: f64) {
    if stats.is_null() {
        return;
    }
    unsafe {
        (*stats).gpu_ms = gpu_ms;
        (*stats).readback_ms = readback_ms;
        (*stats).total_ms = total_ms;
    }
}

fn map_power_preference(value: u32) -> wgpu::PowerPreference {
    match value {
        1 => wgpu::PowerPreference::LowPower,
        2 => wgpu::PowerPreference::HighPerformance,
        _ => wgpu::PowerPreference::default(),
    }
}

fn map_backend_preference(value: u32) -> wgpu::Backends {
    match value {
        1 => wgpu::Backends::METAL,
        2 => wgpu::Backends::VULKAN,
        3 => wgpu::Backends::DX12,
        4 => wgpu::Backends::GL,
        _ => wgpu::Backends::all(),
    }
}

fn map_texture_format(value: u32) -> Option<TextureFormat> {
    match value {
        0 => Some(TextureFormat::Rgba8Unorm),
        _ => None,
    }
}

fn compute_padded_bytes_per_row(width: u32) -> u32 {
    let raw = width.saturating_mul(4);
    let remainder = raw % COPY_BYTES_PER_ROW_ALIGNMENT;
    if remainder == 0 {
        raw
    } else {
        raw + (COPY_BYTES_PER_ROW_ALIGNMENT - remainder)
    }
}

fn unpack_rgba_u32(value: u32) -> wgpu::Color {
    wgpu::Color {
        r: ((value >> 24) & 0xff) as f64 / 255.0,
        g: ((value >> 16) & 0xff) as f64 / 255.0,
        b: ((value >> 8) & 0xff) as f64 / 255.0,
        a: (value & 0xff) as f64 / 255.0,
    }
}

fn clamp_u8(value: f32) -> u8 {
    value.clamp(0.0, 255.0).round() as u8
}

fn maybe_filter_param(value: f32) -> Option<f32> {
    if value.is_nan() { None } else { Some(value) }
}

fn create_image_record_from_rgba(context: &ContextRecord, width: u32, height: u32, rgba: &[u8]) -> ImageRecord {
    let texture = context.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("tge-wgpu-canvas-image"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    context.queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        rgba,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    let sampler = context.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("tge-wgpu-canvas-image-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Nearest,
        min_filter: wgpu::FilterMode::Nearest,
        mipmap_filter: wgpu::FilterMode::Nearest,
        ..Default::default()
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = context.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("tge-wgpu-canvas-image-bind-group"),
        layout: &context.image_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });

    ImageRecord {
        context_handle: 0,
        width,
        height,
        rgba: rgba.to_vec(),
        _texture: texture,
        _sampler: sampler,
        bind_group,
    }
}

fn insert_image_record(context_handle: u64, mut record: ImageRecord) -> Result<u64, u32> {
    record.context_handle = context_handle;
    let handle = NEXT_IMAGE_HANDLE.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut images) = IMAGES.lock() {
        images.insert(handle, record);
        clear_last_error();
        Ok(handle)
    } else {
        set_last_error("failed to lock image table");
        Err(STATUS_INTERNAL_ERROR)
    }
}

fn create_rect_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-rect-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) color: vec4<f32>,
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
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-rect-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<RectFillInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_circle_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-circle-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params: vec4<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params: vec4<f32>,
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
  out.uv = uv * 2.0 - vec2<f32>(1.0, 1.0);
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let dist = length(in.uv);
  let stroke_norm = in.params.x;
  let has_fill = in.params.y;
  let has_stroke = in.params.z;
  if (dist > 1.0) {
    discard;
  }
  let stroke_edge = max(0.0, 1.0 - stroke_norm);
  if (has_stroke > 0.5 && dist >= stroke_edge) {
    return in.stroke_color;
  }
  if (has_fill > 0.5) {
    return in.fill_color;
  }
  discard;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-circle-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<CircleInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_polygon_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-polygon-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
}

fn sd_regular_polygon(p: vec2<f32>, sides: f32, radius: f32) -> f32 {
  let n = max(sides, 3.0);
  let a = atan2(p.y, p.x) + 3.141592653589793;
  let b = 6.283185307179586 / n;
  return cos(floor(0.5 + a / b) * b - a) * length(p) - radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
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
  out.uv = uv * 2.0 - vec2<f32>(1.0, 1.0);
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.params0 = params0;
  out.params1 = params1;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let stroke_norm = in.params0.x;
  let has_fill = in.params0.y;
  let has_stroke = in.params0.z;
  let sides = in.params0.w;
  let rotation = radians(in.params1.x);
  let c = cos(rotation);
  let s = sin(rotation);
  let p = vec2<f32>(
    in.uv.x * c - in.uv.y * s,
    in.uv.x * s + in.uv.y * c,
  );
  let sd = sd_regular_polygon(p, sides, 1.0);
  if (sd > 0.0) { discard; }
  if (has_stroke > 0.5 && sd >= -stroke_norm) {
    return in.stroke_color;
  }
  if (has_fill > 0.5) {
    return in.fill_color;
  }
  discard;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-polygon-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<PolygonInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_bezier_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-bezier-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) p0c: vec4<f32>,
  @location(2) p1s: vec4<f32>,
  @location(3) color: vec4<f32>,
  @location(4) params: vec4<f32>,
}

fn quad_bezier(a: vec2<f32>, b: vec2<f32>, c: vec2<f32>, t: f32) -> vec2<f32> {
  let ab = mix(a, b, t);
  let bc = mix(b, c, t);
  return mix(ab, bc, t);
}

fn segment_distance(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let denom = max(dot(ab, ab), 0.0001);
  let t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  let q = a + ab * t;
  return length(p - q);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) p0c: vec4<f32>,
  @location(2) p1s: vec4<f32>,
  @location(3) color: vec4<f32>,
  @location(4) params: vec4<f32>,
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
  out.uv = uv;
  out.p0c = p0c;
  out.p1s = p1s;
  out.color = color;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.uv * in.p1s.zw;
  let p0 = in.p0c.xy;
  let c = in.p0c.zw;
  let p1 = in.p1s.xy;
  let stroke_half = max(0.5, in.params.x * 0.5);
  let aa = max(0.75, in.params.y);
  var min_dist = 1e9;
  var prev = p0;
  for (var i: u32 = 1u; i <= 32u; i = i + 1u) {
    let t = f32(i) / 32.0;
    let curr = quad_bezier(p0, c, p1, t);
    min_dist = min(min_dist, segment_distance(p, prev, curr));
    prev = curr;
  }
  if (min_dist > stroke_half + aa) {
    discard;
  }
  let alpha = 1.0 - smoothstep(stroke_half, stroke_half + aa, min_dist);
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-bezier-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<BezierInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_shape_rect_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-shape-rect-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
}

fn sd_round_rect(p: vec2<f32>, half_size: vec2<f32>, radius: f32) -> f32 {
  let q = abs(p) - (half_size - vec2<f32>(radius, radius));
  return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) params0: vec4<f32>,
  @location(4) params1: vec4<f32>,
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
  out.uv = uv;
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.params0 = params0;
  out.params1 = params1;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let radius = in.params0.x;
  let stroke_width = in.params0.y;
  let has_fill = in.params0.z;
  let has_stroke = in.params0.w;
  let size = in.params1.xy;
  let p = in.uv * size - size * 0.5;
  let half_size = size * 0.5;
  let sd = sd_round_rect(p, half_size, radius);
  let aa = 1.0;
  if (sd > aa) {
    discard;
  }
  if (has_stroke > 0.5 && sd >= -stroke_width - aa) {
    let alpha = select(1.0 - smoothstep(0.0, aa, sd), 1.0, sd <= 0.0);
    return vec4<f32>(in.stroke_color.rgb, in.stroke_color.a * alpha);
  }
  if (has_fill > 0.5) {
    let alpha = 1.0 - smoothstep(0.0, aa, sd);
    return vec4<f32>(in.fill_color.rgb, in.fill_color.a * alpha);
  }
  discard;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-shape-rect-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<ShapeRectInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_shape_rect_corners_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-shape-rect-corners-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) radii: vec4<f32>,
  @location(4) params0: vec4<f32>,
  @location(5) params1: vec4<f32>,
}

fn corner_radius(p: vec2<f32>, radii: vec4<f32>) -> f32 {
  if (p.x >= 0.0 && p.y < 0.0) { return radii.y; }
  if (p.x >= 0.0 && p.y >= 0.0) { return radii.z; }
  if (p.x < 0.0 && p.y >= 0.0) { return radii.w; }
  return radii.x;
}

fn sd_round_rect_corners(p: vec2<f32>, half_size: vec2<f32>, radii: vec4<f32>) -> f32 {
  let radius = corner_radius(p, radii);
  let q = abs(p) - (half_size - vec2<f32>(radius, radius));
  return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) fill_color: vec4<f32>,
  @location(2) stroke_color: vec4<f32>,
  @location(3) radii: vec4<f32>,
  @location(4) params0: vec4<f32>,
  @location(5) params1: vec4<f32>,
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
  out.uv = uv;
  out.fill_color = fill_color;
  out.stroke_color = stroke_color;
  out.radii = radii;
  out.params0 = params0;
  out.params1 = params1;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let stroke_width = in.params0.x;
  let has_fill = in.params0.y;
  let has_stroke = in.params0.z;
  let size = in.params1.xy;
  let p = in.uv * size - size * 0.5;
  let half_size = size * 0.5;
  let sd = sd_round_rect_corners(p, half_size, in.radii);
  let aa = 1.0;
  if (sd > aa) { discard; }
  if (has_stroke > 0.5 && sd >= -stroke_width - aa) {
    let alpha = select(1.0 - smoothstep(0.0, aa, sd), 1.0, sd <= 0.0);
    return vec4<f32>(in.stroke_color.rgb, in.stroke_color.a * alpha);
  }
  if (has_fill > 0.5) {
    let alpha = 1.0 - smoothstep(0.0, aa, sd);
    return vec4<f32>(in.fill_color.rgb, in.fill_color.a * alpha);
  }
  discard;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-shape-rect-corners-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<ShapeRectCornersInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 80, shader_location: 5, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_nebula_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-nebula-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
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
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-nebula-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<NebulaInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 80, shader_location: 5, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 96, shader_location: 6, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 112, shader_location: 7, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_starfield_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-starfield-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) params0: vec4<f32>,
  @location(2) warm: vec4<f32>,
  @location(3) neutral: vec4<f32>,
  @location(4) cool: vec4<f32>,
}

fn hash21(p: vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(hash21(p), hash21(p + vec2<f32>(19.19, 7.13)));
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) params0: vec4<f32>,
  @location(2) warm: vec4<f32>,
  @location(3) neutral: vec4<f32>,
  @location(4) cool: vec4<f32>,
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
  out.warm = warm;
  out.neutral = neutral;
  out.cool = cool;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let seed = in.params0.x;
  let count = max(1.0, in.params0.y);
  let cluster_count = max(0.0, in.params0.z);
  let cluster_stars = max(0.0, in.params0.w);
  let density = count / 1200.0;
  let cell = floor(in.uv * vec2<f32>(160.0, 90.0));
  let local = fract(in.uv * vec2<f32>(160.0, 90.0)) - 0.5;
  let rnd = hash22(cell + seed);
  let star = smoothstep(0.03 + density * 0.1, 0.0, length(local - (rnd - 0.5) * 0.8)) * step(1.0 - density, rnd.x);
  let cluster_density = (cluster_count * cluster_stars) / 12000.0;
  let cluster = hash21(floor(in.uv * vec2<f32>(28.0, 16.0)) + seed * 1.7);
  let cluster_boost = smoothstep(1.0 - cluster_density, 1.0, cluster);
  let twinkle = 0.65 + 0.35 * sin((rnd.x + rnd.y + seed) * 32.0);
  let warmth = hash21(cell + vec2<f32>(seed * 2.1, seed * 0.7));
  let color = mix(in.neutral, mix(in.warm, in.cool, step(0.55, warmth)), step(0.2, abs(warmth - 0.5)));
  let alpha = clamp((star + cluster_boost * star * 0.6) * twinkle, 0.0, 1.0);
  return vec4<f32>(color.rgb, color.a * alpha);
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-starfield-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<StarfieldInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 80, shader_location: 5, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_glow_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-glow-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) params: vec4<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) params: vec4<f32>,
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
  out.uv = uv * 2.0 - vec2<f32>(1.0, 1.0);
  out.color = color;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) {
    discard;
  }
  let intensity = clamp(in.params.x / 100.0, 0.0, 1.0);
  let power = mix(2.4, 0.8, intensity);
  let alpha = pow(max(0.0, 1.0 - d), power);
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-glow-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<GlowInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_image_pipeline(device: &Device, layout: &wgpu::BindGroupLayout, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-image-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
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
  @location(0) rect: vec4<f32>,
  @location(1) opacity: vec4<f32>,
) -> VSOut {
  var quad_pos = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  var quad_uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  let uv = quad_uv[vertex_index];
  let pos = quad_pos[vertex_index];
  var out: VSOut;
  out.position = vec4<f32>(rect.x + pos.x * rect.z, rect.y + pos.y * rect.w, 0.0, 1.0);
  out.uv = uv;
  out.opacity = opacity.x;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, in.uv);
  return vec4<f32>(color.rgb, color.a * in.opacity);
}
        "#)),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("tge-wgpu-image-pipeline-layout"),
        bind_group_layouts: &[layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-image-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<ImageInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_glyph_pipeline(device: &Device, layout: &wgpu::BindGroupLayout, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-glyph-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) opacity: f32,
}

@group(0) @binding(0) var image_tex: texture_2d<f32>;
@group(0) @binding(1) var image_sampler: sampler;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) uv_rect: vec4<f32>,
  @location(2) color: vec4<f32>,
  @location(3) opacity: vec4<f32>,
) -> VSOut {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );
  let q = quad[vertex_index];
  var out: VSOut;
  out.position = vec4<f32>(rect.x + q.x * rect.z, rect.y + q.y * rect.w, 0.0, 1.0);
  out.uv = vec2<f32>(uv_rect.x + q.x * uv_rect.z, uv_rect.y + q.y * uv_rect.w);
  out.color = color;
  out.opacity = opacity.x;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sample = textureSample(image_tex, image_sampler, in.uv);
  let alpha = sample.a * in.color.a * in.opacity;
  return vec4<f32>(in.color.rgb, alpha);
}
        "#)),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("tge-wgpu-glyph-pipeline-layout"),
        bind_group_layouts: &[layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-glyph-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<GlyphInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_image_transform_pipeline(device: &Device, layout: &wgpu::BindGroupLayout, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-image-transform-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
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

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(image_tex, image_sampler, in.uv);
  return vec4<f32>(color.rgb, color.a * in.opacity);
}
        "#)),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("tge-wgpu-image-transform-pipeline-layout"),
        bind_group_layouts: &[layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-image-transform-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<ImageTransformInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_linear_gradient_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-linear-gradient-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) box: vec2<f32>,
  @location(2) radius: f32,
  @location(3) from_color: vec4<f32>,
  @location(4) to_color: vec4<f32>,
  @location(5) dir: vec2<f32>,
}

fn rounded_mask(local: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
  if (radius <= 0.0) {
    return 1.0;
  }
  let r = min(radius, min(size.x, size.y) * 0.5);
  let q = abs(local - size * 0.5) - (size * 0.5 - vec2<f32>(r, r));
  let outside = length(max(q, vec2<f32>(0.0, 0.0))) - r;
  return select(0.0, 1.0, outside <= 0.0);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) box_radius: vec4<f32>,
  @location(2) from_color: vec4<f32>,
  @location(3) to_color: vec4<f32>,
  @location(4) dir_pad: vec4<f32>,
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
  out.uv = uv;
  out.box = box_radius.xy;
  out.radius = box_radius.z;
  out.from_color = from_color;
  out.to_color = to_color;
  out.dir = normalize(vec2<f32>(dir_pad.x, dir_pad.y));
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let mask = rounded_mask(in.uv * in.box, in.box, in.radius);
  if (mask <= 0.0) {
    discard;
  }
  let centered = in.uv - vec2<f32>(0.5, 0.5);
  let t = clamp(dot(centered, in.dir) + 0.5, 0.0, 1.0);
  return mix(in.from_color, in.to_color, t) * mask;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-linear-gradient-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<LinearGradientInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_radial_gradient_pipeline(device: &Device, format: TextureFormat) -> RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("tge-wgpu-radial-gradient-shader"),
        source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(r#"
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) box: vec2<f32>,
  @location(2) radius: f32,
  @location(3) from_color: vec4<f32>,
  @location(4) to_color: vec4<f32>,
}

fn rounded_mask(local: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
  if (radius <= 0.0) {
    return 1.0;
  }
  let r = min(radius, min(size.x, size.y) * 0.5);
  let q = abs(local - size * 0.5) - (size * 0.5 - vec2<f32>(r, r));
  let outside = length(max(q, vec2<f32>(0.0, 0.0))) - r;
  return select(0.0, 1.0, outside <= 0.0);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) rect: vec4<f32>,
  @location(1) box_radius: vec4<f32>,
  @location(2) from_color: vec4<f32>,
  @location(3) to_color: vec4<f32>,
  @location(4) _pad: vec4<f32>,
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
  out.uv = uv;
  out.box = box_radius.xy;
  out.radius = box_radius.z;
  out.from_color = from_color;
  out.to_color = to_color;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let mask = rounded_mask(in.uv * in.box, in.box, in.radius);
  if (mask <= 0.0) {
    discard;
  }
  let p = in.uv - vec2<f32>(0.5, 0.5);
  let d = clamp(length(p) * 2.0, 0.0, 1.0);
  return mix(in.from_color, in.to_color, d) * mask;
}
        "#)),
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("tge-wgpu-radial-gradient-pipeline"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<RadialGradientInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 16, shader_location: 1, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 32, shader_location: 2, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 48, shader_location: 3, format: wgpu::VertexFormat::Float32x4 },
                    wgpu::VertexAttribute { offset: 64, shader_location: 4, format: wgpu::VertexFormat::Float32x4 },
                ],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_device(options: &TgeWgpuCanvasInitOptions) -> Result<(Device, Queue), String> {
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: map_backend_preference(options.backend_preference),
        flags: wgpu::InstanceFlags::empty(),
        backend_options: wgpu::BackendOptions::default(),
        memory_budget_thresholds: Default::default(),
    });

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: map_power_preference(options.power_preference),
        compatible_surface: None,
        force_fallback_adapter: false,
    }))
    .map_err(|err| format!("request_adapter failed: {err:?}"))?;

    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("tge-wgpu-canvas-device"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults(),
        memory_hints: wgpu::MemoryHints::Performance,
        trace: wgpu::Trace::Off,
    }))
    .map_err(|err| format!("request_device failed: {err:?}"))?;

    Ok((device, queue))
}

fn create_target(context_handle: u64, context: &ContextRecord, desc: &TgeWgpuCanvasTargetDescriptor) -> Result<TargetRecord, String> {
    let format = map_texture_format(desc.format).ok_or_else(|| format!("unsupported texture format {}", desc.format))?;
    let texture = context.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("tge-wgpu-canvas-target"),
        size: wgpu::Extent3d {
            width: desc.width,
            height: desc.height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::COPY_SRC,
        view_formats: &[],
    });

    let padded_bytes_per_row = compute_padded_bytes_per_row(desc.width);
    let readback = context.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("tge-wgpu-canvas-readback"),
        size: padded_bytes_per_row as u64 * desc.height as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    Ok(TargetRecord {
        context_handle,
        width: desc.width,
        height: desc.height,
        _format: format,
        texture,
        readback,
        padded_bytes_per_row,
        region_readback: None,
        region_readback_size: 0,
        active_layer: None,
    })
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_bridge_version() -> u32 {
    BRIDGE_VERSION
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_bridge_available() -> u32 {
    if bridge_available() { 1 } else { 0 }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_bridge_fill_info(info: *mut TgeWgpuBridgeInfo) -> u32 {
    if info.is_null() {
        set_last_error("bridge info pointer is null");
        return STATUS_INVALID_ARGUMENT;
    }
    unsafe {
        (*info).abi_version = ABI_VERSION;
        (*info).bridge_version = BRIDGE_VERSION;
        (*info).available = if bridge_available() { 1 } else { 0 };
        (*info).reserved = 0;
    }
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_bridge_get_last_error_length() -> u32 {
    if let Ok(value) = LAST_ERROR.lock() { value.len() as u32 } else { 0 }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_bridge_copy_last_error(dst: *mut u8, dst_len: u32) -> u32 {
    if dst.is_null() || dst_len == 0 {
        return STATUS_INVALID_ARGUMENT;
    }
    let value = if let Ok(value) = LAST_ERROR.lock() { value.clone() } else { String::new() };
    let bytes = value.as_bytes();
    let count = usize::min(bytes.len(), dst_len.saturating_sub(1) as usize);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), dst, count);
        *dst.add(count) = 0;
    }
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_context_create(opts: *const TgeWgpuCanvasInitOptions) -> u64 {
    let options = if opts.is_null() {
        TgeWgpuCanvasInitOptions { power_preference: 0, backend_preference: 0, enable_validation: 0, reserved: 0 }
    } else {
        unsafe { std::ptr::read(opts) }
    };

    if !bridge_available() {
        set_last_error("wgpu canvas bridge is unavailable in this build");
        return 0;
    }

    let (device, queue) = match create_device(&options) {
        Ok(value) => value,
        Err(error) => {
            set_last_error(&error);
            return 0;
        }
    };

    let image_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("tge-wgpu-image-bind-group-layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            },
        ],
    });

    let record = ContextRecord {
        _power_preference: options.power_preference,
        _backend_preference: options.backend_preference,
        _enable_validation: options.enable_validation,
        rect_pipeline: create_rect_pipeline(&device, TextureFormat::Rgba8Unorm),
        circle_pipeline: create_circle_pipeline(&device, TextureFormat::Rgba8Unorm),
        polygon_pipeline: create_polygon_pipeline(&device, TextureFormat::Rgba8Unorm),
        bezier_pipeline: create_bezier_pipeline(&device, TextureFormat::Rgba8Unorm),
        shape_rect_pipeline: create_shape_rect_pipeline(&device, TextureFormat::Rgba8Unorm),
        shape_rect_corners_pipeline: create_shape_rect_corners_pipeline(&device, TextureFormat::Rgba8Unorm),
        glow_pipeline: create_glow_pipeline(&device, TextureFormat::Rgba8Unorm),
        nebula_pipeline: create_nebula_pipeline(&device, TextureFormat::Rgba8Unorm),
        starfield_pipeline: create_starfield_pipeline(&device, TextureFormat::Rgba8Unorm),
        linear_gradient_pipeline: create_linear_gradient_pipeline(&device, TextureFormat::Rgba8Unorm),
        radial_gradient_pipeline: create_radial_gradient_pipeline(&device, TextureFormat::Rgba8Unorm),
        image_pipeline: create_image_pipeline(&device, &image_bind_group_layout, TextureFormat::Rgba8Unorm),
        glyph_pipeline: create_glyph_pipeline(&device, &image_bind_group_layout, TextureFormat::Rgba8Unorm),
        image_transform_pipeline: create_image_transform_pipeline(&device, &image_bind_group_layout, TextureFormat::Rgba8Unorm),
        image_bind_group_layout,
        device,
        queue,
    };

    let handle = NEXT_CONTEXT_HANDLE.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut contexts) = CONTEXTS.lock() {
        contexts.insert(handle, record);
        clear_last_error();
        return handle;
    }

    set_last_error("failed to lock context table");
    0
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_context_destroy(context_handle: u64) {
    if context_handle == 0 {
        return;
    }
    if let Ok(mut targets) = TARGETS.lock() {
        targets.retain(|_, target| target.context_handle != context_handle);
    }
    if let Ok(mut images) = IMAGES.lock() {
        images.retain(|_, image| image.context_handle != context_handle);
    }
    if let Ok(mut contexts) = CONTEXTS.lock() {
        contexts.remove(&context_handle);
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_create(context_handle: u64, desc: *const TgeWgpuCanvasTargetDescriptor) -> u64 {
    if context_handle == 0 {
        set_last_error("context handle is invalid");
        return 0;
    }
    if desc.is_null() {
        set_last_error("target descriptor pointer is null");
        return 0;
    }

    let descriptor = unsafe { std::ptr::read(desc) };
    if descriptor.width == 0 || descriptor.height == 0 {
        set_last_error("target descriptor width/height must be > 0");
        return 0;
    }

    let context = if let Ok(contexts) = CONTEXTS.lock() {
        contexts.get(&context_handle).cloned()
    } else {
        set_last_error("failed to lock context table");
        return 0;
    };
    let Some(context) = context else {
        set_last_error("context handle was not found");
        return 0;
    };

    let target = match create_target(context_handle, &context, &descriptor) {
        Ok(value) => value,
        Err(error) => {
            set_last_error(&error);
            return 0;
        }
    };

    let handle = NEXT_TARGET_HANDLE.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut targets) = TARGETS.lock() {
        targets.insert(handle, target);
        clear_last_error();
        return handle;
    }

    set_last_error("failed to lock target table");
    0
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_destroy(context_handle: u64, target_handle: u64) {
    if context_handle == 0 || target_handle == 0 {
        return;
    }
    if let Ok(mut targets) = TARGETS.lock() {
        if let Some(target) = targets.get(&target_handle) {
            if target.context_handle == context_handle {
                targets.remove(&target_handle);
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_image_create(
    context_handle: u64,
    desc: *const TgeWgpuCanvasImageDescriptor,
    rgba_ptr: *const u8,
    rgba_len: u32,
) -> u64 {
    if context_handle == 0 {
        set_last_error("image create context handle is invalid");
        return 0;
    }
    if desc.is_null() || rgba_ptr.is_null() {
        set_last_error("image create requires descriptor and pixel data");
        return 0;
    }

    let descriptor = unsafe { std::ptr::read(desc) };
    if descriptor.width == 0 || descriptor.height == 0 {
        set_last_error("image create width/height must be > 0");
        return 0;
    }
    let needed = descriptor.width as usize * descriptor.height as usize * 4;
    if rgba_len as usize != needed {
        set_last_error("image create rgba length does not match width*height*4");
        return 0;
    }

    let context = if let Ok(contexts) = CONTEXTS.lock() {
        contexts.get(&context_handle).cloned()
    } else {
        set_last_error("failed to lock context table");
        return 0;
    };
    let Some(context) = context else {
        set_last_error("image create context handle was not found");
        return 0;
    };

    let rgba = unsafe { std::slice::from_raw_parts(rgba_ptr, needed) };
    let record = create_image_record_from_rgba(&context, descriptor.width, descriptor.height, rgba);
    match insert_image_record(context_handle, record) {
        Ok(handle) => handle,
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_image_destroy(context_handle: u64, image_handle: u64) {
    if context_handle == 0 || image_handle == 0 {
        return;
    }
    if let Ok(mut images) = IMAGES.lock() {
        if let Some(image) = images.get(&image_handle) {
            if image.context_handle == context_handle {
                images.remove(&image_handle);
            }
        }
    }
}

fn get_context(context_handle: u64, label: &str) -> Result<ContextRecord, u32> {
    let context = if let Ok(contexts) = CONTEXTS.lock() {
        contexts.get(&context_handle).cloned()
    } else {
        set_last_error(&format!("failed to lock context table for {label}"));
        return Err(STATUS_INTERNAL_ERROR);
    };
    context.ok_or_else(|| {
        set_last_error(&format!("{label} context handle was not found"));
        STATUS_INVALID_HANDLE
    })
}

fn with_target<'a>(targets: &'a HashMap<u64, TargetRecord>, context_handle: u64, target_handle: u64, label: &str) -> Result<&'a TargetRecord, u32> {
    let target = targets.get(&target_handle).ok_or_else(|| {
        set_last_error(&format!("{label} target handle was not found"));
        STATUS_INVALID_HANDLE
    })?;
    if target.context_handle != context_handle {
        set_last_error(&format!("{label} target/context mismatch"));
        return Err(STATUS_INVALID_HANDLE);
    }
    Ok(target)
}

fn with_target_mut<'a>(targets: &'a mut HashMap<u64, TargetRecord>, context_handle: u64, target_handle: u64, label: &str) -> Result<&'a mut TargetRecord, u32> {
    let target = targets.get_mut(&target_handle).ok_or_else(|| {
        set_last_error(&format!("{label} target handle was not found"));
        STATUS_INVALID_HANDLE
    })?;
    if target.context_handle != context_handle {
        set_last_error(&format!("{label} target/context mismatch"));
        return Err(STATUS_INVALID_HANDLE);
    }
    Ok(target)
}

fn with_image<'a>(images: &'a HashMap<u64, ImageRecord>, context_handle: u64, image_handle: u64, label: &str) -> Result<&'a ImageRecord, u32> {
    let image = images.get(&image_handle).ok_or_else(|| {
        set_last_error(&format!("{label} image handle was not found"));
        STATUS_INVALID_HANDLE
    })?;
    if image.context_handle != context_handle {
        set_last_error(&format!("{label} image/context mismatch"));
        return Err(STATUS_INVALID_HANDLE);
    }
    Ok(image)
}

fn apply_box_blur_rgba(data: &mut [u8], width: u32, height: u32, radius: u32) {
    if radius == 0 || width == 0 || height == 0 {
        return;
    }
    let w = width as usize;
    let h = height as usize;
    let r = radius as usize;
    let mut tmp = vec![0u8; data.len()];

    for y in 0..h {
        for x in 0..w {
            let start = x.saturating_sub(r);
            let end = (x + r).min(w - 1);
            let mut sum = [0u32; 4];
            let mut count = 0u32;
            for sx in start..=end {
                let idx = (y * w + sx) * 4;
                sum[0] += data[idx] as u32;
                sum[1] += data[idx + 1] as u32;
                sum[2] += data[idx + 2] as u32;
                sum[3] += data[idx + 3] as u32;
                count += 1;
            }
            let dst = (y * w + x) * 4;
            tmp[dst] = (sum[0] / count) as u8;
            tmp[dst + 1] = (sum[1] / count) as u8;
            tmp[dst + 2] = (sum[2] / count) as u8;
            tmp[dst + 3] = (sum[3] / count) as u8;
        }
    }

    for y in 0..h {
        for x in 0..w {
            let start = y.saturating_sub(r);
            let end = (y + r).min(h - 1);
            let mut sum = [0u32; 4];
            let mut count = 0u32;
            for sy in start..=end {
                let idx = (sy * w + x) * 4;
                sum[0] += tmp[idx] as u32;
                sum[1] += tmp[idx + 1] as u32;
                sum[2] += tmp[idx + 2] as u32;
                sum[3] += tmp[idx + 3] as u32;
                count += 1;
            }
            let dst = (y * w + x) * 4;
            data[dst] = (sum[0] / count) as u8;
            data[dst + 1] = (sum[1] / count) as u8;
            data[dst + 2] = (sum[2] / count) as u8;
            data[dst + 3] = (sum[3] / count) as u8;
        }
    }
}

fn apply_backdrop_filters_rgba(data: &mut [u8], width: u32, height: u32, params: &TgeWgpuBackdropFilterParams) {
    if let Some(blur) = maybe_filter_param(params.blur) {
        if blur > 0.0 {
            apply_box_blur_rgba(data, width, height, blur.ceil() as u32);
        }
    }

    let brightness = maybe_filter_param(params.brightness);
    let contrast = maybe_filter_param(params.contrast);
    let saturate = maybe_filter_param(params.saturate);
    let grayscale = maybe_filter_param(params.grayscale);
    let invert = maybe_filter_param(params.invert);
    let sepia = maybe_filter_param(params.sepia);
    let hue_rotate = maybe_filter_param(params.hue_rotate);

    let hue_matrix = hue_rotate.map(|degrees| {
        let rad = degrees.to_radians();
        let cos = rad.cos();
        let sin = rad.sin();
        [
            0.213 + cos * 0.787 - sin * 0.213,
            0.715 - cos * 0.715 - sin * 0.715,
            0.072 - cos * 0.072 + sin * 0.928,
            0.213 - cos * 0.213 + sin * 0.143,
            0.715 + cos * 0.285 + sin * 0.140,
            0.072 - cos * 0.072 - sin * 0.283,
            0.213 - cos * 0.213 - sin * 0.787,
            0.715 - cos * 0.715 + sin * 0.715,
            0.072 + cos * 0.928 + sin * 0.072,
        ]
    });

    for px in data.chunks_exact_mut(4) {
        let mut r = px[0] as f32;
        let mut g = px[1] as f32;
        let mut b = px[2] as f32;

        if let Some(value) = brightness {
            let factor = value / 100.0;
            r *= factor;
            g *= factor;
            b *= factor;
        }

        if let Some(value) = contrast {
            let factor = value / 100.0;
            r = ((r / 255.0 - 0.5) * factor + 0.5) * 255.0;
            g = ((g / 255.0 - 0.5) * factor + 0.5) * 255.0;
            b = ((b / 255.0 - 0.5) * factor + 0.5) * 255.0;
        }

        let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        if let Some(value) = saturate {
            let factor = value / 100.0;
            r = luma + (r - luma) * factor;
            g = luma + (g - luma) * factor;
            b = luma + (b - luma) * factor;
        }

        if let Some(value) = grayscale {
            let factor = (value / 100.0).clamp(0.0, 1.0);
            r = r * (1.0 - factor) + luma * factor;
            g = g * (1.0 - factor) + luma * factor;
            b = b * (1.0 - factor) + luma * factor;
        }

        if let Some(value) = invert {
            let factor = (value / 100.0).clamp(0.0, 1.0);
            r = r * (1.0 - factor) + (255.0 - r) * factor;
            g = g * (1.0 - factor) + (255.0 - g) * factor;
            b = b * (1.0 - factor) + (255.0 - b) * factor;
        }

        if let Some(value) = sepia {
            let factor = (value / 100.0).clamp(0.0, 1.0);
            let sr = (r * 0.393) + (g * 0.769) + (b * 0.189);
            let sg = (r * 0.349) + (g * 0.686) + (b * 0.168);
            let sb = (r * 0.272) + (g * 0.534) + (b * 0.131);
            r = r * (1.0 - factor) + sr * factor;
            g = g * (1.0 - factor) + sg * factor;
            b = b * (1.0 - factor) + sb * factor;
        }

        if let Some(matrix) = hue_matrix {
            let nr = r * matrix[0] + g * matrix[1] + b * matrix[2];
            let ng = r * matrix[3] + g * matrix[4] + b * matrix[5];
            let nb = r * matrix[6] + g * matrix[7] + b * matrix[8];
            r = nr;
            g = ng;
            b = nb;
        }

        px[0] = clamp_u8(r);
        px[1] = clamp_u8(g);
        px[2] = clamp_u8(b);
    }
}

fn apply_rounded_rect_mask_rgba(data: &mut [u8], image_width: u32, image_height: u32, mask_x: u32, mask_y: u32, mask_width: u32, mask_height: u32, radius: f32) {
    if mask_width == 0 || mask_height == 0 {
        for px in data.chunks_exact_mut(4) {
            px[3] = 0;
        }
        return;
    }
    let max_radius = (mask_width.min(mask_height) as f32) * 0.5;
    let r = radius.clamp(0.0, max_radius);
    let iw = image_width as usize;
    let ih = image_height as usize;
    let mx = mask_x as f32;
    let my = mask_y as f32;
    let mw = mask_width as f32;
    let mh = mask_height as f32;

    for y in 0..ih {
        for x in 0..iw {
            let idx = (y * iw + x) * 4;
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;

            if px < mx || px >= mx + mw || py < my || py >= my + mh {
                data[idx + 3] = 0;
                continue;
            }

            if r <= 0.0 {
                continue;
            }

            let local_x = px - mx;
            let local_y = py - my;
            let inner_left = r;
            let inner_top = r;
            let inner_right = mw - r;
            let inner_bottom = mh - r;

            let inside_core = (local_x >= inner_left && local_x < inner_right) || (local_y >= inner_top && local_y < inner_bottom);
            if inside_core {
                continue;
            }

            let corner_cx = if local_x < inner_left { inner_left } else { inner_right };
            let corner_cy = if local_y < inner_top { inner_top } else { inner_bottom };
            let dx = local_x - corner_cx;
            let dy = local_y - corner_cy;
            if dx * dx + dy * dy > r * r {
                data[idx + 3] = 0;
            }
        }
    }
}

fn apply_rounded_rect_corners_mask_rgba(data: &mut [u8], image_width: u32, image_height: u32, mask_x: u32, mask_y: u32, mask_width: u32, mask_height: u32, tl: f32, tr: f32, br: f32, bl: f32) {
    if mask_width == 0 || mask_height == 0 {
        for px in data.chunks_exact_mut(4) {
            px[3] = 0;
        }
        return;
    }
    let max_radius = (mask_width.min(mask_height) as f32) * 0.5;
    let tl = tl.clamp(0.0, max_radius);
    let tr = tr.clamp(0.0, max_radius);
    let br = br.clamp(0.0, max_radius);
    let bl = bl.clamp(0.0, max_radius);
    let iw = image_width as usize;
    let ih = image_height as usize;
    let mx = mask_x as f32;
    let my = mask_y as f32;
    let mw = mask_width as f32;
    let mh = mask_height as f32;

    for y in 0..ih {
        for x in 0..iw {
            let idx = (y * iw + x) * 4;
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;

            if px < mx || px >= mx + mw || py < my || py >= my + mh {
                data[idx + 3] = 0;
                continue;
            }

            let local_x = px - mx;
            let local_y = py - my;
            let radius = if local_x >= mw - tr && local_y < tr {
                tr
            } else if local_x >= mw - br && local_y >= mh - br {
                br
            } else if local_x < bl && local_y >= mh - bl {
                bl
            } else {
                tl
            };

            if radius <= 0.0 {
                continue;
            }

            let inner_left = if local_y < tl { tl } else if local_y >= mh - bl { bl } else { 0.0 };
            let inner_right = if local_y < tr { mw - tr } else if local_y >= mh - br { mw - br } else { mw };
            let inner_top = if local_x < tl { tl } else if local_x >= mw - tr { tr } else { 0.0 };
            let inner_bottom = if local_x < bl { mh - bl } else if local_x >= mw - br { mh - br } else { mh };
            let inside_core = (local_x >= inner_left && local_x < inner_right) || (local_y >= inner_top && local_y < inner_bottom);
            if inside_core {
                continue;
            }

            let corner_cx = if local_x < inner_left { inner_left } else { inner_right };
            let corner_cy = if local_y < inner_top { inner_top } else { inner_bottom };
            let dx = local_x - corner_cx;
            let dy = local_y - corner_cy;
            if dx * dx + dy * dy > radius * radius {
                data[idx + 3] = 0;
            }
        }
    }
}

fn load_op_from_mode(load_mode: u32, clear_rgba: u32) -> wgpu::LoadOp<wgpu::Color> {
    if load_mode == 0 {
        wgpu::LoadOp::Clear(unpack_rgba_u32(clear_rgba))
    } else {
        wgpu::LoadOp::Load
    }
}

fn read_target_region_rgba(context: &ContextRecord, target: &mut TargetRecord, rx: u32, ry: u32, rw: u32, rh: u32) -> Result<(Vec<u8>, f64, f64), u32> {
    if rx + rw > target.width || ry + rh > target.height {
        set_last_error("readback region exceeds target bounds");
        return Err(STATUS_INVALID_ARGUMENT);
    }

    let padded_bytes_per_row = compute_padded_bytes_per_row(rw);
    let needed = rw as usize * rh as usize * 4;
    let staging_size = padded_bytes_per_row as u64 * rh as u64;
    if target.region_readback.is_none() || target.region_readback_size < staging_size {
        target.region_readback = Some(context.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("tge-wgpu-canvas-readback-region"),
            size: staging_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        }));
        target.region_readback_size = staging_size;
    }
    let staging = target.region_readback.as_ref().expect("region readback buffer must exist");

    let started = Instant::now();
    let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-readback-region-encoder") });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &target.texture,
            mip_level: 0,
            origin: wgpu::Origin3d { x: rx, y: ry, z: 0 },
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &staging,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(rh),
            },
        },
        wgpu::Extent3d { width: rw, height: rh, depth_or_array_layers: 1 },
    );
    context.queue.submit(Some(encoder.finish()));
    let gpu_ms = started.elapsed().as_secs_f64() * 1000.0;

    let readback_started = Instant::now();
    let slice = staging.slice(..);
    let (tx, rxch) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });
    let _ = context.device.poll(wgpu::PollType::Wait);
    match rxch.recv() {
        Ok(Ok(())) => {}
        Ok(Err(err)) => {
            set_last_error(&format!("region map_async failed: {err:?}"));
            return Err(STATUS_INTERNAL_ERROR);
        }
        Err(_) => {
            set_last_error("region map_async channel failed");
            return Err(STATUS_INTERNAL_ERROR);
        }
    }

    let mut data = vec![0u8; needed];
    let mapped = slice.get_mapped_range();
    let row_bytes = rw as usize * 4;
    let padded_row_bytes = padded_bytes_per_row as usize;
    for row in 0..rh as usize {
        let src_start = row * padded_row_bytes;
        let src_end = src_start + row_bytes;
        let dst_start = row * row_bytes;
        let dst_end = dst_start + row_bytes;
        data[dst_start..dst_end].copy_from_slice(&mapped[src_start..src_end]);
    }
    drop(mapped);
    staging.unmap();

    let readback_ms = readback_started.elapsed().as_secs_f64() * 1000.0;
    Ok((data, gpu_ms, readback_ms))
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_begin_layer(context_handle: u64, target_handle: u64, load_mode: u32, clear_rgba: u32) -> u32 {
    let context = match get_context(context_handle, "begin_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for begin_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "begin_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    if target.active_layer.is_some() {
        set_last_error("begin_layer called while another layer is active");
        return STATUS_INVALID_ARGUMENT;
    }
    let encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-layer-encoder") });
    target.active_layer = Some(ActiveLayerRecord { encoder, first_pass: true, first_load_mode: load_mode, clear_rgba });
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_end_layer(context_handle: u64, target_handle: u64) -> u32 {
    let context = match get_context(context_handle, "end_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for end_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "end_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let active = if let Some(active) = target.active_layer.take() {
        active
    } else {
        set_last_error("end_layer called without an active layer");
        return STATUS_INVALID_ARGUMENT;
    };
    context.queue.submit(Some(active.encoder.finish()));
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_clear(context_handle: u64, target_handle: u64, rgba: u32, stats: *mut TgeWgpuCanvasFrameStats) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    let context = match get_context(context_handle, "render_clear") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_clear");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target(&targets, context_handle, target_handle, "render_clear") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-clear-encoder") });
    {
        let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("tge-wgpu-clear-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(unpack_rgba_u32(rgba)), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
    }
    context.queue.submit(Some(encoder.finish()));
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_readback_rgba(
    context_handle: u64,
    target_handle: u64,
    dst: *mut u8,
    dst_len: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if dst.is_null() || dst_len == 0 {
        set_last_error("readback destination buffer is invalid");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "readback") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for readback");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target(&targets, context_handle, target_handle, "readback") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let needed = target.width as usize * target.height as usize * 4;
    if (dst_len as usize) < needed {
        set_last_error("readback destination buffer is too small for RGBA output");
        return STATUS_INVALID_ARGUMENT;
    }

    let started = Instant::now();
    let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-readback-encoder") });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &target.texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &target.readback,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(target.padded_bytes_per_row),
                rows_per_image: Some(target.height),
            },
        },
        wgpu::Extent3d { width: target.width, height: target.height, depth_or_array_layers: 1 },
    );
    context.queue.submit(Some(encoder.finish()));
    let gpu_ms = started.elapsed().as_secs_f64() * 1000.0;

    let readback_started = Instant::now();
    let slice = target.readback.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });
    let _ = context.device.poll(wgpu::PollType::Wait);
    match rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(err)) => {
            set_last_error(&format!("map_async failed: {err:?}"));
            return STATUS_INTERNAL_ERROR;
        }
        Err(_) => {
            set_last_error("map_async channel failed");
            return STATUS_INTERNAL_ERROR;
        }
    }

    let mapped = slice.get_mapped_range();
    let dst_rgba = unsafe { std::slice::from_raw_parts_mut(dst, needed) };
    let row_bytes = target.width as usize * 4;
    let padded_row_bytes = target.padded_bytes_per_row as usize;
    for row in 0..target.height as usize {
        let src_start = row * padded_row_bytes;
        let src_end = src_start + row_bytes;
        let dst_start = row * row_bytes;
        let dst_end = dst_start + row_bytes;
        dst_rgba[dst_start..dst_end].copy_from_slice(&mapped[src_start..src_end]);
    }
    drop(mapped);
    target.readback.unmap();

    let readback_ms = readback_started.elapsed().as_secs_f64() * 1000.0;
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, gpu_ms, readback_ms, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_readback_region_rgba(
    context_handle: u64,
    target_handle: u64,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    dst: *mut u8,
    dst_len: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if dst.is_null() || dst_len == 0 {
        set_last_error("readback region destination buffer is invalid");
        return STATUS_INVALID_ARGUMENT;
    }
    if rw == 0 || rh == 0 {
        set_last_error("readback region width/height must be > 0");
        return STATUS_INVALID_ARGUMENT;
    }

    let context = match get_context(context_handle, "readback_region") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for readback_region");
        return STATUS_INTERNAL_ERROR;
    };
    let target = if let Some(target) = targets.get_mut(&target_handle) {
        if target.context_handle != context_handle {
            set_last_error("readback_region target/context mismatch");
            return STATUS_INVALID_HANDLE;
        }
        target
    } else {
        set_last_error("readback_region target handle was not found");
        return STATUS_INVALID_HANDLE;
    };

    if rx + rw > target.width || ry + rh > target.height {
        set_last_error("readback region exceeds target bounds");
        return STATUS_INVALID_ARGUMENT;
    }

    let needed = rw as usize * rh as usize * 4;
    if (dst_len as usize) < needed {
        set_last_error("readback region destination buffer is too small for RGBA output");
        return STATUS_INVALID_ARGUMENT;
    }

    let started = Instant::now();
    let (data, gpu_ms, readback_ms) = match read_target_region_rgba(&context, target, rx, ry, rw, rh) {
        Ok(value) => value,
        Err(code) => return code,
    };
    let dst_rgba = unsafe { std::slice::from_raw_parts_mut(dst, needed) };
    dst_rgba.copy_from_slice(&data);
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, gpu_ms, readback_ms, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_copy_region_to_image(
    context_handle: u64,
    target_handle: u64,
    rx: u32,
    ry: u32,
    rw: u32,
    rh: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u64 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if rw == 0 || rh == 0 {
        set_last_error("copy_region_to_image width/height must be > 0");
        return 0;
    }
    let started = Instant::now();
    let context = match get_context(context_handle, "copy_region_to_image") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for copy_region_to_image");
        return 0;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "copy_region_to_image") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let (data, gpu_ms, readback_ms) = match read_target_region_rgba(&context, target, rx, ry, rw, rh) {
        Ok(value) => value,
        Err(_) => return 0,
    };
    drop(targets);
    let record = create_image_record_from_rgba(&context, rw, rh, &data);
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, gpu_ms, readback_ms, total_ms);
    match insert_image_record(context_handle, record) {
        Ok(handle) => handle,
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_image_filter_backdrop(
    context_handle: u64,
    image_handle: u64,
    params: *const TgeWgpuBackdropFilterParams,
) -> u64 {
    if params.is_null() {
        set_last_error("image_filter_backdrop requires params");
        return 0;
    }
    let context = match get_context(context_handle, "image_filter_backdrop") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let params = unsafe { std::ptr::read(params) };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for image_filter_backdrop");
        return 0;
    };
    let image = match with_image(&images, context_handle, image_handle, "image_filter_backdrop") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let mut rgba = image.rgba.clone();
    let width = image.width;
    let height = image.height;
    drop(images);
    apply_backdrop_filters_rgba(&mut rgba, width, height, &params);
    let record = create_image_record_from_rgba(&context, width, height, &rgba);
    match insert_image_record(context_handle, record) {
        Ok(handle) => handle,
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_image_mask_rounded_rect(
    context_handle: u64,
    image_handle: u64,
    mask_x: u32,
    mask_y: u32,
    mask_width: u32,
    mask_height: u32,
    radius: f32,
) -> u64 {
    let context = match get_context(context_handle, "image_mask_rounded_rect") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for image_mask_rounded_rect");
        return 0;
    };
    let image = match with_image(&images, context_handle, image_handle, "image_mask_rounded_rect") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let mut rgba = image.rgba.clone();
    let width = image.width;
    let height = image.height;
    drop(images);
    apply_rounded_rect_mask_rgba(&mut rgba, width, height, mask_x, mask_y, mask_width, mask_height, radius);
    let record = create_image_record_from_rgba(&context, width, height, &rgba);
    match insert_image_record(context_handle, record) {
        Ok(handle) => handle,
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_image_mask_rounded_rect_corners(
    context_handle: u64,
    image_handle: u64,
    mask_x: u32,
    mask_y: u32,
    mask_width: u32,
    mask_height: u32,
    tl: f32,
    tr: f32,
    br: f32,
    bl: f32,
) -> u64 {
    let context = match get_context(context_handle, "image_mask_rounded_rect_corners") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for image_mask_rounded_rect_corners");
        return 0;
    };
    let image = match with_image(&images, context_handle, image_handle, "image_mask_rounded_rect_corners") {
        Ok(value) => value,
        Err(_) => return 0,
    };
    let mut rgba = image.rgba.clone();
    let width = image.width;
    let height = image.height;
    drop(images);
    apply_rounded_rect_corners_mask_rgba(&mut rgba, width, height, mask_x, mask_y, mask_width, mask_height, tl, tr, br, bl);
    let record = create_image_record_from_rgba(&context, width, height, &rgba);
    match insert_image_record(context_handle, record) {
        Ok(handle) => handle,
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_composite_image_layer(
    context_handle: u64,
    target_handle: u64,
    image_handle: u64,
    instance_ptr: *const ImageInstance,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    tge_wgpu_canvas_target_render_image_layer(context_handle, target_handle, image_handle, instance_ptr, load_mode, clear_rgba, stats)
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_rects(
    context_handle: u64,
    target_handle: u64,
    rects_ptr: *const RectFillInstance,
    rect_count: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if rects_ptr.is_null() || rect_count == 0 {
        set_last_error("render_rects requires a non-empty rect instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_rects") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_rects");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target(&targets, context_handle, target_handle, "render_rects") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let rects = unsafe { std::slice::from_raw_parts(rects_ptr, rect_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-rect-instance-buffer"),
        contents: bytemuck::cast_slice(rects),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-rects-encoder") });
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("tge-wgpu-rects-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(unpack_rgba_u32(clear_rgba)), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        pass.set_pipeline(&context.rect_pipeline);
        pass.set_vertex_buffer(0, instance_buffer.slice(..));
        pass.draw(0..6, 0..rect_count);
    }
    context.queue.submit(Some(encoder.finish()));
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_rects_layer(
    context_handle: u64,
    target_handle: u64,
    rects_ptr: *const RectFillInstance,
    rect_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if rects_ptr.is_null() || rect_count == 0 {
        set_last_error("render_rects_layer requires a non-empty rect instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_rects_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_rects_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_rects_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let rects = unsafe { std::slice::from_raw_parts(rects_ptr, rect_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-rect-layer-instance-buffer"),
        contents: bytemuck::cast_slice(rects),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-rect-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.rect_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..rect_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-rect-layer-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-rect-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.rect_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..rect_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_image(
    context_handle: u64,
    target_handle: u64,
    image_handle: u64,
    image_ptr: *const ImageInstance,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if image_ptr.is_null() {
        set_last_error("render_image requires an image instance pointer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_image") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_image");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target(&targets, context_handle, target_handle, "render_image") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for render_image");
        return STATUS_INTERNAL_ERROR;
    };
    let image = if let Some(image) = images.get(&image_handle) {
        if image.context_handle != context_handle {
            set_last_error("render_image image/context mismatch");
            return STATUS_INVALID_HANDLE;
        }
        image
    } else {
        set_last_error("render_image image handle was not found");
        return STATUS_INVALID_HANDLE;
    };

    let instance = unsafe { std::ptr::read(image_ptr) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-image-instance-buffer"),
        contents: bytemuck::bytes_of(&instance),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-image-encoder") });
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("tge-wgpu-image-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(unpack_rgba_u32(clear_rgba)), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        pass.set_pipeline(&context.image_pipeline);
        pass.set_bind_group(0, &image.bind_group, &[]);
        pass.set_vertex_buffer(0, instance_buffer.slice(..));
        pass.draw(0..6, 0..1);
    }
    context.queue.submit(Some(encoder.finish()));
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_image_layer(
    context_handle: u64,
    target_handle: u64,
    image_handle: u64,
    image_ptr: *const ImageInstance,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if image_ptr.is_null() {
        set_last_error("render_image_layer requires an image instance pointer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_image_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_image_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_image_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for render_image_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let image = if let Some(image) = images.get(&image_handle) {
        if image.context_handle != context_handle {
            set_last_error("render_image_layer image/context mismatch");
            return STATUS_INVALID_HANDLE;
        }
        image
    } else {
        set_last_error("render_image_layer image handle was not found");
        return STATUS_INVALID_HANDLE;
    };

    let instance = unsafe { std::ptr::read(image_ptr) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-image-layer-instance-buffer"),
        contents: bytemuck::bytes_of(&instance),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-image-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.image_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..1);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-image-layer-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-image-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.image_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..1);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_images_layer(
    context_handle: u64,
    target_handle: u64,
    image_handle: u64,
    images_ptr: *const ImageInstance,
    image_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if images_ptr.is_null() || image_count == 0 {
        set_last_error("render_images_layer requires a non-empty image instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_images_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_images_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_images_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for render_images_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let image = if let Some(image) = images.get(&image_handle) {
        if image.context_handle != context_handle {
            set_last_error("render_images_layer image/context mismatch");
            return STATUS_INVALID_HANDLE;
        }
        image
    } else {
        set_last_error("render_images_layer image handle was not found");
        return STATUS_INVALID_HANDLE;
    };

    let instances = unsafe { std::slice::from_raw_parts(images_ptr, image_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-images-layer-instance-buffer"),
        contents: bytemuck::cast_slice(instances),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-images-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.image_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..image_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-images-layer-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-images-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.image_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..image_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_glyphs_layer(
    context_handle: u64,
    target_handle: u64,
    image_handle: u64,
    glyphs_ptr: *const GlyphInstance,
    glyph_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if glyphs_ptr.is_null() || glyph_count == 0 {
        set_last_error("render_glyphs_layer requires a non-empty glyph instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_glyphs_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_glyphs_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_glyphs_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for render_glyphs_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let image = if let Some(image) = images.get(&image_handle) {
        if image.context_handle != context_handle {
            set_last_error("render_glyphs_layer image/context mismatch");
            return STATUS_INVALID_HANDLE;
        }
        image
    } else {
        set_last_error("render_glyphs_layer image handle was not found");
        return STATUS_INVALID_HANDLE;
    };

    let instances = unsafe { std::slice::from_raw_parts(glyphs_ptr, glyph_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-glyphs-layer-instance-buffer"),
        contents: bytemuck::cast_slice(instances),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-glyphs-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.glyph_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..glyph_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-glyphs-layer-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-glyphs-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.glyph_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..glyph_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_transformed_images_layer(
    context_handle: u64,
    target_handle: u64,
    image_handle: u64,
    images_ptr: *const ImageTransformInstance,
    image_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if images_ptr.is_null() || image_count == 0 {
        set_last_error("render_transformed_images_layer requires a non-empty image instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_transformed_images_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_transformed_images_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_transformed_images_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let images = if let Ok(images) = IMAGES.lock() {
        images
    } else {
        set_last_error("failed to lock image table for render_transformed_images_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let image = if let Some(image) = images.get(&image_handle) {
        if image.context_handle != context_handle {
            set_last_error("render_transformed_images_layer image/context mismatch");
            return STATUS_INVALID_HANDLE;
        }
        image
    } else {
        set_last_error("render_transformed_images_layer image handle was not found");
        return STATUS_INVALID_HANDLE;
    };

    let instances = unsafe { std::slice::from_raw_parts(images_ptr, image_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-transformed-images-layer-instance-buffer"),
        contents: bytemuck::cast_slice(instances),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-transformed-images-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.image_transform_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..image_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-transformed-images-layer-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-transformed-images-layer-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.image_transform_pipeline);
            pass.set_bind_group(0, &image.bind_group, &[]);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..image_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_linear_gradients_layer(
    context_handle: u64,
    target_handle: u64,
    gradients_ptr: *const LinearGradientInstance,
    gradient_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if gradients_ptr.is_null() || gradient_count == 0 {
        set_last_error("render_linear_gradients_layer requires a non-empty gradient instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_linear_gradients_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_linear_gradients_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_linear_gradients_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let gradients = unsafe { std::slice::from_raw_parts(gradients_ptr, gradient_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-linear-gradient-instance-buffer"),
        contents: bytemuck::cast_slice(gradients),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-linear-gradient-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.linear_gradient_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..gradient_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-linear-gradient-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-linear-gradient-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.linear_gradient_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..gradient_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_radial_gradients_layer(
    context_handle: u64,
    target_handle: u64,
    gradients_ptr: *const RadialGradientInstance,
    gradient_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if gradients_ptr.is_null() || gradient_count == 0 {
        set_last_error("render_radial_gradients_layer requires a non-empty gradient instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_radial_gradients_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_radial_gradients_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_radial_gradients_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let gradients = unsafe { std::slice::from_raw_parts(gradients_ptr, gradient_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-radial-gradient-instance-buffer"),
        contents: bytemuck::cast_slice(gradients),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-radial-gradient-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.radial_gradient_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..gradient_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-radial-gradient-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-radial-gradient-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.radial_gradient_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..gradient_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_circles_layer(
    context_handle: u64,
    target_handle: u64,
    circles_ptr: *const CircleInstance,
    circle_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if circles_ptr.is_null() || circle_count == 0 {
        set_last_error("render_circles_layer requires a non-empty circle instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_circles_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_circles_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_circles_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let circles = unsafe { std::slice::from_raw_parts(circles_ptr, circle_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-circle-instance-buffer"),
        contents: bytemuck::cast_slice(circles),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-circle-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.circle_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..circle_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-circle-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-circle-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.circle_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..circle_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_polygons_layer(
    context_handle: u64,
    target_handle: u64,
    polys_ptr: *const PolygonInstance,
    poly_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if polys_ptr.is_null() || poly_count == 0 {
        set_last_error("render_polygons_layer requires a non-empty polygon instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_polygons_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_polygons_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_polygons_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let polys = unsafe { std::slice::from_raw_parts(polys_ptr, poly_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-polygon-instance-buffer"),
        contents: bytemuck::cast_slice(polys),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-polygon-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.polygon_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..poly_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-polygon-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-polygon-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.polygon_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..poly_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_beziers_layer(
    context_handle: u64,
    target_handle: u64,
    beziers_ptr: *const BezierInstance,
    bezier_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if beziers_ptr.is_null() || bezier_count == 0 {
        set_last_error("render_beziers_layer requires a non-empty bezier instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_beziers_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_beziers_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_beziers_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let beziers = unsafe { std::slice::from_raw_parts(beziers_ptr, bezier_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-bezier-instance-buffer"),
        contents: bytemuck::cast_slice(beziers),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-bezier-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.bezier_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..bezier_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-bezier-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-bezier-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.bezier_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..bezier_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_shape_rects_layer(
    context_handle: u64,
    target_handle: u64,
    rects_ptr: *const ShapeRectInstance,
    rect_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if rects_ptr.is_null() || rect_count == 0 {
        set_last_error("render_shape_rects_layer requires a non-empty rect instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_shape_rects_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_shape_rects_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_shape_rects_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let rects = unsafe { std::slice::from_raw_parts(rects_ptr, rect_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-shape-rect-instance-buffer"),
        contents: bytemuck::cast_slice(rects),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-shape-rect-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.shape_rect_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..rect_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-shape-rect-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-shape-rect-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.shape_rect_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..rect_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_shape_rect_corners_layer(
    context_handle: u64,
    target_handle: u64,
    rects_ptr: *const ShapeRectCornersInstance,
    rect_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if rects_ptr.is_null() || rect_count == 0 {
        set_last_error("render_shape_rect_corners_layer requires a non-empty rect instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_shape_rect_corners_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() { targets } else {
        set_last_error("failed to lock target table for render_shape_rect_corners_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_shape_rect_corners_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let rects = unsafe { std::slice::from_raw_parts(rects_ptr, rect_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-shape-rect-corners-instance-buffer"),
        contents: bytemuck::cast_slice(rects),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-shape-rect-corners-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.shape_rect_corners_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..rect_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-shape-rect-corners-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-shape-rect-corners-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.shape_rect_corners_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..rect_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_glows_layer(
    context_handle: u64,
    target_handle: u64,
    glows_ptr: *const GlowInstance,
    glow_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if glows_ptr.is_null() || glow_count == 0 {
        set_last_error("render_glows_layer requires a non-empty glow instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_glows_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let mut targets = if let Ok(targets) = TARGETS.lock() {
        targets
    } else {
        set_last_error("failed to lock target table for render_glows_layer");
        return STATUS_INTERNAL_ERROR;
    };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_glows_layer") {
        Ok(value) => value,
        Err(code) => return code,
    };

    let glows = unsafe { std::slice::from_raw_parts(glows_ptr, glow_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-glow-instance-buffer"),
        contents: bytemuck::cast_slice(glows),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-glow-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { 0 } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.glow_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..glow_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-glow-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-glow-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&context.glow_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..glow_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_nebulas_layer(
    context_handle: u64,
    target_handle: u64,
    nebulas_ptr: *const NebulaInstance,
    nebula_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if nebulas_ptr.is_null() || nebula_count == 0 {
        set_last_error("render_nebulas_layer requires a non-empty instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_nebulas_layer") { Ok(value) => value, Err(code) => return code };
    let mut targets = if let Ok(targets) = TARGETS.lock() { targets } else { set_last_error("failed to lock target table for render_nebulas_layer"); return STATUS_INTERNAL_ERROR; };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_nebulas_layer") { Ok(value) => value, Err(code) => return code };
    let nebulas = unsafe { std::slice::from_raw_parts(nebulas_ptr, nebula_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-nebula-instance-buffer"),
        contents: bytemuck::cast_slice(nebulas),
        usage: wgpu::BufferUsages::VERTEX,
    });
    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-nebula-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })], depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None,
            });
            pass.set_pipeline(&context.nebula_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..nebula_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-nebula-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-nebula-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })], depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None,
            });
            pass.set_pipeline(&context.nebula_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..nebula_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}

#[no_mangle]
pub extern "C" fn tge_wgpu_canvas_target_render_starfields_layer(
    context_handle: u64,
    target_handle: u64,
    starfields_ptr: *const StarfieldInstance,
    starfield_count: u32,
    load_mode: u32,
    clear_rgba: u32,
    stats: *mut TgeWgpuCanvasFrameStats,
) -> u32 {
    write_stats(stats, 0.0, 0.0, 0.0);
    if starfields_ptr.is_null() || starfield_count == 0 {
        set_last_error("render_starfields_layer requires a non-empty instance buffer");
        return STATUS_INVALID_ARGUMENT;
    }
    let context = match get_context(context_handle, "render_starfields_layer") { Ok(value) => value, Err(code) => return code };
    let mut targets = if let Ok(targets) = TARGETS.lock() { targets } else { set_last_error("failed to lock target table for render_starfields_layer"); return STATUS_INTERNAL_ERROR; };
    let target = match with_target_mut(&mut targets, context_handle, target_handle, "render_starfields_layer") { Ok(value) => value, Err(code) => return code };
    let starfields = unsafe { std::slice::from_raw_parts(starfields_ptr, starfield_count as usize) };
    let instance_buffer = context.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("tge-wgpu-starfield-instance-buffer"),
        contents: bytemuck::cast_slice(starfields),
        usage: wgpu::BufferUsages::VERTEX,
    });
    let started = Instant::now();
    let view = target.texture.create_view(&wgpu::TextureViewDescriptor::default());
    if let Some(active) = target.active_layer.as_mut() {
        {
            let mut pass = active.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-starfield-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(if active.first_pass { active.first_load_mode } else { 1 }, active.clear_rgba), store: wgpu::StoreOp::Store },
                })], depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None,
            });
            pass.set_pipeline(&context.starfield_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..starfield_count);
        }
        active.first_pass = false;
    } else {
        let mut encoder = context.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("tge-wgpu-starfield-encoder") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tge-wgpu-starfield-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: load_op_from_mode(load_mode, clear_rgba), store: wgpu::StoreOp::Store },
                })], depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None,
            });
            pass.set_pipeline(&context.starfield_pipeline);
            pass.set_vertex_buffer(0, instance_buffer.slice(..));
            pass.draw(0..6, 0..starfield_count);
        }
        context.queue.submit(Some(encoder.finish()));
    }
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;
    write_stats(stats, total_ms, 0.0, total_ms);
    clear_last_error();
    STATUS_SUCCESS
}
