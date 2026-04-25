# Delta for retained-cleanup

Refs: `docs/PRD.md §6.7`, `docs/PRD.md §11`, `docs/PRD.md §12 DEC-012/DEC-014`, `docs/ARCHITECTURE.md §2.1` (engine boundary), `docs/PRD-RUST-RETAINED-ENGINE.md` (SUPERSEDED), `docs/ROADMAP-RUST-RETAINED-ENGINE.md` (SUPERSEDED).

## MODIFIED Requirements

### Requirement: TypeScript retained runtime code SHALL be binding-shell or explicit fallback only

After the Rust retained scene/layout/render/event subsystems are removed, no TypeScript module SHALL implement or gate on the dropped retained-native paths (`nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, `nativeEventDispatch`). The TS-only path is the sole path.

(Previously: cleanup targeted stale TS implementations after native retained ownership was complete. Now: the Rust retained subsystems themselves are removed; TS is the only runtime for scene/reactivity/layout/event.)

#### Scenario: Retained-native flag branch is absent

- **GIVEN** the engine package after cleanup
- **WHEN** source files are scanned for `nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, or `nativeEventDispatch`
- **THEN** no import, conditional branch, or type reference to these symbols exists
- **AND** `bun typecheck` passes with zero errors

#### Scenario: Scene graph reactivity stays in TypeScript

- **GIVEN** a node mutation via signal update
- **WHEN** the next frame runs
- **THEN** the scene graph reflects the change without crossing FFI for snapshot or render-graph encoding
- **AND** no `vexart_scene_*` or `vexart_render_graph_*` FFI call occurs

#### Scenario: Event dispatch stays in TypeScript

- **GIVEN** pointer input from the terminal
- **WHEN** an event is dispatched to a node
- **THEN** the dispatch happens entirely in TS without `vexart_event_dispatch_*` FFI calls
- **AND** event bubbling, focus management, and hit-testing use TS-owned logic

#### Scenario: Layout computation stays in TypeScript

- **GIVEN** a frame with layout changes
- **WHEN** layout is computed via Taffy in TS
- **THEN** the layout result feeds the paint pipeline directly
- **AND** no `vexart_scene_layout_compute` or `vexart_layout_writeback` FFI call occurs

### Requirement: Cleanup SHALL preserve intentional fallback and readback APIs

Cleanup MUST NOT remove `nativePresentation`, `nativeLayerRegistry`, `forceLayerRepaint`, or the SHM/file/direct transport paths. Offscreen/test rendering and explicit readback APIs MUST remain functional.

(Previously: verbatim — still applies.)

#### Scenario: Offscreen render test runs without native presentation

- **GIVEN** native presentation is unavailable
- **WHEN** an offscreen/test render helper is used
- **THEN** it continues to render through an intentional fallback path

#### Scenario: nativePresentation still functions after cleanup

- **GIVEN** `nativePresentation=true` is passed to `mount()`
- **WHEN** a frame is presented
- **THEN** the SHM/file/direct transport path is unchanged from before the cleanup
- **AND** paint, composite, and Kitty encoding run through the native Rust pipeline

#### Scenario: Image assets and canvas display lists still function

- **GIVEN** the engine package after cleanup
- **WHEN** `<img>` or `<canvas>` nodes are rendered
- **THEN** native image asset handles and canvas display-list FFI paths work unchanged

### Requirement: Documentation SHALL describe current ownership accurately

Docs and tests MUST describe the new TS-owns-scene/layout/event, Rust-owns-paint/composite/transport boundary. No stale hybrid or retained-native ownership language SHALL remain in non-archived documents.

(Previously: cleanup targeted stale hybrid language after Phase 8 native retained completion. Now: boundary is explicitly TS = scene + reactivity + layout + event, Rust = paint + composite + transport.)

#### Scenario: Grep gate checks stale ownership phrases

- **GIVEN** cleanup is complete
- **WHEN** grep gates scan non-archived docs and source comments
- **THEN** stale hybrid ownership language appears only in archived historical documents or explicit rollback notes

#### Scenario: ARCHITECTURE.md reflects the corrected boundary

- **GIVEN** `docs/ARCHITECTURE.md` after cleanup
- **WHEN** the engine boundary section is reviewed
- **THEN** it states TypeScript owns scene graph, reactivity, layout (Taffy), and event dispatch
- **AND** it states Rust owns paint, composite, image assets, canvas display lists, and Kitty transport
- **AND** it does not claim Rust owns scene graph, layout, render graph, or event dispatch

## REMOVED Requirements

None. The existing requirements are updated, not removed.
