# Design: Phase 3d — Native Render Graph And Pipeline Batching

## Technical Approach

Rust converts native scene nodes and computed layout into render operations, batches them by pipeline/material, and dispatches WGPU work without TypeScript packing ordinary paint commands.

## Native Modules

- `render_graph/mod.rs`
- `render_graph/effects.rs`
- `render_graph/text.rs`
- `render_graph/images.rs`
- `render_graph/materials.rs`
- `paint/pipelines/*`

## Compatibility

TS render graph remains behind fallback only. The native path must not depend on TS `cmd_kind` generation for ordinary JSX nodes.

## Verification

- Golden parity for showcase and effect scenes.
- Unit tests for material generation from props.
- Static inspection that native path avoids TS command batches.
