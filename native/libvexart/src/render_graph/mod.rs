use crate::ffi::buffer::{GRAPH_MAGIC, GRAPH_VERSION};
use crate::paint::instances::{
    BridgeGlowInstance, BridgeImageTransformInstance, BridgeLinearGradientInstance,
    BridgeRadialGradientInstance, BridgeShadowInstance, BridgeShapeRectCornersInstance,
    BridgeShapeRectInstance, MsdfGlyphInstance,
};
use crate::scene::{NativeNodeKind, PropValue, SceneGraph};
use crate::text::atlas::AtlasRegistry;
use crate::text::render::glyph_ndc;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

const PROP_BACKGROUND_COLOR: u16 = 3;
const PROP_BORDER_COLOR: u16 = 4;
const PROP_BORDER_WIDTH: u16 = 5;
const PROP_CORNER_RADIUS: u16 = 6;
const PROP_COLOR: u16 = 7;
const PROP_FONT_SIZE: u16 = 8;
const PROP_OPACITY: u16 = 21;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NativeRenderOpKind {
    Rect,
    Border,
    Text,
    Effect,
    Image,
    Canvas,
}

impl NativeRenderOpKind {
    pub fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::Rect),
            1 => Some(Self::Border),
            2 => Some(Self::Text),
            3 => Some(Self::Effect),
            4 => Some(Self::Image),
            5 => Some(Self::Canvas),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeRenderOp {
    pub kind: NativeRenderOpKind,
    pub node_id: u64,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub color: u32,
    pub corner_radius: f32,
    pub border_width: f32,
    pub opacity: f32,
    pub text: String,
    pub font_size: f32,
    pub font_id: u32,
    pub object_fit: String,
    pub canvas_viewport_json: String,
    pub canvas_display_list_handle: u64,
    pub material_key: String,
    pub effect_key: String,
    pub image_source: String,
    pub image_handle: u64,
    pub has_gradient: bool,
    pub has_shadow: bool,
    pub has_glow: bool,
    pub has_filter: bool,
    pub has_backdrop: bool,
    pub has_transform: bool,
    pub has_opacity: bool,
    pub has_corner_radii: bool,
    pub gradient_json: String,
    pub shadow_json: String,
    pub glow_json: String,
    pub filter_json: String,
    pub transform_json: String,
    pub corner_radii_json: String,
    pub backdrop_blur: Option<f32>,
    pub backdrop_brightness: Option<f32>,
    pub backdrop_contrast: Option<f32>,
    pub backdrop_saturate: Option<f32>,
    pub backdrop_grayscale: Option<f32>,
    pub backdrop_invert: Option<f32>,
    pub backdrop_sepia: Option<f32>,
    pub backdrop_hue_rotate: Option<f32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeRenderBatch {
    pub key: String,
    pub op_node_ids: Vec<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScenePaintOptions {
    pub target_width: u32,
    pub target_height: u32,
    pub offset_x: f32,
    pub offset_y: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ScenePaintRef {
    pub node_id: u64,
    pub kind: NativeRenderOpKind,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SceneImagePaint {
    pub image_handle: u64,
    pub params: Vec<u8>,
}

pub fn scene_to_render_ops(scene: &SceneGraph) -> Vec<NativeRenderOp> {
    let mut roots: Vec<u64> = scene
        .nodes
        .values()
        .filter(|node| node.parent.is_none())
        .map(|node| node.id)
        .collect();
    roots.sort_unstable();

    let mut ops = Vec::new();
    for root in roots {
        collect_ops(scene, root, &mut ops);
    }
    ops
}

pub fn batch_render_ops(ops: &[NativeRenderOp]) -> Vec<NativeRenderBatch> {
    let mut grouped = BTreeMap::<String, Vec<u64>>::new();
    for op in ops {
        grouped
            .entry(op.material_key.clone())
            .or_default()
            .push(op.node_id);
    }
    grouped
        .into_iter()
        .map(|(key, op_node_ids)| NativeRenderBatch { key, op_node_ids })
        .collect()
}

pub fn scene_to_paint_graph(
    scene: &SceneGraph,
    refs: &[ScenePaintRef],
    options: ScenePaintOptions,
) -> Result<Vec<u8>, &'static str> {
    if options.target_width == 0 || options.target_height == 0 {
        return Err("invalid target size");
    }

    let selected: HashSet<ScenePaintRef> = refs.iter().copied().collect();
    if selected.is_empty() {
        return Ok(write_paint_graph(Vec::new()));
    }

    let mut commands = Vec::<(u16, Vec<u8>)>::new();
    for op in scene_to_render_ops(scene) {
        if !selected.contains(&ScenePaintRef {
            node_id: op.node_id,
            kind: op.kind,
        }) {
            continue;
        }
        lower_op_to_paint_command(&op, options, &mut commands)?;
    }

    Ok(write_paint_graph(commands))
}

pub fn scene_to_text_glyphs(
    scene: &SceneGraph,
    refs: &[ScenePaintRef],
    options: ScenePaintOptions,
    atlases: &AtlasRegistry,
) -> Result<Vec<MsdfGlyphInstance>, &'static str> {
    if options.target_width == 0 || options.target_height == 0 {
        return Err("invalid target size");
    }
    let selected: HashSet<ScenePaintRef> = refs.iter().copied().collect();
    if selected.is_empty() {
        return Ok(Vec::new());
    }

    let mut glyphs = Vec::new();
    for op in scene_to_render_ops(scene) {
        if op.kind != NativeRenderOpKind::Text {
            continue;
        }
        if !selected.contains(&ScenePaintRef {
            node_id: op.node_id,
            kind: op.kind,
        }) {
            continue;
        }
        lower_text_to_glyphs(&op, options, atlases, &mut glyphs)?;
    }
    Ok(glyphs)
}

pub fn scene_to_image_paints(
    scene: &SceneGraph,
    refs: &[ScenePaintRef],
    options: ScenePaintOptions,
) -> Result<Vec<SceneImagePaint>, &'static str> {
    if options.target_width == 0 || options.target_height == 0 {
        return Err("invalid target size");
    }
    let selected: HashSet<ScenePaintRef> = refs.iter().copied().collect();
    if selected.is_empty() {
        return Ok(Vec::new());
    }

    let mut images = Vec::new();
    for op in scene_to_render_ops(scene) {
        if op.kind != NativeRenderOpKind::Image {
            continue;
        }
        if !selected.contains(&ScenePaintRef {
            node_id: op.node_id,
            kind: op.kind,
        }) {
            continue;
        }
        images.push(lower_image_to_paint(&op, options)?);
    }
    Ok(images)
}

pub fn parse_scene_paint_config(
    bytes: &[u8],
) -> Result<(ScenePaintOptions, Vec<ScenePaintRef>), &'static str> {
    const HEADER_BYTES: usize = 24;
    const REF_BYTES: usize = 16;

    if bytes.len() < HEADER_BYTES {
        return Err("scene paint config too small");
    }

    let target_width = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    let target_height = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    let offset_x = f32::from_le_bytes(bytes[8..12].try_into().unwrap());
    let offset_y = f32::from_le_bytes(bytes[12..16].try_into().unwrap());
    let ref_count = u32::from_le_bytes(bytes[16..20].try_into().unwrap()) as usize;
    let required = HEADER_BYTES + ref_count.saturating_mul(REF_BYTES);
    if bytes.len() < required {
        return Err("scene paint config truncated");
    }

    let mut refs = Vec::with_capacity(ref_count);
    for index in 0..ref_count {
        let offset = HEADER_BYTES + index * REF_BYTES;
        let node_id = u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap());
        let Some(kind) = NativeRenderOpKind::from_u32(u32::from_le_bytes(
            bytes[offset + 8..offset + 12].try_into().unwrap(),
        )) else {
            return Err("invalid scene paint op kind");
        };
        refs.push(ScenePaintRef { node_id, kind });
    }

    Ok((
        ScenePaintOptions {
            target_width,
            target_height,
            offset_x,
            offset_y,
        },
        refs,
    ))
}

pub fn snapshot_json(scene: &SceneGraph) -> String {
    let ops = scene_to_render_ops(scene);
    let body = ops
        .iter()
        .map(|op| {
            format!(
                "{{\"kind\":\"{}\",\"nodeId\":{},\"x\":{},\"y\":{},\"width\":{},\"height\":{},\"color\":{},\"cornerRadius\":{},\"borderWidth\":{},\"opacity\":{},\"text\":{:?},\"fontSize\":{},\"fontId\":{},\"objectFit\":{:?},\"canvasViewportJson\":{:?},\"canvasDisplayListHandle\":{},\"materialKey\":{:?},\"effectKey\":{:?},\"imageSource\":{:?},\"imageHandle\":{},\"hasGradient\":{},\"hasShadow\":{},\"hasGlow\":{},\"hasFilter\":{},\"hasBackdrop\":{},\"hasTransform\":{},\"hasOpacity\":{},\"hasCornerRadii\":{},\"gradientJson\":{:?},\"shadowJson\":{:?},\"glowJson\":{:?},\"filterJson\":{:?},\"transformJson\":{:?},\"cornerRadiiJson\":{:?},\"backdropBlur\":{},\"backdropBrightness\":{},\"backdropContrast\":{},\"backdropSaturate\":{},\"backdropGrayscale\":{},\"backdropInvert\":{},\"backdropSepia\":{},\"backdropHueRotate\":{}}}",
                kind_name(&op.kind),
                op.node_id,
                op.x,
                op.y,
                op.width,
                op.height,
                op.color,
                op.corner_radius,
                op.border_width,
                op.opacity,
                op.text,
                op.font_size,
                op.font_id,
                op.object_fit,
                op.canvas_viewport_json,
                op.canvas_display_list_handle,
                op.material_key,
                op.effect_key,
                op.image_source,
                op.image_handle,
                op.has_gradient,
                op.has_shadow,
                op.has_glow,
                op.has_filter,
                op.has_backdrop,
                op.has_transform,
                op.has_opacity,
                op.has_corner_radii,
                op.gradient_json,
                op.shadow_json,
                op.glow_json,
                op.filter_json,
                op.transform_json,
                op.corner_radii_json,
                json_option_f32(op.backdrop_blur),
                json_option_f32(op.backdrop_brightness),
                json_option_f32(op.backdrop_contrast),
                json_option_f32(op.backdrop_saturate),
                json_option_f32(op.backdrop_grayscale),
                json_option_f32(op.backdrop_invert),
                json_option_f32(op.backdrop_sepia),
                json_option_f32(op.backdrop_hue_rotate),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let batches = batch_render_ops(&ops)
        .into_iter()
        .map(|batch| {
            let node_ids = batch
                .op_node_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(",");
            format!("{{\"key\":{:?},\"opNodeIds\":[{}]}}", batch.key, node_ids)
        })
        .collect::<Vec<_>>()
        .join(",");
    format!("{{\"ops\":[{}],\"batches\":[{}]}}", body, batches)
}

fn collect_ops(scene: &SceneGraph, node_id: u64, out: &mut Vec<NativeRenderOp>) {
    let Some(node) = scene.nodes.get(&node_id) else {
        return;
    };
    let rect = node.layout;
    let has_area = rect.width > 0.0 && rect.height > 0.0;
    let opacity = numeric_prop(scene, node_id, PROP_OPACITY).unwrap_or(1.0);
    let features = effect_features(scene, node_id, opacity);
    let payloads = effect_payloads(scene, node_id);

    match node.kind {
        NativeNodeKind::Root | NativeNodeKind::Box => {
            if has_area {
                let effect_key_value = effect_key(&features);
                let rect_kind = if effect_key_value.is_empty() {
                    NativeRenderOpKind::Rect
                } else {
                    NativeRenderOpKind::Effect
                };
                if let Some(color) = color_prop(scene, node_id, PROP_BACKGROUND_COLOR) {
                    out.push(NativeRenderOp {
                        kind: rect_kind,
                        node_id,
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        color,
                        corner_radius: numeric_prop(scene, node_id, PROP_CORNER_RADIUS)
                            .unwrap_or(0.0),
                        border_width: 0.0,
                        opacity,
                        text: String::new(),
                        font_size: 0.0,
                        font_id: 0,
                        object_fit: String::new(),
                        canvas_viewport_json: String::new(),
                        canvas_display_list_handle: 0,
                        material_key: material_key(&rect_kind, color, &effect_key_value),
                        effect_key: effect_key_value,
                        image_source: String::new(),
                        image_handle: 0,
                        has_gradient: features.has_gradient,
                        has_shadow: features.has_shadow,
                        has_glow: features.has_glow,
                        has_filter: features.has_filter,
                        has_backdrop: features.has_backdrop,
                        has_transform: features.has_transform,
                        has_opacity: features.has_opacity,
                        has_corner_radii: features.has_corner_radii,
                        gradient_json: payloads.gradient_json.clone(),
                        shadow_json: payloads.shadow_json.clone(),
                        glow_json: payloads.glow_json.clone(),
                        filter_json: payloads.filter_json.clone(),
                        transform_json: payloads.transform_json.clone(),
                        corner_radii_json: payloads.corner_radii_json.clone(),
                        backdrop_blur: payloads.backdrop_blur,
                        backdrop_brightness: payloads.backdrop_brightness,
                        backdrop_contrast: payloads.backdrop_contrast,
                        backdrop_saturate: payloads.backdrop_saturate,
                        backdrop_grayscale: payloads.backdrop_grayscale,
                        backdrop_invert: payloads.backdrop_invert,
                        backdrop_sepia: payloads.backdrop_sepia,
                        backdrop_hue_rotate: payloads.backdrop_hue_rotate,
                    });
                }
                let border_width = numeric_prop(scene, node_id, PROP_BORDER_WIDTH).unwrap_or(0.0);
                if border_width > 0.0 {
                    out.push(NativeRenderOp {
                        kind: NativeRenderOpKind::Border,
                        node_id,
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        color: color_prop(scene, node_id, PROP_BORDER_COLOR).unwrap_or(0),
                        corner_radius: numeric_prop(scene, node_id, PROP_CORNER_RADIUS)
                            .unwrap_or(0.0),
                        border_width,
                        opacity,
                        text: String::new(),
                        font_size: 0.0,
                        font_id: 0,
                        object_fit: String::new(),
                        canvas_viewport_json: String::new(),
                        canvas_display_list_handle: 0,
                        material_key: material_key(
                            &NativeRenderOpKind::Border,
                            color_prop(scene, node_id, PROP_BORDER_COLOR).unwrap_or(0),
                            "",
                        ),
                        effect_key: String::new(),
                        image_source: String::new(),
                        image_handle: 0,
                        has_gradient: false,
                        has_shadow: false,
                        has_glow: false,
                        has_filter: false,
                        has_backdrop: false,
                        has_transform: false,
                        has_opacity: features.has_opacity,
                        has_corner_radii: features.has_corner_radii,
                        gradient_json: String::new(),
                        shadow_json: String::new(),
                        glow_json: String::new(),
                        filter_json: String::new(),
                        transform_json: String::new(),
                        corner_radii_json: payloads.corner_radii_json.clone(),
                        backdrop_blur: None,
                        backdrop_brightness: None,
                        backdrop_contrast: None,
                        backdrop_saturate: None,
                        backdrop_grayscale: None,
                        backdrop_invert: None,
                        backdrop_sepia: None,
                        backdrop_hue_rotate: None,
                    });
                }
            }
        }
        NativeNodeKind::Image => {
            if has_area {
                let source = string_prop(scene, node_id, prop_hash("src"))
                    .unwrap_or_default()
                    .to_string();
                let image_handle = string_prop(scene, node_id, prop_hash("__imageHandle"))
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(0);
                out.push(NativeRenderOp {
                    kind: NativeRenderOpKind::Image,
                    node_id,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    color: color_prop(scene, node_id, PROP_BACKGROUND_COLOR).unwrap_or(0),
                    corner_radius: numeric_prop(scene, node_id, PROP_CORNER_RADIUS).unwrap_or(0.0),
                    border_width: 0.0,
                    opacity,
                    text: String::new(),
                    font_size: 0.0,
                    font_id: 0,
                    object_fit: string_prop(scene, node_id, prop_hash("objectFit"))
                        .unwrap_or_else(|| "contain".to_string()),
                    canvas_viewport_json: String::new(),
                    canvas_display_list_handle: 0,
                    material_key: material_key(&NativeRenderOpKind::Image, 0, ""),
                    effect_key: String::new(),
                    image_source: source,
                    image_handle,
                    has_gradient: false,
                    has_shadow: false,
                    has_glow: false,
                    has_filter: false,
                    has_backdrop: false,
                    has_transform: features.has_transform,
                    has_opacity: features.has_opacity,
                    has_corner_radii: features.has_corner_radii,
                    gradient_json: String::new(),
                    shadow_json: String::new(),
                    glow_json: String::new(),
                    filter_json: String::new(),
                    transform_json: payloads.transform_json.clone(),
                    corner_radii_json: payloads.corner_radii_json.clone(),
                    backdrop_blur: None,
                    backdrop_brightness: None,
                    backdrop_contrast: None,
                    backdrop_saturate: None,
                    backdrop_grayscale: None,
                    backdrop_invert: None,
                    backdrop_sepia: None,
                    backdrop_hue_rotate: None,
                });
            }
        }
        NativeNodeKind::Canvas => {
            if has_area {
                let effect_key_value = effect_key(&features);
                let canvas_display_list_handle =
                    string_prop(scene, node_id, prop_hash("__canvasDisplayListHandle"))
                        .and_then(|value| value.parse::<u64>().ok())
                        .unwrap_or(0);
                out.push(NativeRenderOp {
                    kind: NativeRenderOpKind::Canvas,
                    node_id,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    color: color_prop(scene, node_id, PROP_BACKGROUND_COLOR).unwrap_or(0),
                    corner_radius: numeric_prop(scene, node_id, PROP_CORNER_RADIUS).unwrap_or(0.0),
                    border_width: 0.0,
                    opacity,
                    text: String::new(),
                    font_size: 0.0,
                    font_id: 0,
                    object_fit: String::new(),
                    canvas_viewport_json: string_prop(scene, node_id, prop_hash("viewport"))
                        .unwrap_or_default(),
                    canvas_display_list_handle,
                    material_key: material_key(&NativeRenderOpKind::Canvas, 0, &effect_key_value),
                    effect_key: effect_key_value,
                    image_source: String::new(),
                    image_handle: 0,
                    has_gradient: features.has_gradient,
                    has_shadow: features.has_shadow,
                    has_glow: features.has_glow,
                    has_filter: features.has_filter,
                    has_backdrop: features.has_backdrop,
                    has_transform: features.has_transform,
                    has_opacity: features.has_opacity,
                    has_corner_radii: features.has_corner_radii,
                    gradient_json: payloads.gradient_json.clone(),
                    shadow_json: payloads.shadow_json.clone(),
                    glow_json: payloads.glow_json.clone(),
                    filter_json: payloads.filter_json.clone(),
                    transform_json: payloads.transform_json.clone(),
                    corner_radii_json: payloads.corner_radii_json.clone(),
                    backdrop_blur: payloads.backdrop_blur,
                    backdrop_brightness: payloads.backdrop_brightness,
                    backdrop_contrast: payloads.backdrop_contrast,
                    backdrop_saturate: payloads.backdrop_saturate,
                    backdrop_grayscale: payloads.backdrop_grayscale,
                    backdrop_invert: payloads.backdrop_invert,
                    backdrop_sepia: payloads.backdrop_sepia,
                    backdrop_hue_rotate: payloads.backdrop_hue_rotate,
                });
            }
        }
        NativeNodeKind::Text => {
            let text = collect_text(scene, node_id);
            if has_area && !text.is_empty() {
                out.push(NativeRenderOp {
                    kind: NativeRenderOpKind::Text,
                    node_id,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    color: color_prop(scene, node_id, PROP_COLOR).unwrap_or(0xe0e0e0ff),
                    corner_radius: 0.0,
                    border_width: 0.0,
                    opacity,
                    text,
                    font_size: numeric_prop(scene, node_id, PROP_FONT_SIZE).unwrap_or(14.0),
                    font_id: numeric_prop(scene, node_id, prop_hash("fontId"))
                        .unwrap_or(0.0)
                        .max(0.0) as u32,
                    object_fit: String::new(),
                    canvas_viewport_json: String::new(),
                    canvas_display_list_handle: 0,
                    material_key: material_key(
                        &NativeRenderOpKind::Text,
                        color_prop(scene, node_id, PROP_COLOR).unwrap_or(0xe0e0e0ff),
                        "",
                    ),
                    effect_key: String::new(),
                    image_source: String::new(),
                    image_handle: 0,
                    has_gradient: false,
                    has_shadow: false,
                    has_glow: false,
                    has_filter: false,
                    has_backdrop: false,
                    has_transform: features.has_transform,
                    has_opacity: features.has_opacity,
                    has_corner_radii: features.has_corner_radii,
                    gradient_json: String::new(),
                    shadow_json: String::new(),
                    glow_json: String::new(),
                    filter_json: String::new(),
                    transform_json: payloads.transform_json.clone(),
                    corner_radii_json: payloads.corner_radii_json.clone(),
                    backdrop_blur: None,
                    backdrop_brightness: None,
                    backdrop_contrast: None,
                    backdrop_saturate: None,
                    backdrop_grayscale: None,
                    backdrop_invert: None,
                    backdrop_sepia: None,
                    backdrop_hue_rotate: None,
                });
            }
        }
    }

    for &child in &node.children {
        collect_ops(scene, child, out);
    }
}

fn collect_text(scene: &SceneGraph, node_id: u64) -> String {
    let Some(node) = scene.nodes.get(&node_id) else {
        return String::new();
    };
    if !node.text.is_empty() {
        return node.text.clone();
    }
    let mut text = String::new();
    for child_id in &node.children {
        text.push_str(&collect_text(scene, *child_id));
    }
    text
}

fn kind_name(kind: &NativeRenderOpKind) -> &'static str {
    match kind {
        NativeRenderOpKind::Rect => "rect",
        NativeRenderOpKind::Border => "border",
        NativeRenderOpKind::Text => "text",
        NativeRenderOpKind::Effect => "effect",
        NativeRenderOpKind::Image => "image",
        NativeRenderOpKind::Canvas => "canvas",
    }
}

fn numeric_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> Option<f32> {
    match effective_prop(scene, node_id, prop_id) {
        Some(PropValue::I32(v)) => Some(v as f32),
        Some(PropValue::U32(v)) => Some(v as f32),
        Some(PropValue::F32(v)) => Some(v),
        _ => None,
    }
}

fn color_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> Option<u32> {
    match effective_prop(scene, node_id, prop_id) {
        Some(PropValue::U32(v)) => Some(v),
        Some(PropValue::I32(v)) if v >= 0 => Some(v as u32),
        Some(PropValue::F32(v)) if v >= 0.0 => Some(v as u32),
        _ => None,
    }
}

fn string_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> Option<String> {
    match effective_prop(scene, node_id, prop_id) {
        Some(PropValue::String(v)) => Some(v.clone()),
        _ => None,
    }
}

fn direct_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> Option<&PropValue> {
    scene
        .nodes
        .get(&node_id)
        .and_then(|node| node.props.get(&prop_id))
}

fn prop_truthy(scene: &SceneGraph, node_id: u64, prop_id: u16) -> bool {
    matches!(
        direct_prop(scene, node_id, prop_id),
        Some(PropValue::Bool(true)) | Some(PropValue::Capability(true))
    )
}

fn prop_name(prop_id: u16) -> Option<&'static str> {
    match prop_id {
        PROP_BACKGROUND_COLOR => Some("backgroundColor"),
        PROP_BORDER_COLOR => Some("borderColor"),
        PROP_BORDER_WIDTH => Some("borderWidth"),
        PROP_CORNER_RADIUS => Some("cornerRadius"),
        PROP_COLOR => Some("color"),
        PROP_FONT_SIZE => Some("fontSize"),
        PROP_OPACITY => Some("opacity"),
        _ if prop_id == prop_hash("borderRadius") => Some("borderRadius"),
        _ if prop_id == prop_hash("shadow") => Some("shadow"),
        _ if prop_id == prop_hash("boxShadow") => Some("boxShadow"),
        _ if prop_id == prop_hash("glow") => Some("glow"),
        _ if prop_id == prop_hash("gradient") => Some("gradient"),
        _ if prop_id == prop_hash("filter") => Some("filter"),
        _ if prop_id == prop_hash("transform") => Some("transform"),
        _ if prop_id == prop_hash("backdropBlur") => Some("backdropBlur"),
        _ if prop_id == prop_hash("backdropBrightness") => Some("backdropBrightness"),
        _ if prop_id == prop_hash("backdropContrast") => Some("backdropContrast"),
        _ if prop_id == prop_hash("backdropSaturate") => Some("backdropSaturate"),
        _ if prop_id == prop_hash("backdropGrayscale") => Some("backdropGrayscale"),
        _ if prop_id == prop_hash("backdropInvert") => Some("backdropInvert"),
        _ if prop_id == prop_hash("backdropSepia") => Some("backdropSepia"),
        _ if prop_id == prop_hash("backdropHueRotate") => Some("backdropHueRotate"),
        _ if prop_id == prop_hash("cornerRadii") => Some("cornerRadii"),
        _ if prop_id == prop_hash("fontId") => Some("fontId"),
        _ if prop_id == prop_hash("src") => Some("src"),
        _ => None,
    }
}

fn style_prop_value(
    scene: &SceneGraph,
    node_id: u64,
    style_prop_id: u16,
    prop_id: u16,
) -> Option<PropValue> {
    let name = prop_name(prop_id)?;
    let raw = match direct_prop(scene, node_id, style_prop_id) {
        Some(PropValue::String(value)) => value,
        _ => return None,
    };
    let parsed: Value = serde_json::from_str(raw).ok()?;
    let value = parsed.get(name)?;
    json_value_to_prop(value)
}

fn json_value_to_prop(value: &Value) -> Option<PropValue> {
    match value {
        Value::Bool(v) => Some(PropValue::Bool(*v)),
        Value::Number(v) => {
            if let Some(u) = v.as_u64() {
                if u <= u32::MAX as u64 {
                    return Some(PropValue::U32(u as u32));
                }
            }
            if let Some(i) = v.as_i64() {
                if i >= i32::MIN as i64 && i <= i32::MAX as i64 {
                    return Some(PropValue::I32(i as i32));
                }
            }
            v.as_f64().map(|f| PropValue::F32(f as f32))
        }
        Value::String(v) => Some(PropValue::String(v.clone())),
        Value::Object(_) | Value::Array(_) => Some(PropValue::String(value.to_string())),
        Value::Null => None,
    }
}

fn base_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> Option<PropValue> {
    if let Some(value) = direct_prop(scene, node_id, prop_id) {
        return Some(value.clone());
    }
    if prop_id == PROP_CORNER_RADIUS {
        if let Some(value) = direct_prop(scene, node_id, prop_hash("borderRadius")) {
            return Some(value.clone());
        }
    }
    if prop_id == prop_hash("shadow") {
        if let Some(value) = direct_prop(scene, node_id, prop_hash("boxShadow")) {
            return Some(value.clone());
        }
    }
    style_prop_value(scene, node_id, prop_hash("style"), prop_id)
}

fn effective_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> Option<PropValue> {
    let mut value = base_prop(scene, node_id, prop_id);
    if value.is_none() && prop_id == PROP_CORNER_RADIUS {
        value = base_prop(scene, node_id, prop_hash("borderRadius"));
    }
    if value.is_none() && prop_id == prop_hash("shadow") {
        value = base_prop(scene, node_id, prop_hash("boxShadow"));
    }

    if scene.is_hovered(node_id) || prop_truthy(scene, node_id, prop_hash("__hovered")) {
        if let Some(override_value) =
            style_prop_value(scene, node_id, prop_hash("hoverStyle"), prop_id)
        {
            value = Some(override_value);
        }
    }
    if prop_truthy(scene, node_id, prop_hash("__focused")) {
        if let Some(override_value) =
            style_prop_value(scene, node_id, prop_hash("focusStyle"), prop_id)
        {
            value = Some(override_value);
        }
    }
    if scene.is_active(node_id) || prop_truthy(scene, node_id, prop_hash("__active")) {
        if let Some(override_value) =
            style_prop_value(scene, node_id, prop_hash("activeStyle"), prop_id)
        {
            value = Some(override_value);
        }
    }
    value
}

fn prop_hash(name: &str) -> u16 {
    let mut hash: u32 = 2166136261;
    for byte in name.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16777619);
    }
    ((hash % 60000) + 1000) as u16
}

fn has_prop(scene: &SceneGraph, node_id: u64, prop_id: u16) -> bool {
    effective_prop(scene, node_id, prop_id).is_some()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NativeEffectFeatures {
    has_gradient: bool,
    has_shadow: bool,
    has_glow: bool,
    has_filter: bool,
    has_backdrop: bool,
    has_transform: bool,
    has_opacity: bool,
    has_corner_radii: bool,
}

fn effect_features(scene: &SceneGraph, node_id: u64, _opacity: f32) -> NativeEffectFeatures {
    NativeEffectFeatures {
        has_gradient: has_prop(scene, node_id, prop_hash("gradient")),
        has_shadow: has_prop(scene, node_id, prop_hash("shadow")),
        has_glow: has_prop(scene, node_id, prop_hash("glow")),
        has_filter: has_prop(scene, node_id, prop_hash("filter")),
        has_backdrop: has_prop(scene, node_id, prop_hash("backdropBlur"))
            || has_prop(scene, node_id, prop_hash("backdropBrightness"))
            || has_prop(scene, node_id, prop_hash("backdropContrast"))
            || has_prop(scene, node_id, prop_hash("backdropSaturate"))
            || has_prop(scene, node_id, prop_hash("backdropGrayscale"))
            || has_prop(scene, node_id, prop_hash("backdropInvert"))
            || has_prop(scene, node_id, prop_hash("backdropSepia"))
            || has_prop(scene, node_id, prop_hash("backdropHueRotate")),
        has_transform: has_prop(scene, node_id, prop_hash("transform")),
        has_opacity: has_prop(scene, node_id, PROP_OPACITY),
        has_corner_radii: has_prop(scene, node_id, prop_hash("cornerRadii")),
    }
}

fn effect_key(features: &NativeEffectFeatures) -> String {
    let mut parts = Vec::new();
    if features.has_opacity {
        parts.push("opacity");
    }
    if features.has_transform {
        parts.push("transform");
    }
    if features.has_gradient {
        parts.push("gradient");
    }
    if features.has_shadow {
        parts.push("shadow");
    }
    if features.has_glow {
        parts.push("glow");
    }
    if features.has_filter {
        parts.push("filter");
    }
    if features.has_backdrop {
        parts.push("backdrop");
    }
    if features.has_corner_radii {
        parts.push("cornerRadii");
    }
    parts.join("+")
}

fn material_key(kind: &NativeRenderOpKind, color: u32, effect_key: &str) -> String {
    let kind_key = kind_name(kind);
    if effect_key.is_empty() {
        format!("pipeline:{}:{}", kind_key, color)
    } else {
        format!("pipeline:{}:{}:{}", kind_key, color, effect_key)
    }
}

#[derive(Debug, Clone, Default)]
struct NativeEffectPayloads {
    gradient_json: String,
    shadow_json: String,
    glow_json: String,
    filter_json: String,
    transform_json: String,
    corner_radii_json: String,
    backdrop_blur: Option<f32>,
    backdrop_brightness: Option<f32>,
    backdrop_contrast: Option<f32>,
    backdrop_saturate: Option<f32>,
    backdrop_grayscale: Option<f32>,
    backdrop_invert: Option<f32>,
    backdrop_sepia: Option<f32>,
    backdrop_hue_rotate: Option<f32>,
}

fn effect_payloads(scene: &SceneGraph, node_id: u64) -> NativeEffectPayloads {
    NativeEffectPayloads {
        gradient_json: string_prop(scene, node_id, prop_hash("gradient"))
            .unwrap_or_default()
            .to_string(),
        shadow_json: string_prop(scene, node_id, prop_hash("shadow"))
            .unwrap_or_default()
            .to_string(),
        glow_json: string_prop(scene, node_id, prop_hash("glow"))
            .unwrap_or_default()
            .to_string(),
        filter_json: string_prop(scene, node_id, prop_hash("filter"))
            .unwrap_or_default()
            .to_string(),
        transform_json: string_prop(scene, node_id, prop_hash("transform"))
            .unwrap_or_default()
            .to_string(),
        corner_radii_json: string_prop(scene, node_id, prop_hash("cornerRadii"))
            .unwrap_or_default()
            .to_string(),
        backdrop_blur: numeric_prop(scene, node_id, prop_hash("backdropBlur")),
        backdrop_brightness: numeric_prop(scene, node_id, prop_hash("backdropBrightness")),
        backdrop_contrast: numeric_prop(scene, node_id, prop_hash("backdropContrast")),
        backdrop_saturate: numeric_prop(scene, node_id, prop_hash("backdropSaturate")),
        backdrop_grayscale: numeric_prop(scene, node_id, prop_hash("backdropGrayscale")),
        backdrop_invert: numeric_prop(scene, node_id, prop_hash("backdropInvert")),
        backdrop_sepia: numeric_prop(scene, node_id, prop_hash("backdropSepia")),
        backdrop_hue_rotate: numeric_prop(scene, node_id, prop_hash("backdropHueRotate")),
    }
}

fn json_option_f32(value: Option<f32>) -> String {
    match value {
        Some(v) => v.to_string(),
        None => "null".to_string(),
    }
}

fn lower_op_to_paint_command(
    op: &NativeRenderOp,
    options: ScenePaintOptions,
    out: &mut Vec<(u16, Vec<u8>)>,
) -> Result<(), &'static str> {
    let Some(clip) = clip_op_to_target(op, options) else {
        return Ok(());
    };
    match op.kind {
        NativeRenderOpKind::Rect => {
            out.push((1, shape_rect_payload(op, &clip, op.color, 0, 0.0)));
            Ok(())
        }
        NativeRenderOpKind::Border => {
            let stroke = apply_opacity_to_color(op.color, op.opacity);
            if let Some(radii) = parse_corner_radii(&op.corner_radii_json) {
                out.push((
                    2,
                    shape_rect_corners_payload(op, &clip, 0, stroke, op.border_width, radii),
                ));
            } else {
                out.push((1, shape_rect_payload(op, &clip, 0, stroke, op.border_width)));
            }
            Ok(())
        }
        NativeRenderOpKind::Effect => {
            if op.has_filter || op.has_backdrop || op.has_transform {
                return Err("unsupported scene paint effect");
            }
            let fill = apply_opacity_to_color(op.color, op.opacity);
            let corner_radii = parse_corner_radii(&op.corner_radii_json);
            let radius = clamp_radius(op.corner_radius, clip.box_w, clip.box_h);
            if op.has_shadow {
                for shadow in parse_shadows(&op.shadow_json)? {
                    let shadow = shadow.with_opacity(op.opacity);
                    let shadow_clip = shadow_clip_for_effect(op, options, shadow)?;
                    out.push((
                        20,
                        shadow_payload(&shadow_clip, &clip, shadow, corner_radii, radius),
                    ));
                }
            }
            if op.has_gradient {
                if corner_radii.is_some() {
                    return Err("unsupported scene paint rounded gradient");
                }
                if fill_has_visible_alpha(fill) {
                    out.push((1, shape_rect_payload(op, &clip, fill, 0, 0.0)));
                }
                let gradient = parse_gradient(&op.gradient_json)?.with_opacity(op.opacity);
                out.push(gradient_payload(&clip, radius, gradient)?);
            } else if let Some(radii) = corner_radii {
                out.push((
                    2,
                    shape_rect_corners_payload(op, &clip, fill, 0, 0.0, radii),
                ));
            } else {
                out.push((1, shape_rect_payload(op, &clip, fill, 0, 0.0)));
            }
            if op.has_glow {
                let glow = parse_glow(&op.glow_json)?.with_opacity(op.opacity);
                let glow_clip = expand_clip_for_effect(op, options, glow.radius)?;
                out.push((6, glow_payload(&glow_clip, glow)));
            }
            Ok(())
        }
        NativeRenderOpKind::Text | NativeRenderOpKind::Image | NativeRenderOpKind::Canvas => {
            Err("unsupported scene paint op")
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct PaintClip {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    box_w: f32,
    box_h: f32,
}

fn clip_op_to_target(op: &NativeRenderOp, options: ScenePaintOptions) -> Option<PaintClip> {
    let x = op.x.round() - options.offset_x;
    let y = op.y.round() - options.offset_y;
    let w = op.width.round().max(0.0);
    let h = op.height.round().max(0.0);
    clip_rect_to_target(x + options.offset_x, y + options.offset_y, w, h, options)
}

fn clip_rect_to_target(
    absolute_x: f32,
    absolute_y: f32,
    width: f32,
    height: f32,
    options: ScenePaintOptions,
) -> Option<PaintClip> {
    let x = absolute_x - options.offset_x;
    let y = absolute_y - options.offset_y;
    let w = width.max(0.0);
    let h = height.max(0.0);
    let left = x.max(0.0);
    let top = y.max(0.0);
    let right = (x + w).min(options.target_width as f32);
    let bottom = (y + h).min(options.target_height as f32);
    if right <= left || bottom <= top {
        return None;
    }
    let box_w = right - left;
    let box_h = bottom - top;
    Some(PaintClip {
        x: (left / options.target_width as f32) * 2.0 - 1.0,
        y: 1.0 - (top / options.target_height as f32) * 2.0,
        w: (box_w / options.target_width as f32) * 2.0,
        h: -((box_h / options.target_height as f32) * 2.0),
        box_w,
        box_h,
    })
}

fn shape_rect_payload(
    op: &NativeRenderOp,
    clip: &PaintClip,
    fill: u32,
    stroke: u32,
    stroke_width: f32,
) -> Vec<u8> {
    let fill_rgba = color_to_unit_rgba(fill);
    let stroke_rgba = color_to_unit_rgba(stroke);
    let instance = BridgeShapeRectInstance {
        x: clip.x,
        y: clip.y,
        w: clip.w,
        h: clip.h,
        fill_r: fill_rgba[0],
        fill_g: fill_rgba[1],
        fill_b: fill_rgba[2],
        fill_a: fill_rgba[3],
        stroke_r: stroke_rgba[0],
        stroke_g: stroke_rgba[1],
        stroke_b: stroke_rgba[2],
        stroke_a: stroke_rgba[3],
        radius: clamp_radius(op.corner_radius, clip.box_w, clip.box_h),
        stroke_width,
        has_fill: has_alpha(fill),
        has_stroke: if stroke_width > 0.0 {
            has_alpha(stroke)
        } else {
            0.0
        },
        size_x: clip.box_w,
        size_y: clip.box_h,
        _pad0: 0.0,
        _pad1: 0.0,
    };
    bytemuck::bytes_of(&instance).to_vec()
}

fn shape_rect_corners_payload(
    _op: &NativeRenderOp,
    clip: &PaintClip,
    fill: u32,
    stroke: u32,
    stroke_width: f32,
    radii: CornerRadii,
) -> Vec<u8> {
    let fill_rgba = color_to_unit_rgba(fill);
    let stroke_rgba = color_to_unit_rgba(stroke);
    let instance = BridgeShapeRectCornersInstance {
        x: clip.x,
        y: clip.y,
        w: clip.w,
        h: clip.h,
        fill_r: fill_rgba[0],
        fill_g: fill_rgba[1],
        fill_b: fill_rgba[2],
        fill_a: fill_rgba[3],
        stroke_r: stroke_rgba[0],
        stroke_g: stroke_rgba[1],
        stroke_b: stroke_rgba[2],
        stroke_a: stroke_rgba[3],
        radius_tl: clamp_radius(radii.tl, clip.box_w, clip.box_h),
        radius_tr: clamp_radius(radii.tr, clip.box_w, clip.box_h),
        radius_br: clamp_radius(radii.br, clip.box_w, clip.box_h),
        radius_bl: clamp_radius(radii.bl, clip.box_w, clip.box_h),
        stroke_width,
        has_fill: has_alpha(fill),
        has_stroke: if stroke_width > 0.0 {
            has_alpha(stroke)
        } else {
            0.0
        },
        size_x: clip.box_w,
        size_y: clip.box_h,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    bytemuck::bytes_of(&instance).to_vec()
}

fn gradient_payload(
    clip: &PaintClip,
    radius: f32,
    gradient: GradientSpec,
) -> Result<(u16, Vec<u8>), &'static str> {
    match gradient.kind {
        GradientKind::Linear { angle } => {
            let from = color_to_unit_rgba(gradient.from);
            let to = color_to_unit_rgba(gradient.to);
            let radians = angle.to_radians();
            let instance = BridgeLinearGradientInstance {
                x: clip.x,
                y: clip.y,
                w: clip.w,
                h: clip.h,
                box_w: clip.box_w,
                box_h: clip.box_h,
                radius,
                _pad0: 0.0,
                from_r: from[0],
                from_g: from[1],
                from_b: from[2],
                from_a: from[3],
                to_r: to[0],
                to_g: to[1],
                to_b: to[2],
                to_a: to[3],
                dir_x: radians.cos(),
                dir_y: radians.sin(),
                _pad1: 0.0,
                _pad2: 0.0,
            };
            Ok((12, bytemuck::bytes_of(&instance).to_vec()))
        }
        GradientKind::Radial => {
            let from = color_to_unit_rgba(gradient.from);
            let to = color_to_unit_rgba(gradient.to);
            let instance = BridgeRadialGradientInstance {
                x: clip.x,
                y: clip.y,
                w: clip.w,
                h: clip.h,
                box_w: clip.box_w,
                box_h: clip.box_h,
                radius: clip.box_w.max(clip.box_h) * 0.5,
                _pad0: 0.0,
                from_r: from[0],
                from_g: from[1],
                from_b: from[2],
                from_a: from[3],
                to_r: to[0],
                to_g: to[1],
                to_b: to[2],
                to_a: to[3],
                _pad1: 0.0,
                _pad2: 0.0,
                _pad3: 0.0,
                _pad4: 0.0,
            };
            Ok((13, bytemuck::bytes_of(&instance).to_vec()))
        }
    }
}

fn glow_payload(clip: &PaintClip, glow: GlowSpec) -> Vec<u8> {
    let color = color_to_unit_rgba(glow.color);
    let instance = BridgeGlowInstance {
        x: clip.x,
        y: clip.y,
        w: clip.w,
        h: clip.h,
        color_r: color[0],
        color_g: color[1],
        color_b: color[2],
        color_a: color[3],
        intensity: glow.intensity,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    bytemuck::bytes_of(&instance).to_vec()
}

fn shadow_payload(
    shadow_clip: &PaintClip,
    source_clip: &PaintClip,
    shadow: ShadowSpec,
    corner_radii: Option<CornerRadii>,
    radius: f32,
) -> Vec<u8> {
    let color = color_to_unit_rgba(shadow.color);
    let radii = corner_radii.unwrap_or(CornerRadii {
        tl: radius,
        tr: radius,
        br: radius,
        bl: radius,
    });
    let instance = BridgeShadowInstance {
        x: shadow_clip.x,
        y: shadow_clip.y,
        w: shadow_clip.w,
        h: shadow_clip.h,
        color_r: color[0],
        color_g: color[1],
        color_b: color[2],
        color_a: color[3],
        radius_tl: radii.tl,
        radius_tr: radii.tr,
        radius_br: radii.br,
        radius_bl: radii.bl,
        box_w: source_clip.box_w,
        box_h: source_clip.box_h,
        offset_x: shadow.x,
        offset_y: shadow.y,
        blur: shadow.blur.max(0.0),
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    bytemuck::bytes_of(&instance).to_vec()
}

fn lower_text_to_glyphs(
    op: &NativeRenderOp,
    options: ScenePaintOptions,
    atlases: &AtlasRegistry,
    out: &mut Vec<MsdfGlyphInstance>,
) -> Result<(), &'static str> {
    if op.text.is_empty() {
        return Ok(());
    }
    let atlas_id = if op.font_id == 0 { 1 } else { op.font_id };
    let atlas = atlases
        .get(atlas_id)
        .ok_or("scene paint text atlas missing")?;
    let color = color_to_unit_rgba(apply_opacity_to_color(op.color, op.opacity));
    let font_size = if op.font_size > 0.0 {
        op.font_size
    } else {
        atlas.ref_size
    };
    let line_height = op
        .height
        .max(font_size * 1.2)
        .max(atlas.cell_height as f32 * font_size / atlas.ref_size);
    let mut pen_x = op.x.round() - options.offset_x;
    let mut pen_y = op.y.round() - options.offset_y;
    let base_x = pen_x;

    for ch in op.text.chars() {
        if ch == '\n' {
            pen_x = base_x;
            pen_y += line_height;
            continue;
        }
        let glyph = atlas
            .glyphs
            .get(&ch)
            .ok_or("scene paint text glyph missing")?;
        let advance = glyph.x_advance as f32 * font_size / atlas.ref_size;
        if ch.is_whitespace() {
            pen_x += advance;
            continue;
        }
        let (x, y, w, h, uv_x, uv_y, uv_w, uv_h, next_pen) = glyph_ndc(
            pen_x,
            pen_y,
            font_size,
            atlas.ref_size,
            options.target_width as f32,
            options.target_height as f32,
            atlas.width as f32,
            atlas.height as f32,
            glyph,
        );
        if glyph_visible(x, y, w, h) {
            out.push(MsdfGlyphInstance {
                x,
                y,
                w,
                h: -h.abs(),
                uv_x,
                uv_y,
                uv_w,
                uv_h,
                color_r: color[0],
                color_g: color[1],
                color_b: color[2],
                color_a: color[3],
                atlas_id,
                _pad0: 0,
                _pad1: 0,
                _pad2: 0,
            });
        }
        pen_x = next_pen;
    }
    Ok(())
}

fn lower_image_to_paint(
    op: &NativeRenderOp,
    options: ScenePaintOptions,
) -> Result<SceneImagePaint, &'static str> {
    if op.image_handle == 0 {
        return Err("scene paint image handle missing");
    }
    if op.has_transform || op.has_corner_radii {
        return Err("unsupported scene paint image effect");
    }
    let x = op.x.round() - options.offset_x;
    let y = op.y.round() - options.offset_y;
    let w = op.width.round().max(0.0);
    let h = op.height.round().max(0.0);
    if w <= 0.0 || h <= 0.0 {
        return Err("scene paint image outside target");
    }
    let p0x = (x / options.target_width as f32) * 2.0 - 1.0;
    let p0y = 1.0 - (y / options.target_height as f32) * 2.0;
    let p1x = ((x + w) / options.target_width as f32) * 2.0 - 1.0;
    let p1y = p0y;
    let p2x = p0x;
    let p2y = 1.0 - ((y + h) / options.target_height as f32) * 2.0;
    let p3x = p1x;
    let p3y = p2y;
    let instance = BridgeImageTransformInstance {
        p0x,
        p0y,
        p1x,
        p1y,
        p2x,
        p2y,
        p3x,
        p3y,
        opacity: op.opacity,
        _pad0: 0.0,
        _pad1: 0.0,
        _pad2: 0.0,
    };
    Ok(SceneImagePaint {
        image_handle: op.image_handle,
        params: bytemuck::bytes_of(&instance).to_vec(),
    })
}

fn glyph_visible(x: f32, y: f32, w: f32, h: f32) -> bool {
    x + w > -1.0 && x < 1.0 && y > -1.0 && y + h > -1.0
}

fn expand_clip_for_effect(
    op: &NativeRenderOp,
    options: ScenePaintOptions,
    margin: f32,
) -> Result<PaintClip, &'static str> {
    clip_rect_to_target(
        op.x.round() - margin,
        op.y.round() - margin,
        op.width.round().max(0.0) + margin * 2.0,
        op.height.round().max(0.0) + margin * 2.0,
        options,
    )
    .ok_or("scene paint effect outside target")
}

fn shadow_clip_for_effect(
    op: &NativeRenderOp,
    options: ScenePaintOptions,
    shadow: ShadowSpec,
) -> Result<PaintClip, &'static str> {
    let blur = shadow.blur.max(0.0).ceil();
    let pad = blur * 2.0;
    let left = op.x.round() + shadow.x.min(0.0) - pad;
    let top = op.y.round() + shadow.y.min(0.0) - pad;
    let right = op.x.round() + op.width.round().max(0.0) + shadow.x.max(0.0) + pad;
    let bottom = op.y.round() + op.height.round().max(0.0) + shadow.y.max(0.0) + pad;
    clip_rect_to_target(left, top, right - left, bottom - top, options)
        .ok_or("scene paint shadow outside target")
}

fn write_paint_graph(commands: Vec<(u16, Vec<u8>)>) -> Vec<u8> {
    let payload_bytes = commands
        .iter()
        .map(|(_, payload)| 8 + payload.len())
        .sum::<usize>();
    let mut out = Vec::with_capacity(16 + payload_bytes);
    out.extend_from_slice(&GRAPH_MAGIC.to_le_bytes());
    out.extend_from_slice(&GRAPH_VERSION.to_le_bytes());
    out.extend_from_slice(&(commands.len() as u32).to_le_bytes());
    out.extend_from_slice(&(payload_bytes as u32).to_le_bytes());
    for (kind, payload) in commands {
        out.extend_from_slice(&kind.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        out.extend_from_slice(&payload);
    }
    out
}

fn color_to_unit_rgba(color: u32) -> [f32; 4] {
    [
        ((color >> 24) & 0xff) as f32 / 255.0,
        ((color >> 16) & 0xff) as f32 / 255.0,
        ((color >> 8) & 0xff) as f32 / 255.0,
        (color & 0xff) as f32 / 255.0,
    ]
}

fn has_alpha(color: u32) -> f32 {
    if (color & 0xff) > 0 {
        1.0
    } else {
        0.0
    }
}

fn fill_has_visible_alpha(color: u32) -> bool {
    (color & 0xff) > 0
}

fn apply_opacity_to_color(color: u32, opacity: f32) -> u32 {
    let alpha = (color & 0xff) as f32;
    let next_alpha = (alpha * opacity).round().clamp(0.0, 255.0) as u32;
    (color & 0xffffff00) | next_alpha
}

fn clamp_radius(radius: f32, width: f32, height: f32) -> f32 {
    radius.max(0.0).min(width / 2.0).min(height / 2.0)
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct CornerRadii {
    tl: f32,
    tr: f32,
    br: f32,
    bl: f32,
}

fn parse_corner_radii(raw: &str) -> Option<CornerRadii> {
    if raw.is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(raw).ok()?;
    Some(CornerRadii {
        tl: value.get("tl")?.as_f64()? as f32,
        tr: value.get("tr")?.as_f64()? as f32,
        br: value.get("br")?.as_f64()? as f32,
        bl: value.get("bl")?.as_f64()? as f32,
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum GradientKind {
    Linear { angle: f32 },
    Radial,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct GradientSpec {
    kind: GradientKind,
    from: u32,
    to: u32,
}

impl GradientSpec {
    fn with_opacity(self, opacity: f32) -> Self {
        Self {
            kind: self.kind,
            from: apply_opacity_to_color(self.from, opacity),
            to: apply_opacity_to_color(self.to, opacity),
        }
    }
}

fn parse_gradient(raw: &str) -> Result<GradientSpec, &'static str> {
    let value: Value = serde_json::from_str(raw).map_err(|_| "invalid scene paint gradient")?;
    let kind = match value.get("type").and_then(Value::as_str) {
        Some("linear") => GradientKind::Linear {
            angle: value.get("angle").and_then(Value::as_f64).unwrap_or(0.0) as f32,
        },
        Some("radial") => GradientKind::Radial,
        _ => return Err("unsupported scene paint gradient"),
    };
    let from = json_u32(&value, "from").ok_or("invalid scene paint gradient")?;
    let to = json_u32(&value, "to").ok_or("invalid scene paint gradient")?;
    Ok(GradientSpec { kind, from, to })
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct GlowSpec {
    radius: f32,
    color: u32,
    intensity: f32,
}

impl GlowSpec {
    fn with_opacity(self, opacity: f32) -> Self {
        Self {
            color: apply_opacity_to_color(self.color, opacity),
            ..self
        }
    }
}

fn parse_glow(raw: &str) -> Result<GlowSpec, &'static str> {
    let value: Value = serde_json::from_str(raw).map_err(|_| "invalid scene paint glow")?;
    Ok(GlowSpec {
        radius: value
            .get("radius")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .max(0.0) as f32,
        color: json_u32(&value, "color").ok_or("invalid scene paint glow")?,
        intensity: value
            .get("intensity")
            .and_then(Value::as_f64)
            .unwrap_or(80.0) as f32,
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct ShadowSpec {
    x: f32,
    y: f32,
    blur: f32,
    color: u32,
}

impl ShadowSpec {
    fn with_opacity(self, opacity: f32) -> Self {
        Self {
            color: apply_opacity_to_color(self.color, opacity),
            ..self
        }
    }
}

fn parse_shadows(raw: &str) -> Result<Vec<ShadowSpec>, &'static str> {
    let value: Value = serde_json::from_str(raw).map_err(|_| "invalid scene paint shadow")?;
    let mut shadows = Vec::new();
    match value {
        Value::Array(entries) => {
            for entry in entries {
                shadows.push(parse_shadow_value(&entry)?);
            }
        }
        Value::Object(_) => shadows.push(parse_shadow_value(&value)?),
        _ => return Err("invalid scene paint shadow"),
    }
    Ok(shadows)
}

fn parse_shadow_value(value: &Value) -> Result<ShadowSpec, &'static str> {
    Ok(ShadowSpec {
        x: value.get("x").and_then(Value::as_f64).unwrap_or(0.0) as f32,
        y: value.get("y").and_then(Value::as_f64).unwrap_or(0.0) as f32,
        blur: value
            .get("blur")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .max(0.0) as f32,
        color: json_u32(value, "color").ok_or("invalid scene paint shadow")?,
    })
}

fn json_u32(value: &Value, key: &str) -> Option<u32> {
    let number = value.get(key)?.as_u64()?;
    if number > u32::MAX as u64 {
        return None;
    }
    Some(number as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::{NativeLayoutRect, NativeNodeKind, SceneGraph};

    fn single_u32_prop(prop_id: u16, value: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&prop_id.to_le_bytes());
        bytes.push(3);
        bytes.push(0);
        bytes.extend_from_slice(&4u32.to_le_bytes());
        bytes.extend_from_slice(&value.to_le_bytes());
        bytes
    }

    fn single_bool_prop(prop_id: u16, value: bool) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&prop_id.to_le_bytes());
        bytes.push(1);
        bytes.push(0);
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.push(if value { 1 } else { 0 });
        bytes
    }

    fn single_string_prop(prop_id: u16, value: &str) -> Vec<u8> {
        let raw = value.as_bytes();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&prop_id.to_le_bytes());
        bytes.push(5);
        bytes.push(0);
        bytes.extend_from_slice(&(raw.len() as u32).to_le_bytes());
        bytes.extend_from_slice(raw);
        bytes
    }

    #[test]
    fn scene_to_render_ops_emits_rect_border_and_text_in_tree_order() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let box_node = scene.create_node(NativeNodeKind::Box);
        let text_node = scene.create_node(NativeNodeKind::Text);
        scene.insert(root, box_node, None);
        scene.insert(box_node, text_node, None);
        scene.set_layout(
            root,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 200.0,
                height: 100.0,
            },
        );
        scene.set_layout(
            box_node,
            NativeLayoutRect {
                x: 10.0,
                y: 20.0,
                width: 50.0,
                height: 30.0,
            },
        );
        scene.set_layout(
            text_node,
            NativeLayoutRect {
                x: 12.0,
                y: 24.0,
                width: 40.0,
                height: 12.0,
            },
        );
        scene.set_props(
            box_node,
            &single_u32_prop(PROP_BACKGROUND_COLOR, 0xff00ffff),
        );
        scene.set_props(box_node, &single_u32_prop(PROP_BORDER_COLOR, 0x00ff00ff));
        scene.set_props(box_node, &single_u32_prop(PROP_BORDER_WIDTH, 2));
        scene.set_props(text_node, &single_u32_prop(PROP_COLOR, 0xffffffff));
        scene.set_props(text_node, &single_u32_prop(PROP_FONT_SIZE, 16));
        scene.set_text(text_node, b"hello");

        let ops = scene_to_render_ops(&scene);
        assert_eq!(ops.len(), 3);
        assert_eq!(ops[0].kind, NativeRenderOpKind::Rect);
        assert_eq!(ops[0].node_id, box_node);
        assert_eq!(ops[1].kind, NativeRenderOpKind::Border);
        assert_eq!(ops[2].kind, NativeRenderOpKind::Text);
        assert_eq!(ops[2].text, "hello");
        assert!(!ops[0].material_key.is_empty());
        assert!(!ops[0].has_opacity);
    }

    #[test]
    fn scene_to_render_ops_collects_jsx_text_container_content() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let text_container = scene.create_node(NativeNodeKind::Text);
        let text_leaf = scene.create_node(NativeNodeKind::Text);
        scene.insert(root, text_container, None);
        scene.insert(text_container, text_leaf, None);
        scene.set_layout(
            text_container,
            NativeLayoutRect {
                x: 8.0,
                y: 9.0,
                width: 100.0,
                height: 17.0,
            },
        );
        scene.set_layout(
            text_leaf,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            },
        );
        scene.set_props(text_container, &single_u32_prop(PROP_COLOR, 0xffffffff));
        scene.set_props(text_container, &single_u32_prop(PROP_FONT_SIZE, 16));
        scene.set_text(text_leaf, b"Hello from TGE");

        let ops = scene_to_render_ops(&scene);
        assert_eq!(ops.len(), 1);
        assert_eq!(ops[0].kind, NativeRenderOpKind::Text);
        assert_eq!(ops[0].node_id, text_container);
        assert_eq!(ops[0].text, "Hello from TGE");
        assert_eq!(ops[0].font_size, 16.0);
        assert_eq!(ops[0].color, 0xffffffff);
    }

    #[test]
    fn scene_to_render_ops_emits_effect_image_canvas_and_batches() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let effect_box = scene.create_node(NativeNodeKind::Box);
        let image = scene.create_node(NativeNodeKind::Image);
        let canvas = scene.create_node(NativeNodeKind::Canvas);
        scene.insert(root, effect_box, None);
        scene.insert(root, image, None);
        scene.insert(root, canvas, None);
        scene.set_layout(
            effect_box,
            crate::scene::NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        );
        scene.set_layout(
            image,
            crate::scene::NativeLayoutRect {
                x: 30.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        );
        scene.set_layout(
            canvas,
            crate::scene::NativeLayoutRect {
                x: 60.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        );
        scene.set_props(
            effect_box,
            &single_u32_prop(PROP_BACKGROUND_COLOR, 0x11223344),
        );
        scene.set_props(effect_box, &{
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&prop_hash("gradient").to_le_bytes());
            bytes.push(5);
            bytes.push(0);
            bytes.extend_from_slice(&2u32.to_le_bytes());
            bytes.extend_from_slice(b"{}");
            bytes
        });
        scene.set_props(image, &{
            let src = b"demo.png";
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&prop_hash("src").to_le_bytes());
            bytes.push(5);
            bytes.push(0);
            bytes.extend_from_slice(&(src.len() as u32).to_le_bytes());
            bytes.extend_from_slice(src);
            bytes
        });
        scene.set_props(image, &single_string_prop(prop_hash("objectFit"), "cover"));
        scene.set_props(
            canvas,
            &single_string_prop(prop_hash("viewport"), r#"{"x":3,"y":4,"zoom":2}"#),
        );

        let ops = scene_to_render_ops(&scene);
        assert_eq!(ops[0].kind, NativeRenderOpKind::Effect);
        assert_eq!(ops[1].kind, NativeRenderOpKind::Image);
        assert_eq!(ops[1].object_fit, "cover");
        assert_eq!(ops[2].kind, NativeRenderOpKind::Canvas);
        assert_eq!(ops[2].canvas_viewport_json, r#"{"x":3,"y":4,"zoom":2}"#);
        assert!(ops[0].has_gradient);
        let batches = batch_render_ops(&ops);
        assert_eq!(batches.len(), 3);
    }

    #[test]
    fn scene_to_render_ops_resolves_interactive_styles_in_order() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let node = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, node, None);
        scene.set_layout(
            node,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 40.0,
                height: 20.0,
            },
        );
        scene.set_props(node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0x111111ff));
        scene.set_props(node, &single_string_prop(prop_hash("hoverStyle"), r#"{"backgroundColor":572662527,"borderColor":858993663,"borderWidth":2,"cornerRadius":5,"cornerRadii":{"tl":20,"tr":8,"br":20,"bl":8},"glow":{"radius":8,"color":1431655935,"intensity":70}}"#));
        scene.set_props(
            node,
            &single_string_prop(
                prop_hash("focusStyle"),
                r#"{"backgroundColor":1145324799,"borderWidth":4}"#,
            ),
        );
        scene.set_props(
            node,
            &single_string_prop(
                prop_hash("activeStyle"),
                r#"{"backgroundColor":1431655935,"borderWidth":6}"#,
            ),
        );
        scene.set_props(node, &single_bool_prop(prop_hash("__hovered"), true));
        scene.set_props(node, &single_bool_prop(prop_hash("__focused"), true));
        scene.set_props(node, &single_bool_prop(prop_hash("__active"), true));

        let ops = scene_to_render_ops(&scene);

        assert_eq!(ops.len(), 2);
        assert_eq!(ops[0].kind, NativeRenderOpKind::Effect);
        assert_eq!(ops[0].color, 0x555555ff);
        assert_eq!(ops[0].corner_radius, 5.0);
        assert!(ops[0].has_glow);
        assert!(ops[0].has_corner_radii);
        assert_eq!(
            ops[0].glow_json,
            r#"{"color":1431655935,"intensity":70,"radius":8}"#
        );
        let corner_radii: Value = serde_json::from_str(&ops[0].corner_radii_json).unwrap();
        assert_eq!(corner_radii["tl"], 20);
        assert_eq!(corner_radii["tr"], 8);
        assert_eq!(corner_radii["br"], 20);
        assert_eq!(corner_radii["bl"], 8);
        assert_eq!(ops[1].kind, NativeRenderOpKind::Border);
        assert_eq!(ops[1].color, 0x333333ff);
        assert_eq!(ops[1].border_width, 6.0);
        assert!(ops[1].has_corner_radii);
    }

    #[test]
    fn scene_to_paint_graph_lowers_selected_rect_and_border() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let node = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, node, None);
        scene.set_layout(
            node,
            NativeLayoutRect {
                x: 10.0,
                y: 20.0,
                width: 50.0,
                height: 30.0,
            },
        );
        scene.set_props(node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0xff00ffff));
        scene.set_props(node, &single_u32_prop(PROP_BORDER_COLOR, 0x00ff00ff));
        scene.set_props(node, &single_u32_prop(PROP_BORDER_WIDTH, 2));

        let graph = scene_to_paint_graph(
            &scene,
            &[
                ScenePaintRef {
                    node_id: node,
                    kind: NativeRenderOpKind::Rect,
                },
                ScenePaintRef {
                    node_id: node,
                    kind: NativeRenderOpKind::Border,
                },
            ],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
        )
        .expect("rect and border should lower");

        let header = crate::ffi::buffer::parse_header(&graph).expect("paint graph header");
        assert_eq!(header.cmd_count, 2);
        assert_eq!(u16::from_le_bytes(graph[16..18].try_into().unwrap()), 1);
        assert_eq!(u16::from_le_bytes(graph[104..106].try_into().unwrap()), 1);
    }

    #[test]
    fn scene_to_paint_graph_lowers_gradient_shadow_and_glow_effect() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let node = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, node, None);
        scene.set_layout(
            node,
            NativeLayoutRect {
                x: 10.0,
                y: 20.0,
                width: 50.0,
                height: 30.0,
            },
        );
        scene.set_props(node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0x112233ff));
        scene.set_props(
            node,
            &single_string_prop(
                prop_hash("gradient"),
                r#"{"type":"linear","from":4278190335,"to":4294967295,"angle":90}"#,
            ),
        );
        scene.set_props(
            node,
            &single_string_prop(
                prop_hash("shadow"),
                r#"{"x":0,"y":4,"blur":8,"color":1431655935}"#,
            ),
        );
        scene.set_props(
            node,
            &single_string_prop(
                prop_hash("glow"),
                r#"{"radius":10,"color":1456785663,"intensity":50}"#,
            ),
        );

        let graph = scene_to_paint_graph(
            &scene,
            &[ScenePaintRef {
                node_id: node,
                kind: NativeRenderOpKind::Effect,
            }],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
        )
        .expect("supported effect should lower");

        let header = crate::ffi::buffer::parse_header(&graph).expect("paint graph header");
        assert_eq!(header.cmd_count, 4);
        assert_eq!(paint_graph_kinds(&graph), vec![20, 1, 12, 6]);
    }

    #[test]
    fn scene_to_paint_graph_rejects_rounded_gradient_until_masking_is_native() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let node = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, node, None);
        scene.set_layout(
            node,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        );
        scene.set_props(node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0x112233ff));
        scene.set_props(
            node,
            &single_string_prop(
                prop_hash("gradient"),
                r#"{"type":"radial","from":4278190335,"to":4294967295}"#,
            ),
        );
        scene.set_props(
            node,
            &single_string_prop(prop_hash("cornerRadii"), r#"{"tl":4,"tr":4,"br":4,"bl":4}"#),
        );

        let graph = scene_to_paint_graph(
            &scene,
            &[ScenePaintRef {
                node_id: node,
                kind: NativeRenderOpKind::Effect,
            }],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
        );

        assert_eq!(
            graph.unwrap_err(),
            "unsupported scene paint rounded gradient"
        );
    }

    #[test]
    fn scene_to_paint_graph_rejects_unsupported_selected_text() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let text = scene.create_node(NativeNodeKind::Text);
        scene.insert(root, text, None);
        scene.set_layout(
            text,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 20.0,
            },
        );
        scene.set_props(text, &single_u32_prop(PROP_COLOR, 0xffffffff));
        scene.set_text(text, b"hello");

        let graph = scene_to_paint_graph(
            &scene,
            &[ScenePaintRef {
                node_id: text,
                kind: NativeRenderOpKind::Text,
            }],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
        );

        assert_eq!(graph.unwrap_err(), "unsupported scene paint op");
    }

    #[test]
    fn scene_to_text_glyphs_requires_loaded_atlas() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let text = scene.create_node(NativeNodeKind::Text);
        scene.insert(root, text, None);
        scene.set_layout(
            text,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 20.0,
            },
        );
        scene.set_props(text, &single_u32_prop(PROP_COLOR, 0xffffffff));
        scene.set_text(text, b"hello");

        let glyphs = scene_to_text_glyphs(
            &scene,
            &[ScenePaintRef {
                node_id: text,
                kind: NativeRenderOpKind::Text,
            }],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
            &AtlasRegistry::new(),
        );

        assert_eq!(glyphs.unwrap_err(), "scene paint text atlas missing");
    }

    #[test]
    fn scene_to_image_paints_lowers_native_image_handle() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let image = scene.create_node(NativeNodeKind::Image);
        scene.insert(root, image, None);
        scene.set_layout(
            image,
            NativeLayoutRect {
                x: 10.0,
                y: 20.0,
                width: 50.0,
                height: 30.0,
            },
        );
        scene.set_props(image, &single_string_prop(prop_hash("__imageHandle"), "77"));

        let images = scene_to_image_paints(
            &scene,
            &[ScenePaintRef {
                node_id: image,
                kind: NativeRenderOpKind::Image,
            }],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
        )
        .expect("image should lower");

        assert_eq!(images.len(), 1);
        assert_eq!(images[0].image_handle, 77);
        assert_eq!(
            images[0].params.len(),
            std::mem::size_of::<BridgeImageTransformInstance>()
        );
        let instance =
            bytemuck::pod_read_unaligned::<BridgeImageTransformInstance>(&images[0].params);
        assert!((instance.p0x - -0.8).abs() < 0.0001);
        assert!((instance.p0y - 0.5).abs() < 0.0001);
        assert!((instance.p3x - 0.2).abs() < 0.0001);
        assert!((instance.p3y - -0.25).abs() < 0.0001);
    }

    #[test]
    fn scene_to_image_paints_rejects_missing_image_handle() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let image = scene.create_node(NativeNodeKind::Image);
        scene.insert(root, image, None);
        scene.set_layout(
            image,
            NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        );

        let images = scene_to_image_paints(
            &scene,
            &[ScenePaintRef {
                node_id: image,
                kind: NativeRenderOpKind::Image,
            }],
            ScenePaintOptions {
                target_width: 100,
                target_height: 80,
                offset_x: 0.0,
                offset_y: 0.0,
            },
        );

        assert_eq!(images.unwrap_err(), "scene paint image handle missing");
    }

    #[test]
    fn parse_scene_paint_config_decodes_refs() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&100u32.to_le_bytes());
        bytes.extend_from_slice(&80u32.to_le_bytes());
        bytes.extend_from_slice(&10f32.to_le_bytes());
        bytes.extend_from_slice(&20f32.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&42u64.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());

        let (options, refs) = parse_scene_paint_config(&bytes).expect("config should parse");

        assert_eq!(options.target_width, 100);
        assert_eq!(options.target_height, 80);
        assert_eq!(options.offset_x, 10.0);
        assert_eq!(options.offset_y, 20.0);
        assert_eq!(
            refs,
            vec![ScenePaintRef {
                node_id: 42,
                kind: NativeRenderOpKind::Border
            }]
        );
    }

    fn paint_graph_kinds(graph: &[u8]) -> Vec<u16> {
        let header = crate::ffi::buffer::parse_header(graph).unwrap();
        let mut offset = 16usize;
        let mut kinds = Vec::new();
        for _ in 0..header.cmd_count {
            let kind = u16::from_le_bytes(graph[offset..offset + 2].try_into().unwrap());
            let payload =
                u32::from_le_bytes(graph[offset + 4..offset + 8].try_into().unwrap()) as usize;
            kinds.push(kind);
            offset += 8 + payload;
        }
        kinds
    }

    #[test]
    fn effect_features_detect_shadow_glow_filter_backdrop_transform_and_opacity() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let node = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, node, None);
        scene.set_layout(
            node,
            crate::scene::NativeLayoutRect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        );
        scene.set_props(node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0xff));
        scene.set_props(node, &single_u32_prop(PROP_OPACITY, 0));
        for prop in ["shadow", "glow", "filter", "transform", "backdropBlur"] {
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&prop_hash(prop).to_le_bytes());
            bytes.push(5);
            bytes.push(0);
            bytes.extend_from_slice(&2u32.to_le_bytes());
            bytes.extend_from_slice(b"{}");
            scene.set_props(node, &bytes);
        }
        let ops = scene_to_render_ops(&scene);
        assert_eq!(ops.len(), 1);
        let op = &ops[0];
        assert!(op.has_shadow);
        assert!(op.has_glow);
        assert!(op.has_filter);
        assert!(op.has_transform);
        assert!(op.has_backdrop);
        assert!(op.has_opacity);
    }
}
