# Delta for paint

## ADDED Requirements

### Requirement: Paint module extraction

The system MUST extract the paint phase from `frameLayered` (loop.ts L2449–2776, the loop over `preparedSlots` that calls `paintCommandsWithRendererBackend`) into `loop/paint.ts` as a standalone function. The function MUST accept a `PaintInput` and return `PaintResult`.

#### Scenario: Dirty layer is painted via backend

- GIVEN a prepared slot with `dirty=true` and valid bounds
- WHEN `paintLayers` processes it
- THEN `RendererBackend.paint()` is called with correct commands, offsets, and frame/layer context
- AND the returned `PaintResult` contains the kitty payload

#### Scenario: Clean layer is reused without paint

- GIVEN a prepared slot with `dirty=false`, no damage rect, and no force repaint
- WHEN `paintLayers` evaluates it
- THEN `RendererBackend.reuseLayer()` is called instead of paint
- AND no GPU work occurs

#### Scenario: Frame budget defers remaining layers

- GIVEN `experimental.frameBudgetMs > 0` and painting exceeds the budget
- WHEN remaining non-background layers are evaluated
- THEN they are deferred (marked dirty for next frame) and skipped

#### Scenario: Regional repaint uses clipped damage

- GIVEN a layer with a small damage rect (<40% of layer area) and `allowRegionalRepaint=true`
- WHEN paint runs
- THEN only commands intersecting the damage rect are painted
- AND output uses the clipped damage rect

#### Scenario: Orphan layer cleanup

- GIVEN a layer existed in the previous frame but has no matching slot this frame
- WHEN paint completes
- THEN the orphan layer is removed from `layerCache` and `layerComposer.removeLayer()` is called

### Requirement: PaintInput/PaintResult typed contracts

`PaintInput` MUST include `preparedSlots`, `commands`, `layerCache`, `viewportWidth`, `viewportHeight`, `frameBudgetMs`, `forceLayerRepaint`. `PaintResult` MUST include `repaintedCount`, `moveOnlyCount`, `stableReuseCount`, `rendererOutput`, `rendererStrategy`.

#### Scenario: Paint returns structured result

- GIVEN paint phase completes for a frame
- WHEN the result is returned to coordinator
- THEN `repaintedCount`, `moveOnlyCount`, `stableReuseCount` are accurate counts
- AND `rendererOutput` indicates the output path used ("buffer" | "layered-raw" | "final-frame-raw")

### Requirement: Paint has no loop.ts dependency

`paint.ts` MUST NOT import from `loop/index.ts`. It MAY import from `ffi/`, `reconciler/`, and `output/`.

#### Scenario: Standalone import

- GIVEN `paint.ts` is imported in isolation
- WHEN its dependency graph is traced
- THEN `loop/index.ts` is not reachable

## Test Fixtures

- **fixture:paint-dirty-layer.json** — One dirty layer → backend.paint() called
- **fixture:paint-clean-layer.json** — Clean layer → backend.reuseLayer() called
- **fixture:paint-regional-repaint.json** — Small damage rect → clipped commands
- **fixture:paint-budget-defer.json** — Budget exceeded → layers deferred
- **fixture:paint-orphan-cleanup.json** — Removed layer → layerComposer.removeLayer() called
