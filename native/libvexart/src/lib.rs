// native/libvexart/src/lib.rs
// FFI exports and shared runtime singletons for libvexart.
// C-ABI symbols are implemented across cohesive submodules under `ffi::`
// and re-exported here at crate root.

pub mod composite;
pub mod ffi;
pub mod font;
pub mod kitty;
pub mod paint;
pub mod text;
pub mod types;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard};

pub use ffi::panic::{
    ERR_GPU_DEVICE_LOST, ERR_INVALID_ARG, ERR_INVALID_HANDLE, ERR_OUT_OF_BUDGET,
    OK,
};
pub use ffi::{
    composite::*, context::*, font::*, kitty::*, paint::*, resource::*,
};

/// Lock a mutex, recovering from poison instead of panicking.
/// If a previous panic poisoned the mutex, the guard is recovered
/// so the renderer can continue operating instead of permanently failing.
pub(crate) fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

// ─── Single shared PaintContext (lazy-initialized, persisted across all FFI calls) ──
// One PaintContext owns: WgpuContext (Instance/Adapter/Device/Queue + 13 pipelines +
// image bind group layout) + image registry + render target. Initializing wgpu costs
// 200-300ms (adapter request, device, shader compilation, pipeline creation), so we
// MUST persist it across vexart_paint_dispatch / vexart_paint_upload_image /
// vexart_paint_remove_image calls. Recreating per call would cap render rate at 3-5 fps
// and would break image handles (cross-device texture references). Per design §17,
// post-Apply #2a architectural fix.
//
// NEXT_IMAGE_HANDLE is now in paint::NEXT_IMAGE_HANDLE for sharing with composite ops.

pub(crate) static SHARED_PAINT: LazyLock<Mutex<Option<paint::PaintContext>>> =
    LazyLock::new(|| Mutex::new(None));

pub(crate) fn get_or_init_paint() -> MutexGuard<'static, Option<paint::PaintContext>> {
    let mut guard = lock_or_recover(&SHARED_PAINT);
    if guard.is_none() {
        *guard = Some(paint::PaintContext::new());
    }
    guard
}

pub(crate) fn upload_image_record(
    pctx: &mut paint::PaintContext,
    handle: u64,
    rgba: &[u8],
    width: u32,
    height: u32,
) -> bool {
    let max_dim = pctx.wgpu.device.limits().max_texture_dimension_2d;
    if width == 0 || height == 0 || width > max_dim || height > max_dim {
        return false;
    }
    let expected_bytes = match (width as usize).checked_mul(height as usize).and_then(|px| px.checked_mul(4)) {
        Some(b) => b,
        None => return false,
    };
    if rgba.len() < expected_bytes {
        return false;
    }
    let wgpu_ctx = &pctx.wgpu;
    let texture = wgpu_ctx.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("vexart-image"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });

    wgpu_ctx.queue.write_texture(
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

    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = wgpu_ctx.device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("vexart-image-sampler"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Nearest,
        min_filter: wgpu::FilterMode::Nearest,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        ..Default::default()
    });
    let bind_group = wgpu_ctx
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("vexart-image-bind-group"),
            layout: &wgpu_ctx.image_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
    let _ = sampler;
    pctx.images.insert(
        handle,
        paint::ImageRecord {
            texture,
            view,
            bind_group,
            width,
            height,
            references: 1,
        },
    );
    true
}

/// Default memory budget: 512MB (per ARCHITECTURE §8.3).
pub const DEFAULT_BUDGET_BYTES: u64 = 512 * 1024 * 1024;
/// Minimum allowed budget: 32MB (per ARCHITECTURE §8.3).
pub const MIN_BUDGET_BYTES: u64 = 32 * 1024 * 1024;

pub(crate) static BUDGET_BYTES: AtomicU64 = AtomicU64::new(DEFAULT_BUDGET_BYTES);
pub(crate) static HIGH_WATER_MARK: AtomicU64 = AtomicU64::new(0);

pub(crate) static FRAME_COUNT: AtomicU64 = AtomicU64::new(1);

pub fn current_frame() -> u64 {
    FRAME_COUNT.load(Ordering::Relaxed)
}

pub(crate) fn advance_presentation_frame() -> u64 {
    FRAME_COUNT.fetch_add(1, Ordering::Relaxed)
}

// ─── Font system — MSDF text pipeline (Phase 2b / DEC-008) ─────────

pub(crate) static SHARED_FONT_SYSTEM: LazyLock<Mutex<font::system::FontSystem>> =
    LazyLock::new(|| Mutex::new(font::system::FontSystem::new()));

pub(crate) static SHARED_MSDF_ATLAS: LazyLock<Mutex<font::msdf_atlas::MsdfAtlasManager>> =
    LazyLock::new(|| Mutex::new(font::msdf_atlas::MsdfAtlasManager::new()));

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
