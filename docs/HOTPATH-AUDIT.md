# Vexart Engine — Hotpath Audit Report

> **Date:** 2026-05-05
> **Scope:** Complete per-frame render pipeline review
> **Goal:** Identify optimization targets ordered by impact

---

## Pipeline Flow (per frame @ 60fps = 16.6ms budget)

```
frame()
  └→ compositeFrame()
       ├─ 1. resetWalkAccumulators()     — clear 10+ Maps/arrays
       ├─ 2. layoutAdapter.beginLayout() — FREE all Flexily nodes
       ├─ 3. walkTree()                  — rebuild entire Flexily tree
       ├─ 4. layoutAdapter.endLayout()   — calculateLayout() + emitNode()
       ├─ 5. writeLayoutBack()           — geometry → TGENodes
       ├─ 6. applyScrollOffsets()        — O(N) descendant mutation
       ├─ 7. updateInteractiveStates()   — sort + hit-test all nodes
       ├─ 8. IF interaction changed → runLayoutPass() AGAIN (steps 2-6!)
       ├─ 9. assignLayersSpatial()       — command → layer assignment
       ├─10. buildRenderGraphFrame()     — commands → render ops
       ├─11. backend.paint()             — pack + FFI → GPU
       └─12. composite + present         — Kitty output
```

---

## Key Files

| File | Role |
|------|------|
| `packages/engine/src/loop/loop.ts` | Render loop coordinator, scheduling |
| `packages/engine/src/loop/walk-tree.ts` | Tree walk + Flexily feeding |
| `packages/engine/src/loop/layout-adapter.ts` | Flexily wrapper, command emission |
| `packages/engine/src/loop/composite.ts` | Frame orchestrator (all steps) |
| `packages/engine/src/loop/paint.ts` | Layer paint dispatch + cleanup |
| `packages/engine/src/loop/layout.ts` | Layout writeback + interaction states |
| `packages/engine/src/ffi/render-graph.ts` | Commands → RenderGraphOps |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | GPU pack + FFI dispatch |
| `packages/engine/src/ffi/text-layout.ts` | Text measurement (Rust FFI) |
| `packages/engine/src/ffi/node.ts` | TGENode, resolveProps, parseSizing |

---

## CRITICAL — Allocations Per Frame

### HP-1: Full Flexily Tree Rebuild Every Frame

**Files:** `layout-adapter.ts:252-264`, `walk-tree.ts`
**Impact:** ~40-60% of frame time in medium UIs
**Effort:** High
**Priority:** P0

**Problem:**

```typescript
beginLayout() {
  for (let i = 0; i < _nodeCount; i++) {
    _allNodes[i].free()   // Destroy EVERY node
  }
  _nodeCount = 0
  _nodeToIndex.clear()    // Clear map
}
```

Then walkTree calls `Node.create()` for EVERY element and text node. For 500 nodes
that's 500 `free()` + 500 `create()` + hundreds of `setPadding/setWidth/setFlexDirection`
— ALL OF THIS EVEN WHEN NOTHING CHANGED.

**Fix: Incremental Layout**

1. **Persist Flexily nodes** — associate each TGENode with its Flexily Node
   permanently. Don't destroy until JSX node unmounts.

2. **Granular dirty tracking** — when `setProp()` changes a layout-affecting value
   (width, padding, gap, etc.), mark that node as "layout-dirty". Visual-only props
   (backgroundColor, shadow) do NOT mark layout-dirty.

3. **Partial recalculation** — instead of `calculateLayout()` on the entire root,
   only recalculate the subtree rooted at the lowest common ancestor of all dirty
   nodes. Flexily supports this via `node.markDirty()` + `calculateLayout()` on root
   (Flexily internally optimizes clean subtrees).

4. **Incremental command emission** — only re-emit `RenderCommand[]` for nodes whose
   position/size changed after layout.

**Tradeoffs:**
- Complexity: High. Must synchronize Flexily Node lifecycle with TGENode, handle
  child reordering, guarantee dirty tracking doesn't miss changes.
- Risk: If a dirty flag is lost, UI freezes with stale layout. Needs a "force full
  layout" escape hatch.
- Gain: Idle frames (scroll, animation, hover) go from ~5ms layout to ~0.1ms.

---

### HP-2: Map Allocations in `endLayout()`

**File:** `layout-adapter.ts:266-388`
**Impact:** 5+ data structure allocations per frame, GC spikes
**Effort:** Low
**Priority:** P1

**Problem:**

```typescript
endLayout(): RenderCommand[] {
  const layoutMap = new Map<number, PositionedCommand>()     // NEW every frame
  const childrenByParent = new Map<number, number[]>()       // NEW every frame
  const scrollContainerIds = new Set<number>()               // NEW every frame
  const textByNodeId = new Map<number, number>()             // NEW every frame
  const cmds: RenderCommand[] = []                           // NEW every frame
}
```

**Fix: Pre-allocate and Reuse**

Elevate these to module-level and `.clear()` at the start instead of creating new:

```typescript
// Module-level (allocated ONCE)
const _layoutMap = new Map<number, PositionedCommand>()
const _childrenByParent = new Map<number, number[]>()
const _scrollContainerIds = new Set<number>()
const _textByNodeId = new Map<number, number>()
const _cmds: RenderCommand[] = []

function endLayout() {
  _layoutMap.clear()
  _childrenByParent.clear()
  _scrollContainerIds.clear()
  _textByNodeId.clear()
  _cmds.length = 0
  // ... use them
}
```

**Note:** `_lastLayoutMap` is already stored as a reference. Since `writeLayoutBack`
reads it before the next `beginLayout`, the module-level Map works. Must verify no
consumer stores a reference beyond the current frame.

**Tradeoffs:**
- Complexity: Very low. Just moving declarations.
- Risk: Low — must ensure nobody holds a reference to `cmds[]` beyond the current frame.
- Gain: Eliminates 5 data structure allocations per frame. Map internals reuse buckets
  between `.clear()` and repopulation.

---

### HP-3: `.slice()` in Pack Functions

**File:** `gpu-renderer-backend.ts:397-465`
**Impact:** ~100-300 Uint8Array allocations per frame
**Effort:** Low
**Priority:** P1

**Problem:**

```typescript
function packShapeRectInstance(...): Uint8Array {
  // writes into shared _packView
  return _packU8.slice(0, 80)  // NEW Uint8Array per rect!
}
```

Every rect, shadow, glow, gradient, image instance creates a new `Uint8Array`.
Then `flushVexartBatch()` copies it AGAIN into the batch buffer. Two copies:
pack → slice → set.

**Fix: Direct Write to Batch Buffer**

Write directly into the batch buffer. Instead of pack → slice → set:

1. Calculate total batch size upfront (we know counts before starting).
2. Ensure `_batchBuf` has enough space.
3. Write each instance directly at its final position in the batch buffer.
4. One `vexart_paint_dispatch()` call at the end with the complete buffer.

```typescript
// Before: 100 rects = 100 .slice() + 100 .set() + 100 FFI calls
for (const rect of rects) {
  const instance = packShapeRectInstance(...)  // slice
  flushVexartBatch(ctx, 1, instance)           // copy + FFI call per rect
}

// After: 100 rects = 1 write pass + 1 FFI call
const total = HEADER + PREFIX + rects.length * 80
const { view } = ensureBatchBuf(total)
let offset = HEADER + PREFIX
for (const rect of rects) {
  writeShapeRectDirect(view, offset, rect)  // direct write, no slice
  offset += 80
}
symbols.vexart_paint_dispatch(ctx, target, ptr(u8), total, ptr(stats))
```

**Tradeoffs:**
- Complexity: Low. Mechanical refactoring.
- Risk: Very low — same bytes, different write location.
- Gain: Eliminates ~100-300 `Uint8Array` allocations/frame + reduces FFI call count
  by batching multiple instances of the same cmd_kind into ONE dispatch.

---

### HP-4: Text Render Buffer Allocations

**File:** `gpu-renderer-backend.ts:866-914`
**Impact:** ~200+ allocations per frame (4 per text node)
**Effort:** Low
**Priority:** P1

**Problem:**

```typescript
function tryMsdfText(...) {
  const textBuf = _msdfEncoder.encode(text)          // NEW per text
  const familiesJson = _msdfEncoder.encode(           // NEW per text
    JSON.stringify([family])                          // JSON.stringify per text!
  )
  const paramsBuf = new Uint8Array(28 + ...)          // NEW per text
  const view = new DataView(paramsBuf.buffer)          // NEW per text
}
```

4 allocations per text node × 50 text nodes = ~200 allocations/frame.

**Fix: Pre-allocate and Cache**

1. **Family JSON cache** — 99% of text uses the same fontFamily. Cache the result
   of `encode(JSON.stringify([family]))` in a `Map<string, Uint8Array>`.

2. **Reusable paramsBuf** — pre-allocate a large buffer (e.g. 4KB) and write there.
   Since `vexart_font_render_text` consumes synchronously and returns, the buffer
   can be reused immediately.

3. **`encodeInto`** — use `TextEncoder.encodeInto(text, buffer)` instead of
   `TextEncoder.encode(text)` to write into a reusable buffer.

```typescript
const _familyCache = new Map<string, Uint8Array>()
const _textParamsBuf = new Uint8Array(4096)
const _textParamsView = new DataView(_textParamsBuf.buffer)
const _textEncodeBuf = new Uint8Array(4096)

function tryMsdfText(...) {
  const { written } = _msdfEncoder.encodeInto(text, _textEncodeBuf)

  let familiesEncoded = _familyCache.get(family)
  if (!familiesEncoded) {
    familiesEncoded = _msdfEncoder.encode(JSON.stringify([family]))
    _familyCache.set(family, familiesEncoded)
  }

  _textParamsView.setFloat32(0, x, true)
  // ...
  _textParamsBuf.set(familiesEncoded, 28)

  sym.vexart_font_render_text(
    vctx, targetHandle,
    ptr(_textEncodeBuf), written,
    ptr(_textParamsBuf), 28 + familiesEncoded.byteLength,
    ptr(_msdfStatsBuf),
  )
}
```

**Tradeoffs:**
- Complexity: Low. `TextEncoder.encodeInto()` exists exactly for this.
- Risk: Must handle text exceeding the pre-allocated buffer (fallback to allocation).
  99% of texts are <1KB.
- Gain: From ~250 allocs/frame to ~5 allocs/frame (only first-time cache misses).

---

## HIGH — Redundant Work

### HP-5: Double Layout Pass on Interaction

**File:** `composite.ts:725-729`
**Impact:** ~2x layout cost on interactive frames (~50% of all frames)
**Effort:** Medium
**Priority:** P0

**Problem:**

```typescript
if (interaction.changed || interaction.hadClick) {
  commands = runLayoutPass(s)  // FULL re-layout!
}
```

Every hover transition or click runs the full pipeline TWICE. walkTree + endLayout +
writeLayoutBack — all repeated. The second pass exists because `hoverStyle` CAN change
`borderWidth` which affects layout. But 95% of the time it only changes
`backgroundColor` or `shadow` — things that do NOT affect layout.

**Fix: Classify Interactive Props**

1. **Visual-only** (no layout impact): `backgroundColor`, `shadow`, `glow`,
   `gradient`, `opacity`, `backdropBlur`, `filter`
2. **Layout-affecting**: `borderWidth`, `padding`, `width`, `height`, `margin`

On interaction change:
- If ONLY visual-only props changed → **skip re-layout**, just mark layer dirty.
- If layout-affecting props changed → re-layout, but only the affected subtree.

```typescript
const interactionPropsAffectLayout = (style: InteractiveStyleProps) => {
  return style.borderWidth !== undefined ||
         style.padding !== undefined ||
         style.width !== undefined
}

if (interaction.changed) {
  const needsRelayout = changedNodes.some(node =>
    interactionPropsAffectLayout(node.props.hoverStyle) ||
    interactionPropsAffectLayout(node.props.activeStyle)
  )
  if (needsRelayout) {
    commands = runLayoutPass(s)
  } else {
    markAffectedLayersDirty(changedNodes)
  }
}
```

**Tradeoffs:**
- Complexity: Medium. The prop classification is static and easy to maintain.
- Risk: Misclassifying a prop (saying visual-only when it affects layout) causes pixel
  shift. Easy to test against.
- Gain: ~95% of interactions (hover only changes color/shadow) go from 6-10ms to 3-5ms.

---

### HP-6: Scroll Offset O(N) Mutation

**File:** `composite.ts:377-387`
**Impact:** Linear with scrolled content size
**Effort:** Medium
**Priority:** P1

**Problem:**

```typescript
// TODO(perf): Store scroll offset on container and apply during paint/hit-test
function applyOffsetToDescendants(container, ox, oy) {
  for (const child of container.children) {
    child.layout.x += ox   // Mutate EVERY descendant
    child.layout.y += oy
    applyOffsetToDescendants(child, ox, oy)
  }
}
```

The code itself has a TODO acknowledging this. A VirtualList with 200 visible + 50
off-screen items = 250 recursive mutations per frame.

**Fix: Lazy Offset Application**

Store the offset on the scroll container and apply it lazily:

1. **Paint phase**: When the renderer reads `cmd.x/cmd.y`, add the scroll ancestor's
   offset. The layout adapter already emits `SCISSOR_START` with container bounds —
   just add the offset to child commands.

2. **Hit-testing**: When comparing `pointer vs node.layout`, subtract the scroll
   container's offset. We already have `node._scrollContainerId` pointing to the
   container.

```typescript
// Instead of mutating layout.x/y:
scrollHandle.offsetX = ox
scrollHandle.offsetY = oy

// In hit-testing:
function getEffectivePosition(node: TGENode) {
  const containerId = node._scrollContainerId
  if (containerId === 0) return { x: node.layout.x, y: node.layout.y }
  const offset = getScrollOffset(containerId)
  return { x: node.layout.x + offset.x, y: node.layout.y + offset.y }
}
```

**Tradeoffs:**
- Complexity: Medium. Must audit all consumers of `node.layout.x/y` to add offset
  lookup (hit-testing, damage rects, layer bounds).
- Risk: Missing a read point means that code sees un-offset positions. Needs
  regression tests.
- Gain: From O(N) per frame to O(1). Significant for large scroll containers.

---

## MEDIUM — Optimization Opportunities

### HP-7: Version-based Map Invalidation

**File:** `composite.ts:271-285`
**Impact:** GC pressure from Map.clear() with many entries
**Effort:** Low-Medium
**Priority:** P2

**Problem:**

`resetWalkAccumulators()` clears 10+ Maps/arrays every frame. `Map.clear()` triggers
GC marking work and the repopulation has hashing overhead for entries that didn't
change.

**Fix: Generation Counter**

```typescript
let currentGeneration = 0
const nodeRefByIdGen = new Map<number, { node: TGENode; gen: number }>()

function beginFrame() {
  currentGeneration++
  // NO clear — old entries are ignored by gen mismatch
}

function registerNode(id: number, node: TGENode) {
  nodeRefByIdGen.set(id, { node, gen: currentGeneration })
}

function getNode(id: number): TGENode | undefined {
  const entry = nodeRefByIdGen.get(id)
  if (!entry || entry.gen !== currentGeneration) return undefined
  return entry.node
}
```

Periodically (every N frames), sweep to remove old entries and free memory.

**Alternative (simpler):** Use flat arrays indexed by `node.id` (already incremental).
O(1) access without hashing, `array.fill(null)` is cheaper than Map.clear().

**Tradeoffs:**
- Complexity: Low-Medium.
- Risk: Memory leak if periodic sweep is missed. Balance cleanup frequency.
- Gain: Eliminates Map.clear() cost + re-insert overhead for unchanged entries.
  ~0.5ms/frame savings with 500 nodes.

---

### HP-8: Cached Depth for Stacking Sort

**File:** `layout.ts:237-284`
**Impact:** O(N log N × d) during sort with floating nodes
**Effort:** Trivial
**Priority:** P2

**Problem:**

```typescript
function depth(node: TGENode) {
  let total = 0
  let current: TGENode | null = node
  while (current) { total++; current = current.parent }
  return total
}
```

Called inside `compareStackingPaintOrder()` as sort comparator. For N floating nodes,
each depth() is O(d) where d = tree depth.

**Fix: Compute During walkTree**

```typescript
// In walkTree, add:
node._depth = parentDepth + 1  // O(1) during walk

// In compareStackingPaintOrder:
function depth(node: TGENode) {
  return node._depth  // O(1) lookup instead of O(d) walk
}
```

**Tradeoffs:**
- Complexity: Trivial. One field + one assignment.
- Risk: Zero. It's a cache of something already computable.
- Gain: Small but free — eliminates O(d) parent walks during sort.

---

### HP-9: Pre-allocate Composite Helper Buffers

**File:** `gpu-renderer-backend.ts:162-198`
**Effort:** Trivial
**Priority:** P2

```typescript
// Before (per-call):
const paramBuf = new Float32Array(8)
const out = new BigUint64Array(1)

// After (module-level singleton):
const _backdropParams = new Float32Array(8)
const _handleOut = new BigUint64Array(1)
```

---

### HP-10: Pre-allocate Region Readback Buffer

**File:** `gpu-renderer-backend.ts:213-237`
**Effort:** Trivial
**Priority:** P2

```typescript
// Before:
const rect = new Uint8Array(16)       // per-call
const statsOut = new Uint8Array(32)   // per-call

// After:
const _regionRect = new Uint8Array(16)
const _regionView = new DataView(_regionRect.buffer)
const _regionStats = new Uint8Array(32)
```

---

### HP-11: Object Pool for RenderGraphOps

**File:** `render-graph.ts:640-679`
**Effort:** Low
**Priority:** P2

Creates new objects for every command. Apply the same pool pattern already used for
`effectPool` in `walk-tree.ts:99`:

```typescript
const rectOpPool: RectangleRenderOp[] = []
let rectOpPoolIdx = 0

function claimRectOp(): RectangleRenderOp {
  if (rectOpPoolIdx < rectOpPool.length) {
    return rectOpPool[rectOpPoolIdx++]
  }
  const op = { kind: "rectangle", renderObjectId: null, command: null!, inputs: null! }
  rectOpPool.push(op)
  rectOpPoolIdx++
  return op
}
```

---

### HP-12: Cache FFI Symbols at Backend Creation

**File:** `gpu-renderer-backend.ts:105-198`
**Effort:** Trivial
**Priority:** P2

```typescript
// Before (per-call indirection):
function vexartCompositeTargetCreate(vctx, width, height) {
  const { symbols } = openVexartLibrary()  // lookup per call
  symbols.vexart_composite_target_create(...)
}

// After (cached at creation):
export function createGpuRendererBackend() {
  const { symbols: sym } = openVexartLibrary()  // ONE lookup

  function targetCreate(vctx, width, height) {
    sym.vexart_composite_target_create(...)  // direct
  }
}
```

---

## Impact Prioritization

| # | Issue | Impact | Effort | Priority |
|---|-------|--------|--------|----------|
| HP-1 | Full Flexily rebuild | ~40-60% frame time | High | P0 |
| HP-5 | Double layout pass | ~2x on interactive frames | Medium | P0 |
| HP-3 | `.slice()` per paint op | ~100-300 allocs/frame | Low | P1 |
| HP-4 | Text render allocs | ~200+ allocs/frame | Low | P1 |
| HP-2 | Map allocs in endLayout | 5+ struct allocs/frame | Low | P1 |
| HP-6 | Scroll O(N) mutation | Linear with content | Medium | P1 |
| HP-7 | Map.clear() GC pressure | GC spikes | Low | P2 |
| HP-8 | Sort depth() walks | Floating node UIs only | Trivial | P2 |
| HP-9 | Backdrop helper allocs | Marginal per-call | Trivial | P2 |
| HP-10 | Region readback allocs | Marginal per-call | Trivial | P2 |
| HP-11 | RenderGraphOp allocs | ~100+ objects/frame | Low | P2 |
| HP-12 | FFI symbol indirection | Marginal per-call | Trivial | P2 |

---

## Recommended Sequence

### Phase A — Quick Wins (P1, low effort, high frequency)
1. **HP-3**: Eliminate `.slice()` in pack functions
2. **HP-4**: Pre-allocate text render buffers
3. **HP-2**: Pre-allocate Maps in `endLayout()`
4. **HP-8**: Cache depth during walkTree

Expected: Eliminate ~300+ allocations per frame with mechanical changes.

### Phase B — Interaction Optimization (P0, medium effort)
5. **HP-5**: Smart re-layout on interaction (classify visual vs layout props)

Expected: Eliminate double layout on ~95% of interactive frames.

### Phase C — Scroll Optimization (P1, medium effort)
6. **HP-6**: Lazy scroll offset application

Expected: O(N) → O(1) for scroll containers.

### Phase D — Architectural Change (P0, high effort)
7. **HP-1**: Incremental Flexily layout

Expected: Idle frame layout from ~5ms to ~0.1ms.

### Phase E — Micro-optimizations (P2, trivial effort)
8. **HP-7, HP-9, HP-10, HP-11, HP-12**: GC reduction, FFI pre-allocation, pools

Expected: Additional ~1-2ms/frame savings.

---

## Expected Outcome

```
            BEFORE                          AFTER
┌─────────────────────────┐    ┌─────────────────────────┐
│ Frame Budget: 16.6ms    │    │ Frame Budget: 16.6ms    │
│                         │    │                         │
│ ██████████ Layout 8ms   │    │ ██ Layout 1.5ms         │
│ ████ Allocs 3ms         │    │ █ Allocs 0.3ms          │
│ ██ Render Graph 1.5ms   │    │ █ Render Graph 0.8ms    │
│ ███ GPU Paint 2ms       │    │ ███ GPU Paint 2ms       │
│ █ Composite 1ms         │    │ █ Composite 1ms         │
│ █ Present 1ms           │    │ █ Present 1ms           │
│ ─── OVERTIME ───        │    │                         │
│ ████ Double Layout 4ms  │    │ (eliminated)            │
│                         │    │ ░░░░░░░░░ Free: ~10ms   │
│ Total: ~20ms            │    │ Total: ~6.5ms           │
└─────────────────────────┘    └─────────────────────────┘
```
