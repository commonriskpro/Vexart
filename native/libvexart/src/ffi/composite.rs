// native/libvexart/src/ffi/composite.rs
// Composite target management, layer operations, image filtering, and readback FFI exports.

use crate::composite;
use crate::ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, ERR_INVALID_HANDLE};
use crate::ffi_guard;
use crate::paint;
use crate::types::FrameStats;

/// Create an offscreen RGBA8 render target. Returns handle in `*out_target`.
/// (REQ-2B-001)
///
/// # Safety
/// `out_target` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_target_create(
    _ctx: u64,
    width: u32,
    height: u32,
    out_target: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_target.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_create(pctx, width, height, out_target)
    })
}

/// Destroy an offscreen render target and release GPU memory.
/// (REQ-2B-001)
#[no_mangle]
pub extern "C" fn vexart_composite_target_destroy(_ctx: u64, target: u64) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_destroy(pctx, target)
    })
}

/// Begin a render layer on the target. `load_mode=0` clears to `clear_rgba`.
/// (REQ-2B-002)
#[no_mangle]
pub extern "C" fn vexart_composite_target_begin_layer(
    _ctx: u64,
    target: u64,
    load_mode: u32,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_begin_layer(pctx, target, load_mode, clear_rgba)
    })
}

/// End the active render layer and submit GPU work.
/// (REQ-2B-002)
#[no_mangle]
pub extern "C" fn vexart_composite_target_end_layer(_ctx: u64, target: u64) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_end_layer(pctx, target)
    })
}

/// Set hardware scissor rectangle on an offscreen render target.
#[no_mangle]
pub extern "C" fn vexart_composite_target_set_scissor(
    _ctx: u64,
    target: u64,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_set_scissor(pctx, target, x, y, width, height)
    })
}

/// Reset/clear hardware scissor rectangle on an offscreen render target.
#[no_mangle]
pub extern "C" fn vexart_composite_target_reset_scissor(_ctx: u64, target: u64) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::target_reset_scissor(pctx, target)
    })
}

/// Composite an image onto a target at (x,y,w,h) with the given z-order.
/// (REQ-2B-003)
#[no_mangle]
pub extern "C" fn vexart_composite_render_image_layer(
    _ctx: u64,
    target: u64,
    image: u64,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    z: u32,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::composite_render_image_layer(pctx, target, image, x, y, w, h, z, clear_rgba)
    })
}

/// Composite an image onto a target using an explicit transformed quad + opacity.
///
/// # Safety
/// `params_ptr` must point to a packed `BridgeImageTransformInstance` buffer (48 bytes).
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_render_image_transform_layer(
    _ctx: u64,
    target: u64,
    image: u64,
    params_ptr: *const u8,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        if params_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let params = std::slice::from_raw_parts(
            params_ptr,
            std::mem::size_of::<paint::instances::BridgeImageTransformInstance>(),
        );
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::composite_render_image_transform_layer(pctx, target, image, params, clear_rgba)
    })
}

/// Composite one retained source target onto another using only transform/opacity params.
///
/// # Safety
/// `params_ptr` must point to a packed `BridgeImageTransformInstance` buffer (48 bytes).
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_update_uniform(
    _ctx: u64,
    target: u64,
    source_target: u64,
    params_ptr: *const u8,
    clear_rgba: u32,
) -> i32 {
    ffi_guard!({
        if params_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let params = std::slice::from_raw_parts(
            params_ptr,
            std::mem::size_of::<paint::instances::BridgeImageTransformInstance>(),
        );
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::composite_update_uniform(pctx, target, source_target, params, clear_rgba)
    })
}

/// Extract a rectangular region from a target into a new image handle.
/// (REQ-2B-004)
///
/// # Safety
/// `out_image` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_copy_region_to_image(
    _ctx: u64,
    target: u64,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        if target == 0 || w == 0 || h == 0 {
            return ERR_INVALID_ARG;
        }
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        let (tw, th) = match pctx.targets.get(target) {
            Some(r) => (r.width, r.height),
            None => return ERR_INVALID_HANDLE,
        };
        let cx = x.min(tw);
        let cy = y.min(th);
        let cw = w.min(tw.saturating_sub(cx));
        let ch = h.min(th.saturating_sub(cy));
        if cw == 0 || ch == 0 {
            return ERR_INVALID_ARG;
        }
        composite::copy_region_to_image(pctx, target, x, y, w, h, out_image)
    })
}

/// Apply backdrop blur + 7-op color filter chain to an image, returning new image handle.
/// `params_ptr` = 8 × f32: blur, brightness, contrast, saturate, grayscale, invert, sepia, hue_rotate_deg.
/// (REQ-2B-006)
///
/// # Safety
/// `params_ptr` must be valid for `params_len` bytes; `out_image` must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_image_filter_backdrop(
    _ctx: u64,
    image: u64,
    params_ptr: *const u8,
    params_len: u32,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() {
            return ERR_INVALID_ARG;
        }
        if params_ptr.is_null() || params_len < 32 {
            return ERR_INVALID_ARG;
        }
        let params: &[f32] = std::slice::from_raw_parts(params_ptr as *const f32, 8);
        let blur_raw = params[0];
        let brightness_raw = params[1];
        let contrast_raw = params[2];
        let saturate_raw = params[3];
        let grayscale_raw = params[4];
        let invert_raw = params[5];
        let sepia_raw = params[6];
        let hue_rotate_deg_raw = params[7];

        let blur = if blur_raw.is_nan() { 0.0 } else { blur_raw.max(0.0) };
        let brightness = if brightness_raw.is_nan() { 100.0 } else { brightness_raw };
        let contrast = if contrast_raw.is_nan() { 100.0 } else { contrast_raw };
        let saturate = if saturate_raw.is_nan() { 100.0 } else { saturate_raw };
        let grayscale = if grayscale_raw.is_nan() { 0.0 } else { grayscale_raw };
        let invert = if invert_raw.is_nan() { 0.0 } else { invert_raw };
        let sepia = if sepia_raw.is_nan() { 0.0 } else { sepia_raw };
        let hue_rotate_deg = if hue_rotate_deg_raw.is_nan() { 0.0 } else { hue_rotate_deg_raw };

        let has_blur = blur > 0.0;
        let has_color = (brightness - 100.0).abs() > f32::EPSILON
            || (contrast - 100.0).abs() > f32::EPSILON
            || (saturate - 100.0).abs() > f32::EPSILON
            || grayscale.abs() > f32::EPSILON
            || invert.abs() > f32::EPSILON
            || sepia.abs() > f32::EPSILON
            || hue_rotate_deg.abs() > f32::EPSILON;

        let passes: u64 = match (has_blur, has_color) {
            (true, true) => 3,
            (true, false) => 2,
            (false, true) => 1,
            (false, false) => {
                *out_image = 0;
                return ERR_INVALID_ARG;
            }
        };
        let _ = passes;

        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::image_filter_backdrop(pctx, image, params_ptr, params_len, out_image)
    })
}

/// Apply rounded-rect SDF mask to an image, returning new image handle.
/// `rect_ptr` = 6 × f32: radius_uniform, tl, tr, br, bl, mode.
/// (REQ-2B-006)
///
/// # Safety
/// `rect_ptr` must be valid for 24 bytes; `out_image` must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_image_mask_rounded_rect(
    _ctx: u64,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() || rect_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::image_mask_rounded_rect(pctx, image, rect_ptr, out_image)
    })
}

/// Apply a rounded-rect SDF mask with an explicit source-box region.
/// `rect_ptr` = 10 × f32: six radius/mode values followed by mask_x, mask_y,
/// mask_w, mask_h in output NDC. This internal companion keeps radius
/// geometry in the original image box when the source has been cropped.
///
/// # Safety
/// `rect_ptr` must be valid for 40 bytes; `out_image` must be valid.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_image_mask_rounded_rect_region(
    _ctx: u64,
    image: u64,
    rect_ptr: *const u8,
    out_image: *mut u64,
) -> i32 {
    ffi_guard!({
        if out_image.is_null() || rect_ptr.is_null() {
            return ERR_INVALID_ARG;
        }
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::image_mask_rounded_rect_region(pctx, image, rect_ptr, out_image)
    })
}

/// Blocking GPU→CPU readback of full target.
///
/// # Safety
/// `dst` must be valid for `dst_cap` bytes if non-null.
#[no_mangle]
pub unsafe extern "C" fn vexart_composite_readback_rgba(
    _ctx: u64,
    target: u64,
    dst: *mut u8,
    dst_cap: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let mut guard = crate::get_or_init_paint();
        let pctx = match guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        composite::readback_rgba(pctx, target, dst, dst_cap, stats_out)
    })
}
