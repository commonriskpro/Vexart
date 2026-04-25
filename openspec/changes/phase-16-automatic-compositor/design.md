# Design: Automatic Compositor Layer Promotion, Dirty Tracking & Readback Elimination

## Technical Approach

Extend the existing layer infrastructure (`createLayerStore`, `findLayerBoundaries`, `canReuseStableLayer`, `reuseLayer`) with three additions: (1) auto-promotion heuristics in `assign-layers.ts` that promote backdrop-blur/filter nodes immediately and stable subtrees after 3 frames, (2) per-node `_layerKey` ownership so `setProperty` marks only the owning layer dirty instead of the full tree, (3) flip `forceLayerRepaint` default to `false` so the existing `canReuseStableLayer → reuseLayer` path actually fires and skips GPU paint + readback for clean layers.

## Architecture — Target State

```
walkTree → [auto-promotion scan] → findLayerBoundaries → assignLayersSpatial → layout → paint
                                                                                          ↓
                                                                                per layer:
                                                                                  clean → reuseLayer() → SKIP paint+readback
                                                                                  dirty (small) → paint → readback REGION → emit
                                                                                  dirty (full)  → paint → readback FULL → emit
                                                                                          ↓
                                                                                compose final frame: cached textures + fresh layers
```

## Architecture Decisions

| # | Decision | Alternatives | Rationale | Tradeoffs |
|---|----------|-------------|-----------|-----------|
| D1 | Auto-promote backdropBlur/filter nodes immediately (no hysteresis) | Apply same 3-frame hysteresis as stable subtrees | Backdrop blur reads the buffer behind the element each frame — ALWAYS expensive. Delaying promotion wastes 3 frames of readback. | Adds up to 8 layers even during initial mount; mitigated by budget cap |
| D2 | Stable-subtree promotion after N=3 stable frames | N=1 (instant) or N=5 (conservative) | N=1 thrashes on initial mount (SolidJS fires setProperty rapidly during reconciliation). N=5 is too slow for cosmic-shell panels that stabilize in 2-3 frames. | 3-frame delay before benefits kick in |
| D3 | Budget cap = 8 auto-promoted layers (hard-coded) | Unlimited; dynamic based on GPU memory | 8 layers × 1080p ≈ 33MB GPU. Unlimited risks OOM on composited UIs with many backdrop-blur cards. Dynamic adds complexity with marginal benefit. | May cap out on heavily-layered UIs; manual `layer={true}` is not capped |
| D4 | Size threshold ≥ 64×64 px for auto-promotion | No threshold; 32×32 | Tiny layers (icons, badges) have more composite overhead than readback savings. 64×64 = 16KB minimum texture — below this, per-layer GPU + readback overhead dominates. | Some medium-size elements (32-63 px) miss auto-promotion |
| D5 | Generation counter (not content hash) to detect dirty | CRC32 content hash; full render-graph equality | Generation counter is O(1): `setProperty` increments it, `B1-02` equality check (`currentProps[name] === value`) prevents false increments. Content hash requires traversing the render graph every frame. | Requires the B1-02 guard in setProperty — already exists at line 203 of reconciler.ts |
| D6 | `forceLayerRepaint` default = `false` | Remove flag entirely; keep `true` default | The whole point of phase 16. Flag stays as opt-in for bench/debug (`experimental.forceLayerRepaint: true`). | Existing frame-breakdown bench must explicitly pass `forceLayerRepaint: true` for "full repaint" scenario |

## Data Flow

### Auto-promotion scan (during walkTree)

```
for each node in walkTree:
  if node.props.layer === true           → boundary (manual, always)
  elif shouldPromoteInteractionLayer()   → boundary (existing)
  elif hasSubtreeTransform               → boundary (existing)
  elif hasValidWillChange                → boundary (existing)
  elif hasBackdropEffect(node)           → boundary (auto, immediate, _autoLayer=true)
  elif node._stableFrames >= 3
       AND area >= 64×64
       AND autoLayerCount < 8            → boundary (auto, stable, _autoLayer=true)
  elif node._autoLayer
       AND node._unstableFrames >= 3     → demote (_autoLayer=false)
```

### Stable-frame tracking

```
After paint, for each node with _autoLayer=true:
  if node's owning layer was clean this frame:
    node._stableFrames++
    node._unstableFrames = 0
  else:
    node._unstableFrames++
    node._stableFrames = 0
```

### Targeted dirty propagation

```
setProperty(node, name, value):
  if currentProps[name] === value → return         // B1-02 (line 203)
  ... existing logic ...
  node._generation++                                // NEW: bump gen counter
  if node._layerKey:
    markLayerDirtyByKey(node._layerKey)             // NEW: targeted
  markDirty()                                       // existing global dirty

assignLayersSpatial:
  for each sortedBound:
    mark(node) → node._layerKey = slot.key          // NEW: reuse nodeIdToLayerIdx walk
```

### Readback elimination (in paintFrame per slot)

```
for each preparedSlot:
  canReuseStableLayer = !forceLayerRepaint && !layer.dirty && !layer.damageRect  // existing
  if canReuseStableLayer:
    backend.reuseLayer() → skip GPU paint + readback → DONE                      // existing path, now default
  elif useRegionalRepaint && clippedDamage:
    paint → readback REGION → nativeEmitRegionTarget → DONE                      // existing path
  else:
    paint → readback FULL → emit → DONE
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/engine/src/ffi/node.ts` | Modify | Add `_autoLayer: boolean`, `_layerKey: string \| null`, `_stableFrames: number`, `_unstableFrames: number`, `_generation: number` to TGENode + createNode |
| `packages/engine/src/loop/assign-layers.ts` | Modify | Extend `findLayerBoundaries` with backdrop-blur/filter check + stable-subtree heuristic. Budget counter. Set `_layerKey` on nodes during `nodeIdToLayerIdx` walk |
| `packages/engine/src/loop/walk-tree.ts` | Modify | Expose `hasBackdropEffect()` helper (extract existing check at line 452). Emit auto-promotion hints |
| `packages/engine/src/loop/paint.ts` | Modify | After paint loop, update `_stableFrames`/`_unstableFrames` on auto-promoted nodes |
| `packages/engine/src/loop/loop.ts` | Modify | Change `forceLayerRepaint` default from `=== true` to `?? false` (line 171) |
| `packages/engine/src/reconciler/reconciler.ts` | Modify | In `setProperty`: increment `node._generation`, call `markLayerDirtyByKey(node._layerKey)` |
| `packages/engine/src/loop/composite.ts` | Modify | Wire `markLayerDirtyByKey` into CompositeFrameState |
| `packages/engine/src/ffi/layers.ts` | Modify | Add `markLayerDirtyByKey(key)` to LayerStore |
| `scripts/frame-breakdown.tsx` | Modify | Add `COSMIC_TYPING` and `COSMIC_IDLE` scenarios |
| `native/libvexart/src/composite/target.rs` | Design only | Document double-buffer readback plumbing (DEFERRED) |

## Interfaces / Contracts

```typescript
// New TGENode fields (node.ts)
_autoLayer: boolean           // true when auto-promoted, false for manual/none
_layerKey: string | null      // "layer:42" or "bg" — set during assignLayers
_stableFrames: number         // consecutive frames with no generation change
_unstableFrames: number       // consecutive frames with generation change
_generation: number           // bumped on every setProperty mutation

// New LayerStore method (layers.ts)
markLayerDirtyByKey: (key: string) => void

// New helper (walk-tree.ts)
function hasBackdropEffect(node: TGENode): boolean
```

```rust
// DEFERRED: Double-buffer readback (target.rs)
pub struct TargetRecord {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub readback_buffer_a: wgpu::Buffer,  // double buffer A
    pub readback_buffer_b: wgpu::Buffer,  // double buffer B
    pub active_readback: u8,              // 0 = A, 1 = B
    pub width: u32,
    pub height: u32,
    pub padded_bytes_per_row: u32,
    pub active_layer: Option<ActiveLayerRecord>,
}
```

## Bench Scenarios

| Scenario | Key | Behavior | Target |
|----------|-----|----------|--------|
| `COSMIC_TYPING` | cosmic-typing | Mount cosmic-shell, warmup, then mutate one text node per measured frame | p95 ≤ 4 ms |
| `COSMIC_IDLE` | cosmic-idle | Mount cosmic-shell, warmup, then measure with zero mutations | p95 ≤ 1 ms |
| `COSMIC_SHELL_1080P` | cosmic-shell-1080p | Existing scenario + `forceLayerRepaint: true` override | p95 ≤ 9 ms (no regression) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `hasBackdropEffect()` returns true for each backdrop prop | bun test — pure function |
| Unit | `findLayerBoundaries` promotes backdrop nodes; respects budget cap | bun test — mock tree |
| Unit | `_stableFrames` increments/resets correctly | bun test — simulate multi-frame |
| Unit | `markLayerDirtyByKey` marks correct layer | bun test — LayerStore |
| Integration | `forceLayerRepaint=false` activates reuse path | frame-breakdown bench |
| Bench | Three scenarios meet p95 targets | frame-breakdown-gate.ts |

## Slice Order

| # | Slice | Files | Keeps build green |
|---|-------|-------|-------------------|
| S1 | Auto-promote backdrop-blur/filter nodes | assign-layers.ts, walk-tree.ts, node.ts | ✅ additive only |
| S2 | Stable-subtree tracking + promote/demote | node.ts, assign-layers.ts, paint.ts | ✅ new fields, heuristic |
| S3 | Per-node layer ownership (`_layerKey`) | assign-layers.ts, node.ts | ✅ set during existing walk |
| S4 | Targeted layer dirty (`setProperty → markLayerDirtyByKey`) | reconciler.ts, layers.ts, composite.ts | ✅ additive path |
| S5 | Default `forceLayerRepaint=false` | loop.ts | ✅ one-line change |
| S6 | Add `COSMIC_TYPING` + `COSMIC_IDLE` bench scenarios | scripts/frame-breakdown.tsx | ✅ new scenarios |
| S7 | Verify readback elimination (existing `reuseLayer` path fires) | Manual verification via bench | ✅ no code changes |
| S8 | Regional readback for small dirty rects | paint.ts (wire existing `nativeEmitRegionTarget`) | ✅ existing infra |
| S9 | Bench validation — verify 3 scenarios meet targets | frame-breakdown-gate.ts | ✅ gate only |

## Out of Scope

- **Async double-buffer readback**: Plumbing designed above (`TargetRecord` with `readback_buffer_a/b`), not implemented in phase 16. Deferred to separate slice if layer caching alone doesn't close the 120fps gap.
- **Layer merging**: Combining small adjacent auto-layers into one composite.
- **GPU memory budget tracking**: 8-layer cap is sufficient for v0.9.
- **Changes to Rust paint pipelines or Kitty encoding**: Out of scope per proposal.

## Migration / Rollout

No migration required. All auto-promotion is tagged `_autoLayer: true` and gated behind budget cap. Rollback path:
1. `experimental.forceLayerRepaint: true` → disables all caching (existing escape hatch).
2. Remove auto-promotion heuristics from `findLayerBoundaries` → manual `layer={true}` still works.
3. `git revert` phase-16 commits → full restore.

## Open Questions

None — all decisions pre-resolved.
