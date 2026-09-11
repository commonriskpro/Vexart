# Engine Runtime, Reconciler & Layout Architecture

The `@vexart/engine` package is the foundational runtime of Vexart. It orchestrates SolidJS universal reconciliation, the retained TypeScript scene graph, Flexily layout calculations, render graph compilation, the fast-path compositor, the frame scheduler, terminal I/O lifecycle, input parsing, focus graphs, and transform-aware hit-testing.

---

## 1. SolidJS Universal Reconciler

Vexart compiles JSX into a retained scene graph without a Virtual DOM using `createRenderer<TGENode>` from `solid-js/universal`.

### 1.1 Intrinsic Elements
Vexart supports exactly four intrinsic elements:
- `<box>`: Primary visual and structural layout container. Supports background colors, gradients, borders, shadows, glows, corner radii, transforms, backdrop filters, and flex/grid layout properties.
- `<text>`: Leaf typography container. Holds text content, font family, font size, line height, text wrap rules, and syntax highlighting spans.
- `<img>`: Hardware-accelerated image container backed by GPU texture handles.
- `<canvas>`: Immediate-mode and retained display list rendering surface.

> **CRITICAL INVARIANT — OBSOLETE PRIMITIVES**:
> Historical primitives `<Span>`, `<RichText>`, and `<WrapRow>` **do not exist**. They were permanently deleted during the monorepo consolidation. Any attempt to use `<Span>`, `<RichText>`, or `<WrapRow>` will fail at compile or runtime. Use `<box>` and `<text>` intrinsics or application `<Box>` and `<Text>` components.

### 1.2 Reconciler Implementation Contract
The reconciler interface is bound to `TGENode` in `packages/engine/src/reconciler/reconciler.ts`:

```typescript
import { createRenderer } from "solid-js/universal"
import { type TGENode, createNode, createTextNode, insertChild, removeChild } from "../ffi/node"

export const renderer = createRenderer<TGENode>({
  createElement(string: string): TGENode {
    return createNode(string as TGENodeKind)
  },
  createTextNode(value: string | number): TGENode {
    return createTextNode(String(value))
  },
  replaceText(node: TGENode, value: string): void {
    node.text = String(value)
    // Raw text children created by createTextNode are not directly walked by walkTree.
    // Invalidate the parent <text> node to trigger proper scoped dirty tracking.
    const target = node.parent?.kind === "text" ? node.parent : node
    target._flexNode?.markDirty()
    markNodeVisualDamage(target)
    markNodeDirty(target)
  },
  setProperty(node: TGENode, name: string, value: unknown, prev: unknown): void {
    // Eager pre-parsing and bitmask dispatch (see Section 3)
  },
  insertNode(parent: TGENode, node: TGENode, anchor?: TGENode): void {
    insertChild(parent, node, anchor)
    syncCompositorLayerBacking(node)
    onSubtreeChanged(parent.id)
    markDirty()
  },
  removeNode(parent: TGENode, node: TGENode): void {
    if (node.id === getCapturedNodeId()) {
      releasePointerCapture(node.id)
    }
    // Recursively unregister all focusable nodes in the destroyed subtree
    // to prevent ghost entries in the keyboard focus ring.
    unregisterSubtree(node)
    unmarkSubtreeLayerBacking(node)
    onSubtreeChanged(parent.id)
    removeChild(parent, node)
    markDirty()
  },
  isTextNode(node: TGENode): boolean {
    return node.kind === "text"
  },
  getParentNode(node: TGENode): TGENode | undefined {
    return node.parent ?? undefined
  },
  getFirstChild(node: TGENode): TGENode | undefined {
    return node.children[0]
  },
  getNextSibling(node: TGENode): TGENode | undefined {
    if (!node.parent) return undefined
    return node.parent.children[node._siblingIndex + 1]
  },
})
```

---

## 2. Scene Graph Node Model (`TGENode`)

The retained scene graph consists of `TGENode` objects defined in `packages/engine/src/ffi/node.ts` and `node-types.ts`:

### 2.1 Node Kinds (`TGENodeKind`)
- `"box"`: Rectangular layout box.
- `"text"`: Typography container.
- `"img"`: Hardware texture blit container.
- `"canvas"`: Display list drawing surface.
- `"root"`: Top-level viewport root node.

### 2.2 Core Node Fields
```typescript
export type TGENode = {
  id: number
  kind: TGENodeKind
  props: TGEProps
  text: string
  children: TGENode[]
  parent: TGENode | null
  destroyed: boolean
  layout: { x: number; y: number; width: number; height: number }
  
  // Layout Backing
  _flexNode: flexily.Node | null
  
  // Interaction & Focus
  _hovered: boolean
  _active: boolean
  _focused: boolean
  _focusableCount: number
  _interactionMode: "none" | "drag"
  
  // Transform Matrices (3x3 projective matrices stored column-major)
  _transform: Matrix3x3 | null
  _transformInverse: Matrix3x3 | null
  _accTransform: Matrix3x3 | null
  _accTransformInverse: Matrix3x3 | null
  
  // Retained Compositing & Layer Backing
  _autoLayer: boolean
  _layerKey: string | null
  _stableFrameCount: number
  _unstableFrameCount: number
  _scrollContainerId: number
  _siblingIndex: number
  _depth: number
  _dfsIndex: number
}
```

---

## 3. Eager Pre-Parsing & Style Resolution

To prevent string parsing, object allocations, and color conversions inside the 60/120fps render loop, `setProperty()` eagerly normalizes values upon mutation:

### 3.1 Color Pre-Parsing
All color strings (`"#fff"`, `"#ffffff"`, `"#ffffff80"`, or `"ffffff"`) are parsed immediately into packed 32-bit unsigned integers (`u32 0xRRGGBBAA`) using `parseColor()`:
- **LRU Bounded Cache**: `_colorCache` is capped at **512 entries** with LRU eviction. This eliminates memory leaks from dynamic or computed color strings.
- **Short-Hex Expansion**: Formats `#rgb` and `#rgba` expand canonically to 8-digit equivalents (`#f00` $\to$ `0xff0000ff`, `#f008` $\to$ `0xff000088`).

### 3.2 Sub-Style Pre-Parsing
Complex style sub-objects are unpacked and their internal color fields are converted to `u32` during `setProperty()`:
- **`resolveGlow(glow)`**: Normalizes `{ radius, color, intensity }` where `color` is resolved to `u32`.
- **`resolveShadow(shadow)`**: Handles single shadows or multi-shadow arrays (`ShadowConfig[]`), resolving `{ x, y, blur, color }` with `color` as packed `u32`.
- **`resolveGradient(gradient)`**: Normalizes `{ type, from, to, angle }`, resolving both `from` and `to` to packed `u32`.
- **`resolveInteractiveStyle(style)`**: Pre-parses nested colors inside `hoverStyle`, `activeStyle`, and `focusStyle` blocks.

### 3.3 Property Dispatch Bitmasks (`PROP_FLAGS`)
Bitmasks classify properties on arrival to execute minimal code paths:
- `FLAG_VISUAL_DAMAGE` (`1`): Marks the node's GPU layer damaged (`markNodeLayerDamaged`), triggering an incremental repaint.
- `FLAG_COLOR` (`2`): Invokes `resolveColor()` string-to-u32 translation.
- `FLAG_STYLE_SUB_COLOR` (`4`): Dispatches nested color resolution in style dictionaries.
- `FLAG_COMPOSITOR` (`8`): Synchronizes compositor layer backing (`layer`, `willChange`, `transform`, `opacity`, `filter`).

---

## 4. Pure JS Flexily Layout Engine (Flexbox & CSS Grid)

Layout is computed by the vendored `flexily` engine (`packages/internal-flexily`), running in pure TypeScript/JavaScript with zero external dependencies and zero native FFI allocations.

### 4.1 Retained Layout Node (`_flexNode`)
Every non-text `TGENode` retains a `flexily.Node` instance on `node._flexNode`. When layout props change in `setProperty()` (`width`, `height`, `flexDirection`, `padding`, `margin`, `gap`), `syncLayoutProp()` mutates the backing Flexily node directly.

### 4.2 Dual Layout Modes
Vexart nodes support two declarative layout modes via the `layout` prop:

#### 1. Flexbox Mode (`layout: "flex"` — Default)
Full Yoga-compatible Flexbox model:
- `flexDirection`: `"row" | "column" | "row-reverse" | "column-reverse"`
- `alignItems`, `alignSelf`: `"flex-start" | "center" | "flex-end" | "stretch"`
- `justifyContent`: `"flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"`
- `flexGrow`, `flexShrink`, `flexBasis`, `gap`, `rowGap`, `columnGap`

#### 2. CSS Grid Mode (`layout: "grid"`)
A complete 2D CSS Grid solver supporting complex responsive layouts:
- **Track Sizing (`gridTemplateColumns`, `gridTemplateRows`)**:
  - Fractional units: `"1fr 2fr 1fr"`
  - Fixed pixels: `100`, `"200px"`
  - Percentages: `"25% 75%"`
  - Minimum/Maximum functions: `minmax(100px, 1fr)`
  - Fit-content: `fit-content(200px)`
- **Template Areas (`gridTemplateAreas`)**:
  ```tsx
  <box
    layout="grid"
    gridTemplateAreas={[
      "header header",
      "sidebar main",
      "footer footer"
    ]}
    gridTemplateColumns="200px 1fr"
    gridTemplateRows="auto 1fr auto"
  >
    <box gridArea="header">...</box>
    <box gridArea="sidebar">...</box>
    <box gridArea="main">...</box>
    <box gridArea="footer">...</box>
  </box>
  ```
- **Auto-Flow**: `"row" | "column" | "row dense" | "column dense"`. The dense packing algorithm backfills empty holes in the grid.
- **Item Placement**: `gridColumn`, `gridRow`, `gridColumnStart`, `gridColumnEnd`, `gridRowStart`, `gridRowEnd` using line indexes or named grid lines.

### 4.3 Atomic Layout Writeback (`writeLayoutBack`)
Layout calculation must maintain total atomicity. A corrupted or partial layout must never leak to the GPU renderer or damage tracker:

```typescript
export function writeLayoutBack(
  layoutMap: Map<number, PositionedCommand> | null,
  state: WriteLayoutBackState
): boolean {
  const { boxNodes, textNodes } = state

  // Invariant 1: Reject missing or empty layout maps
  if (!layoutMap || layoutMap.size === 0) return false

  // Invariant 2: Abort atomically if ANY node has non-finite coordinates
  // or a registered GridLayoutError
  for (const node of boxNodes) {
    if (!isFiniteLayoutPosition(layoutMap.get(node.id)) || getGridLayoutError(node)) {
      return false // ATOMIC ABORT
    }
  }
  for (const node of textNodes) {
    if (!isFiniteLayoutPosition(layoutMap.get(node.id)) || getGridLayoutError(node)) {
      return false // ATOMIC ABORT
    }
  }

  // All coordinates verified finite (Number.isFinite) — commit writeback
  for (const node of boxNodes) {
    const pos = layoutMap.get(node.id)!
    node.layout.x = pos.x
    node.layout.y = pos.y
    node.layout.width = pos.width
    node.layout.height = pos.height
  }
  return true
}
```

If any layout calculation produces `NaN`, `Infinity`, or encounters an unresolvable grid constraint (`GridLayoutError`), `writeLayoutBack` returns `false`. The render loop preserves the previous valid frame, preventing visual corruption or GPU panics.

### 4.4 Text Layout Measurement Callback (`measureForLayout`)
Flexily nodes for `<text>` do not use geometric children. Instead, Flexily registers a text measurement callback:
- Computes font metrics, line breaks, and bounding box dimensions via `text-layout.ts`.
- Results are cached in an LRU layout cache keyed by `(text, fontId, fontSize, maxWidth)`.

---

## 5. Render Graph & Layer Composition

The render graph converts layout boxes and resolved styles into flat, cacheable render queues.

### 5.1 The 7 `RenderGraphOp` Kinds
Every visual element in Vexart maps to one of seven operations (`packages/engine/src/ffi/render-graph.ts`):
1. `rectangle`: Solid background quads, single-color borders, and SDF rounded rectangles.
2. `image`: Texture blits referencing GPU image assets.
3. `canvas`: Custom immediate-mode or display list commands.
4. `effect`: High-level GPU visual effects (linear/radial/conic gradients, glows, drop shadows, backdrop blur, backdrop color filters).
5. `border`: Multi-sided borders with individual per-edge thicknesses and colors.
6. `text`: MSDF glyph quad batches.
7. `raw-command`: Passthrough low-level hardware commands.

### 5.2 Layer Boundary Discovery (`findLayerBoundaries`)
Layers isolate subtrees into independent GPU render targets, enabling partial damage updates and zero-layout compositor animations.

`findLayerBoundaries()` in `packages/engine/src/loop/assign-layers.ts` traverses the tree and promotes nodes into layers based on strict criteria:
1. **Explicit Layers**: `node.props.layer === true`.
2. **Compositor Hints**: `node.props.willChange` containing `"transform"`, `"opacity"`, `"filter"`, or `"scroll"`.
3. **Interactive Subtrees**: Nodes actively undergoing pointer drag or hover interaction (`shouldPromoteInteractionLayer`).
4. **Scroll Containers**: Containers with `scrollX` or `scrollY` enabled.
5. **Subtree Transforms**: Transformed parents with children.
6. **Backdrop Filters**: Elements with `backdropFilter` (glassmorphism), capped at an **auto-layer budget of 8** (with a maximum of 4 active backdrop filters per frame).

### 5.3 Bijective Layer Mapping by `nodeId`
Historic versions grouped layers by background color, causing catastrophic visual collisions when multiple distinct cards shared the same `#171717` background. Vexart maps layers bijectively using `nodeId`:
```typescript
rectCommandsByNodeId = new Map<number, { index: number; cmd: RenderCommand }>()
```
Every layer looks up its backing command in $O(1)$ by node identity, guaranteeing 100% deterministic layer assignment regardless of duplicate colors.

---

## 6. Fast-Path Compositor & Frame Scheduler

### 6.1 Dual-Cadence Interaction Scheduler
User interaction boosts frame rendering rates to eliminate perceived input latency (`packages/engine/src/loop/loop.ts`):
- **Key Boost Window**: **220 ms** (`keyInteractionBoostMs`)
- **Scroll Boost Window**: **320 ms** (`scrollInteractionBoostMs`)
- **Pointer / Drag Boost Window**: **520 ms** (`pointerInteractionBoostMs`)

When an interaction event is received, the scheduler elevates the frame rate to `interactionMaxFps` (typically 60–120 FPS). Once the boost window expires without new input, the engine relaxes back to the idle frame rate, minimizing CPU and GPU power consumption.

### 6.2 3-Priority Budget Scheduler
Tasks are queued across three priority lanes (`packages/engine/src/scheduler/index.ts`):
1. `"user-blocking"`: **Never deferred**. Always executes in the active frame regardless of remaining millisecond budget (e.g. keyboard focus shifts, pointer capture changes).
2. `"user-visible"`: Executes within the remaining frame time budget (e.g. animated layout adjustments, hover visual highlights). Deferred to next frame if budget is exhausted.
3. `"background"`: Runs only during idle slices when user-visible work is complete (e.g. Tree-Sitter syntax re-parsing, atlas cache compaction).

### 6.3 Fast-Path Compositor
When an animation targets only `transform` or `opacity` on a layer-backed node:
1. `createTransition` or `createSpring` registers an `AnimationDescriptor` with `registerAnimationDescriptor()`.
2. The frame orchestrator evaluates `isCompositorOnlyFrame()`.
3. If true, the engine **completely bypasses** the SolidJS reconciler, `walkTree`, and the Flexily layout pass.
4. The compositor writes updated 3x3 transform matrices or opacity values directly to GPU uniform buffers (`vexart_composite_update_uniform`), achieving 120 FPS animations with negligible CPU load.

---

## 7. Terminal I/O, Parsing & Input Lifecycle

### 7.1 Protocol Support & ANSI/Kitty Sequences
Vexart interfaces directly with the terminal using advanced terminal escape modes:
- **SGR Extended Mouse (Mode 1006)**: Decodes subpixel mouse coordinates and buttons:
  - `\x1b[<0;20;15M` (Button 1 press at column 20, row 15)
  - `\x1b[<0;20;15m` (Button 1 release — prioritizes release suffix `m`)
  - Mouse movement without buttons (code `35`).
- **Kitty Keyboard Protocol (Mode >1u)**: Reports key presses, releases, repeats, and full modifier masks (Shift, Alt, Ctrl, Super, Hyper, Meta).
  - Handles LF mode: Byte 10 (`\n`) maps unambiguously to `enter` (not `Ctrl+j`).
  - Byte 0 (`\x00`) maps to `space` with `ctrl: true`.
- **Focus Reporting (Mode 1004)**: Detects terminal window focus gains (`\x1b[I`) and losses (`\x1b[O`).
- **Bracketed Paste (Mode 2004)**: Delimits bulk pasted text between `\x1b[200~` and `\x1b[201~`.
- **Synchronized Output (Mode 2026)**: Wraps frame writes in `\x1b[?2026h` and `\x1b[?2026l` to eliminate terminal tearing.

### 7.2 Pointer Capture
To prevent drag operations from breaking when the mouse leaves an element's bounds, Vexart implements explicit pointer capture:
- `setPointerCapture(nodeId)`: Redirects all subsequent mouse events exclusively to `nodeId`.
- `releasePointerCapture(nodeId)`: Releases capture, restoring standard hit-test routing.

### 7.3 Transform-Aware Hit-Testing & Nested Scroll Composition
Hit-testing maps screen cell coordinates to the correct interactive node in pixel space:
1. **Affine Pixel Projection**: Screen coordinates $(col, row)$ are translated to subpixel centers:
   $$px = (col + 0.5) \cdot cellWidth, \quad py = (row + 0.5) \cdot cellHeight$$
2. **Projective Matrix Inversion**: Nodes with 3D rotation, scaling, or perspective project the point into local space by multiplying against `node._accTransformInverse` ($P_{local} = M_{acc}^{-1} \cdot P_{screen}$).
3. **Compound Scroll Offset Map**: In nested scroll hierarchies, ancestor scroll translations are compounded in $O(1)$ via `composite-scroll.ts`, ensuring that deeply nested scrolled elements receive accurate mouse clicks.

### 7.4 Nested Lifecycle Teardown (`mount.ts`)
To ensure terminal settings and raw modes are 100% restored upon unexpected errors or process termination, `mount.ts` executes an 8-stage nested `try / finally` destruction ladder:

```typescript
destroy: () => {
  try {
    unsubData()
  } finally {
    try {
      unsubResize()
    } finally {
      try {
        parser.destroy()
      } finally {
        try {
          dispose() // Disposes SolidJS reactive root
        } finally {
          try {
            resetFocus()
          } finally {
            try {
              clearSelection()
            } finally {
              try {
                unbindLoop(loop)
              } finally {
                try {
                  loop.destroy() // Releases GPU and terminal handles
                } finally {
                  resetCompositorPathState()
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 8. Authoritative Hook Signatures

Verified signatures extracted directly from the engine runtime:

### 8.1 `useQuery<T>`
Lightweight reactive data fetching hook (`packages/engine/src/reconciler/data.ts`):
```typescript
export function useQuery<T>(
  fetcher: () => Promise<T>,
  options?: QueryOptions
): QueryResult<T>

export type QueryOptions = {
  enabled?: boolean           // Default: true
  refetchInterval?: number   // Auto-refetch in ms (0 = disabled)
  retry?: number             // Retry count on error
  retryDelay?: number        // Retry delay in ms
}

export type QueryResult<T> = {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  refetch: () => void
  mutate: (data: T | ((prev: T | undefined) => T)) => void
}
```

### 8.2 `useMutation<T, V>`
Reactive mutation hook for remote operations:
```typescript
export function useMutation<T, V>(
  mutationFn: (variables: V) => Promise<T>,
  options?: MutationOptions<T, V>
): MutationResult<T, V>

export type MutationOptions<T, V> = {
  onMutate?: (variables: V) => T | undefined
  onSuccess?: (data: T, variables: V) => void
  onError?: (error: Error, variables: V, previousData: T | undefined) => void
  onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void
}

export type MutationResult<T, V> = {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  mutate: (variables: V) => Promise<T | undefined>
  reset: () => void
}
```

### 8.3 `useDrag`
Pointer drag interaction hook (`packages/engine/src/reconciler/drag.ts`):
```typescript
export function useDrag(opts: DragOptions): DragState

export type DragOptions = {
  onDragStart?: (evt: NodeMouseEvent) => boolean | void
  onDrag: (evt: NodeMouseEvent) => void
  onDragEnd?: (evt: NodeMouseEvent) => void
  disabled?: () => boolean
  interaction?: InteractionBinding
}

export type DragProps = {
  ref: (handle: NodeHandle) => void
  onMouseDown: (evt: NodeMouseEvent) => void
  onMouseMove: (evt: NodeMouseEvent) => void
  onMouseUp: (evt: NodeMouseEvent) => void
}

export type DragState = {
  dragging: () => boolean
  dragProps: DragProps
}
```

### 8.4 `useHover`
Hover detection hook with customizable entry and exit delays (`packages/engine/src/reconciler/hover.ts`):
```typescript
export function useHover(opts?: HoverOptions): HoverState

export type HoverOptions = {
  onEnter?: () => void
  onLeave?: () => void
  delay?: number           // Milliseconds before triggering onEnter
  leaveDelay?: number      // Milliseconds before triggering onLeave
  disabled?: () => boolean
}

export type HoverProps = {
  onMouseOver: (evt: NodeMouseEvent) => void
  onMouseOut: (evt: NodeMouseEvent) => void
}

export type HoverState = {
  hovered: () => boolean
  hoverProps: HoverProps
}
```
