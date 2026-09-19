// Frame caching, xxHash comparison, and animation frame tracking for Kitty transport.

use std::cell::RefCell;
#[cfg(test)]
use std::cell::Cell;
use std::collections::HashMap;

thread_local! {
    // Next animation frame number for each live Kitty image id. A missing
    // entry means the image has not been transmitted by this process yet.
    static IMAGE_FRAMES: RefCell<HashMap<u32, u32>> = RefCell::new(HashMap::new());
    // Last direct-transport payload for each live Kitty image id. The render
    // loop can revisit an unchanged target many times; avoid flooding stdout
    // with identical animation frames while still allowing real pixels to
    // update immediately.
    static IMAGE_HASHES: RefCell<HashMap<u32, u64>> = RefCell::new(HashMap::new());
    // Dimensions of the root canvas last transmitted for each live Kitty image
    // id. Kitty animation frames belong to that root canvas; a target resize
    // therefore requires a fresh image transmit rather than an animation
    // update with a different `s`/`v` pair.
    static IMAGE_GEOMETRIES: RefCell<HashMap<u32, (u32, u32)>> = RefCell::new(HashMap::new());
    // Test-only counter used to prove a digest is scanned once per output
    // attempt even though the result is consumed by both cache operations.
    #[cfg(test)]
    pub static RGBA_HASH_SCANS: Cell<usize> = const { Cell::new(0) };
    // Test-only animation support override keeps transport tests independent of
    // the host terminal environment.
    #[cfg(test)]
    pub static FORCE_ANIMATION_SUPPORT: Cell<Option<bool>> = const { Cell::new(None) };
}

pub fn image_frame(image_id: u32) -> Option<u32> {
    IMAGE_FRAMES.with(|frames| frames.borrow().get(&image_id).copied())
}

pub fn next_animation_frame(existing_frame: Option<u32>) -> (u32, u32, bool) {
    // returns (target_frame, compose_frame, is_replacement)
    match existing_frame {
        None => (1, 1, false),
        Some(1) => (2, 1, false), // Frame 2 is appended (first time)
        Some(2) => (1, 2, true),  // Frame 1 is replaced (r=1)
        Some(_) => (2, 1, true),  // Frame 2 is replaced (r=2)
    }
}

pub fn record_image_frame(image_id: u32, target_frame: Option<u32>) {
    IMAGE_FRAMES.with(|frames| {
        let next = match target_frame {
            Some(1) => 3,
            Some(2) => 2,
            Some(_) => 3,
            None => 1,
        };
        frames.borrow_mut().insert(image_id, next);
    });
}

pub fn forget_image_frame(image_id: u32) {
    IMAGE_FRAMES.with(|frames| {
        frames.borrow_mut().remove(&image_id);
    });
    IMAGE_HASHES.with(|hashes| {
        hashes.borrow_mut().remove(&image_id);
    });
    IMAGE_GEOMETRIES.with(|geometries| {
        geometries.borrow_mut().remove(&image_id);
    });
}

pub fn clear_frame_caches() {
    IMAGE_FRAMES.with(|cell| cell.borrow_mut().clear());
    IMAGE_HASHES.with(|cell| cell.borrow_mut().clear());
    IMAGE_GEOMETRIES.with(|cell| cell.borrow_mut().clear());
}

pub fn image_geometry(image_id: u32) -> Option<(u32, u32)> {
    IMAGE_GEOMETRIES.with(|geometries| geometries.borrow().get(&image_id).copied())
}

pub fn record_image_geometry(image_id: u32, width: u32, height: u32) {
    IMAGE_GEOMETRIES.with(|geometries| {
        geometries.borrow_mut().insert(image_id, (width, height));
    });
}

pub fn animation_supported() -> bool {
    #[cfg(test)]
    if let Some(forced) = FORCE_ANIMATION_SUPPORT.with(|c| c.get()) {
        return forced;
    }
    let vexart_kitty_animation = std::env::var("VEXART_KITTY_ANIMATION").ok();
    animation_supported_from_env(vexart_kitty_animation.as_deref())
}

pub fn animation_supported_from_env(vexart_kitty_animation: Option<&str>) -> bool {
    vexart_kitty_animation == Some("1")
}

pub fn rgba_hash(rgba: &[u8]) -> u64 {
    #[cfg(test)]
    RGBA_HASH_SCANS.with(|scans| scans.set(scans.get().saturating_add(1)));
    rgba.iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

pub fn payload_hash(rgba: &[u8], width: u32, height: u32, col: i32, row: i32, z: i32) -> u64 {
    [
        rgba_hash(rgba),
        u64::from(width),
        u64::from(height),
        col as u64,
        row as u64,
        z as u64,
    ]
    .into_iter()
    .fold(0xcbf29ce484222325, |hash, value| {
        value.to_le_bytes().iter().fold(hash, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        })
    })
}

pub fn payload_unchanged(image_id: u32, digest: u64) -> bool {
    IMAGE_HASHES.with(|hashes| hashes.borrow().get(&image_id).copied() == Some(digest))
}

pub fn record_payload(image_id: u32, digest: u64) {
    IMAGE_HASHES.with(|hashes| {
        hashes.borrow_mut().insert(image_id, digest);
    });
}

pub fn needs_full_transmit(image_id: u32, width: u32, height: u32) -> bool {
    !animation_supported()
        || image_frame(image_id).is_none()
        || image_geometry(image_id) != Some((width, height))
}
