# Delta for package-boundaries

Refs: `docs/ARCHITECTURE.md §2.1` (engine boundary), `docs/ARCHITECTURE.md §5` (native crate structure), `docs/PRD.md §12 DEC-014`, proposal `§Scope — native crate removals`.

## MODIFIED Requirements

None existing requirements are modified — the package-boundaries spec governs the four public `@vexart/*` packages, not the internal native crate structure. The crate module boundary change is captured below as ADDED.

## ADDED Requirements

### REQ-PB-011: Native crate SHALL NOT expose scene/render-graph/layout-writeback/event-dispatch modules

`native/libvexart/` MUST NOT contain or export modules for the dropped Rust retained subsystems: `scene.rs`, `render_graph/`, layout writeback paths in `layout/`, or retained frame strategy logic in `frame.rs`. The crate's public FFI surface (`lib.rs`) MUST NOT export `vexart_scene_*`, `vexart_scene_layout_*`, `vexart_render_graph_*`, `vexart_frame_choose_strategy`, `vexart_scene_apply_mutations`, or `vexart_event_dispatch_*` functions.

#### Scenario: cargo test passes after module removal

- **GIVEN** the native crate after cleanup
- **WHEN** `cargo test` runs in `native/libvexart/`
- **THEN** all tests pass with zero dead-import or unresolved-symbol errors
- **AND** no test references the dropped modules

#### Scenario: cargo build passes after module removal

- **GIVEN** the native crate after cleanup
- **WHEN** `cargo build --release` runs
- **THEN** the build succeeds and `libvexart.{dylib,so,dll}` links correctly
- **AND** the exported symbol table does not contain `vexart_scene_*`, `vexart_render_graph_*`, `vexart_event_dispatch_*`, or `vexart_frame_choose_strategy`

#### Scenario: Paint and composite FFI remain intact

- **GIVEN** the native crate after cleanup
- **WHEN** the exported FFI symbols are inspected
- **THEN** paint pipeline functions (`tge_*`, `vexart_paint_*`), composite functions, Kitty encoder functions, image asset functions, and canvas display-list functions are still exported
- **AND** `nativePresentation` and `nativeLayerRegistry` FFI paths compile and function

### REQ-PB-012: Reverted phase directories SHALL be tagged with REVERTED note

Each of the nine reverted phase directories under `openspec/changes/` MUST contain a `REVERTED by phase-14` note in their `proposal.md` pointing to `openspec/changes/phase-14-rust-retained-cleanup/proposal.md`.

#### Scenario: Reverted phase contains revert annotation

- **GIVEN** the directory `openspec/changes/phase-3b-native-scene-graph/`
- **WHEN** `proposal.md` is reviewed
- **THEN** it contains a `REVERTED by phase-14` note with a reference to the phase-14 proposal
- **AND** the same annotation exists in the eight other reverted phase directories
