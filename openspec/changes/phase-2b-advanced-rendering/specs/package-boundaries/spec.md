# Delta for package-boundaries

## ADDED Requirements

### Requirement: Phase 2b libvexart module additions

The `native/libvexart/src/` crate layout in ARCHITECTURE §4.1 SHALL include the following new modules for Phase 2b: `kitty/encoder.rs`, `kitty/writer.rs`, `kitty/transport.rs`, `text/atlas.rs`, `text/render.rs`, `text/glyph_info.rs`, `resource/mod.rs`, `resource/priority.rs`, `resource/eviction.rs`, `resource/stats.rs`, `paint/pipeline_cache.rs`, `paint/pipelines/filter.rs`, `paint/pipelines/glyph.rs`, `paint/shaders/msdf_text.wgsl`, `paint/shaders/self_filter.wgsl`. These modules replace Phase 2b stubs with real implementations.

**PRD trace**: `docs/PRD.md §743-801` (Phase 2b scope).

#### Scenario: New modules exist in crate layout

- GIVEN Phase 2b implementation is complete
- WHEN the `native/libvexart/src/` directory is inspected
- THEN all listed module files exist
- AND each contains non-stub implementation code

#### Scenario: No orphan stubs remain

- GIVEN Phase 2b replaces stub modules
- WHEN the text/ and kitty/ directories are inspected
- THEN no files contain only placeholder or no-op implementations

## REMOVED Requirements

### Requirement: wgpu-canvas-bridge package existence

(Reason: Phase 2b deletes `native/wgpu-canvas-bridge/` and `packages/engine/src/ffi/wgpu-canvas-bridge.ts` after migration. The two-binary rule in ARCHITECTURE §2.3 is satisfied: only `libvexart` remains as the native artifact.)

#### Scenario: wgpu-canvas-bridge directory absent

- GIVEN Phase 2b bridge deletion is complete
- WHEN the repository tree is inspected
- THEN `native/wgpu-canvas-bridge/` does not exist
- AND `packages/engine/src/ffi/wgpu-canvas-bridge.ts` does not exist
