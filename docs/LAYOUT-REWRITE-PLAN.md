# Layout Pipeline Rewrite — Big Bang Plan (A')

**Objective**: Replace the 8-pass immediate-mode layout/paint pipeline with a
2-pass retained pipeline. Eliminate 36 parallel arrays, `_layoutMap`,
`writeLayoutBack`, and the `RenderCommand → RenderGraphOp` wrapping layer.
Zero observable behavior change.

**Surface area**: 10 production files (~5,578 LOC), 12 test suites (~3,184 LOC).

**Invariant**: `bun run showcase` renders identically before and after.
`bun run test` and `bun run typecheck` pass green.

---

## Phase 0 — Pre-Flight & Design Decisions

Resolve architectural questions before any code changes. Each decision is
documented inline so sub-agents have unambiguous guidance.

### 0.1 Atomicity Strategy

- [ ] **Decision**: How to prevent half-written `node.layout` on Flexily/Grid error.
- **Chosen approach**: Snapshot-and-restore. Before pass 1, snapshot every
  `node.layout` rect into a flat `Float64Array` (4 floats × N nodes). If
  `calculateRoots()` or the traversal throws, restore from snapshot atomically.
  This preserves the current guarantee that a failed frame leaves `node.layout`
  untouched.
- **Why not two-phase commit**: Writing to a temp buffer and copying back adds the
  same O(N) copy that we're trying to eliminate. Snapshot-restore only pays the
  restore cost on the error path (rare).

### 0.2 Unified Op Type

- [ ] **Decision**: What replaces `RenderCommand` + `RenderGraphOp`.
- **Chosen approach**: Keep the `RenderGraphOp` discriminated union as the single
  op type. `RenderCommand` (flat numeric record) is deleted. The DFS emits
  `RenderGraphOp` directly — `RectangleRenderOp`, `TextRenderOp`,
  `BorderRenderOp`, etc.
- Clip state (currently maintained by `buildRenderGraphFrame`'s `clipStack`) is
  computed inline during DFS using a context stack passed through recursion.

### 0.3 syncVisualPropsToCommands Migration

- [ ] **Decision**: How visual-only updates work without `RenderCommand[]`.
- **Chosen approach**: On layout-clean frames, `syncVisualProps` iterates the
  retained `RenderGraphOp[]` from the last frame (stored in layer slots). It
  mutates op fields (`color`, `cornerRadius`, `borderWidths`) in-place using
  `resolveProps(node)`, same as today but on the unified type.

### 0.4 Stacking Sort in DFS

- [ ] **Decision**: How to emit children in correct z-order during a single DFS.
- **Chosen approach**: Before recursing into children, pre-sort `node.children`
  by `(isFloating, zIndex, siblingIndex)` — same comparator as current
  `sortedChildIndices()`. Root-attached floating nodes are collected in a
  deferred list and emitted after the root traversal completes.

### 0.5 Scroll Offset Application (Pass 2)

- [ ] **Decision**: How the post-order scroll pass works.
- **Chosen approach**: Pass 1 emits ops in document coordinates. Pass 2 is a
  lightweight post-order walk that:
  1. Computes content extents per scroll container (max child bottom/right).
  2. Clamps scroll handles.
  3. Builds compounded scroll offset map.
  4. Applies offsets to `op.x` / `op.y` for ops inside scroll containers.
  This is essentially today's `applyScrollOffsets` but operating on
  `RenderGraphOp[]` instead of `RenderCommand[]`.

### 0.6 Layer Routing Strategy

- [ ] **Decision**: How ops are assigned to layers without a separate `assignLayersSpatial` pass.
- **Chosen approach**: During DFS, maintain a layer context stack. When entering a
  node with `_autoLayer` or a scroll container boundary, push a new
  `LayerSlot` onto the stack. Ops are emitted directly into
  `activeSlot.ops[]`. Scissor start/end are tracked as layer boundaries on the
  stack rather than emitted as sentinel commands.

---

## Phase 1 — Scaffolding & New Types

Build the new pipeline structures alongside the old ones. No behavioral change
yet — old pipeline still runs.

- [ ] **1.1** Create `packages/engine/src/loop/pipeline-types.ts`:
  - `PipelineContext`: carries clip stack, layer stack, scroll container stack,
    coordinate accumulator, stacking sort comparator.
  - `FrameSnapshot`: the `Float64Array` layout snapshot for atomicity.
  - `LayerOpBucket`: typed container for `RenderGraphOp[]` per layer slot.
  - Export helper: `snapshotLayouts(nodes) → FrameSnapshot`.
  - Export helper: `restoreLayouts(nodes, snapshot) → void`.

- [ ] **1.2** Define the unified clip context:
  - `ClipEntry`: `{ x, y, width, height, nodeId }`.
  - `pushClip(ctx, entry)` / `popClip(ctx)` / `getCurrentClipBounds(ctx)`.
  - Port the clip logic from `render-graph.ts:690-698` into this module.

- [ ] **1.3** Define the layer routing context:
  - `LayerContext`: stack of active `LayerOpBucket`s.
  - `pushLayer(ctx, boundary)` / `popLayer(ctx)` / `emitOp(ctx, op)`.
  - `emitOp` routes to the top-of-stack bucket.

- [ ] **1.4** Create `snapshotLayouts` / `restoreLayouts` utilities with unit test.

---

## Phase 2 — New Traversal: Pass 1 (Pre-Order DFS)

The core rewrite. A single DFS function that replaces `walkTree` array
population + `endLayout` + `writeLayoutBack` + `buildRenderGraphFrame`.

- [ ] **2.1** Create `packages/engine/src/loop/pipeline-traverse.ts`:
  - Function `traverseFrame(root, state, ctx): TraversalResult`.
  - Entry point:
    1. Call `snapshotLayouts()`.
    2. Run Flexily `calculateRoots()`.
    3. Pre-order DFS over `TGENode` tree.
    4. On error: `restoreLayouts()` + return failure.

- [ ] **2.2** Per-node DFS logic (inside `traverseFrame`):
  - Read computed layout from `node._flexNode` (`getComputedLeft()`, etc).
  - Compute absolute position: parent absolute offset + flex computed offset.
  - Write directly to `node.layout` `{ x, y, width, height }`.
  - Compute `node._transform` and `node._transformInverse` (port from
    `layout.ts:191-224`).
  - Compute `node._accTransform` (port from `layout.ts:255-303`).
    Note: parent's transform is guaranteed computed because we're pre-order.
  - Compute damage rects if layout changed (port from `layout.ts:125-146`).
  - Set `node._dfsIndex`, `node._depth`, `node._scrollContainerId`.
  - Handle image decoding (`decodeImageForNode`) and canvas execution
    (`props.onDraw`) — port from `walk-tree.ts:307,383-398`.
  - Handle auto-layer heuristic — port from `walk-tree.ts:230-249`.
  - Handle viewport culling — port from `walk-tree.ts:580-607`.

- [ ] **2.3** Stacking-sorted child recursion:
  - Before recursing, sort `node.children` by
    `(isFloating, zIndex, siblingIndex)`.
  - Root-attached floating nodes: collect in `deferredRootFloats[]`,
    traverse after main tree DFS completes.
  - Port floating resolution logic from `layout-adapter.ts:556-604`
    (`resolveAbsolute` for floating attach points).

- [ ] **2.4** Op emission during DFS:
  - Emit `RectangleRenderOp` for background (port from `emitNode` `CMD.RECTANGLE`).
  - Push clip for scroll containers (`pushClip`).
  - Recurse children (sorted).
  - Emit `BorderRenderOp` after children (preserves current border-over-children
    behavior — compensatory pattern #3).
  - Pop clip after children.
  - Emit `TextRenderOp`, `ImageRenderOp`, `CanvasRenderOp`, `EffectRenderOp`
    as appropriate.
  - For effects: resolve `effect.transform` inline using `node._transform`
    (eliminates compensatory pattern #1 — no more zero-filled placeholder).
  - All ops go through `emitOp(layerCtx, op)` → routed to active layer bucket.

- [ ] **2.5** Layer boundary management during DFS:
  - On entering a node with `_autoLayer` or scroll boundary:
    `pushLayer(layerCtx, boundary)`.
  - On exit: `popLayer(layerCtx)`.
  - Scissor claiming for scroll containers is handled by clip context, not
    sentinel commands.
  - Assign `node._layerKey` during traversal (port from
    `assign-layers.ts:188-194`).

- [ ] **2.6** Populate `WalkTreeState` outputs that other systems consume:
  - `rectNodes`, `textNodes`, `boxNodes`: filled during DFS.
  - `nodeRefById`, `rectNodeById`: filled during DFS.
  - `scrollContainers`, `layerBoundaries`: filled during DFS.
  - Interactive state sorting (`sortNodesByStackingPaintOrder`) stays as-is —
    it's a separate hit-test concern.

---

## Phase 3 — New Traversal: Pass 2 (Scroll Offsets)

Post-order pass that resolves scroll geometry and shifts op coordinates.

- [ ] **3.1** Create `packages/engine/src/loop/pipeline-scroll.ts`:
  - Function `applyScrollOffsetsToOps(layerBuckets, scrollContainers, state)`.
  - For each scroll container:
    1. Compute content extents from child `node.layout` rects (all
       `node.layout` values are final after pass 1).
    2. Clamp scroll handle position.
    3. Compute compounded scroll offset.
  - Walk all ops in affected layer buckets, apply `op.x += offset.x`,
    `op.y += offset.y` for ops whose `nodeId` is inside the scroll subtree.

- [ ] **3.2** Port scroll content extent calculation from
  `composite-scroll.ts` (content max measurement logic).

- [ ] **3.3** Port scroll handle clamping and momentum from `scroll.ts`
  integration points.

---

## Phase 4 — Pipeline Orchestration

Rewire `composite.ts` to call the new pipeline instead of the old 8-pass
sequence.

- [ ] **4.1** Update `composite.ts` frame orchestration:
  - Layout-dirty frame:
    1. `traverseFrame()` (pass 1).
    2. `applyScrollOffsetsToOps()` (pass 2).
    3. `paintFrame()` consuming layer op buckets directly.
  - Layout-clean frame:
    1. `syncVisualProps()` on retained ops.
    2. `paintFrame()`.

- [ ] **4.2** Update `syncVisualPropsToCommands` → `syncVisualPropsToOps`:
  - Iterate retained `RenderGraphOp[]` instead of `RenderCommand[]`.
  - Mutate `op.color`, `op.cornerRadius`, `op.borderWidths` via
    `resolveProps(node)`.
  - Port interactive state logic (hover/focus border zeroing).

- [ ] **4.3** Update `paintFrame` / `paint.ts`:
  - Remove `collectLayerCommands` (no longer needed — ops are pre-routed to
    layer buckets).
  - `paint.ts` receives `LayerOpBucket[]` directly, passes to
    `gpu-renderer-backend.ts`.

- [ ] **4.4** Update `gpu-renderer-backend.ts`:
  - Verify it already consumes `RenderGraphOp[]` — it should need minimal
    changes since we're keeping the same op type.
  - Remove any residual `RenderCommand` references.
  - Verify clip bounds are correctly attached to ops (now computed during
    DFS instead of in `buildRenderGraphFrame`).

- [ ] **4.5** Update `renderer-backend.ts` (`LayerPaintContext` contracts).

---

## Phase 5 — Dead Code Removal

Remove all replaced infrastructure.

- [ ] **5.1** Delete from `layout-adapter.ts`:
  - All 36 parallel arrays and their population logic.
  - `endLayout()`, `emitNode()`, `resolveAbsolute()`, `sortedChildIndices()`.
  - `_layoutMap`, `getLastLayoutMap()`, `_childrenByParent`.
  - `configureFloating()`, `restoreDetachedRoots()`.
  - Retain only: `createVexartLayoutCtx()` shell (if needed for Flexily node
    management), `openElement()`/`closeElement()` for Flexily tree sync,
    `calculateRoots()` invocation.

- [ ] **5.2** Delete from `walk-tree.ts`:
  - Array recording into layout adapter (`configureRectangle`, `text()`, etc).
  - Retain: any node metadata setting that still happens during reconciliation
    (not during frame traversal).

- [ ] **5.3** Delete from `layout.ts`:
  - `writeLayoutBack()` entirely.
  - `updateCommandsToLayoutMap()`.
  - `damageRectForLayoutTransition()` — move to pipeline-traverse.ts if still
    used, or inline.
  - Retain: `updateInteractiveStates()` (hit-test sorting is independent).

- [ ] **5.4** Delete from `render-graph.ts`:
  - `buildRenderGraphFrame()`.
  - `RenderCommand` type and `CMD` enum (if fully replaced).
  - Clip stack management (moved to pipeline context).
  - Retain: `RenderGraphOp` types, op constructors, effect transform utils.

- [ ] **5.5** Delete from `assign-layers.ts`:
  - `assignLayersSpatial()` entirely.
  - `findLayerBoundaries()` (already dead in prod).
  - Retain: `LayerSlot` type (if used by new layer context), `assignNodeLayerKeys`
    (if not inlined into DFS).

- [ ] **5.6** Delete or gut `composite-scroll.ts`:
  - `applyScrollOffsets()` (replaced by `pipeline-scroll.ts`).
  - Retain: scroll measurement utilities if shared.

- [ ] **5.7** Remove `RenderCommand` from `loop/types.ts`.

---

## Phase 6 — Test Suite Migration

Rewrite the 12 affected test suites to test the new pipeline.

- [ ] **6.1** `layout-adapter.test.ts`:
  - Replace `getLastLayoutMap()` assertions with direct `node.layout` checks.
  - Test through `traverseFrame()` instead of `endLayout()`.

- [ ] **6.2** `layout-adapter-grid.test.ts`:
  - Same migration: `getLastLayoutMap()` → `node.layout`.
  - Grid error detection via `traverseFrame` return value.

- [ ] **6.3** `layout-atomicity.test.ts`:
  - **Critical**: Verify snapshot-restore atomicity. Inject a Flexily error
    and assert `node.layout` is unchanged.

- [ ] **6.4** `layout.test.ts`:
  - `damageRectForLayoutTransition` tests: port to new location or inline.
  - `updateCommandsToLayoutMap` tests: delete (function deleted).

- [ ] **6.5** `walk-grid.test.ts`:
  - Replace `getLastLayoutMap()` with `node.layout` assertions.

- [ ] **6.6** `grid-interaction.test.ts`:
  - Replace `writeLayoutBack()` + `getLastLayoutMap()` with
    `traverseFrame()` + `node.layout`.

- [ ] **6.7** `node-layout-grid.test.ts`:
  - Same pattern.

- [ ] **6.8** `grid-flex-diagnostic.test.ts`:
  - Grid error diagnostics through new pipeline.

- [ ] **6.9** `assign-layers.test.ts`:
  - Test layer routing through `traverseFrame()` output layer buckets.
  - Verify scissor/scroll layer boundaries.

- [ ] **6.10** `render-graph.test.ts`:
  - Test op emission directly from `traverseFrame()`.
  - Remove `RenderCommand` input construction.

- [ ] **6.11** `composite-scroll.test.ts`:
  - Test through `applyScrollOffsetsToOps()`.
  - Verify coordinate shifts on `RenderGraphOp`.

- [ ] **6.12** `walk-tree.test.ts`:
  - Verify DFS metadata (`_dfsIndex`, `_depth`, `_scrollContainerId`) is
    still set correctly by the new traversal.

---

## Phase 7 — Validation

Final verification gate. Nothing merges without all checks green.

- [ ] **7.1** `bun run typecheck` — zero errors.
- [ ] **7.2** `bun run test` — all suites pass (including the 12 migrated).
- [ ] **7.3** `bun run showcase` — visual inspection of all 6 tabs:
  - [ ] Inputs tab
  - [ ] Display tab
  - [ ] Collections tab
  - [ ] Code & Docs tab
  - [ ] Overlays tab
  - [ ] Typography tab
- [ ] **7.4** `cd native/libvexart && cargo test` — Rust tests unaffected.
- [ ] **7.5** Verify `syncVisualProps` path: change a theme token at runtime
  and confirm the visual update works without layout recalculation.
- [ ] **7.6** Verify scroll behavior: scroll a long list, confirm clamp and
  momentum work correctly.
- [ ] **7.7** Verify floating elements: tooltip, popover, dropdown positioning.
- [ ] **7.8** Verify transforms: rotated/scaled elements with correct hit-testing.
- [ ] **7.9** Review integrated diff — no unintended changes outside the pipeline.

---

## File Ownership Map

| File | Action | Phase |
| :--- | :--- | :--- |
| `loop/pipeline-types.ts` | **NEW** | 1 |
| `loop/pipeline-traverse.ts` | **NEW** | 2 |
| `loop/pipeline-scroll.ts` | **NEW** | 3 |
| `loop/composite.ts` | **REWRITE** orchestration | 4 |
| `loop/paint.ts` | **MODIFY** consumption | 4 |
| `loop/layout-adapter.ts` | **GUT** (keep Flexily sync) | 5 |
| `loop/walk-tree.ts` | **GUT** (keep reconciler hooks) | 5 |
| `loop/layout.ts` | **GUT** (keep hit-test sort) | 5 |
| `ffi/render-graph.ts` | **GUT** (keep op types) | 5 |
| `loop/assign-layers.ts` | **DELETE** most | 5 |
| `loop/composite-scroll.ts` | **REPLACE** | 5 |
| `loop/types.ts` | **MODIFY** remove RenderCommand | 5 |
| `ffi/gpu-renderer-backend.ts` | **MODIFY** minimal | 4 |
| `ffi/renderer-backend.ts` | **MODIFY** contracts | 4 |
| 12 test files | **REWRITE** | 6 |

---

## Risk Mitigations

1. **Snapshot-restore atomicity**: Tested explicitly in phase 6.3.
2. **Compensatory patterns — all 6 resolved at root cause**:
   - **#1** (effect zero-fill → overwrite): **Eliminated**. `node._transform`
     is computed before effect ops are emitted — no placeholder, no late overwrite.
   - **#2** (scissor re-sort in assignLayersSpatial): **Eliminated**. Ops are
     emitted in correct z-order by DFS with pre-sorted children. No post-hoc re-sort.
   - **#3** (border after children): **Not a workaround** — this is correct
     paint semantics (border renders above content). The DFS emits border ops
     after recursing children because that is the architecturally correct order.
   - **#4** (interactive border zeroing via RenderCommand): **Eliminated**.
     `syncVisualPropsToOps` operates directly on retained `RenderGraphOp` —
     no intermediate `RenderCommand` layer to compensate through.
   - **#5** (fallback slot for orphan ops): **Eliminated**. Layer routing
     during DFS is complete — no orphan ops, no fallback slot needed.
   - **#6** (root float detach/reattach in Flexily tree): **Eliminated**.
     Root-attached floats are deferred to a separate list and traversed after
     the main DFS — no temporary Flexily tree mutation.
3. **12 test suites**: Each one is explicitly mapped to its migration strategy.


