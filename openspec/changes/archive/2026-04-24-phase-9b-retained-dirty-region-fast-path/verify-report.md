# Verify Report: Phase 9b — Retained Dirty-Region Fast Path

## Status

Implemented scoped dirty invalidation for pointer/interaction visual changes. Unknown and structural dirty marks remain conservative full invalidations.

## Implemented

- Added dirty scope model:
  - `full`
  - `interaction`
  - `node-visual`
- `feedPointer()` now marks interaction dirty without immediately marking every layer dirty.
- Interaction state updates now report specific visual nodes when hover/active/focus state changes.
- Composite frame queues node damage rectangles for visual-only interaction state changes.
- Global dirty subscriber preserves full invalidation for unknown/structural marks and falls back to full dirty if scoped node damage cannot be resolved.
- Added per-path frame instrumentation for scroll/input, layout, interaction, relayout, layer assignment, native snapshot, layer prep, frame context, backend begin/paint/end, render graph, presentation, cleanup, and terminal sync.
- Frame breakdown report now prints top p95 bottleneck stages.
- Dirty-region and compositor-only benchmarks no longer force full layer repaint.
- API snapshot updated for dirty scope exports.

## Verification Run

- `bun run bench:frame-breakdown -- --frames=3 --warmup=1` — passed.
- `bun run typecheck` — passed.
- `bun test` — 306 passed.
- `bun run check:retained-cleanup` — passed.
- `bun run api:check` — passed and updated `packages/engine/etc/engine.api.md`.
- `git diff --check` — passed after normalizing generated API snapshot whitespace.

## Smoke Benchmark Output

```txt
dashboard-800x600  800×600    p95=9.87 ms
dashboard-1080p    1920×1080  p95=14.14 ms
noop-retained      1920×1080  p95=0.12 ms
dirty-region       1920×1080  p95=10.07 ms
compositor-only    1920×1080  p95=2.18 ms
```

## Instrumented Bottlenecks

Short smoke run, p95 stages:

- `dashboard-1080p`: `ioMs=8.15`, `paintPresentationMs=8.15`, `paintMs=5.14`, `paintBackendEndMs=2.31`, `paintBackendPaintMs=1.40`, `paintNativeSnapshotMs=1.32`.
- `dirty-region`: `ioMs=7.20`, `paintPresentationMs=7.20`, `paintMs=2.44`, `paintBackendEndMs=1.97`, `layoutMs=0.31`, `paintBackendPaintMs=0.26`.
- `compositor-only`: `paintBackendPaintMs=1.98`, `paintMs=1.98`, `paintLayerPrepMs=0.14`.

## Outcome

Scoped dirty invalidation is now in place, but the instrumented run shows the current smoke bottleneck is presentation/I/O, not layout or render graph build. The next slice should separate engine-only vs offscreen/readback vs terminal-present modes and then optimize the presentation path with reliable 300-frame data.
