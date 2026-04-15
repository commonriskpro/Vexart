# TGE Engine Fixes After Lightcode Debugging

## Goal

Capture which problems were fixed in the engine itself, which are still app-level workarounds in `examples/lightcode.tsx`, and which engine fixes still need to be implemented.

---

## Engine fixes already implemented

### 1. macOS Kitty file transport is now a first-class path

- Replaced per-frame temp files with a **persistent mmap-backed file transport**.
- Uses Kitty `t=f` with `S`/`O` offsets instead of creating and deleting files every frame.
- This is the correct supported path on macOS now that POSIX shm is blocked by the OS.

### 2. Compression policy is now mode-aware

- Added `compress: "auto"`.
- `file` / `shm` stay raw by default.
- `direct` compresses only when payload size justifies it.
- This avoids burning CPU on zlib where it gives no real win.

### 3. Viewport clipping now exists in the compositor

- The compositor now clips rendered layer geometry to the visible viewport by default.
- This is browser-like behavior: layout may exist outside the viewport, but visible rendering is clipped.
- `viewportClip={false}` remains the explicit opt-out.

### 4. Input invalidation is now smarter

- Removed the old `markDirty()` on every input event.
- Mouse move only invalidates when it can affect visible state:
  - drag / button down
  - pointer capture
  - hover / mouse-reactive nodes in the tree
- Press/release/scroll still repaint immediately.

### 5. Interaction boosts render cadence

- Added a short interaction activity window so recent pointer/scroll activity uses the active frame interval instead of idle cadence.
- This prevents interactive UI from being stuck in the low-FPS idle scheduler.

### 6. `layer` roots without background now get real layout bounds

- Layer roots now receive Clay IDs even when they are not interactive.
- Layout writeback now works for `layer` roots too.
- No-background layer boundaries now use real layout bounds instead of falling back to text-only matching.
- This fixed command leakage from floating layered chrome into the background layer.

---

## App-level workarounds currently living in Lightcode

These are useful for the demo, but they are **not** fundamental engine fixes.

### 1. `partialUpdates: false` in Lightcode

- Lightcode currently disables partial updates because the composition still glitches in this scenario.
- This is a workaround, not a final engine solution.

### 2. Background parallax removed

- Removed because it introduced unnecessary invalidation and noise while debugging.

### 3. Panel tilt removed

- Removed because it caused global mouse-driven invalidation and made drag performance harder to reason about.

### 4. Stage-based profiling harness

- `LIGHTCODE_STAGE` is a debugging harness for isolating performance cliffs.
- Useful, but not part of the renderer contract.

### 5. Optional debug HUD in tree

- Kept behind `LIGHTCODE_SHOW_HUD=1` because a reactive in-tree HUD contaminates profiling.

---

## Engine fixes still pending

These should be solved in the engine so app developers do not need per-demo workarounds.

### 1. Fix `floating + layer + partial updates`

**Problem**

- Lightcode showed that partial patching breaks for certain layered floating compositions.
- The bug was isolated away from viewport movement and from Kitty file transport.

**Why it matters**

- Developers should be able to use floating layered panels without having to disable partial updates manually.

**Needed work**

- Audit `patchRegion()` assumptions vs transformed/floating layer geometry.
- Verify whether patch coordinates are still valid after placement / clipping changes.
- Add a safe engine-level rule to skip partial patching for unsupported layer classes instead of pushing this burden to app code.

---

### 2. Make dirty tracking layer-aware instead of global

**Problem**

- `markDirty()` is still global.
- The engine decides later which layers changed by repainting and comparing buffers.

**Why it matters**

- This is simpler, but still causes extra frame work and weakens predictability under complex UI.

**Needed work**

- Introduce layer- or subtree-scoped invalidation.
- Let reconciler/property changes mark the owning layer or subtree dirty directly.
- Reduce the need to repaint/compare unrelated layers.

---

### 3. Separate layout dirtiness from visual dirtiness

**Problem**

- Some changes require full layout.
- Others only require repaint of an already-known surface.

**Why it matters**

- Today too many changes funnel through the same “dirty” path.

**Needed work**

- Introduce distinct signals for:
  - layout invalidation
  - paint invalidation
  - placement invalidation
- Let the loop choose the cheapest valid path.

---

### 4. Stabilize floating root chrome composition

**Problem**

- Root-floating layered chrome was the first real performance cliff in Lightcode.
- We fixed one real bug (command leakage), but this area is still clearly sensitive.

**Why it matters**

- Root-floating UI is not an edge case. Toolbars, HUDs, popovers, windows, dialogs, and overlays depend on it.

**Needed work**

- Add targeted tests for `floating="root" + layer`.
- Verify placement updates do not unnecessarily dirty background surfaces.
- Confirm command assignment remains stable across repeated frames.

---

### 5. Move performance/debug overlays out of the reactive tree by default

**Problem**

- A reactive in-tree HUD invalidates the scene it is supposed to measure.

**Why it matters**

- Profiling should not change the workload significantly.

**Needed work**

- Provide an engine-supported out-of-band debug overlay path similar to the imperative benchmark overlay.
- Keep tree-based debug overlays only as an explicit opt-in.

---

### 6. Add compositor regression tests for real scenarios

**Problem**

- Several bugs only became obvious while debugging a realistic mock.

**Why it matters**

- These are engine-level regressions and should be caught automatically.

**Needed work**

- Add fixture tests for:
  - floating layered header/footer
  - no-bg layer roots
  - viewport clipping of partially visible layers
  - input invalidation semantics
  - partial patch fallback behavior

---

## Recommended priority order

### P0

1. Fix `floating + layer + partial updates`
2. Stabilize floating root chrome composition

### P1

3. Separate layout dirtiness from paint/placement dirtiness
4. Make dirty tracking layer-aware

### P2

5. Out-of-band engine debug overlay
6. Regression test suite for compositor scenarios

---

## Practical rule for developers right now

Until the pending engine fixes are done:

- Prefer `file` transport on macOS.
- Use `layer` intentionally, not everywhere.
- Treat `floating + layer` as supported but still performance-sensitive.
- Disable partial updates in compositions that still glitch.
- Avoid reactive debug UI inside the same tree when profiling.
