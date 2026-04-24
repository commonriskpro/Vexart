# Design: Phase 9b — Retained Dirty-Region Fast Path

## Current behavior

The reconciler and runtime call a global `markDirty()` function. The render loop subscribes through `onGlobalDirty()` and marks every GPU layer dirty before waking the frame.

```txt
markDirty()
  -> onGlobalDirty
  -> markAllDirty()
  -> next frame repaints every retained layer
```

This is safe, but it is too coarse for small pointer interactions.

## Target behavior

Keep conservative full dirty for structural or unknown changes, but allow known node-local visual invalidation to be routed as damage rectangles.

```txt
markDirty({ nodeId, kind: "visual" })
  -> onGlobalDirty(scope)
  -> queue node damage
  -> wake frame
  -> layer paint uses regional repaint when possible
```

## Dirty scope model

Initial scope shape:

```ts
const DIRTY_KIND = {
  FULL: "full",
  INTERACTION: "interaction",
  NODE_VISUAL: "node-visual",
} as const
```

- `full`: existing behavior, mark all layers dirty.
- `interaction`: pointer/input movement that may require interaction state evaluation but should not eagerly dirty every layer.
- `node-visual`: queue damage for the node's previous/current layout rect without marking all layers dirty.

## Frame-path instrumentation

The benchmark must identify the bottleneck before additional optimization. Each measured frame now records:

- input/scroll routing: `scrollMs`
- layout stages: `walkTreeMs`, `layoutComputeMs`, `layoutWritebackMs`, `interactionMs`, `relayoutMs`, `layoutMs`
- layer planning: `layerAssignMs`, `prepMs`
- paint stages: `paintNativeSnapshotMs`, `paintLayerPrepMs`, `paintFrameContextMs`, `paintBackendBeginMs`, `paintReuseMs`, `paintRenderGraphMs`, `paintBackendPaintMs`, `paintLayerCleanupMs`, `paintBackendEndMs`, `paintPresentationMs`, `paintInteractionStatsMs`, `paintMs`
- terminal sync/I/O: `beginSyncMs`, `ioMs`, `endSyncMs`

The benchmark report prints the top p95 stage bottlenecks per scenario so the next slice is evidence-driven.

## Safety

- Unknown calls to `markDirty()` remain full dirty.
- Structural mutations remain full dirty.
- If node layout is unavailable, fallback to full dirty.
- Tests continue to exercise fallback/global behavior.

## Benchmark expectation

The dirty-region benchmark should reduce repaint work. The target remains `<5 ms p95`; this slice may only provide the first reduction depending on layer reuse behavior.
