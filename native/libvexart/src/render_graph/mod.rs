use crate::scene::{NativeNodeKind, PropValue, SceneGraph};
use serde_json::Value;
use std::collections::BTreeMap;

const PROP_BACKGROUND_COLOR: u16 = 3;
const PROP_BORDER_COLOR: u16 = 4;
const PROP_BORDER_WIDTH: u16 = 5;
const PROP_CORNER_RADIUS: u16 = 6;
const PROP_COLOR: u16 = 7;
const PROP_FONT_SIZE: u16 = 8;
const PROP_OPACITY: u16 = 21;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NativeRenderOpKind {
    Rect,
    Border,
    Text,
    Effect,
    Image,
    Canvas,
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
    pub material_key: String,
    pub effect_key: String,
    pub image_source: String,
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
        grouped.entry(op.material_key.clone()).or_default().push(op.node_id);
    }
    grouped
        .into_iter()
        .map(|(key, op_node_ids)| NativeRenderBatch { key, op_node_ids })
        .collect()
}

pub fn snapshot_json(scene: &SceneGraph) -> String {
    let ops = scene_to_render_ops(scene);
    let body = ops
        .iter()
        .map(|op| {
            format!(
                "{{\"kind\":\"{}\",\"nodeId\":{},\"x\":{},\"y\":{},\"width\":{},\"height\":{},\"color\":{},\"cornerRadius\":{},\"borderWidth\":{},\"opacity\":{},\"text\":{:?},\"fontSize\":{},\"fontId\":{},\"objectFit\":{:?},\"canvasViewportJson\":{:?},\"materialKey\":{:?},\"effectKey\":{:?},\"imageSource\":{:?},\"hasGradient\":{},\"hasShadow\":{},\"hasGlow\":{},\"hasFilter\":{},\"hasBackdrop\":{},\"hasTransform\":{},\"hasOpacity\":{},\"hasCornerRadii\":{},\"gradientJson\":{:?},\"shadowJson\":{:?},\"glowJson\":{:?},\"filterJson\":{:?},\"transformJson\":{:?},\"cornerRadiiJson\":{:?},\"backdropBlur\":{},\"backdropBrightness\":{},\"backdropContrast\":{},\"backdropSaturate\":{},\"backdropGrayscale\":{},\"backdropInvert\":{},\"backdropSepia\":{},\"backdropHueRotate\":{}}}",
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
                op.material_key,
                op.effect_key,
                op.image_source,
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
                        corner_radius: numeric_prop(scene, node_id, PROP_CORNER_RADIUS).unwrap_or(0.0),
                        border_width: 0.0,
                        opacity,
                        text: String::new(),
                        font_size: 0.0,
                        font_id: 0,
                        object_fit: String::new(),
                        canvas_viewport_json: String::new(),
                        material_key: material_key(&rect_kind, color, &effect_key_value),
                        effect_key: effect_key_value,
                        image_source: String::new(),
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
                        corner_radius: numeric_prop(scene, node_id, PROP_CORNER_RADIUS).unwrap_or(0.0),
                        border_width,
                        opacity,
                        text: String::new(),
                        font_size: 0.0,
                        font_id: 0,
                        object_fit: String::new(),
                        canvas_viewport_json: String::new(),
                        material_key: material_key(&NativeRenderOpKind::Border, color_prop(scene, node_id, PROP_BORDER_COLOR).unwrap_or(0), ""),
                        effect_key: String::new(),
                        image_source: String::new(),
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
                let source = string_prop(scene, node_id, prop_hash("src")).unwrap_or_default().to_string();
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
                    object_fit: string_prop(scene, node_id, prop_hash("objectFit")).unwrap_or_else(|| "contain".to_string()),
                    canvas_viewport_json: String::new(),
                    material_key: material_key(&NativeRenderOpKind::Image, 0, ""),
                    effect_key: String::new(),
                    image_source: source,
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
                    canvas_viewport_json: string_prop(scene, node_id, prop_hash("viewport")).unwrap_or_default(),
                    material_key: material_key(&NativeRenderOpKind::Canvas, 0, &effect_key_value),
                    effect_key: effect_key_value,
                    image_source: String::new(),
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
                    font_id: numeric_prop(scene, node_id, prop_hash("fontId")).unwrap_or(0.0).max(0.0) as u32,
                    object_fit: String::new(),
                    canvas_viewport_json: String::new(),
                    material_key: material_key(&NativeRenderOpKind::Text, color_prop(scene, node_id, PROP_COLOR).unwrap_or(0xe0e0e0ff), ""),
                    effect_key: String::new(),
                    image_source: String::new(),
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
    scene.nodes.get(&node_id).and_then(|node| node.props.get(&prop_id))
}

fn prop_truthy(scene: &SceneGraph, node_id: u64, prop_id: u16) -> bool {
    matches!(direct_prop(scene, node_id, prop_id), Some(PropValue::Bool(true)) | Some(PropValue::Capability(true)))
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

fn style_prop_value(scene: &SceneGraph, node_id: u64, style_prop_id: u16, prop_id: u16) -> Option<PropValue> {
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
        if let Some(override_value) = style_prop_value(scene, node_id, prop_hash("hoverStyle"), prop_id) {
            value = Some(override_value);
        }
    }
    if prop_truthy(scene, node_id, prop_hash("__focused")) {
        if let Some(override_value) = style_prop_value(scene, node_id, prop_hash("focusStyle"), prop_id) {
            value = Some(override_value);
        }
    }
    if scene.is_active(node_id) || prop_truthy(scene, node_id, prop_hash("__active")) {
        if let Some(override_value) = style_prop_value(scene, node_id, prop_hash("activeStyle"), prop_id) {
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
    if features.has_opacity { parts.push("opacity"); }
    if features.has_transform { parts.push("transform"); }
    if features.has_gradient { parts.push("gradient"); }
    if features.has_shadow { parts.push("shadow"); }
    if features.has_glow { parts.push("glow"); }
    if features.has_filter { parts.push("filter"); }
    if features.has_backdrop { parts.push("backdrop"); }
    if features.has_corner_radii { parts.push("cornerRadii"); }
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
        gradient_json: string_prop(scene, node_id, prop_hash("gradient")).unwrap_or_default().to_string(),
        shadow_json: string_prop(scene, node_id, prop_hash("shadow")).unwrap_or_default().to_string(),
        glow_json: string_prop(scene, node_id, prop_hash("glow")).unwrap_or_default().to_string(),
        filter_json: string_prop(scene, node_id, prop_hash("filter")).unwrap_or_default().to_string(),
        transform_json: string_prop(scene, node_id, prop_hash("transform")).unwrap_or_default().to_string(),
        corner_radii_json: string_prop(scene, node_id, prop_hash("cornerRadii")).unwrap_or_default().to_string(),
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
        scene.set_layout(root, NativeLayoutRect { x: 0.0, y: 0.0, width: 200.0, height: 100.0 });
        scene.set_layout(box_node, NativeLayoutRect { x: 10.0, y: 20.0, width: 50.0, height: 30.0 });
        scene.set_layout(text_node, NativeLayoutRect { x: 12.0, y: 24.0, width: 40.0, height: 12.0 });
        scene.set_props(box_node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0xff00ffff));
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
        scene.set_layout(text_container, NativeLayoutRect { x: 8.0, y: 9.0, width: 100.0, height: 17.0 });
        scene.set_layout(text_leaf, NativeLayoutRect { x: 0.0, y: 0.0, width: 0.0, height: 0.0 });
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
        scene.set_layout(effect_box, crate::scene::NativeLayoutRect { x: 0.0, y: 0.0, width: 20.0, height: 20.0 });
        scene.set_layout(image, crate::scene::NativeLayoutRect { x: 30.0, y: 0.0, width: 20.0, height: 20.0 });
        scene.set_layout(canvas, crate::scene::NativeLayoutRect { x: 60.0, y: 0.0, width: 20.0, height: 20.0 });
        scene.set_props(effect_box, &single_u32_prop(PROP_BACKGROUND_COLOR, 0x11223344));
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
        scene.set_props(canvas, &single_string_prop(prop_hash("viewport"), r#"{"x":3,"y":4,"zoom":2}"#));

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
        scene.set_layout(node, NativeLayoutRect { x: 0.0, y: 0.0, width: 40.0, height: 20.0 });
        scene.set_props(node, &single_u32_prop(PROP_BACKGROUND_COLOR, 0x111111ff));
        scene.set_props(node, &single_string_prop(prop_hash("hoverStyle"), r#"{"backgroundColor":572662527,"borderColor":858993663,"borderWidth":2,"cornerRadius":5,"cornerRadii":{"tl":20,"tr":8,"br":20,"bl":8},"glow":{"radius":8,"color":1431655935,"intensity":70}}"#));
        scene.set_props(node, &single_string_prop(prop_hash("focusStyle"), r#"{"backgroundColor":1145324799,"borderWidth":4}"#));
        scene.set_props(node, &single_string_prop(prop_hash("activeStyle"), r#"{"backgroundColor":1431655935,"borderWidth":6}"#));
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
        assert_eq!(ops[0].glow_json, r#"{"color":1431655935,"intensity":70,"radius":8}"#);
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
    fn effect_features_detect_shadow_glow_filter_backdrop_transform_and_opacity() {
        let mut scene = SceneGraph::new();
        let root = scene.create_node(NativeNodeKind::Root);
        let node = scene.create_node(NativeNodeKind::Box);
        scene.insert(root, node, None);
        scene.set_layout(node, crate::scene::NativeLayoutRect { x: 0.0, y: 0.0, width: 20.0, height: 20.0 });
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
