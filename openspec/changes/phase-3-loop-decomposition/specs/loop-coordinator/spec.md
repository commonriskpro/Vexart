# Delta for loop-coordinator

## ADDED Requirements

### Requirement: loop/index.ts is a thin coordinator

After all extractions, `loop/index.ts` (the former `loop.ts`) MUST be ≤400 lines. It MUST contain only the `createRenderLoop` factory, frame scheduling logic, resize/suspend/resume/destroy handlers, and wiring between pipeline modules. It MUST NOT contain layout computation, paint logic, layer assignment algorithms, or interaction state management.

#### Scenario: Coordinator delegates to extracted modules

- GIVEN `createRenderLoop` is invoked
- WHEN `frame()` is called
- THEN the call chain is: walk-tree → layout → assign-layers → paint → composite
- AND each phase is a function call to its respective module

#### Scenario: Coordinator is under 400 lines

- GIVEN the extraction is complete
- WHEN `wc -l loop/index.ts` is run
- THEN the output is ≤400

### Requirement: State bags are owned by coordinator

The coordinator MUST own all mutable state as typed state bags: `WalkTreeState`, `InteractionState`, `LayoutState`, `PaintState`, `CompositeState`. Each pipeline module receives its state as a function argument and MUST NOT hold its own module-level mutable state.

#### Scenario: State bags are created in createRenderLoop

- GIVEN `createRenderLoop` initializes
- WHEN state bags are created
- THEN each bag is a fresh typed object with empty/zero initial values
- AND no module-level mutable arrays or maps exist in extracted modules

#### Scenario: State bags prevent circular dependencies

- GIVEN any extracted module is imported in isolation
- WHEN its imports are inspected
- THEN it does not import from `loop/index.ts`
- AND shared state flows only through function arguments

### Requirement: Frame scheduling is preserved

The coordinator MUST preserve the existing adaptive frame scheduling: idle/active intervals, interaction boost windows, nudge-based immediate frames, and the `isRenderingFrame` guard.

#### Scenario: Idle FPS is throttled

- GIVEN no animations running and no recent interaction
- WHEN the scheduler runs
- THEN frames are throttled to `idleInterval` (default: 1000/60 ≈ 16ms)

#### Scenario: Interaction boost triggers immediate frame

- GIVEN a pointer move event
- WHEN `nudgeInteraction("pointer")` is called
- THEN the next frame is scheduled with minimal delay (0ms for pointer)

### Requirement: Resize triggers full repaint

The coordinator MUST handle terminal resize by updating viewport dimensions, resetting the layout context, clearing layer cache, and forcing an immediate frame.

#### Scenario: Resize during active loop

- GIVEN the render loop is running
- WHEN `term.onResize` fires
- THEN viewport dimensions are updated
- AND `clay.setDimensions()` is called
- AND `markAllDirty()` marks all layers dirty
- AND an immediate frame is forced

### Requirement: Suspend/resume lifecycle

The coordinator MUST support suspend (stop loop, restore terminal) and resume (re-enter TGE mode, force full repaint, restart loop).

#### Scenario: Suspend stops rendering

- GIVEN the loop is running
- WHEN `suspend()` is called
- THEN the timer is cleared
- AND `term.suspend()` restores terminal state
- AND `isSuspended` is `true`

#### Scenario: Resume restarts rendering

- GIVEN the loop is suspended
- WHEN `resume()` is called
- THEN `term.resume()` re-enters TGE mode
- AND all layers are marked dirty
- AND a frame is rendered immediately
- AND the scheduling loop restarts

### Requirement: Integration tests verify end-to-end parity

Integration tests MUST verify that the decomposed pipeline produces identical output to the original monolithic loop.ts for the showcase application.

#### Scenario: Showcase renders identically

- GIVEN the showcase example runs with the decomposed pipeline
- WHEN visual output is compared frame-by-frame
- THEN the output is pixel-identical to the pre-extraction baseline

## Test Fixtures

- **fixture:coordinator-frame-pipeline.json** — Mock pipeline modules → verify call order is walk → layout → assign → paint → composite
- **fixture:coordinator-resize.json** — Resize event → verify viewport update + full repaint
- **fixture:coordinator-suspend-resume.json** — Suspend/resume cycle → verify lifecycle
- **integration:showcase-parity.ts** — Run showcase with decomposed pipeline → verify identical output
