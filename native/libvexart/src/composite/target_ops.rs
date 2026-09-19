// native/libvexart/src/composite/target_ops.rs
// Target lifecycle and layer/scissor operations.

use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
use crate::paint::PaintContext;

/// Create an offscreen target in the registry. Returns OK with handle in `*out_handle`.
pub fn target_create(
    pctx: &mut PaintContext,
    width: u32,
    height: u32,
    out_handle: *mut u64,
) -> i32 {
    if out_handle.is_null() {
        return ERR_INVALID_ARG;
    }
    if width == 0 || height == 0 {
        return ERR_INVALID_ARG;
    }

    let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
    if width > max_dim || height > max_dim {
        return ERR_INVALID_ARG;
    }

    let current_frame = crate::current_frame();
    let (texture, view) = pctx
        .texture_pool
        .acquire(&pctx.wgpu.device, width, height, current_frame);

    // SAFETY: out_handle is non-null (checked above) and valid (caller contract).
    let handle_ref = unsafe { &mut *out_handle };
    let rec = match pctx
        .targets
        .create_with_texture(width, height, texture, view, handle_ref)
    {
        Some(r) => r,
        None => return ERR_INVALID_ARG,
    };
    let handle = *handle_ref;
    pctx.targets.insert(handle, rec);
    OK
}

/// Destroy an offscreen target, releasing GPU memory.
pub fn target_destroy(pctx: &mut PaintContext, handle: u64) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    if let Some(rec) = pctx.targets.remove(handle) {
        let (texture, view, width, height) = rec.into_texture_and_view();
        let current_frame = crate::current_frame();
        pctx.texture_pool.release(
            texture,
            view,
            width,
            height,
            current_frame,
        );
        OK
    } else {
        ERR_INVALID_HANDLE
    }
}

/// Begin a layer on a target: create CommandEncoder for subsequent dispatch calls.
pub fn target_begin_layer(
    pctx: &mut PaintContext,
    handle: u64,
    load_mode: u32,
    clear_rgba: u32,
) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    // Extract device pointer before borrowing pctx.targets.
    // SAFETY: pctx.wgpu.device is stable; the raw pointer is valid for this call.
    let device_ptr: *const wgpu::Device = &pctx.wgpu.device as *const wgpu::Device;
    match pctx
        .targets
        .begin_layer(unsafe { &*device_ptr }, handle, load_mode, clear_rgba)
    {
        Ok(()) => OK,
        Err(code) => code,
    }
}

/// End a layer: submit the encoder to the queue and return the target to rested state.
pub fn target_end_layer(pctx: &mut PaintContext, handle: u64) -> i32 {
    if handle == 0 {
        return ERR_INVALID_ARG;
    }
    // Extract queue pointer before borrowing pctx.targets.
    // SAFETY: pctx.wgpu.queue is stable; the raw pointer is valid for this call.
    let queue_ptr: *const wgpu::Queue = &pctx.wgpu.queue as *const wgpu::Queue;
    let res = match pctx.targets.end_layer(unsafe { &*queue_ptr }, handle) {
        Ok(()) => OK,
        Err(code) => code,
    };
    pctx.on_frame_complete();
    res
}

/// Set hardware scissor rectangle on an offscreen render target.
pub fn target_set_scissor(
    pctx: &mut PaintContext,
    target: u64,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> i32 {
    if target == 0 {
        return ERR_INVALID_ARG;
    }
    let rec = match pctx.targets.get_mut(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };
    rec.set_scissor(x, y, width, height);
    OK
}

/// Reset/clear hardware scissor rectangle on an offscreen render target.
pub fn target_reset_scissor(pctx: &mut PaintContext, target: u64) -> i32 {
    if target == 0 {
        return ERR_INVALID_ARG;
    }
    let rec = match pctx.targets.get_mut(target) {
        Some(r) => r,
        None => return ERR_INVALID_HANDLE,
    };
    rec.clear_scissor();
    OK
}

