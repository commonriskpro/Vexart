// native/libvexart/src/ffi/context.rs
// Version, context lifecycle, and last error FFI exports.

use std::sync::atomic::Ordering;

use crate::ffi::panic::{ERR_INVALID_ARG, OK};
use crate::ffi_guard;
use crate::{
    font, kitty, lock_or_recover, BUDGET_BYTES, DEFAULT_BUDGET_BYTES, FRAME_COUNT,
    HIGH_WATER_MARK, SHARED_MSDF_ATLAS, SHARED_PAINT,
};

pub use super::error::{vexart_copy_last_error, vexart_get_last_error_length};

/// Returns the Phase 2b version constant (0x00020B00).
/// TS mount path checks this against EXPECTED_BRIDGE_VERSION. Per design §12 rule 2.
/// Phase 2b Slice 1: target registry + compositing + real readback.
#[no_mangle]
pub extern "C" fn vexart_version() -> u32 {
    0x00020B00
}

/// Creates a Vexart rendering context.
///
/// The context handle is an opaque identifier for API symmetry. Actual GPU
/// state is managed internally via a lazy-initialized singleton (`SHARED_PAINT`)
/// because the WGPU device must persist across all paint/composite/text calls.
/// The handle exists so the API can evolve toward per-context isolation in the
/// future without breaking the FFI contract.
///
/// # Safety
/// `out_ctx` must be a valid mutable pointer.
#[no_mangle]
pub unsafe extern "C" fn vexart_context_create(
    opts_ptr: *const u8,
    opts_len: u32,
    out_ctx: *mut u64,
) -> i32 {
    ffi_guard!({
        let _ = (opts_ptr, opts_len);
        if out_ctx.is_null() {
            return ERR_INVALID_ARG;
        }
        // Ensure the GPU singleton is initialized eagerly (fail fast on GPU errors).
        let _guard = crate::get_or_init_paint();
        *out_ctx = 1;
        OK
    })
}

/// Releases a Vexart rendering context.
///
/// Ensures complete native teardown: drains SHARED_PAINT (releasing WGPU device,
/// queue, pipelines, and targets), symmetrically resets associated registries,
/// and unlinks active POSIX SHM mappings.
#[no_mangle]
pub extern "C" fn vexart_context_destroy(ctx: u64) -> i32 {
    ffi_guard!({
        let _ = ctx;
        // 1. Drain SHARED_PAINT (releases WGPU device, queue, pipeline caches, render targets + scissor state, images, atlases, texture pool)
        {
            let mut guard = lock_or_recover(&SHARED_PAINT);
            if let Some(pctx) = guard.as_mut() {
                pctx.texture_pool.clear();
            }
            let _ = guard.take();
        }
        // 2. Symmetrically reset/drain SHARED_MSDF_ATLAS
        {
            let mut guard = lock_or_recover(&SHARED_MSDF_ATLAS);
            *guard = font::msdf_atlas::MsdfAtlasManager::new();
        }
        // 3. Symmetrically reset frame counter and budget stats
        FRAME_COUNT.store(1, Ordering::Relaxed);
        BUDGET_BYTES.store(DEFAULT_BUDGET_BYTES, Ordering::Relaxed);
        HIGH_WATER_MARK.store(0, Ordering::Relaxed);
        // 4. Release any active SHM mappings
        kitty::transport::cleanup_shm_on_shutdown();
        OK
    })
}

