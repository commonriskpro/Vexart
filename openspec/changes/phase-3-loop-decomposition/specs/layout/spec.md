# Delta for layout

## ADDED Requirements

### Requirement: Layout adapter module extraction

The system MUST extract the `VexartLayoutCtx` factory and its helper functions (loop.ts L49–568) into `loop/layout.ts` as a standalone module. The factory `createVexartLayoutCtx()` MUST return the same public interface consumed by walk-tree.

#### Scenario: Layout context produces identical commands

- GIVEN the same TGENode tree and viewport dimensions
- WHEN layout is computed via the extracted `layout.ts`
- THEN the resulting `RenderCommand[]` is structurally identical to loop.ts pre-extraction
- AND `getLastLayoutMap()` returns the same `Map<bigint, PositionedCommand>`

#### Scenario: Layout buffer reuse across frames

- GIVEN a `VexartLayoutCtx` instance
- WHEN multiple frames are computed sequentially
- THEN the internal 256KB layout buffer is reused (no allocation on hot path)
- AND `_layoutBuf`, `_outBuf`, `_outUsedBuf` are shared ArrayBuffer instances

### Requirement: Layout writeback extraction

The system MUST extract `writeLayoutBack` (loop.ts L1902–2054) into `loop/layout-writeback.ts` as a standalone function `writeLayoutBack(commands, boxNodes, textNodes, rectNodes, layoutMap)`. This function writes computed geometry back to TGENodes and computes transform matrices.

#### Scenario: Layout positions are written to nodes

- GIVEN layout computation completes with a layout map
- WHEN `writeLayoutBack` is called
- THEN every node in `boxNodes` and `textNodes` has `node.layout.{x,y,width,height}` populated
- AND nodes with transforms have `node._transform` and `node._transformInverse` computed

#### Scenario: Accumulated transform hierarchy is computed

- GIVEN a node inside two ancestors, both with transform props
- WHEN `writeLayoutBack` runs
- THEN `node._accTransform` is the composed forward matrix
- AND `node._accTransformInverse` correctly maps screen-space pointer coords to node-local space

#### Scenario: Layout writeback has no loop.ts dependency

- GIVEN `layout-writeback.ts` is imported in isolation
- WHEN its dependency graph is traced
- THEN it does not reach `loop/index.ts`

### Requirement: Interaction state extraction

The system MUST extract `updateInteractiveStates` and related state (loop.ts L2056–2277) into `loop/interaction-state.ts` as a standalone function `updateInteractiveStates(state: InteractionState): boolean`. The function owns hover/active/focus/click detection and event dispatch.

#### Scenario: Hover detection works after extraction

- GIVEN pointer is over a node with `hoverStyle`
- WHEN `updateInteractiveStates` runs
- THEN `node._hovered` is set to `true`
- AND `onMouseOver` callback fires

#### Scenario: onPress bubbles after extraction

- GIVEN a click on a nested node
- WHEN `updateInteractiveStates` detects release-while-hovered
- THEN `PressEvent` bubbles up the parent chain
- AND `event.stopPropagation()` halts propagation

#### Scenario: Pointer capture routes events

- GIVEN node A has captured the pointer
- WHEN pointer moves outside node A
- THEN node A still receives `onMouseMove` events
- AND auto-release fires on button up

#### Scenario: InteractionState is a typed state bag

- GIVEN the coordinator creates `InteractionState`
- WHEN passed to `updateInteractiveStates`
- THEN it carries `pointerX`, `pointerY`, `pointerDown`, `pendingPress`, `pendingRelease`, `capturedNodeId`, `rectNodes`, `prevActiveNode`, `pressOriginSet`
- AND `interaction-state.ts` does not import from `loop/index.ts`

## Test Fixtures

- **fixture:layout-basic.json** — 10-node tree → expected RenderCommand[] from layout
- **fixture:layout-writeback-transform.json** — Nodes with nested transforms → expected _accTransform matrices
- **fixture:interaction-hover.json** — Pointer over/out transitions → expected _hovered state changes
- **fixture:interaction-press-bubble.json** — Click on nested node → PressEvent propagation chain
- **fixture:interaction-capture.json** — Pointer capture lifecycle → events routed to captured node
