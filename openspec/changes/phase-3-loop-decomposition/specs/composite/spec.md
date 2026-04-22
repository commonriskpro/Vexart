# Delta for composite

## ADDED Requirements

### Requirement: Composite module extraction

The system MUST extract the compositing and output phase from `frameLayered` (loop.ts L2778–2804, the orphan cleanup + `backend.endFrame` + final frame render) into `loop/composite.ts` as a standalone function `compositeLayers(input: CompositeInput): CompositeResult`.

#### Scenario: Layered output composites dirty layers

- GIVEN dirty layers were painted with kitty payloads
- WHEN `compositeLayers` runs
- THEN `layerComposer.renderLayerRaw()` was called for each painted layer with correct z-order
- AND `layerComposer.removeLayer()` was called for orphan layers

#### Scenario: Final frame raw path

- GIVEN `backend.endFrame()` returns `output: "final-frame-raw"` with `finalFrame` data
- WHEN `compositeLayers` processes the result
- THEN `layerComposer.renderFinalFrameRaw()` is called with the final frame buffer

#### Scenario: Terminal sync wraps composite

- GIVEN the composite phase starts
- WHEN compositing begins
- THEN `term.beginSync()` was called before composite
- AND `term.endSync()` is called after composite completes

#### Scenario: Debug stats are updated

- GIVEN debug mode is enabled
- WHEN composite completes
- THEN `debugUpdateStats()` is called with frame metrics (commandCount, layerCount, repaintedCount, etc.)

### Requirement: CompositeInput/CompositeResult typed contracts

`CompositeInput` MUST include `paintedSlots`, `preparedSlots`, `layerComposer`, `terminal`, `backend`, `frameCtx`. `CompositeResult` MUST include `rendererOutput`, `repaintedCount`, `ioMs`.

#### Scenario: Composite returns structured result

- GIVEN composite phase completes
- WHEN the result is returned to coordinator
- THEN `repaintedCount` matches layers actually rendered
- AND `ioMs` reflects terminal I/O time

### Requirement: Composite has no loop.ts dependency

`composite.ts` MUST NOT import from `loop/index.ts`.

#### Scenario: Standalone import

- GIVEN `composite.ts` is imported in isolation
- WHEN its dependency graph is traced
- THEN `loop/index.ts` is not reachable

## Test Fixtures

- **fixture:composite-layered.json** — Painted layers → layerComposer.renderLayerRaw() called per layer
- **fixture:composite-final-frame.json** — Backend returns final-frame-raw → renderFinalFrameRaw() called
- **fixture:composite-sync.json** — beginSync/endSync bracket verified
