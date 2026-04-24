# Design: Phase 4b — Native Transform-Aware Hit Testing

## Current behavior

TypeScript computes `_transformInverse` / `_accTransformInverse` in `layout.ts` and uses those matrices in the compatibility hit-test loop. Phase 4a native interaction dispatch is disabled when such matrices exist:

```ts
useNativeInteractionDispatch: s.useNativePressDispatch && !hasTransformHitTestFallback
```

Rust currently hit-tests axis-aligned layout rectangles only.

## Target behavior

Rust computes the same transform matrices from native scene props and applies the inverse accumulated transform before hit-testing each node's local hit area.

## Transform model

Native scene props already encode object props as JSON strings. Rust will parse:

- `transform`: `{ translateX?, translateY?, rotate?, scale?, scaleX?, scaleY?, skewX?, skewY?, perspective?, rotateX?, rotateY? }`
- `transformOrigin`: one of the known string origins or `{ x, y }` normalized coordinates.

The matrix math mirrors `packages/engine/src/ffi/matrix.ts`:

1. start identity
2. optional translate
3. translate to origin
4. optional perspective with rotateX/rotateY
5. optional rotate
6. optional scale / scaleXY
7. optional skew
8. translate back from origin

## Hit-test algorithm

For a node, build an ancestor chain from outermost to innermost, including the node itself when transformed. Lift each local matrix into absolute coordinates using the node layout origin:

```txt
absolute = T(layout.x, layout.y) × local × T(-layout.x, -layout.y)
```

Compose the absolute matrix, then rebase it into the current node's local coordinate space:

```txt
forwardLocal = T(-node.x, -node.y) × absoluteForward × T(node.x, node.y)
inverse = invert(forwardLocal)
localPoint = inverse × (pointer - node.layout.origin)
```

If no transform applies, use the existing axis-aligned hit-test path.

## Event records

Event `node_x` / `node_y` remain `pointer - layout.origin`, matching the current TS helper. This change affects targeting, not event payload semantics.

## Tradeoffs

- Parsing JSON during hit-test is acceptable for Phase 4b correctness, but can be cached later if profiling shows cost.
- Transform math duplicates TS matrix semantics in Rust to keep hit-test ownership native. The duplication is intentional until a shared transform representation lands.
