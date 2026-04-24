# Proposal: Phase 4c — Native Image Asset Handles

## Problem

The retained native render path still depends on JS-owned decoded image buffers. `<img>` currently decodes into `TGENode._imageBuffer`, queues `ImagePaintConfig.imageBuffer`, and the GPU backend uploads from that JS buffer. That means images are still a hot ownership exception in the Rust-retained architecture.

## Goal

Introduce native image asset handles so decoded RGBA image data is registered once with Rust, tracked by the native resource manager, and referenced by render graph ops by handle instead of carrying JS pixel buffers through the frame path.

## Scope

- Add FFI to register, update, touch, and release image assets.
- Store native image metadata and resource accounting in Rust.
- Extend TS image decode to upload decoded RGBA once and cache the returned native handle by `src`.
- Update render graph image ops to prefer native handles when available.
- Preserve existing JS buffer fallback for native-disabled/offscreen/test paths.

## Non-goals

- Moving image decoding from Bun/JS to Rust in this phase.
- Removing `ImagePaintConfig.imageBuffer` entirely.
- Designing the canvas display-list API.
- Changing public JSX `<img>` props.

## Verification

- Rust tests for image asset registration, touch/release, and resource stats.
- TS tests proving repeated `src` uses reuse a native handle.
- Native render graph parity remains green.
- Perf check has no regression.

## Rollback

- Disable native render graph or native presentation flags to use JS image buffers.
- Keep JS image buffer fallback until Phase 8 cleanup.
