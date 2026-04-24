# Baseline: Phase 2b — Native Presentation

## Captured Baseline

Command:

```sh
bun --conditions=browser run scripts/perf-baseline.tsx
```

Environment:

- Date: 2026-04-23
- Terminal context: Kitty session confirmed by user
- Scene: `dashboard-800x600`
- Mode: offscreen render-to-buffer benchmark
- Frames: 5 measured, 2 warmup

Result:

| Metric | Value |
|---|---:|
| Total time | 73.642916 ms |
| Avg frame | 14.7285832 ms |
| Regression threshold (+30%) | 19.14715816 ms |

Baseline file:

- `scripts/perf-baseline.json`

## Current Rust -> JS RGBA Transfer Points

These are the current normal-presentation hot spots that Native Presentation must remove from the default terminal path.

### Layer paint readback

- `packages/engine/src/ffi/gpu-renderer-backend.ts:2233`
- Calls `vexartCompositeReadbackRgba(vctx, targetHandle, ctx.targetWidth * ctx.targetHeight * 4)`.
- Returns `rawLayer.data` as a `Uint8Array` to JavaScript.

### Final-frame readback

- `packages/engine/src/ffi/gpu-renderer-backend.ts:2298`
- Calls `vexartCompositeReadbackRgba(vctx, targetHandle, frame.viewportWidth * frame.viewportHeight * 4)`.
- Returns `finalFrame.data` as a `Uint8Array` to JavaScript.

### Layer presentation from JavaScript

- `packages/engine/src/loop/paint.ts:580-593`
- Consumes `paintResult.kittyPayload.data` and calls `layerComposer.renderLayerRaw(...)`.

### Final-frame presentation from JavaScript

- `packages/engine/src/loop/paint.ts:617-628`
- Consumes `frameResult.finalFrame.data` and calls `layerComposer.renderFinalFrameRaw(...)`.

### TS Kitty transmission

- `packages/engine/src/output/layer-composer.ts:103-119`
- Calls `kitty.transmitRawAt(...)` with raw RGBA data from JavaScript.

### Existing native frame emitter not wired as default

- `packages/engine/src/output/kitty.ts:469-476`
- `transmitFrameNative(...)` calls `vexart_kitty_emit_frame(...)`.
- This wrapper exists, but current normal presentation still routes through the raw JS payload path above.

## Pending Baselines

These remain required before implementation is considered fully baseline-complete:

- Terminal showcase baseline with native terminal output path.
- Heavy text scene baseline.
- Glass/effects scene baseline.
- Scrolling scene baseline.
- Interaction latency baseline.
- FFI call count per frame.
- JS allocation per terminal-presented frame.
- Current Kitty encode/write time in the TS presentation path.

The existing offscreen benchmark is useful as a regression guard, but it does not measure terminal SHM presentation cost. Phase 1 implementation must compare native presentation against a terminal-output baseline before default cutover.

## 2026-04-23 Attempted Terminal Baseline

Command attempted:

```sh
TGE_DEBUG_KITTY=1 VEXART_DEBUG_NATIVE_PRESENTATION=1 TGE_EXIT_AFTER_MS=3000 bun --conditions=browser run examples/showcase.tsx
```

Result: blocked before rendering because the current API shell does not answer the active Kitty graphics probe, even though `TERM=xterm-kitty` is set. The runtime correctly set `kittyGraphics=false` and exited with `TGE GPU-only renderer requires a terminal with Kitty graphics support`.

Terminal-output baselines still require an interactive terminal session that returns the Kitty graphics probe OK response.
