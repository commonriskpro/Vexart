# TGE GPU Paint Backend Design

## Goal

Definir una ruta realista para agregar un backend GPU opcional a TGE sin reescribir Clay, el árbol JSX, el sistema de input o el transporte Kitty.

La meta inmediata NO es “hacer todo GPU”.
La meta inmediata es:

1. aislar el cuello real (`paint` CPU),
2. introducir un punto de extensión limpio,
3. medir CPU vs GPU con el mismo scene/canvas workload,
4. decidir con datos si conviene avanzar hacia 3D / GPU-first scene rendering.

---

## Current architecture

```txt
JSX / Solid
  → TGENode tree
    → Clay layout
      → RenderCommands / Canvas draw commands
        → CPU raster paint (@tge/pixel + Zig)
          → Kitty image transport (shm/file/direct)
            → Terminal
```

### What is already fast

- Layout / Clay: ~0.1ms class workload in Lightcode stage 1.
- Scheduling: already verified not the limiting factor.

### What is currently expensive

- CPU paint/raster/compositing.
- Then Kitty transport I/O.

### Important constraint

Even with GPU rendering, Kitty/file/shm transport remains the display path.
So GPU can reduce `paint`, but does NOT eliminate terminal upload cost.

---

## Verified performance framing

Clean Kitty/file stage 1 profiling showed approximately:

- Empty stage 1 canvas: paint ~2.45ms
- Static graph background only: paint ~8.03ms
- Background + cached nebula: paint ~11.29ms
- Full stage 1 after static background cache: paint ~14.4ms, total ~18ms, ~49–51 FPS

This means the correct next architectural experiment is a GPU paint backend, not a GPU layout rewrite.

---

## Non-goals (for phase 1)

These are explicitly OUT of scope for the first GPU experiment:

- Replacing Clay layout
- Replacing TGENode / reconciler
- Replacing Kitty transport
- Full 3D scene graph
- GPU text shaping/layout system
- GPU-first compositor for all renderer paths

If we skip these boundaries, the work explodes and we stop learning.

---

## Decision

Introduce an optional `CanvasPainterBackend` abstraction for canvas/scene paint.

Why this seam first:

- Lightcode hotspots are heavily canvas/scene driven.
- `CanvasContext` already has a command buffer.
- GPU raster can consume the same draw commands.
- We can compare CPU and GPU with the same workload.

This is the smallest architectural cut that gives us real evidence.

---

## Target architecture

```txt
CanvasContext commands
  → CanvasPainterBackend
      - cpu (current Zig/software painter)
      - gpu (future Metal/WebGPU/WGPU raster path)
  → RGBA framebuffer
  → existing layer compositor / Kitty transport
```

### Phase 1 scope

Support backend swapping for `CanvasContext` paint only.

### Phase 2 scope

Let higher-level renderer paint paths reuse the same abstraction where it pays.

### Phase 3 scope

If GPU paint proves valuable, evaluate a richer GPU scene path for 3D.

---

## API shape

### Backend contract

```ts
type CanvasPainterBackend = {
  name: string
  paint(buf: PixelBuffer, ctx: CanvasContext, canvasW: number, canvasH: number): void
}
```

### Required renderer controls

- `setCanvasPainterBackend(backend)`
- `getCanvasPainterBackend()`
- `getCanvasPainterBackendName()`

### Rules

- Default backend remains CPU.
- Apps/examples can opt into another backend explicitly.
- If GPU backend is unavailable, engine falls back to CPU without exploding.

---

## Why not “everything GPU” now?

Because it optimizes the wrong layer first.

### Layout is not the problem

- Clay/layout cost is tiny.
- Rebuilding layout on GPU would add huge complexity for almost no measured gain.

### Output is still terminal-bound

- Even perfect GPU paint still ends in Kitty image upload.

### We still need proof

Before building a GPU-first engine, we need to know:

1. how much `paint` actually drops,
2. how expensive readback is,
3. whether the remaining Kitty transport dominates.

---

## GPU experiment matrix

We should compare 3 real modes with the same scene:

### A. CPU baseline

- Current software painter.

### B. GPU paint backend

- Same commands
- GPU raster to texture/framebuffer
- Read back RGBA
- Existing Kitty transport
- Current preferred direction: `wgpu-native` via a thin native bridge, not Metal-only

### C. Future GPU scene/3D backend

- Only after B proves worthwhile.
- This is a separate initiative.

---

## First primitives to migrate

Do NOT start with the whole world.

Start with the highest-value primitives for Lightcode-like scenes:

1. `image`
2. `rect`
3. `linearGradient`
4. `radialGradient`
5. `glow`
6. `line`
7. `bezier`

Second wave:

8. `polygon`
9. `circle`
10. `text`
11. `nebula`
12. `starfield`

### Why this order

- It matches current hotspots.
- It gets us meaningful performance data sooner.
- Text and procedural effects are trickier; don’t block the experiment on them.

---

## Readback reality

This is the architectural trap everyone ignores.

If GPU raster requires expensive CPU readback every frame, some of the gain disappears.

So the experiment MUST measure separately:

- GPU draw time
- GPU → CPU readback time
- Kitty/file/shm transmit time
- total frame time

If readback kills the gain, then the next step is not “force more GPU”, but to rethink surface granularity and caching.

---

## Success criteria

Phase 1 GPU backend is considered promising only if it achieves at least one of these:

1. Lightcode stage 1 total frame time drops enough to sustain **60 FPS stable** in Kitty/file.
2. `paint` cost drops substantially while transport remains acceptable.
3. The architecture proves reusable enough to support a future 3D framebuffer path.

### Failure conditions

Abort or redesign if:

- GPU backend adds major complexity but barely beats CPU.
- readback dominates and erases the paint win.
- backend split leaks GPU assumptions throughout the renderer.

---

## Phase plan

### Phase 0 — done now

- Introduce explicit `CanvasPainterBackend` abstraction.
- Keep CPU backend as default.
- Keep behavior identical.

### Phase 1 — instrumentation + plug point

- Make backend identity observable.
- Allow examples/bench scripts to select backend.
- Keep no-op fallback to CPU.

### Phase 2 — GPU prototype

- Implement a minimal GPU backend for image/rect/gradients/glow.
- Use the same `CanvasContext` commands.
- Produce an RGBA framebuffer.

### Phase 3 — compare on Kitty

- Run Lightcode stage profiles with CPU vs GPU.
- Measure paint/readback/io separately.

### Phase 4 — decide direction

- If it pays: expand primitive coverage and design 3D framebuffer path.
- If not: keep CPU path and focus on smarter caching/dirty regions.

---

## Testing plan

### Required benchmarks

1. Empty canvas baseline
2. Static background only
3. Background + cached nebula
4. Full stage 1
5. Synthetic canvas stress scene

### Metrics to record

- backend name
- paint ms
- readback ms (GPU only)
- io ms
- total frame ms
- steady-state FPS

### Test environments

- Kitty file transport on macOS (current priority)
- Kitty shm if available elsewhere
- direct mode for sanity only

---

## Open questions

1. How thin can the native bridge stay while still keeping Bun/FFI ergonomic?

2. Should GPU backend own text raster, or should text remain CPU in phase 1?

3. Should canvas GPU backend render the whole canvas each frame, or only selected command groups?

4. Can static GPU-rendered subscenes be cached as RGBA surfaces before Kitty upload?

### Current implementation note

- `packages/renderer/src/wgpu-canvas-bridge.ts` probes an optional native bridge library.
- `native/wgpu-canvas-bridge/` contains the initial bridge scaffold.
- The bridge implementation is a Rust `cdylib` using native `wgpu` inside the bridge while preserving a TGE-owned FFI ABI.
- The bridge now supports context create, offscreen target create, clear render, and RGBA readback.
- The next missing step is mapping `CanvasContext` draw commands onto that GPU path.

---

## Recommendation

Proceed with **GPU paint backend first**, not “everything GPU”.

That path:

- attacks the measured bottleneck,
- preserves the engine architecture,
- produces trustworthy benchmarks,
- and keeps the door open for 3D without committing to a full rewrite prematurely.
