# Design: Phase 12 Canvas Display-List Replay

## Decision: Provide a safe raster replay path for canvas ops

The existing pipeline captures TypeScript canvas commands and registers display-list bytes natively, but the GPU backend currently returns `null` for canvas sprites. This change completes the replay path so canvas ops resolve to image handles and render through the existing image batching path.

## Approach

1. Keep the public `CanvasContext` API unchanged.
2. Decode normalized display-list commands in TypeScript for now, because command JSON is already available in the frontend pipeline and the GPU backend already owns image upload/cache helpers.
3. Rasterize commands into an RGBA buffer using existing command semantics.
4. Upload the rasterized buffer via the existing image handle path.
5. Cache by display-list hash plus canvas dimensions.

## Tradeoffs

- A native Rust replay path is still the long-term target for maximum performance.
- A TypeScript raster fallback is acceptable for this slice because it makes the public API usable, keeps behavior testable, and avoids frame failure while native replay matures.
- Heavy procedural commands should be cached aggressively.

## Compatibility

- No public API changes.
- Existing canvas display-list native registry remains useful for future Rust replay.
