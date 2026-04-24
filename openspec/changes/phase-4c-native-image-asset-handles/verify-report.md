# Verify Report: Phase 4c — Native Image Asset Handles

## Status

Implemented, with JS decode preserved and Rust now owning native image asset handles, resource accounting, and native paint image records for registered assets.

## Implemented

- Added `native/libvexart/src/image_asset.rs` with stable key → handle registry.
- Added FFI exports:
  - `vexart_image_asset_register`
  - `vexart_image_asset_touch`
  - `vexart_image_asset_release`
- Registered native image assets as `ResourceKind::ImageSprite` in the resource manager.
- Uploaded registered image assets into the native paint image registry using the same handle, so the GPU backend can prefer the native handle.
- Added TS bridge `packages/engine/src/ffi/native-image-assets.ts`.
- Extended decoded image cache entries and `TGENode` with native image handle metadata.
- Updated image decode flow to register decoded RGBA once per `src` and sync `__imageHandle` to the native scene node.
- Extended render graph image config and native snapshots to carry image handles while preserving `imageBuffer` fallback.
- Updated GPU backend image path to prefer `nativeImageHandle` when present and fall back to JS buffer upload otherwise.

## Verification Run

- `cargo build --quiet --manifest-path native/libvexart/Cargo.toml` — passed.
- `cargo test --quiet --manifest-path native/libvexart/Cargo.toml` — 150 passed.
- `bun test packages/engine/src/ffi/native-image-assets.test.ts packages/engine/src/ffi/native-render-graph.test.ts` — 12 passed.
- `bun run typecheck` — passed.
- `bun test` — 303 passed.
- `bun run test:visual:native-render-graph` — 40 passed, 0 failed.
- `bun run perf:check` — passed (`14.76 ms/frame`, +0.2% vs baseline).
- `bun run api:check` — passed and updated `packages/engine/etc/engine.api.md`.
- `git diff --check` — passed.

## Added Coverage

- Rust tests for stable handle reuse and resource-manager accounting.
- TS FFI tests for stable handle reuse and native `ImageSprite` resource stats.
- Render graph test for propagating `imageHandle` into `nativeImageHandle`.

## Remaining Gaps

- JS still performs image decoding by design for this phase; Rust owns asset identity/upload after decoded RGBA is available.

## Rollback

- Native-disabled/offscreen/test fallback keeps using `imageBuffer`.
- If native image registration fails, image decode still populates `_imageBuffer` and rendering can continue through the existing upload path.
