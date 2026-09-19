// native/libvexart/src/composite/mod.rs
// GPU composite operations: image layer rendering, region copy, readback, and filter effects.
// Decomposed into focused deep modules for target management, image blitting,
// region extraction, and visual effect chains.

pub mod copy;
pub mod effects;
pub mod image_layer;
pub mod pool;
pub mod readback;
pub mod target;
pub mod target_ops;

// Re-export target lifecycle and layer/scissor operations
pub use target_ops::{
    target_begin_layer, target_create, target_destroy, target_end_layer,
    target_reset_scissor, target_set_scissor,
};

// Re-export image layer blitting and affine quad transforms
pub use image_layer::{
    composite_layers_batch, composite_render_image_layer,
    composite_render_image_transform_layer, composite_update_uniform,
    BridgeLayerBatchItem,
};

// Re-export region copy and GPU readback
pub use copy::{copy_region_to_image, readback_region_rgba, readback_rgba};

// Re-export visual filter and mask effects
pub use effects::{
    image_filter_backdrop, image_mask_rounded_rect, image_mask_rounded_rect_region,
};

#[cfg(test)]
pub(crate) use effects::{remove_temp_image, render_blur_image};

#[cfg(test)]
pub(crate) use crate::ffi::panic::{ERR_INVALID_ARG, ERR_INVALID_HANDLE, OK};
#[cfg(test)]
pub(crate) use crate::paint::PaintContext;
#[cfg(test)]
pub(crate) use crate::types::FrameStats;

#[cfg(test)]
#[path = "mod_tests.rs"]
mod tests;
