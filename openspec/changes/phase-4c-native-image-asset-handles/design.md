# Design: Phase 4c — Native Image Asset Handles

## Current ownership

```txt
<img src>
  → packages/engine/src/loop/image.ts decodes in JS/Bun
  → TGENode._imageBuffer stores RGBA bytes
  → walk-tree queues ImagePaintConfig.imageBuffer
  → TS GPU backend uploads/caches from Uint8Array
```

This keeps decoded image pixels and upload identity in TypeScript.

## Target ownership

```txt
<img src>
  → JS/Bun decodes once to RGBA
  → vexart_image_asset_register(...) returns u64 handle
  → SceneGraph node stores/receives image asset handle
  → render graph image op references handle
  → Rust resource manager tracks lifetime/bytes/usage
```

JS remains the decoder in Phase 4c, but Rust owns the registered asset identity and lifetime.

## FFI shape

Candidate functions:

```txt
vexart_image_asset_register(ctx, scene, key_ptr, key_len, rgba_ptr, rgba_len, width, height, out_handle) -> i32
vexart_image_asset_release(ctx, scene, handle) -> i32
vexart_image_asset_touch(ctx, scene, handle) -> i32
```

`key` is a stable string such as normalized `src`. Rust may dedupe by key and dimensions.

## TypeScript bridge

- Extend decoded image cache entry with optional native handle.
- Register decoded pixels after successful decode when native image assets are enabled.
- Store handle on the node or image config as `_nativeImageHandle`.
- Keep `_imageBuffer` for fallback/offscreen paths until cleanup.

## Rust resource model

- Add `ImageAssetRegistry` or integrate into existing `resource` module.
- Track:
  - handle
  - key
  - width/height
  - byte size
  - last touched frame
  - optional GPU texture identity later
- Register assets as `ResourceKind::ImageSprite`.

## Render graph integration

Native image ops should expose:

```txt
imageSource
imageHandle
objectFit
```

TS translators may still populate `imageBuffer` only when no handle exists.

## Tradeoffs

- Keeping JS decode avoids binding Rust image libraries now.
- Rust handle ownership gives immediate lifetime/resource-accounting benefits.
- Upload-to-GPU ownership may still require backend integration after registration; this change is the ownership boundary first.
