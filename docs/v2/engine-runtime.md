# Engine Runtime & Reconciler Architecture

The `@vexart/engine` package is the core runtime coordinating SolidJS universal reconciliation, scene graph mutations, Flexily layout calculations, frame scheduling, terminal I/O lifecycle, input parsing, focus scopes, and hit-testing.

---

## 1. SolidJS Universal Reconciler

Vexart uses `createRenderer` from `solid-js/universal` to compile JSX directly into a retained TypeScript scene graph without a Virtual DOM.

### Reconciler Configuration Methods
The renderer contract is bound to custom scene graph nodes (`TGENode`):

```typescript
const renderer = createRenderer<TGENode>({
  createElement(string: string): TGENode {
    return createNode(string as TGENodeKind)
  },
  createTextNode(value: string | number): TGENode {
    return createTextNode(String(value))
  },
  replaceText(node: TGENode, value: string): void {
    node.text = String(value)
    // Raw text children (created by createTextNode) are never walked by walkTree —
    // the parent <text> element is the unit tracked by nodeRefById & layer cache.
    // Mark the parent dirty so scoped dirty tracking resolves correctly instead
    // of falling back to markAllDirty().
    const target = node.parent?.kind === "text" ? node.parent : node
    target._flexNode?.markDirty()
    markNodeVisualDamage(target)
    markNodeDirty(target)
  },
  setProperty(node: TGENode, name: string, value: unknown, prev: unknown): void {
    // Optimized pre-parsing & bitmask dispatch (see below)
  },
  insertNode(parent: TGENode, node: TGENode, anchor?: TGENode): void {
    insertChild(parent, node, anchor)
    syncCompositorLayerBacking(node)
    onSubtreeChanged(parent.id)
    markDirty()
  },
  removeNode(parent: TGENode, node: TGENode): void {
    unregisterSubtree(node) // Recursively purges focus entries
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
  }
})
```

### Pre-Parsing & Fast-Path Optimizations
To avoid doing string parsing and layout translation during the 60fps render loop, `setProperty` eagerly resolves complex properties once on mutation:

1. **Color Pre-Parsing**: Colors (`backgroundColor`, `borderColor`, `color`, and nested colors inside `glow`, `shadow`, `gradient`, `hoverStyle`, `activeStyle`, `focusStyle`) are resolved immediately from CSS-like strings (`"#ffffff"`, `"#00000080"`) into packed 32-bit unsigned integers (`u32 0xRRGGBBAA`) via `parseColor()`. Theme swapping updates the SolidJS signal, re-triggering `setProperty` with zero remounting overhead.
2. **Sizing Pre-Parsing**: Sizing definitions (`width`, `height`, `minWidth`, etc.) are resolved once to `SizingInfo` (numeric pixel values, percentage fractions, auto, or flex points) via `parseSizing()`.
3. **Property Classification Flags**: Property names are mapped via bitmasks (`PROP_FLAGS`):
   - `FLAG_VISUAL_DAMAGE` (`1`): Triggers `markNodeLayerDamaged()` to invalidate GPU layer cache.
   - `FLAG_COLOR` (`2`): Triggers single-pass `resolveColor()`.
   - `FLAG_STYLE_SUB_COLOR` (`4`): Resolves nested color tokens inside interactive style blocks.
   - `FLAG_COMPOSITOR` (`8`): Informs the retained layer compositor (`layer`, `willChange`, `transform`, `opacity`, `filter`).

---

## 2. Scene Graph Node Model

The scene graph consists of retained `TGENode` structures:

### Node Kinds (`TGENodeKind`)
- `root`: Root container mapped to terminal viewport dimensions.
- `box`: Rectangular layout and visual container supporting borders, corners, gradients, shadows, and backdrop filters.
- `text`: Typography leaf node with font configuration, wrapping, and text measurement hooks.
- `img`: Hardware-accelerated image container with GPU texture caching.
- `canvas`: Immediate/retained drawing surface with custom display lists.

### Node Transforms & Coordinate Spaces
Each node maintains affine and projective matrices (stored as flat 9-element 3x3 matrices in column-major order):
- `_transform`: Local transformation matrix computed from `rotate`, `scale`, `translate`, `skew`, or `perspective`.
- `_transformInverse`: Inverse local transform matrix.
- `_accTransform`: Accumulated world transform matrix multiplied down the hierarchy.
- `_accTransformInverse`: Accumulated world inverse transform matrix used for transform-aware hit-testing.

---

## 3. Flexily Layout Engine Integration

Layout is calculated via Flexily (a high-performance, zero-dependency pure JavaScript layout engine with a Yoga-compatible flexbox model).

### Synchronization (`flex-sync.ts`)
Each `TGENode` retains a corresponding `_flexNode`. Whenever layout props mutate in `setProperty` (`flexDirection`, `alignItems`, `justifyContent`, `padding`, `margin`, `gap`), `syncLayoutProp` updates the backing Flexily node immediately.

### Text Measurement Callbacks
Text nodes cannot be measured purely by geometry. Flexily invokes the lazy text layout callback `measureForLayout`:
- Interacts with `text-layout.ts` or MSDF font cache.
- Returns exact dimensions `{ width, height }` based on font family, font size, line height, and text content.
- Cache-backed: Repeated measurements with identical text and constraints hit an LRU text layout cache.

### Walk-Tree, Culling & Writeback
Each frame execution runs:
1. **Flexily Computation**: `flexNode.calculateLayout(viewportWidth, viewportHeight)` resolves tree geometry.
2. **Layout Writeback (`writeLayoutBack`)**: Traverses the tree and copies calculated offsets and dimensions from Flexily nodes back into `TGENode.layout` (`{ x, y, width, height }`).
3. **DFS Walk-Tree (`walkTree`)**:
   - Computes accumulated transforms ($M_{acc} = M_{parent} \times M_{local}$).
   - Computes Axis-Aligned Bounding Boxes (AABB) in viewport space.
   - **AABB Viewport Culling**: Compares node bounds against the terminal screen viewport. Nodes completely outside the screen bounds or obscured by clipping containers are culled prior to GPU command generation.

---

## 4. Floating Elements Subsystem

The floating elements subsystem allows subtrees to break free of standard flex and grid layout flows to render popovers, tooltips, context menus, and modal layers.

### Floating Props & Configuration
Nodes declare floating behavior via props on `<box>` or `<text>` elements:
- `floating?: "parent" | "root" | { attachTo: string }`: Specifies the anchor reference frame:
  - `"parent"`: Positions relative to the immediate layout parent container.
  - `"root"`: Anchors directly to the root viewport bounds, ignoring ancestor scroll offsets and local layout positions.
  - `{ attachTo: string }`: Anchors dynamically to an arbitrary target node identified by node ID or key string.
- `floatOffset?: { x: number, y: number }`: Translation delta in pixels applied relative to the anchor attachment point.
- `floatAttach?: { element?: AttachPoint, parent?: AttachPoint }`: Alignment point definitions (`LEFT_TOP`, `CENTER`, `RIGHT_BOTTOM`, `CENTER_TOP`, etc.) defining which anchor point of the floating element aligns with which anchor point of the target/parent bounding rect.
- `zIndex?: number`: Numerical stacking context depth. Floating elements sort by `zIndex` (`node.props.floating ? (node.props.zIndex ?? 0) : 0`).
- `viewportClip?: boolean`: Defaults to `true`. When explicitly set to `false`, exempts the floating subtree from parent container clipping and screen viewport clipping, allowing elements to escape bounded containers.

### Pre-Measurement & Layout Cycle
Floating layout is integrated into `layout-adapter.ts`:
1. **Flow Exclusion**: Floating nodes are detached from Flexily parent track calculation, preventing them from altering the dimensions or sibling distribution of regular flex/grid items.
2. **Intrinsic Pre-Measurement**: Floating wrappers with `"fit"` or unconstrained dimensions are pre-measured from their intrinsic children before anchoring calculations execute.
3. **Anchor Coordinate Resolution**: Once anchor target bounds are resolved, the adapter calculates final coordinates:
   $$x = x_{anchor} + x_{parentPoint} - x_{elementPoint} + offset.x$$
   $$y = y_{anchor} + y_{parentPoint} - y_{elementPoint} + offset.y$$
4. **Stacking Context Depth Sorting**: Before emitting GPU paint commands, the render loop performs a stable depth sort on all floating nodes based on `zIndex`, guaranteeing that overlays render strictly above underlying UI surfaces.

---

## 5. Scroll Routing & Programmatic Control

Scroll containers provide bounded viewports with scrollable child content extents, mouse-wheel routing, and imperative programmatic scrolling.

### Scroll Routing & Hit-Testing (`routeScrollDeltas`)
Located in `loop/composite-scroll.ts`:
- Mouse-wheel scroll deltas (`sdx`, `sdy`) are routed through `routeScrollDeltas(s, sdx, sdy)`.
- Dispatches wheel deltas to the **innermost** scroll container whose bounding box contains the mouse pointer.
- When multiple scrollable containers overlap at the same cursor position, an area-weighting heuristic selects the smallest enclosing container, ensuring nested scrollers receive input before outer scroll views.

### Geometry & Command Offsets (`applyScrollOffsets`)
- `applyScrollOffsets(commands, s, markDirtyLayer)` adjusts render commands before dispatching to the native compositor.
- Content extents (`scrollWidth`, `scrollHeight`) are calculated from the bounding box of all descendant layout nodes.
- Clips and isolates nested containers: commands belonging to the scroll container have their positions shifted by $(-scrollX, -scrollY)$.
- When scroll offsets shift, `applyScrollOffsets` invokes `markDirtyLayer(key)` to flag the container's GPU layer for repaint.

### Programmatic `ScrollHandle` API (`loop/scroll.ts`)
Components obtain an imperative handle via `createScrollHandle(scrollId: string)`:
```typescript
const handle = createScrollHandle("my-scroller")
handle.scrollTo(0, 150)           // Scroll to absolute coordinates
handle.scrollBy(0, 20)            // Relative scroll displacement
handle.scrollIntoView("child-id") // Scroll until child is visible within viewport
```
- **Accessors**:
  - `handle.scrollX()`: Current horizontal scroll offset in pixels.
  - `handle.scrollY()`: Current vertical scroll offset in pixels.
  - `handle.maxScrollX()`: Maximum horizontal scrollable travel ($\max(0, scrollWidth - viewportWidth)$).
  - `handle.maxScrollY()`: Maximum vertical scrollable travel ($\max(0, scrollHeight - viewportHeight)$).
  - `handle.viewportWidth()` / `handle.viewportHeight()`: Visible container dimensions.
- **Lifecycle**: Handles are released via `releaseScrollHandle(scrollId)` or wiped on loop destruction via `resetScrollHandles()`.

---

## 6. Frame Scheduling, Damage Tracking & Compositor Fast-Path

Vexart employs fine-grained dirty tracking, prioritized task queuing, compositor fast-paths, and dynamic frame rate scheduling to deliver smooth 60fps animations while resting at near-zero CPU/GPU utilization during idle states.

### Dirty Scopes (`DIRTY_KIND`)
- `FULL` (`"full"`): Complete scene invalidation (e.g. terminal resize, layer clear, root re-layout). Forces re-render of all GPU targets.
- `INTERACTION` (`"interaction"`): User interaction active (e.g. mouse move, active drag, key press).
- `NODE_VISUAL` (`"node-visual"`): Visual property change localized to specific nodes or regions without affecting layout geometry.

### Fine-Grained Damage Tracking
`markNodeLayerDamaged(nodeId, rect?)` registers localized damage rectangles:
- Intersects damage with existing layer boundaries.
- Prevents redrawing clean background layers when only a cursor or hover effect changes.

### Dual-Cadence Frame Scheduler
The loop automatically toggles between two cadence modes:
- **Idle Cadence**: Defaults to 30–60 FPS (or configurable lower idle cadence) with timers throttled when no input or animations are pending.
- **Interaction Boost Cadence**: Active interactions immediately trigger cadence boost windows:
  - `key`: Boost window of **220ms**.
  - `scroll`: Boost window of **320ms**.
  - `pointer`: Boost window of **520ms**.
  During boost windows, the scheduler locks to maximum target FPS (typically 60fps) and prioritizes input responsiveness.

### 3-Priority Frame Budget Scheduler (`scheduler/index.ts`)
The engine implements a priority-queue scheduler maintaining three execution lanes drained per frame in strict priority order via `scheduler.drainFrame(budgetMs, isIdle)`:
1. `user-blocking`: **Immediate, no deferral**. Always executes in the current frame regardless of time elapsed. Used for keyboard input dispatch, focus switches, and synchronous interaction bindings.
2. `user-visible`: **Budget-bound execution** (default budget: **12ms** per frame). Runs tasks until the per-frame budget is exhausted; any remaining tasks are deferred to the subsequent frame. Used for data fetch updates rendering into view and non-blocking layout changes.
3. `background`: **Idle-only execution**. Runs only when `isIdle()` returns true (no active interaction boost windows and no pending reconciler dirty states) and remaining frame budget exists. Used for prefetching, offscreen preparation, and cache pruning.
- Scheduled tasks return a cancellation cleanup closure: `const cancel = scheduler.scheduleTask("user-visible", fn)`.

### Compositor Animation Fast-Path (`animation/compositor-path.ts`)
When animating visual properties on a retained layer-backed node (`layer={true}` or `willChange`):
1. The animation system registers active descriptors in a global fast-path table keyed by `${nodeId}:${property}` (`registerAnimationDescriptor`).
2. The frame loop queries `isCompositorOnlyFrame()`:
   - Returns `true` if at least one compositor descriptor is active and **zero non-compositor properties** (`width`, `height`, `backgroundColor`, etc.) were mutated in the frame.
3. **Bypass Optimization**: When `isCompositorOnlyFrame()` evaluates to `true`, the engine **completely bypasses** the Solid reconciler, Flexily layout calculations, and DFS `walkTree` passes.
4. It dispatches transform matrices and uniform updates directly to the native GPU compositor, rendering at locked 60fps with zero layout allocations.

### Retained GPU Layer Promotion
Subtrees undergoing high-frequency transformations, opacity fades, or continuous pointer interactions are evaluated by `shouldPromoteInteractionLayer()`. Promoted subtrees are isolated into dedicated offscreen GPU render targets. During subsequent interaction frames, the compositor transforms the existing texture without re-rasterizing the underlying vector commands.

---

## 7. Terminal Lifecycle Management

Entering and exiting the terminal runtime is managed in `terminal/lifecycle.ts`. Restoration is installed into process exit hooks (`SIGINT`, `SIGTERM`, unhandled exceptions) to guarantee that the terminal is never left corrupted.

### Terminal Control Escape Sequences
- **Raw Mode**: `stdin.setRawMode(true)` disables line buffering and local echo.
- **Alternate Screen Buffer**:
  - Enter: `\x1b[?1049h`
  - Leave: `\x1b[?1049l`
- **Cursor Visibility**:
  - Hide: `\x1b[?25l`
  - Show: `\x1b[?25h`
- **Mouse Tracking**: SGR extended mode (1006) combined with all-event tracking (1003):
  - Enter: `\x1b[?1003h\x1b[?1006h`
  - Leave: `\x1b[?1003l\x1b[?1006l`
- **Keyboard Protocols**:
  - Direct Terminal (Kitty Keyboard Protocol): `\x1b[>1u` (enter) / `\x1b[<u` (leave).
  - tmux Extended Keys: `\x1b[>4;1m` (enter) / `\x1b[>4;0m` (leave).
- **Bracketed Paste**:
  - Enter: `\x1b[?2004h`
  - Leave: `\x1b[?2004l`
- **Synchronized Output**: Eliminates tearing during frame presentation:
  - Begin Frame: `\x1b[?2026h`
  - End Frame: `\x1b[?2026l`

---

## 8. Input Parsing & Dispatch

The input subsystem processes raw byte streams from standard input and maps them into structured event dispatches.

### Parser & Byte Stream State Machine
`createParser` consumes ANSI escape sequences and UTF-8 bytes:
- `parseKey`: Identifies special keys, functional keys (`F1`..`F12`), arrow keys, and decodes modifier bitmasks:
  - `shift`: `1`
  - `alt`: `2`
  - `ctrl`: `4`
  - `meta`: `8`
- `parseMouse`: Decodes SGR mouse sequences (`\x1b[<button;col;rowM` or `m`):
  - Maps column/row cell coordinates into subpixel coordinates based on terminal cell pixel dimensions (`pixelWidth / cols`, `pixelHeight / rows`).
  - Emits `mousedown`, `mouseup`, `mousemove`, and `wheel` events.

### Event Bubbling & Pointer Capture Contracts
Vexart enforces explicit propagation and pointer capture contracts across the scene graph:

- **`onPress` Event Bubbling**:
  - `onPress` is a semantic activation event triggered by mouse clicks or keyboard activation (`Enter` / `Space`).
  - Bubbles recursively up the scene graph hierarchy from the target leaf node to ancestor containers.
  - Supports `e.stopPropagation()`: Invoking `stopPropagation()` on the `PressEvent` halts traversal immediately, preventing ancestor handlers from executing.
- **Node-Level Mouse Events Do NOT Bubble**:
  - Direct pointer events (`onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`) do **NOT** bubble up the scene graph.
  - They dispatch directly and exclusively to the specific target node resolved by transform-aware hit-testing. This prevents parent containers from inadvertently capturing or reacting to low-level pointer movements intended for child elements.
- **Pointer Capture (`setPointerCapture` / `releasePointerCapture`)**:
  - `setPointerCapture(nodeId)` redirects all subsequent global pointer movement (`onMouseMove`) and pointer release (`onMouseUp`) events directly to the captured node, regardless of where the cursor travels across the terminal window.
  - `releasePointerCapture(nodeId)` releases the capture lock, restoring standard hit-test routing.
  - **Essential Use Cases**: Critical for fluid drag-and-drop operations, slider tracks and thumbs, scrollbar handles, and split-pane resizers, preventing mouse events from dropping if the user rapidly drags the pointer outside the element's layout bounds.

---

## 9. Focus Management & Scopes

Terminal applications depend entirely on keyboard focus graphs without browser focus rings.

### Focus Graphs & Scopes
- Focusable nodes register with `registerNodeFocusable(node)`.
- **Tab Cycling**: Pressing `Tab` or `Shift+Tab` cycles forward and backward through registered focusable nodes in layout order, wrapping seamlessly at boundaries.
- **Focus Scopes (`pushFocusScope`)**: Modal dialogs, popovers, and drawers push a new `FocusScope`. Tab cycling is strictly trapped within the active scope until dismissed.
- **Asynchronous Focus Repair**:
  - `adjustFocusableAncestors` maintains `_focusableCount` counters up the parent chain.
  - When a node is unmounted, `removeNode` invokes `unregisterSubtree(node)` to immediately purge destroyed children, preventing ghost focus states.

---

## 10. Transform-Aware Hit-Testing

Hit-testing operates in screen pixel space and accurately determines the target node even when affine or perspective transformations are applied.

### Inverse Matrix Projection
When a node or its ancestors have transformations, `buildNodeMouseEvent` computes local coordinates using the accumulated inverse matrix $M_{acc}^{-1}$:

$$\begin{pmatrix} x' \\ y' \\ w' \end{pmatrix} = \begin{pmatrix} M_{00} & M_{01} & M_{02} \\ M_{10} & M_{11} & M_{12} \\ M_{20} & M_{21} & M_{22} \end{pmatrix} \begin{pmatrix} x_{rel} \\ y_{rel} \\ 1 \end{pmatrix}$$

where $x_{rel} = x_{pointer} - x_{node}$ and $y_{rel} = y_{pointer} - y_{node}$.

The normalized local node coordinates are resolved by dividing by the homogeneous coordinate $w'$:

$$nodeX = \frac{x'}{w'}, \quad nodeY = \frac{y'}{w'}$$

If $|w'| \le 10^{-12}$, the point falls outside the projective plane.

### Scroll Container Geometry
`setActiveScrollOffsets(offsets)` passes active scroll offsets to hit-testing. `isFullyOutsideScrollViewport()` discards nodes that are clipped outside parent scroll containers.

---

## 11. Tree-Sitter Syntax Highlighting Architecture

Located in `packages/engine/src/reconciler/tree-sitter/`:
- **WASM Runtime**: Uses `web-tree-sitter` running in WebAssembly.
- **Background Worker**: `parser.worker.ts` parses code off the main rendering thread to prevent frame drops during large file tokenization.
- **TreeSitterClient**: `getTreeSitterClient()` manages parser singletons and preloads default language grammars (`javascript`, `typescript`, `markdown`, `markdown_inline`).
- **Query Highlights (`.scm`)**: Tree-sitter tree nodes are matched against tree-sitter SCM queries (`highlights.scm`, `injections.scm`).
- **Token Output**: `highlightsToTokens()` converts syntax captures to typed runs with themes (`ONE_DARK`, `KANAGAWA`, or custom `SyntaxStyle`).

---

## 12. Extmarks Subsystem (`reconciler/extmarks.ts`)

The extmarks system manages positioned character-range decorations and inline annotations for text areas, code editors, and input fields.

### Range Decorations & Visual Styling
Each extmark attaches to a half-open character range `[start, end)`:
- `start`: Start character offset (inclusive).
- `end`: End character offset (exclusive). For ghost text, `start === end`.
- `typeId`: Numeric type identifier returned by `mgr.registerType(name)` for rapid type-filtered queries.
- `styleId`: Optional syntax style identifier from `SyntaxStyle.getStyleId(token)`.
- `fg` / `bg`: Optional packed RGBA color overrides (`u32 0xRRGGBBAA`).
- `priority`: Numeric layering priority. When extmarks overlap on the same character range, higher priority styles take precedence.
- `data`: Arbitrary payload dictionary attached to the mark.

### Ghost Text Autocompletion
When `ghost: true` and `start === end`, the extmark represents inline ghost text (e.g. LLM code completion suggestions or shell autosuggestions). The renderer displays the suggestion in semi-transparent styling directly following the cursor without altering underlying buffer indices.

### Buffer Shift Offsets (`adjustForEdit`)
When text edits occur, `adjustForEdit(editStart, oldEnd, newEnd)` maintains extmark positioning:
- Marks situated entirely after the edit shift by $\Delta = newEnd - oldEnd$.
- Marks encompassing the edit point expand or truncate accordingly.
- Marks strictly inside deleted text collapse to the edit point.
- Zero-length non-ghost marks are automatically pruned.

---

## 13. CSS Grid Beta Subsystem

Located in `packages/engine/src/ffi/grid-types.ts`, `layout-adapter-grid.test.ts`, and `packages/internal-flexily`:

### Container & Item Alignment Props
- **Container Alignment**:
  - `justifyItems`: Horizontal item alignment within grid cells (`"start" | "end" | "center" | "stretch"`).
  - `alignItems`: Vertical item alignment within grid cells (`"start" | "end" | "center" | "stretch"`).
  - `justifyContent`: Distribution of entire grid tracks along the horizontal axis (`"start" | "end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch"`).
  - `alignContent`: Distribution of entire grid tracks along the vertical axis (`"start" | "end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch"`).
- **Item Self Alignment**:
  - `justifySelf`: Overrides horizontal alignment for a specific grid child (`"start" | "end" | "center" | "stretch"`).
  - `alignSelf`: Overrides vertical alignment for a specific grid child (`"start" | "end" | "center" | "stretch"`).

### Track Syntax & Sizing Definitions
The grid solver supports flexible, bounded, and repeated track specifications:
- **Fractional Tracks (`fr`)**: Distribute available free space proportionally (e.g. `[{ fr: 1 }, { fr: 2 }]`).
- **MinMax Bounds (`minmax`)**: Bounded track widths `{ minmax: [minBreadth, maxBreadth] }` where bounds can be numeric pixels, percentages, `"auto"`, `"min-content"`, or `"max-content"`.
- **Fit-Content (`fitContent`)**: Caps max-content sizing at a fixed pixel or percentage ceiling `{ fitContent: 120 }`.
- **Repetitions (`repeat`)**: Expands repeated patterns `{ repeat: { count: number | "auto-fill" | "auto-fit", tracks } }`.
- **Implicit Auto Tracks**: `gridAutoColumns` and `gridAutoRows` define automatic track sizing for out-of-bounds placements.

### Auto-Placement & Dense Packing
`gridAutoFlow` controls automatic placement direction:
- `"row"`, `"column"`: Places unplaced items along row or column axes.
- `"row-dense"`, `"column-dense"`: Enables dense cursor back-tracking, scanning earlier empty cell gaps to fill holes before advancing placement.

### Intrinsic Cycle Breaking & Diagnostic Recovery
Intrinsic sizing in terminal grids (e.g. text wrapping inside fractional columns) can trigger cyclic dependencies between track widths and cell heights:
1. **Two-Pass Intrinsic Sizing**: The solver tracks `GridCalculateStats.intrinsicPasses` (`1 | 2`), measuring items under unconstrained constraints before resolving definite track breadths.
2. **Snapshot Caching**: Validated layout styles are cached in `GridSnapshot`. When track computations produce no delta, `stats.cacheHit` and `stats.noOp` bypass recalculation.
3. **Graceful Error Recovery**: If invalid dimensions or cyclic conflicts occur, the solver emits a `GridLayoutError` with diagnostic code (`GRID_INVALID_VALUE`, `GRID_CONFLICTING_PLACEMENT`, etc.) and seamlessly falls back to the prior valid frame bounds without dropping frames or throwing unhandled exceptions.

---

## 14. Full Hooks Reference

Vexart provides a comprehensive suite of reactive hooks deeply integrated with SolidJS reactivity and the native rendering engine.

### `useQuery<T>`
Reactive data-fetching primitive for async resources:
- **Signature**: `useQuery<T>(fetcher: () => Promise<T>, options?: QueryOptions): QueryResult<T>`
- **Options**:
  - `enabled?: boolean`: Whether to fetch immediately upon component mounting (default: `true`).
  - `refetchInterval?: number`: Auto-refetch polling interval in milliseconds (0 = disabled).
  - `retry?: number`: Number of consecutive retry attempts upon failure (default: `0`).
  - `retryDelay?: number`: Delay in milliseconds between retries (default: `1000`).
- **Return Value (`QueryResult<T>`)**:
  - `data: () => T | undefined`: Reactive signal accessor returning fetched data.
  - `loading: () => boolean`: Reactive signal indicating active in-flight request.
  - `error: () => Error | undefined`: Reactive signal containing the last fetch error.
  - `refetch: () => void`: Manually triggers fetcher re-execution.
  - `mutate: (updater: T | ((prev: T | undefined) => T)) => void`: Optimistically updates local cache.

### `useMutation<T, V = void>`
Reactive mutation primitive for async actions and state modifications:
- **Signature**: `useMutation<T, V = void>(mutator: (variables: V) => Promise<T>, options?: MutationOptions<T, V>): MutationResult<T, V>`
- **Options**:
  - `onMutate?: (variables: V) => T | undefined`: Pre-mutation hook returning optimistic data applied immediately.
  - `onSuccess?: (data: T, variables: V) => void`: Callback executed on successful completion.
  - `onError?: (error: Error, variables: V, previousData: T | undefined) => void`: Callback on failure; automatically restores previous data for optimistic rollbacks.
  - `onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void`: Callback invoked on either success or error.
- **Return Value (`MutationResult<T, V>`)**:
  - `data: () => T | undefined`: Last successful mutation result.
  - `loading: () => boolean`: Whether mutation is currently in flight.
  - `error: () => Error | undefined`: Last failure error.
  - `mutate: (variables: V) => Promise<T | undefined>`: Executes mutation with optimistic updates and automatic rollback.
  - `reset: () => void`: Resets status signals back to idle.

### `useDrag`
Pointer capture and mouse drag interaction hook:
- **Signature**: `useDrag(opts: DragOptions): DragState`
- **Options**:
  - `onDragStart?: (evt: NodeMouseEvent) => boolean | void`: Invoked on pointer down; returning `false` cancels drag.
  - `onDrag: (evt: NodeMouseEvent) => void`: Invoked on each mouse movement while dragging.
  - `onDragEnd?: (evt: NodeMouseEvent) => void`: Invoked on pointer release.
  - `disabled?: () => boolean`: Reactive predicate disabling drag behavior.
  - `interaction?: InteractionBinding`: Binds to an interaction layer (`"auto" | "none"` or `InteractionLayerState`).
- **Return Value (`DragState`)**:
  - `dragging: () => boolean`: Reactive signal returning `true` during active drag.
  - `dragProps`: Object containing `{ ref, onMouseDown, onMouseMove, onMouseUp }` spreading pointer capture (`setPointerCapture`) and interaction tracking onto the target node.

### `useHover`
Mouse hover tracking hook with configurable debounce timers:
- **Signature**: `useHover(opts?: HoverOptions): HoverState`
- **Options**:
  - `onEnter?: () => void`: Callback invoked when hover initiates.
  - `onLeave?: () => void`: Callback invoked when hover ends.
  - `delay?: number`: Debounce delay in milliseconds before setting hover to `true`.
  - `leaveDelay?: number`: Debounce delay in milliseconds before clearing hover state.
  - `disabled?: () => boolean`: Reactive predicate disabling hover detection.
- **Return Value (`HoverState`)**:
  - `hovered: () => boolean`: Reactive boolean signal reflecting hover status.
  - `hoverProps`: Object `{ onMouseOver, onMouseOut }` to spread onto target elements.

### `useFocus`
Registers a keyboard-focusable entry within the engine focus graph:
- **Signature**: `useFocus(opts?: { id?: string; onKeyDown?: (event: KeyEvent) => void; onPress?: () => void }): FocusHandle`
- **Return Value (`FocusHandle`)**:
  - `focused: () => boolean`: Reactive signal returning `true` when this entry has focus.
  - `focus: () => void`: Imperatively requests focus for this entry.
  - `id: string`: Unique focusable identifier. Automatically unregisters upon component cleanup.

### `useKeyboard`
Direct keyboard event stream subscription:
- **Signature**: `useKeyboard(): KeyboardState`
- **Return Value (`KeyboardState`)**:
  - `key: () => KeyEvent | null`: Reactive signal emitting the most recent key event.
  - `pressed: (name: string) => boolean`: Checks if a specific key name (e.g. `"Enter"`, `"Escape"`, `"ArrowUp"`) matches the active event.

### `useMouse`
Direct mouse position and button state subscription:
- **Signature**: `useMouse(): MouseState`
- **Return Value (`MouseState`)`:
  - `mouse: () => TGEMouseEvent | null`: Reactive signal emitting the most recent mouse event.
  - `pos: () => { x: number; y: number }`: Subpixel mouse cursor coordinates.

### `useInput`
Raw terminal input stream subscription:
- **Signature**: `useInput(): () => InputEvent | null`
- **Return Value**: Reactive accessor emitting all incoming raw `InputEvent` records (key, mouse, resize, paste, focus).

### `useTerminalDimensions`
Live reactive terminal window dimensions:
- **Signature**: `useTerminalDimensions(terminal: Terminal): { width, height, cols, rows, cellWidth, cellHeight }`
- **Return Value**: Reactive accessors for pixel dimensions (`width()`, `height()`), grid character dimensions (`cols()`, `rows()`), and font cell sizes (`cellWidth()`, `cellHeight()`), synchronized with `terminal.onResize`.

---

## 15. Engine Public API Reference

The explicit public exports of `@vexart/engine` (from `packages/engine/src/public.ts`):

### FFI & Renderer Backend
- `setRendererBackend`, `getRendererBackend`, `getRendererBackendName`, `createGpuRendererBackend`, `getGpuRendererBackendCacheStats`
- `chooseGpuLayerStrategy`, `buildRenderOp`, `buildRenderGraphFrame`, `BACKDROP_FILTER_KIND`, `getRendererResourceStats`
- Matrix math: `identity`, `translate`, `rotate`, `scale`, `scaleXY`, `skew`, `perspective`, `multiply`, `invert`, `transformPoint`, `transformBounds`, `fromConfig`, `isIdentity`
- Damage math: `intersectRect`, `unionRect`, `expandRect`, `translateRect`, `damageRectArea`, `damageSumOverlapArea`, `rectRight`, `rectBottom`, `isEmptyRect`
- Canvas & Particles: `CanvasContext`, `createParticleSystem`, `createLayerStore`
- Scene Graph: `createNode`, `insertChild`, `removeChild`, `parseColor`, `parseSizing`, `parseDirection`, `parseAlignX`, `parseAlignY`, `createPressEvent`, `resolveProps`
- Bridge Symbols: `EXPECTED_BRIDGE_VERSION`, `VEXART_SYMBOLS`, `VexartNativeError`, `openVexartLibrary`, `closeVexartLibrary`, `GRAPH_MAGIC`, `GRAPH_VERSION`, `vexartGetLastError`, `vexartVersion`, `assertBridgeVersion`
- Font FFI: `registerFont`, `getFont`, `clearTextCache`, `getTextLayoutCacheStats`, `FontDescriptor`, `msdfFontInit`, `msdfFontQuery`, `msdfMeasureText`, `isMsdfFontAvailable`, `MsdfTextMeasurement`

### Reconciler & Subsystems
- Reconciler: `solidRender`, `effect`, `memo`, `createComponent`, `createElement`, `createTextNode`, `insertNode`, `insert`, `spread`, `setProp`, `mergeProps`, `use`, `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`
- Data & State: `useQuery`, `useMutation`, `createDirtyTracker`, `onGlobalDirty`, `markDirty`, `isDirty`, `clearDirty`, `DIRTY_KIND`
- Pointer & Interaction: `useDrag`, `useHover`, `beginNodeInteraction`, `endNodeInteraction`, `hasActiveNodeInteraction`, `hasInteractionInSubtree`, `shouldPromoteInteractionLayer`, `shouldFreezeInteractionLayer`, `useInteractionLayer`, `setPointerCapture`, `releasePointerCapture`, `markNodeLayerDamaged`, `requestInteractionFrame`, `bindLoop`, `unbindLoop`
- Focus: `focusedId`, `setFocusedId`, `setFocus`, `pushFocusScope`, `getFocusedEntry`, `useFocus`, `registerNodeFocusable`, `updateNodeFocusEntry`, `unregisterNodeFocusable`, `getNodeFocusId`, `resetFocus`
- Node Handles: `createHandle`, `NodeHandle`
- Extmarks: `ExtmarkManager`, `Extmark`, `CreateExtmarkOptions`
- Plugin Slots: `createSlotRegistry`, `createSlot`, `SlotComponent`, `TgePluginApi`, `TgePlugin`, `SlotRegistry`
- Hit-Testing & Selection: `buildNodeMouseEvent`, `isFullyOutsideScrollViewport`, `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal`, `resetSelection`
- Syntax Highlighting: `TreeSitterClient`, `getTreeSitterClient`, `addDefaultParsers`, `SyntaxStyle`, `ONE_DARK`, `KANAGAWA`, `highlightsToTokens`

### Loop & Scheduler
- `createRenderLoop`, `createFrameScheduler`, `onInput`, `dispatchInput`, `getLatestInteractionTrace`, `useKeyboard`, `useMouse`, `useInput`
- `updateScrollContainerGeometry`, `createScrollHandle`, `releaseScrollHandle`, `resetScrollHandles`, `ScrollHandle`
- `markLayerDirtyByKey`, `markLayerDamageByKey`
- `createScaledImageCache`, `decodeImageForNode`, `scaleImage`, `clearImageCache`, `getImageCacheStats`
- `boostWindowFor`, `hasRecentInteraction`, `hasActiveAnimations`, `easing`, `createTransition`, `createSpring`, `CompositorProperty`
- Debugging: `toggleDebug`, `setDebug`, `isDebugEnabled`, `debugFrameStart`, `debugUpdateStats`, `debugState`, `debugStatsLine`, `debugDumpTree`, `debugDumpCulledNodes`

### Input
- `createParser`, `parseKey`, `parseMouse`, `NO_MODS`, `decodeMods`
- Types: `InputHandler`, `InputParser`, `Modifiers`, `KeyEvent`, `MouseAction`, `MouseEvent`, `FocusEvent`, `PasteEvent`, `ResizeEvent`, `InputEvent`

### Terminal & Output
- Terminal: `createTerminal`, `detect`, `inferCaps`, `probeKittyGraphics`, `queryColors`, `getSize`, `queryPixelSize`, `onResize`, `enter`, `leave`, `beginSync`, `endSync`, `inTmux`, `parentTerminal`, `passthroughSupported`, `createWriter`, `wrapPassthrough`
- Output & Kitty: `probeShm`, `probeFile`, `getKittyTransportStats`, `resetKittyTransportStats`, `COMPRESS_MODE`, `configureKittyTransportManager`, `getKittyTransportManagerState`, `reportKittyTransportFailure`, `reportKittyTransportSuccess`, `resetKittyTransportManager`, `resolveKittyTransportMode`, `TRANSPORT_FAILURE_REASON`, `TRANSPORT_HEALTH`, `getNativeKittyShmHelperVersion`, `prepareNativeKittyShm`, `releaseNativeKittyShm`

### Mount
- `mount`, `useTerminalDimensions`, `decodePasteBytes`, `MouseButton`, `RGBA`, `createContext`, `useContext`
