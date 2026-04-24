# Design: Phase 2c — Native Layer Registry

## Technical Approach

Keep TypeScript layer assignment temporarily, but move layer resource ownership into Rust. TS sends stable layer descriptors; Rust decides whether to create, reuse, mark dirty, present, or delete native resources.

## Native Model

```rust
struct LayerRegistry {
    layers: HashMap<LayerKey, LayerRecord>,
}

struct LayerRecord {
    key: LayerKey,
    target: WgpuTargetHandle,
    terminal_image_id: u32,
    bounds: Rect,
    z_index: i32,
    dirty: bool,
    last_used_frame: u64,
    bytes: u64,
}
```

## FFI Shape

Exact signatures may use packed buffers.

```rust
vexart_layer_upsert(ctx, key_ptr, desc_ptr, out_handle) -> i32
vexart_layer_mark_dirty(ctx, layer, dirty_rect_ptr, dirty_rect_len) -> i32
vexart_layer_reuse(ctx, layer, frame_id, stats_out) -> i32
vexart_layer_remove(ctx, layer) -> i32
vexart_layer_present_dirty(ctx, layer, stats_out) -> i32
```

## Decisions

- Stable layer keys remain supplied by TS until the native scene graph owns layer assignment.
- Rust owns terminal image ID allocation on the native path.
- Resource eviction integrates visible/recent/cold priorities; visible layers are non-evictable.
- TS fallback remains available and may keep its old layer composer while the feature flag is off.

## Verification

- Registry unit tests for lifecycle and eviction invariants.
- TS integration tests for feature flag and fallback routing.
- Static validation that native path does not own terminal image IDs in TS.
