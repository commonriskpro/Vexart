# Engine Optimization Plan

Structured migration plan to fix every performance issue, dead code instance, and architectural inconsistency found in the engine/runtime audit.

## Status key

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done

---

## Phase 1 — Per-Frame Allocation Elimination

**Goal:** Zero garbage-collected allocations in the hot render path (frame → paint → output).

### 1.1 WGPU Canvas Bridge — Staging Buffer Pool

**Problem:** 41 `new Float32Array` / `new Float64Array` allocations across 13+ render functions in `wgpu-canvas-bridge.ts`. Every draw call allocates two typed arrays that get GC'd next frame.

**Fix:**
- [ ] Create a `StagingBufferPool` at bridge context creation time
- [ ] Pre-allocate one `Float32Array(16384)` and one `Float64Array(64)` as reusable staging buffers
- [ ] Each render function calls `pool.getFloat32(requiredLength)` which returns a subarray view if it fits, or grows the backing buffer (doubling) if not
- [ ] Stats `Float64Array(3)` uses a single persistent instance — reset to zero before each call
- [ ] No `new` in any render function body

**Files:** `packages/core/src/wgpu-canvas-bridge.ts`
**Impact:** Eliminates ~41 typed array allocations per frame

---

### 1.2 GPU Renderer Backend — Hoist renderFrame Locals

**Problem:** Every `renderFrame()` call (once per dirty layer per frame) allocates 6 arrays + 3 Maps at lines 853–861.

```typescript
// CURRENT — allocates every call
const rects: WgpuCanvasRectFill[] = []
const shapeRects: WgpuCanvasShapeRect[] = []
const shapeRectCorners: WgpuCanvasShapeRectCorners[] = []
const linearGradients: ... = []
const radialGradients: ... = []
const glows: WgpuCanvasGlow[] = []
const imageGroups = new Map<bigint, ...>()
const glyphGroups = new Map<bigint, ...>()
const transformedImageGroups = new Map<bigint, ...>()
```

**Fix:**
- [ ] Hoist all 9 collections to the `createGpuRendererBackend` closure scope
- [ ] At the top of `renderFrame`, reset: `rects.length = 0`, `shapeRects.length = 0`, etc. for arrays; `.clear()` for Maps
- [ ] Same for `transientFullFrameImages` (line 946), `tempGlyphs` (line 1481), `dirtyRects` (line 1482)

**Files:** `packages/core/src/gpu-renderer-backend.ts`
**Impact:** Eliminates ~12 allocations per layer per frame (N layers × 12 → 0)

---

### 1.3 Cache Keys — Replace JSON.stringify with Template Literals

**Problem:** Two `JSON.stringify` calls in the hot path (lines 622 and 740) allocate strings with `Array.from(Float64Array)` conversion.

```typescript
// CURRENT — line 622 (canvas sprite key)
const key = JSON.stringify({ fnId, width, height, viewportX, viewportY, viewportZoom })

// CURRENT — line 740 (transform sprite key)
const key = JSON.stringify({ kind, command, width, height, transform: Array.from(op.effect.transform ?? []), opacity })
```

**Fix:**
- [ ] Canvas sprite key: `` `${fnId}:${width}:${height}:${viewportX}:${viewportY}:${viewportZoom}` ``
- [ ] Transform sprite key: `` `${kind}:${command}:${width}:${height}:${hashMatrix(op.effect.transform)}:${opacity}` ``
- [ ] Implement `hashMatrix(m: Float64Array | undefined): number` — a simple FNV-1a over the 9 float values, returning a u32. Zero allocations.

**Files:** `packages/core/src/gpu-renderer-backend.ts`
**Impact:** Eliminates 2 `JSON.stringify` + 2 `Array.from` per effect per frame

---

### 1.4 Render Graph — Allocation-Free State IDs

**Problem:** `getEffectStateId` (line 354) builds a 14-segment string with `.join(";")`. `getTransformStateId` (line 351) does `Array.from(matrix).join(",")`. `getClipStackStateId` (line 387) does `.map().join(">")`. `cloneRenderGraphQueues` (line 206) does 3x `.slice()`.

**Fix:**
- [ ] `getEffectStateId`: replace `.join(";")` with template literal — single string interpolation instead of array→join
- [ ] `getTransformStateId`: replace `Array.from(matrix, fn).join(",")` with manual concatenation of 9 values — no intermediate array
- [ ] `getClipStackStateId`: replace `.map().join(">")` with a `for` loop appending to a string
- [ ] `cloneRenderGraphQueues`: pass index ranges (start, end) into the original arrays instead of slicing. The consumer iterates linearly — it never needs ownership of the copy

**Files:** `packages/core/src/render-graph.ts`
**Impact:** Eliminates ~50 array allocations per frame (one per effect + 3 per layer)

---

### 1.5 Loop — Eliminate Per-Frame Sort and Filter Chains

**Problem:**
- Line 2114: `slot.cmdIndices.slice().sort(...)` — allocates + sorts per layer per frame. Indices are already pushed in ascending order by `assignLayersSpatial`.
- Lines 2007–2013: `preparedSlots.map(...)`, `.filter(...)` chains allocate intermediate arrays
- Line 2159: `new Set(preparedSlots.map(...))` — array + Set allocation

**Fix:**
- [ ] Remove the `.slice().sort()` at line 2114 — `cmdIndices` are already sorted by construction
- [ ] Replace `.map()` + `.filter()` chains at 2007–2013 with a single `for` loop computing `dirtyRects`, `dirtyLayerCount`, `dirtyPixelArea`, `overlapPixelArea` in one pass
- [ ] Replace `new Set(preparedSlots.map(...))` at 2159 with a `for` loop checking membership against a reusable Set cleared per frame

**Files:** `packages/runtime/src/loop.ts`
**Impact:** Eliminates ~4 intermediate arrays + 1 Set per frame

---

### 1.6 Pointer Capture — Index by ID

**Problem:** `rectNodes.find(n => n.id === capturedNodeId)` at line 1472 — linear scan over all interactive nodes on every frame during pointer capture (drag operations).

**Fix:**
- [ ] Maintain a `Map<number, RectNode>` (or simple object lookup) built once when `rectNodes` is populated, cleared each frame
- [ ] Replace `.find()` with `rectNodeById.get(capturedNodeId)` — O(1)
- [ ] Same fix for `rectNodes.find(n => n._hovered ...)` at line 1604 if it's in the hot path

**Files:** `packages/runtime/src/loop.ts`
**Impact:** O(N) → O(1) per frame during drag (N = number of interactive nodes)

---

### 1.7 Stats Provider — Incremental Byte Tracking

**Problem:** `gpuRendererBackendStatsProvider` (lines 515–532) calls `Array.from(map.values()).reduce(...)` for 6 different caches. If debug overlay queries every frame: 6 temporary arrays + 6 reduce iterations per frame.

**Fix:**
- [ ] Maintain a mutable `stats` object in the backend closure with `layerTargetBytes`, `canvasSpriteBytes`, etc.
- [ ] On cache insert: `stats.canvasSpriteBytes += w * h * 4`
- [ ] On cache evict: `stats.canvasSpriteBytes -= w * h * 4`
- [ ] Stats provider returns the pre-computed object directly — zero iteration

**Files:** `packages/core/src/gpu-renderer-backend.ts`
**Impact:** Eliminates 6 `Array.from` + 6 `reduce` allocations when debug overlay is active

---

## Phase 2 — Dead Code Elimination

**Goal:** Remove every function, type, and file that exists only for the deleted CPU raster / compat-canvas paths.

### 2.1 Delete Dead Files

- [ ] Delete `packages/core/src/damage-tracker.ts` — CPU pixel diff (`buffersEqual`, `findDirtyRegion`, `extractRegion`). Only used by the old software renderer.
- [ ] Remove from `packages/core/src/index.ts` if exported

### 2.2 Gut deleted raster staging helpers

- [ ] Delete `readbackTargetToSurface` (line 89)
- [ ] Delete `compositeReadback` (line 112)
- [ ] Delete `compositeRegionReadback` (line ~125)
- [ ] Delete `compositeTargetReadbackToSurface` (line 141)
- [ ] Delete `uploadRasterDataToTarget` (line 65)
- [ ] Keep only `copyGpuTargetRegionToImage` and `createEmptyGpuImage` — the 2 functions actually called from the GPU path

### 2.3 Gut render-surface.ts

- [ ] Delete `compositeSurfaceOnBlack` — CPU raster composite
- [ ] Evaluate if `createRasterSurface` / `clearRasterSurface` / `RasterSurface` type are still needed anywhere. If only dead callers use them → delete entirely

### 2.4 Gut frame-presenter.ts

- [ ] Delete `canUsePartialUpdates` — references non-existent `viewportClip` prop, never called
- [ ] Delete `clearRectRegion` — CPU fill loop on RasterSurface, no callers
- [ ] If the file becomes empty or only contains types, collapse remaining types into the caller

### 2.5 Clean layer-planner.ts

- [ ] Delete `claimScissorCommands` — stub never completed, loop.ts has its own complete implementation
- [ ] Delete `findLayerBoundaries` — loop.ts has a diverged version with different signature. Keep only the loop.ts version.
- [ ] If only `resolveNodeByPath` and `collectAllTexts` remain, consider inlining them into loop.ts and deleting the file

### 2.6 Clean loop.ts Dead Code

- [ ] Delete `buffersEqual`, `findDirtyRegion`, `extractRegion` at lines 2411–2477 — duplicates of damage-tracker.ts, never called

### 2.7 Fix renderer-backend.ts Default

- [ ] Change `getRendererBackendName()` default from `"cpu-legacy"` to `"none"` (or throw)

---

## Phase 3 — Architectural Fixes

**Goal:** Resolve structural inconsistencies that cause confusion, duplication, or future bugs.

### 3.1 Canvas Sprite Cache — Fix Eviction

**Problem:** `clearCanvasSpriteCache()` called unconditionally at line 1656 in `beginFrame`. Every canvas sprite is destroyed and recreated every frame. The LRU (MAX_GPU_CANVAS_SPRITES=64) never functions.

**Fix:**
- [ ] Remove `clearCanvasSpriteCache()` from `beginFrame`
- [ ] Implement per-frame usage tracking: before each frame, set `usedThisFrame = false` on all entries. During `getCanvasSprite`, set `usedThisFrame = true`.
- [ ] After `endFrame`, evict entries where `usedThisFrame === false` AND `age > N frames` (e.g., 3 frames of non-use). This handles canvas nodes that appear/disappear while keeping persistent ones cached.
- [ ] Keep the MAX_GPU_CANVAS_SPRITES LRU as a hard cap

**Files:** `packages/core/src/gpu-renderer-backend.ts`
**Impact:** Eliminates GPU image destroy/recreate cycle for every canvas every frame

---

### 3.2 Strategy Decision — Unify

**Problem:** `chooseGpuLayerStrategy` in `gpu-layer-strategy.ts` and `applyStrategyHysteresis` in `gpu-renderer-backend.ts` both decide the rendering mode with overlapping logic and different thresholds.

**Fix:**
- [ ] Move `applyStrategyHysteresis` logic INTO `chooseGpuLayerStrategy`, adding `lastStrategy` and `framesSinceChange` as inputs
- [ ] `gpu-renderer-backend.ts` calls the unified function — one decision point
- [ ] Delete `applyStrategyHysteresis` from the backend

**Files:** `packages/core/src/gpu-layer-strategy.ts`, `packages/core/src/gpu-renderer-backend.ts`

---

### 3.3 Layer Planner — Complete or Collapse

**Problem:** `layer-planner.ts` was a partial extraction from `loop.ts`. Two diverged `findLayerBoundaries` exist. Loop doesn't use the planner's version.

**Fix:**
- [ ] If `resolveNodeByPath` and `collectAllTexts` are small and only used in loop.ts, inline them and delete `layer-planner.ts` entirely
- [ ] If keeping the file, delete the diverged `findLayerBoundaries` and `claimScissorCommands`
- [ ] Update `loop.ts` imports accordingly

**Files:** `packages/core/src/layer-planner.ts`, `packages/runtime/src/loop.ts`

---

### 3.4 Global Mutable State — Scope to Loop Instance

**Problem:** `layers.ts` (`layers` Map, `nextLayerId`) and `dirty.ts` (`dirty`, `dirtyLogCount`) use module-level globals. Only one render loop can ever exist.

**Fix:**
- [ ] `dirty.ts`: export `createDirtyTracker()` returning `{ markDirty, isDirty, clearDirty }`. The loop creates its own instance in `createRenderLoop`.
- [ ] `layers.ts`: export `createLayerStore()` returning the layer API. The loop creates its own instance.
- [ ] Keep the existing exported functions as thin wrappers over a default instance for backward compatibility during migration. Mark with `@deprecated`.

**Files:** `packages/runtime/src/dirty.ts`, `packages/core/src/layers.ts`, `packages/runtime/src/loop.ts`

---

### 3.5 Renderer Backend Interface — Decide

**Problem:** `RendererBackend` interface exists for extensibility but only one implementation exists. The interface adds indirection without value.

**Fix (Option A — Keep interface, document):**
- [ ] Add JSDoc documenting it as an extension point for future backends (e.g., WebGL, Vulkan)
- [ ] Type-narrow the backend reference inside loop.ts to avoid repeated null checks

**Fix (Option B — Remove interface, inline):**
- [ ] Replace `getRendererBackend()` calls in loop.ts with direct `gpuRendererBackend.paint()` calls
- [ ] Remove `renderer-backend.ts` — types and the creation function live in `gpu-renderer-backend.ts`
- [ ] Saves ~20 lines of glue and one level of indirection per frame

**Recommendation:** Option A is safer. The interface is cheap and the indirection cost is negligible compared to the real bottlenecks above. Document it, don't remove it.

**Files:** `packages/core/src/renderer-backend.ts`

---

## Phase 4 — Validation

- [ ] `bun typecheck` — zero errors
- [ ] `bun --conditions=browser run examples/showcase.tsx` — renders correctly
- [ ] `bun --conditions=browser run examples/windowing-demo.tsx` — drag/resize/minimize work
- [ ] Profile a 60fps drag with `TGE_PROFILE=1` — confirm zero typed array allocations per frame in the staging buffer path
- [ ] Measure frame time before/after — target: <4ms average

---

## Summary

| Phase | Items | Estimated LOC changed | Impact |
|-------|-------|----------------------|--------|
| 1 — Allocations | 7 tasks | ~300 | Direct perf: eliminates ~70+ GC-tracked allocations per frame |
| 2 — Dead code | 7 tasks | -400 (deletions) | Clarity: removes 400 lines of CPU raster code |
| 3 — Architecture | 5 tasks | ~150 | Correctness: fixes cache eviction, strategy duplication, global state |
| 4 — Validation | 5 checks | 0 | Confidence: proves nothing broke |

**Total: 24 tasks.** Phases 1 and 2 are independent and can run in parallel. Phase 3 depends on Phase 2 (some files are deleted first). Phase 4 runs after all others.
