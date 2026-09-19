// native/libvexart/src/ffi/resource.rs
// Resource manager stats, budget control, and image asset lifecycle FFI exports.

use std::sync::atomic::Ordering;

use crate::ffi::panic::{ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, ERR_OUT_OF_BUDGET, OK};
use crate::ffi_guard;
use crate::paint;
use crate::{
    upload_image_record, BUDGET_BYTES, HIGH_WATER_MARK, MIN_BUDGET_BYTES,
};

/// Retrieve current ResourceManager statistics as a JSON-encoded UTF-8 buffer.
///
/// The buffer is written to `out_ptr` (up to `out_cap` bytes).
/// `out_used` receives the number of bytes written (excluding NUL).
///
/// Returns:
///   OK (0)              — stats written successfully
///   ERR_INVALID_ARG (-9) — out_ptr is null or out_cap is 0
///
/// # Safety
/// `out_ptr` must be valid for `out_cap` bytes; `out_used` must be a valid mutable pointer.
///
/// (REQ-2B-704)
#[no_mangle]
pub unsafe extern "C" fn vexart_resource_get_stats(
    _ctx: u64,
    out_ptr: *mut u8,
    out_cap: u32,
    out_used: *mut u32,
) -> i32 {
    ffi_guard!({
        if out_ptr.is_null() || out_cap == 0 || out_used.is_null() {
            return ERR_INVALID_ARG;
        }

        let mut image_count: u32 = 0;
        let mut image_bytes: u64 = 0;
        let mut target_count: u32 = 0;
        let mut target_bytes: u64 = 0;

        {
            let guard = crate::get_or_init_paint();
            if let Some(pctx) = guard.as_ref() {
                image_count = pctx.images.len() as u32;
                for img in pctx.images.values() {
                    image_bytes += img.size_bytes();
                }
                let (tc, tb) = pctx.targets.stats();
                target_count = tc;
                target_bytes = tb;
            }
        }

        let current_usage = image_bytes + target_bytes;
        let _ = HIGH_WATER_MARK.fetch_max(current_usage, Ordering::Relaxed);
        let high_water_mark = HIGH_WATER_MARK.load(Ordering::Relaxed).max(current_usage);
        let budget_bytes = BUDGET_BYTES.load(Ordering::Relaxed);

        let mut kinds = Vec::new();
        if image_count > 0 {
            kinds.push(format!(
                "\"ImageSprite\":{{\"count\":{},\"bytes\":{}}}",
                image_count, image_bytes
            ));
        }
        if target_count > 0 {
            kinds.push(format!(
                "\"LayerTarget\":{{\"count\":{},\"bytes\":{}}}",
                target_count, target_bytes
            ));
        }
        let kind_json = kinds.join(",");

        let json = format!(
            "{{\"budgetBytes\":{},\"currentUsage\":{},\"highWaterMark\":{},\"resourcesByKind\":{{{}}},\"evictionsLastFrame\":0,\"evictionsTotal\":0}}",
            budget_bytes, current_usage, high_water_mark, kind_json,
        );
        let bytes = json.as_bytes();

        let write_len = bytes.len().min(out_cap as usize);
        let out_slice = std::slice::from_raw_parts_mut(out_ptr, write_len);
        out_slice.copy_from_slice(&bytes[..write_len]);
        *out_used = write_len as u32;
        OK
    })
}

/// Set the GPU memory budget.
#[no_mangle]
pub extern "C" fn vexart_resource_set_budget(_ctx: u64, budget_mb: u32) -> i32 {
    ffi_guard!({
        let budget_bytes = ((budget_mb as u64) * 1024 * 1024).max(MIN_BUDGET_BYTES);
        BUDGET_BYTES.store(budget_bytes, Ordering::Relaxed);
        OK
    })
}

/// Register or update a native image asset from decoded RGBA bytes.
#[no_mangle]
pub unsafe extern "C" fn vexart_image_asset_register(
    _current_frame: u64,
    key_ptr: *const u8,
    key_len: u32,
    rgba_ptr: *const u8,
    rgba_len: u32,
    meta_ptr: *const u8,
    out_handle: *mut u64,
) -> i32 {
    ffi_guard!({
        if key_ptr.is_null()
            || key_len == 0
            || rgba_ptr.is_null()
            || rgba_len == 0
            || meta_ptr.is_null()
            || out_handle.is_null()
        {
            return ERR_INVALID_ARG;
        }
        let meta = std::slice::from_raw_parts(meta_ptr, 8);
        let width = u32::from_le_bytes(meta[0..4].try_into().unwrap_or([0; 4]));
        let height = u32::from_le_bytes(meta[4..8].try_into().unwrap_or([0; 4]));

        let bytes = match (width as u64)
            .checked_mul(height as u64)
            .and_then(|px| px.checked_mul(4))
        {
            Some(b) => b,
            None => {
                *out_handle = 0;
                return ERR_OUT_OF_BUDGET;
            }
        };

        if rgba_len as u64 != bytes {
            *out_handle = 0;
            return ERR_INVALID_ARG;
        }

        let rgba = std::slice::from_raw_parts(rgba_ptr, rgba_len as usize);

        let mut paint_guard = crate::get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };

        let handle = paint::alloc_image_handle();
        if !upload_image_record(pctx, handle, rgba, width, height) {
            *out_handle = 0;
            return ERR_INVALID_ARG;
        }
        *out_handle = handle;
        OK
    })
}

#[no_mangle]
pub extern "C" fn vexart_image_asset_touch(_current_frame: u64, handle: u64) -> i32 {
    ffi_guard!({
        if handle == 0 {
            return ERR_INVALID_ARG;
        }
        let guard = crate::get_or_init_paint();
        let pctx = match guard.as_ref() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        if pctx.images.contains_key(&handle) {
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

/// Acquire an additional image owner; release it with vexart_image_asset_release.
#[no_mangle]
pub extern "C" fn vexart_image_asset_retain(handle: u64) -> i32 {
    ffi_guard!({
        if handle == 0 {
            return ERR_INVALID_ARG;
        }
        let mut paint_guard = crate::get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        if let Some(img) = pctx.images.get_mut(&handle) {
            img.references = img.references.saturating_add(1);
            OK
        } else {
            ERR_INVALID_ARG
        }
    })
}

#[no_mangle]
pub extern "C" fn vexart_image_asset_release(handle: u64) -> i32 {
    ffi_guard!({
        if handle == 0 {
            return ERR_INVALID_ARG;
        }
        let mut paint_guard = crate::get_or_init_paint();
        let pctx = match paint_guard.as_mut() {
            Some(c) => c,
            None => return ERR_GPU_DEVICE_LOST,
        };
        if let Some(img) = pctx.images.get_mut(&handle) {
            if img.references > 1 {
                img.references -= 1;
                return OK;
            }
        } else {
            return ERR_INVALID_ARG;
        }
        pctx.images.remove(&handle);
        OK
    })
}
