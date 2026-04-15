# TGE Level-2 Damage Rendering Blueprint

## Goal

Upgrade the compositor from whole-layer repaint semantics to **region-aware repainting** so moving floating windows and local UI changes do not force full background/layer redraws.

---

## Problem statement

Current behavior is still too coarse:

- moving a floating layer often forces the entire background layer to repaint
- large layers repaint even when only a small region actually changed
- partial transport updates exist, but repainting is still too broad before transport even happens

We need to move from:

> layer changed → repaint the whole layer

to:

> region changed → repaint only the damaged region, then patch/transmit only what is safe

---

## Scope

This blueprint targets the compositor and layered rendering path.

Primary files involved:

- `packages/renderer/src/loop.ts`
- `packages/renderer/src/layers.ts`
- `packages/output/src/layer-composer.ts`
- new damage helpers under `packages/renderer/src/`

---

## Design principles

### 1. Layout is still global when needed

We are **not** trying to skip layout yet.

This design improves:

- repaint region
- buffer clearing region
- command execution region
- transport region

without first solving full layout invalidation.

### 2. Correctness before aggressiveness

If a layer class is unsafe for regional repaint or patching, we fall back to full repaint for that layer.

### 3. Damage tracking is separate from transport optimization

These are different steps:

1. determine what changed
2. repaint only that region if safe
3. patch transmit only if safe

Do not couple them too early.

---

## Core data model

Introduce a reusable rect model:

```ts
type DamageRect = {
  x: number
  y: number
  width: number
  height: number
}
```

Helpers:

- `isEmptyRect(rect)`
- `rectRight(rect)`
- `rectBottom(rect)`
- `intersectRect(a, b)`
- `unionRect(a, b)`
- `expandRect(rect, padding)`
- `translateRect(rect, dx, dy)`

---

## Layer state additions

Extend `Layer` with geometry history and damage state:

```ts
prevX: number
prevY: number
prevWidth: number
prevHeight: number
damageRect: DamageRect | null
```

New helpers in `layers.ts`:

- `getLayerRect(layer): DamageRect`
- `getPreviousLayerRect(layer): DamageRect`
- `markLayerDamaged(layer, rect)`
- `consumeLayerDamage(layer)`
- `updateLayerGeometry(layer, x, y, w, h)` should preserve old geometry before changing current geometry

---

## Damage sources

### 1. Geometry change

If a layer moves or resizes:

```ts
damage = unionRect(previousBounds, currentBounds)
```

This captures:

- newly exposed region at old position
- newly covered region at new position

### 2. Buffer content change without geometry change

If geometry is stable, derive region from pixel diff:

- existing `findDirtyRegion(...)` can remain the first implementation
- later it can evolve to tile-based damage if needed

### 3. Explicit invalidation by engine

If a layer class is known unsafe for partial repaint:

- keep `damageRect = full layer rect`

---

## Damage propagation between layers

When a foreground layer changes geometry, lower layers may need repaint in the exposed region.

### Initial correct rule

For a changed layer with z = `N`:

- compute `movementDamage = union(oldBounds, newBounds)`
- propagate that rect to all layers with `z < N`

This is conservative but correct.

Later we can optimize to only propagate where overlap existed.

---

## Paint strategy

### Current behavior

```ts
clear full layer buffer
paint every command in slot
compare full buffer
```

### New behavior

For each layer:

1. resolve `effectiveDamageRect`
2. if no damage → skip
3. if damage area is large → full repaint fallback
4. else repaint only the damaged region

### Regional repaint steps

1. Convert damage rect from global coordinates to local layer coordinates
2. Clear only that local rect in the layer buffer
3. Execute only commands that intersect the damage rect
4. Keep rest of the layer buffer intact

---

## Command filtering

Add:

```ts
commandIntersectsRect(cmd: RenderCommand, rect: DamageRect): boolean
```

First implementation rules:

- `RECTANGLE`, `BORDER`, `IMAGE`, `TEXT` → use their command bounds
- `SCISSOR_START/END` → include if the active clipped subtree intersects the damage rect

For phase 1 we can be conservative:

- if scissor complexity is ambiguous, repaint full layer

---

## Threshold policy

Regional repaint is only worth it when the damage area is meaningfully smaller than the layer.

Suggested initial heuristic:

- if `damageArea / layerArea <= 0.4` → regional repaint
- else → full repaint

Use per-layer fallback, not global fallback.

---

## Partial transport policy

Only use `patchLayer(...)` when the layer is safe.

Unsafe classes for partial transport:

- `floating`
- transform in subtree
- `viewportClip={false}`

These rules are already partially established and should be reused.

This means:

- paint can still be regional
- transport may still be full for some layers

That is acceptable and still valuable.

---

## Background-specific behavior

The background layer should benefit the most.

When foreground layers move:

- background receives the propagated damage rect
- background repaints only that region instead of full-screen

This is the major performance win for floating window motion.

---

## Safety fallback matrix

| Layer class | Regional repaint | Partial transport |
| --- | --- | --- |
| static non-transformed | yes | yes, if safe |
| floating no transform | yes | no initially |
| transformed subtree | no initially | no |
| viewportClip=false | no initially | no |
| scroll/scissor heavy | conservative fallback | conservative fallback |

---

## Implementation phases

### Phase 1 — rect infrastructure

- add `DamageRect` type and helpers
- extend `Layer` with previous bounds and `damageRect`
- preserve previous geometry before updates

### Phase 2 — movement damage

- detect movement/resizing of layers
- compute `union(oldBounds, newBounds)`
- propagate to lower layers

### Phase 3 — regional repaint for safe layers

- clear only damaged region
- repaint only intersecting commands
- fallback to full repaint above threshold

### Phase 4 — integrate with partial transport

- use patch transport only for safe layer classes
- continue using full transmit where patching is unsafe

### Phase 5 — regression coverage

- moving floating layered windows
- no-bg layer roots
- viewport clipped layers
- partial update fallback safety

---

## Success criteria

### Case A — moving a floating panel

Before:

- background full repaint
- multiple large layers repaint

After:

- background only repaints exposed region
- moved layer repaints only needed region or full layer if threshold exceeded

### Case B — local UI state change inside a panel

Before:

- full panel repaint

After:

- local region repaint
- optional patch transport if safe

### Case C — correctness under fallback

- no visual corruption
- unsafe classes automatically fall back to full repaint

---

## Non-goals for the first implementation

- full layout invalidation optimization
- tile-based damage maps
- transform-aware partial repaint for all cases
- exact browser-grade retained compositing in one pass

We want the first version to be **correct, measurable, and incrementally useful**.
