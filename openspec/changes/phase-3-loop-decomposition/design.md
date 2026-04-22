# Design: Phase 3 — Loop Decomposition + Tier 2 Optimizations

## Technical Approach

Break `loop.ts` (3030 lines) into 6 pipeline modules + coordinator (≤400 lines), downstream-first. Each module receives typed state bags as arguments — no module-level shared mutables. Coordinator owns all cross-cutting state (`FrameState`) and passes slices to each phase. Viewport culling inserts into `walk-tree.ts` as an AABB prune pass. Frame budget scheduler is a standalone `scheduler/` module consumed by the coordinator.

Maps to proposal slices 1–8, ARCHITECTURE.md §3.1, PRD §Phase 3 (L803–838).

## Architecture Decisions

### Decision: State Bag Pattern over Shared Closures

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Keep closure state inside `createRenderLoop` | Zero refactor but untestable — 35+ `let` bindings only accessible inside the 2200-line closure | ❌ Rejected |
| Module-global singletons | Testable but creates hidden coupling and circular dep risk | ❌ Rejected |
| **Typed state bags passed as args** | Each module is a pure function of `(input, state) → output`; coordinator owns and passes state | ✅ Chosen |

**Rationale**: State bags make every module independently testable with fixture JSON. The coordinator constructs `FrameState` once per frame and threads it through the pipeline. No hidden globals.

### Decision: Downstream-First Extraction Order

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Top-down (walk-tree first) | Highest coupling — touches layout adapter, effects queue, node lists simultaneously | ❌ Rejected |
| **Bottom-up (interaction-state first)** | Least coupled phases first; each slice removes code from loop.ts without touching upstream logic | ✅ Chosen |

**Rationale**: `updateInteractiveStates` (L2056–2277) reads `rectNodes` and pointer state but has zero coupling to layout/paint. Extracting it first proves the state-bag pattern with minimal blast radius.

### Decision: AABB Viewport Culling (Bottom-Up in Walk)

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Top-down AABB (parent bounds first) | Parent bounds depend on children in Taffy — chicken-egg | ❌ Rejected |
| **Bottom-up AABB (post-layout prune)** | Layout runs first, then a prune pass skips painting for off-screen subtrees | ✅ Chosen |
| Spatial index (R-Tree) | Overkill for 50–500 nodes; deferred to v1.x per DEC-010 | ❌ Deferred |

**Rationale**: Bottom-up AABB after layout writeback is simple — walk boxNodes, compute subtree bounds, mark `_culled` flag. Paint skips flagged nodes. Scroll containers are exempt (children may scroll into view).

### Decision: Priority Queue for Frame Scheduler

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Single setTimeout (current) | No priority, no budget accounting | ❌ Replace |
| **3 arrays drained in order** | Simple, O(1) enqueue, O(n) drain per lane; n is tiny (<20 tasks/frame) | ✅ Chosen |
| Binary heap | Overkill — task count per frame is <20 | ❌ Rejected |

**Rationale**: Three plain arrays (`userBlocking[]`, `userVisible[]`, `background[]`) drained in order. `performance.now()` budget check before each `userVisible` task. Array splice on cancel — acceptable for <20 items.

## Data Flow

```
Coordinator (index.ts)
  │
  │ buildFrameState()
  ▼
┌──────────────┐   WalkResult    ┌────────────────┐   LayoutResult
│  walk-tree   │ ──────────────▶ │ layout-adapter  │ ──────────────▶
│  (+ culling) │                 │ (VexartLayoutCtx│                 
└──────────────┘                 └────────────────┘                 
                                                                    
  ┌─────────────────┐   LayerPlan   ┌────────────────────┐         
  │  assign-layers  │ ◀──────────── │ layout-writeback    │         
  │                 │               │ (transform + layout)│         
  └────────┬────────┘               └────────────────────┘         
           │                                                        
           ▼ LayerPlan                                              
  ┌─────────────────┐                                              
  │  frame-pipeline  │ ← paint + composite + present               
  │  (per-layer loop)│                                              
  └────────┬────────┘                                              
           │                                                        
           ▼                                                        
  ┌────────────────────┐                                           
  │ interaction-state   │ ← hover/active/focus + onPress dispatch  
  │ (post-layout)       │                                           
  └─────────────────────┘                                           
```

## Interfaces / Contracts

```typescript
// ── State bags ──

/** Mutable pointer/scroll/capture state — coordinator owns, modules read/write. */
type PointerState = {
  x: number; y: number; down: boolean
  dirty: boolean; pendingPress: boolean; pendingRelease: boolean
  capturedNodeId: number; pressOriginSet: boolean
}

/** Accumulated scroll state. */
type ScrollState = {
  deltaX: number; deltaY: number; speedCap: number
}

/** Per-frame immutable context. */
type FrameState = {
  root: TGENode
  viewportWidth: number; viewportHeight: number
  cellWidth: number; cellHeight: number
  pointer: PointerState
  scroll: ScrollState
  term: Terminal
  forceLayerRepaint: boolean
}

// ── Module outputs ──

/** walk-tree.ts → layout-adapter.ts */
type WalkResult = {
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  textMetas: TextMeta[]
  effectsQueue: EffectConfig[]
  imageQueue: ImageEntry[]
  canvasQueue: CanvasEntry[]
  nodePathById: Map<number, string>
  nodeRefById: Map<number, TGENode>
  culledCount: number                // Tier 2: nodes skipped by AABB cull
}

/** layout-adapter.ts → layout-writeback.ts */
type LayoutResult = {
  commands: RenderCommand[]
  layoutMap: Map<bigint, PositionedCommand>
}

/** layout-writeback.ts → assign-layers.ts */
// Mutates boxNodes/rectNodes/textNodes layout fields in-place.
// Returns void — side-effect is on TGENode.layout + _transform.

/** assign-layers.ts → frame-pipeline.ts */
type LayerPlan = {
  bgSlot: LayerSlot
  contentSlots: LayerSlot[]
  slotBoundaryByKey: Map<string, LayerBoundary>
  boundaries: LayerBoundary[]
}

/** interaction-state.ts → coordinator */
type InteractionResult = {
  changed: boolean       // any hover/active/focus changed
  hadClick: boolean      // onPress dispatched (triggers re-layout)
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `loop/index.ts` | Create | ≤400-line coordinator: `createRenderLoop()`, `frame()`, `scheduleNextFrame()`, state ownership |
| `loop/walk-tree.ts` | Create | `walkTree()` + `collectText()` + AABB culling (L1081–1428 + new ~120 lines) |
| `loop/layout-adapter.ts` | Create | `VexartLayoutCtx` factory + buffer helpers (L49–568) |
| `loop/assign-layers.ts` | Create | `findLayerBoundaries()` + `assignLayersSpatial()` (L1430–1873) |
| `loop/layout-writeback.ts` | Create | `writeLayoutBack()` + transform hierarchy (L1875–2054) |
| `loop/interaction-state.ts` | Create | `updateInteractiveStates()` + pointer dispatch (L2056–2277) |
| `loop/frame-pipeline.ts` | Create | `frameLayered()` layer prepare + paint loop (L2325–2847) |
| `scheduler/index.ts` | Create | `createFrameScheduler()` with 3-priority queues |
| `scheduler/priority.ts` | Create | `TaskPriority` type + lane constants |
| `scheduler/budget.ts` | Create | `BudgetTracker` — `elapsed()`, `hasRemaining()`, `DEFAULT_BUDGET_MS = 12` |
| `loop/types.ts` | Create | Shared types: `FrameState`, `WalkResult`, `LayoutResult`, `LayerPlan`, `InteractionResult`, `PointerState`, `ScrollState` |
| `loop/loop.ts` | Delete | Replaced by the above modules |
| `loop/debug.ts` | Modify | Add `debugDumpCulledNodes()` export |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `walkTree()` produces correct `WalkResult` | Fixture: serialized TGENode tree → expected rectNodes/textNodes/effectsQueue counts |
| Unit | `assignLayersSpatial()` correct layer assignment | Fixture: RenderCommand[] + LayerBoundary[] → expected slot membership |
| Unit | `updateInteractiveStates()` hover/click dispatch | Fixture: rectNodes with layout + pointer pos → expected `_hovered`/`_active` flags |
| Unit | `writeLayoutBack()` transform accumulation | Fixture: boxNodes with layout + transform configs → expected `_accTransform` |
| Unit | Scheduler drains lanes in priority order | Enqueue mixed tasks, drain with budget, verify execution order |
| Unit | AABB culling marks off-screen nodes `_culled` | Fixture: nodes at known positions, viewport rect → expected `_culled` flags |
| Integration | Full frame pipeline produces identical output | Capture `commands[]` from current loop.ts on showcase, replay through new pipeline, assert identical |
| Benchmark | Viewport culling ≥40% reduction | 1000-node tree, 100 visible, compare walk+layout wall-time |
| Benchmark | Scheduler: user-blocking never misses | 10× background tasks, measure user-blocking latency |

**Fixture generation**: Add `VEXART_DUMP_FIXTURES=1` env flag. When set, `frame()` serializes `WalkResult`, `LayoutResult`, `LayerPlan` to JSON files in `packages/engine/src/loop/fixtures/`. These become test inputs.

## Migration / Rollout

Each slice = 1 commit. After each commit:
1. `bun run typecheck` passes
2. `bun run showcase` renders identically (visual check)
3. Existing tests pass

No public API changes. No feature flags needed. `loop/loop.ts` shrinks with each slice until deleted at slice 6. `loop/index.ts` re-exports `createRenderLoop` so consumers are unaffected.

## Open Questions

- [x] All questions resolved during design — no blockers.
