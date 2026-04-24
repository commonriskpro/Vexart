# Design: Phase 9c — Presentation Transport Fast Path

## Finding

With 60-frame smoke runs:

- `direct` dirty-region p95 stays around `10.66ms`, dominated by direct base64 presentation.
- `file` dirty-region p95 drops to `5.06ms`.
- `shm` dirty-region p95 drops to `4.37ms`.
- `shm` dashboard-1080p p95 reaches `7.48ms`.

This confirms the bottleneck is transport/presentation, not layout.

## Benchmark transport selection

The runtime transport policy is:

```txt
SHM → file → direct
```

SHM is the default happy path. File transport is the local fallback when SHM is unavailable. Direct base64 is the last-resort compatibility path.

`scripts/frame-breakdown.tsx` accepts:

```bash
bun run bench:frame-breakdown -- --transport=direct
bun run bench:frame-breakdown -- --transport=file
bun run bench:frame-breakdown -- --transport=shm
```

The script configures the Kitty transport manager to make mock-terminal runs reflect the requested transport instead of silently falling back to direct.

If no transport is passed, the benchmark defaults to `shm` to match the intended production happy path.

## Strategy forcing

The benchmark no longer sets `TGE_GPU_FORCE_LAYER_STRATEGY=final-frame-raw` by default. If a forced strategy is required, callers must pass the environment variable explicitly.

## Regional TS fallback

For non-native retained presentation:

```txt
small node visual damage
  -> layer repaint region
  -> backend returns regional payload metadata
  -> layerComposer.patchLayer(region)
```

If the layer is not already present, the path falls back to full layer presentation.

## Lower-layer damage

Upper-layer visual repaint should not dirty lower layers unless the upper layer moved or resized. Static hover/focus style changes only require repainting the upper layer image.

## Full repaint classification

Full repaint is now based on explicit force or dirty pixel area. A single dirty layer can still be a regional repaint if the dirty area is small.
