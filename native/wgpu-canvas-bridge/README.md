# TGE WGPU Canvas Bridge

This native bridge is the planned integration point between Bun/FFI and a future native `wgpu`-powered canvas painter backend.

## Implementation approach

The bridge is implemented as a Rust `cdylib` using the `wgpu` crate inside the bridge itself.

Why this approach:

- TGE needs a native cross-platform GPU path.
- Bun in this environment does not expose `navigator.gpu`.
- For a Rust-owned bridge, using `wgpu` directly is the thinnest path to native WebGPU-style rendering while preserving a stable TGE-owned ABI over FFI.

## Current status

- The bridge ABI v1 is implemented and compiles.
- Context creation works.
- Offscreen target creation works.
- Clear render works.
- Full RGBA readback works.
- The command-driven `CanvasPainterBackend` path is NOT wired yet.

## Why this exists

TGE needs a cross-platform native GPU path, but Bun in this environment does not expose `navigator.gpu`.
So the intended direction is:

```txt
Bun/TS renderer
  → bun:ffi
    → native bridge (this crate)
      → Rust `wgpu` native GPU backend
        → RGBA framebuffer
          → Kitty transport
```

## ABI v1 surface

The first stable surface now defined in code covers:

1. bridge version / availability
2. adapter/device initialization
3. offscreen target creation/resizing
4. render-to-RGBA for canvas workloads
5. readback timing/stats
6. global last-error retrieval

See: `docs/tge-wgpu-canvas-bridge-abi-v1.md`

## Smoke test

```bash
bun run scripts/wgpu-bridge-probe.ts
bun run scripts/wgpu-bridge-smoke.ts
```

Expected smoke result:

- bridge probe shows `available: true`
- clear/readback returns a solid RGBA frame

## Build intent

Expected release artifact names:

- macOS: `libtge_wgpu_canvas_bridge.dylib`
- Linux: `libtge_wgpu_canvas_bridge.so`
- Windows: `tge_wgpu_canvas_bridge.dll`

The TypeScript side probes `native/wgpu-canvas-bridge/target/release/` by default, or `TGE_WGPU_BRIDGE_PATH` if set.
