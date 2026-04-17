# TGE GPU-Native End-to-End Redesign

## Goal

Marcar con precisión QUÉ parte del core oficial todavía impide un renderer GPU-native end-to-end real y definir el rediseño exacto que necesitamos antes de reintroducir capacidades quitadas.

Este documento no habla de compat/lab.
Habla del **core oficial**.

---

## Current blocker summary

Hoy el core oficial ya no depende de:

- CPU fallback backend,
- texto raster fallback en `gpu-renderer-backend.ts`,
- canvas raster fallback en `gpu-renderer-backend.ts`,
- subtree transform staging en surfaces.

The original blocker was this model:

```txt
Layer owns RasterSurface
  -> loop paints into raw bytes
  -> backend syncs/composites from raw bytes
  -> output presents raw bytes
```

That model has now been removed from the official layer/loop contract.

What still remains for full cleanliness is mostly separation of official boundary helpers from compat-only raster helpers.

## Verified progress

- `Layer` no longer owns `surface: RasterSurface`
- `updateLayerGeometry()` no longer allocates raw backing memory
- `loop.ts` no longer paints/diffs/transmits from layer-owned raw byte buffers
- `gpu-renderer-backend.ts` no longer allocates `createRasterSurface(...)` for sprite rendering
- subtree transforms now use a GPU-native layer-boundary composition pass

The remaining cleanup now lives around helper/module boundaries, not the central layer model.

## Remaining refinement targets

- `packages/renderer/src/layers.ts`
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/render-surface.ts`

---

## 1. `packages/renderer/src/layers.ts`

## Status

This redesign step is DONE for the official model.

`Layer` sigue siendo dueño de:

```ts
surface: RasterSurface | null
```

Y `updateLayerGeometry()` todavía hace:

```ts
layer.surface = createRasterSurface(w, h)
```

Eso significa que el modelo de layer sigue pensado como buffer raster en memoria, no como backing GPU.

## Result

`Layer` now uses a split model:

```ts
type LayerBackingKind = "gpu" | "raw"

type LayerBacking = {
  kind: LayerBackingKind
  imageId: number
  targetKey: string
  width: number
  height: number
}

type Layer = {
  id: number
  z: number
  x: number
  y: number
  width: number
  height: number
  backing: LayerBacking | null
  dirty: boolean
  damageRect: DamageRect | null
  prevX: number
  prevY: number
  prevW: number
  prevH: number
  prevZ: number
}

`imageId`/`targetKey` now belong to the backing identity, not raw layer memory.
```

`layers.ts` now owns geometry/damage/backing metadata only.
- keep image ID / geometry / damage tracking only

---

## 2. `packages/renderer/src/loop.ts`

## Status

The central loop blocker is also removed from the official path.

`frameLayered()` used to assume each layer owned mutable bytes:

- snapshots `prev = layer.surface.data.slice()`
- clears `layer.surface`
- paints into `layer.surface`
- diffs against `layer.surface.data`
- patches/transmits from `layer.surface.data`

This is the heart of the remaining non-end-to-end model.

## Result

### Replace

```txt
layer.surface owned by loop
  -> clear bytes
  -> paint bytes
  -> diff bytes
  -> upload/present bytes
```

### With

```txt
layer metadata owned by loop
  -> backend paints into GPU target
  -> backend returns presentation result / dirty region metadata
  -> output presents GPU-backed layer result
```

`RendererBackendPaintContext` now carries `targetWidth`, `targetHeight`, and `backing`.

`frameLayered()` now consumes backend-provided raw payloads for presentation instead of diffing/transmitting from layer-owned `RasterSurface` memory.

## New contract needed

The loop should talk to the backend with something like:

```ts
type RendererBackendLayerPaintResult = {
  output: "skip-present" | "raw-layer" | "gpu-layer" | "final-frame-raw"
  dirtyRegion?: DamageRect | null
  gpuLayer?: {
    targetKey: string
    width: number
    height: number
  }
  finalFrame?: RawRgbaFrame
}
```

## Rule

The loop must stop owning pixel memory for normal layer painting.
If raw bytes still appear, they should be explicit boundary payloads, not the loop's default layer state.

---

## 3. `packages/renderer/src/gpu-renderer-backend.ts`

## Status

The sprite allocation blocker is also removed.

`renderOpToImage()` used to create:

```ts
buffer: createRasterSurface(width, height)
```

That means sprite rendering still uses a fake raw surface context even when the actual rendering target is GPU.

It now renders against GPU target dimensions without allocating a temporary `RasterSurface`.

### Target shape

```ts
type RendererBackendGpuContext = {
  viewportWidth: number
  viewportHeight: number
  offsetX: number
  offsetY: number
  targetHandle: WgpuCanvasTargetHandle
}
```

`renderFrame()` should be split so it can render to:

- a layer target,
- a standalone target,
- a sprite target,

without requiring `ctx.buffer` as its main mutable state.

## Remaining issue

The remaining problem is no longer the main paint path, but helper/module boundaries that still talk in raster terms.

The backend now already separates:

### Official rendering path
- paint GPU target
- return raw presentation payload or skip-present strategy

### Explicit raw boundary path
- final frame readback
- diagnostics / screenshots / probes

The official layer path no longer syncs into a `RasterSurface` to satisfy the loop.

---

## 4. `packages/renderer/src/gpu-raster-staging.ts`

## Problem

This module still mixes two categories:

### Legitimate boundary work
- `copyGpuTargetRegionToImage()`
- final readback helpers

### Internal raw-model support
- `uploadRasterDataToTarget()`
- `readbackTargetToSurface()`
- `compositeTargetReadbackToSurface()`
- compat text via `createGpuTextImage()`

## Required redesign

Split it conceptually into two modules:

### `gpu-boundary-io.ts`
- final readback RGBA
- GPU target -> GPU image copy
- explicit diagnostics/screenshot helpers

### `compat-raster-bridge.ts`
- `createGpuTextImage()`
- raw RGBA upload helpers used only by compat/lab

## Rule

If a helper needs `RasterSurface`, it does NOT belong in the official renderer hot path.

---

## 5. `packages/renderer/src/render-surface.ts`

## Problem

`RasterSurface` still reads like a renderer-internal neutral primitive.
That is too central for the architecture we want.

## Required redesign

Downgrade `RasterSurface` to one of these roles only:

- explicit raw boundary payload,
- compat painter backing,
- diagnostics / capture / diff tooling.

It must stop being the normal mental model of frame/layer rendering.

## Rule

The official renderer should speak primarily in:

- GPU target
- GPU image
- GPU layer
- GPU compositor state

and only secondarily in:

- raw RGBA frame

at the final output boundary.

---

## Recommended remaining implementation order

## Phase 1 — Boundary cleanup

1. move `createGpuTextImage()` to compat-only bridge
2. move `uploadRasterDataToTarget()` and raw surface helpers out of the official hot path

## Phase 2 — Naming/contract cleanup

1. stop using the `buffer` compatibility alias in `RendererBackendPaintContext`
2. rename remaining target-size helpers/fields so the official contract talks only in GPU terms

---

## Exit criteria

We can now say the official core path is materially GPU-native end-to-end in architecture, with two caveats:

1. raw RGBA still appears as explicit presentation payloads to Kitty
2. compat/lab helpers still exist in separate modules and should not leak back into the core story

---

## Bottom line

That step is now done.

The next architecture step is to reimplement the missing capabilities (subtree transforms, broader text coverage, unsupported canvas commands) directly on top of the GPU-native core without reintroducing compat raster helpers.
