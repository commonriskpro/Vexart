# TGE GPU Output Path Plan

## Goal

Move TGE toward a more GPU-first output path by reducing CPU-side materialization between WGPU readback and Kitty transmission.

This document defines the next concrete cut after the current hybrid canvas backend work.

---

## What we learned already

Current hybrid WGPU path on supported scenes looks like this:

```txt
WGPU render target
  → readback RGBA bytes
    → write into PixelBuffer.data
      → Kitty layer compositor transmit
```

This is already better than:

```txt
WGPU render target
  → readback RGBA bytes
    → temp PixelBuffer
      → CPU over(...)
        → Kitty transmit
```

But it still means the WGPU path must conform to a CPU-buffer-oriented API boundary.

---

## Constraint: Kitty is not GPU-native

Kitty graphics protocol accepts:

- RGBA/RGB bytes
- file payloads
- shm payloads

It does **not** accept:

- Metal textures
- WGPU texture handles
- GPU memory references

So the correct design goal is **not** “GPU all the way into Kitty”.

The correct design goal is:

> Keep the frame on GPU as long as possible, then cross into CPU-visible bytes **once**, as late as possible, in the most output-friendly form.

---

## New output primitives added

The following raw output primitives now exist:

### `kitty.transmitRaw()`

Transmit raw RGBA/RGB bytes directly without requiring a PixelBuffer-shaped API upstream.

### `kitty.transmitRawAt()`

Transmit and place raw bytes directly at terminal cell coordinates.

### `LayerComposer.renderLayerRaw()`

Render a layer from raw RGBA bytes without constructing a PixelBuffer wrapper upstream.

These primitives are the first architectural seam for a more GPU-first output flow.

---

## Near-term experimental route (recommended)

### Experiment C.1 — WGPU readback → Kitty raw full-frame transmit

```txt
WGPU render target
  → readback RGBA bytes
    → kitty.transmitRawAt(...)
```

Use this in a dedicated benchmark/demo to compare against:

- existing layer path using PixelBuffer wrappers
- existing CPU path

### Why this experiment matters

It tells us whether removing the PixelBuffer-oriented output boundary produces measurable wins.

---

## Medium-term route

### Experiment C.2 — WGPU readback subregion → Kitty patchRegion

```txt
WGPU render target
  → read back dirty subregion only
    → kitty.patchRegion(...)
```

This is more aligned with a GPU-first compositor because it avoids retransmitting the full frame when only part of the scene changed.

### Requirements

- persistent image IDs
- target persistence across frames
- dirty region tracking on the WGPU side
- subregion readback support

---

## Longer-term route

### C.3 — GPU-aware layer compositor

Replace the layer boundary from:

```txt
PixelBuffer → layer composer
```

to something closer to:

```txt
GPU render result | raw RGBA bytes → layer composer
```

Potential future shape:

- `renderLayerRaw(...)`
- `patchLayerRaw(...)`
- explicit target/image/frame ownership

---

## Implementation order

### Step 1 — done

- add raw Kitty transmit APIs
- add raw layer-composer entrypoint

### Step 2 — next

Build a controlled benchmark/example that uses:

- WGPU render target
- readback bytes
- `transmitRawAt(...)`

and compare it against the current path.

### Step 3

If it wins or even breaks even with less CPU overhead, prototype:

- persistent raw layer path
- subregion patch path

### Step 4

Only then consider deeper loop integration.

---

## Success criteria

The route is promising if one of these happens:

1. end-to-end transmit time decreases versus the current PixelBuffer-shaped path
2. CPU time in the output boundary decreases enough to matter in Lightcode-like scenes
3. the design enables patch/subregion transmission cleanly

---

## Recommendation

Proceed with **Experiment C.1** next:

> WGPU readback → `kitty.transmitRawAt()` benchmark/demo

That is the smallest real experiment that tests whether the new output seam is worth integrating into the main loop.
