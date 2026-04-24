# Proposal: Phase 3c — Native Layout, Damage, And Hit-Testing

## Intent

Use the Rust-retained scene graph to compute layout, damage, layer preparation, hit-testing, focus traversal data, scroll clipping, pointer capture behavior, and event records.

**PRD trace**: `docs/PRD.md §6.7`, retained overlay R4, `docs/PRD-RUST-RETAINED-ENGINE.md §10-11`, `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 4`.

## Scope

### In Scope

- Map native scene nodes to Taffy nodes.
- Compute layout and visual damage from native dirty flags.
- Compute layer preparation metadata from native layout.
- Implement native hit-testing with transforms, scroll clipping, pointer passthrough, min hit area, and pointer capture.
- Return event records for JS callback dispatch.
- Preserve `stopPropagation()` and focus APIs.

### Out of Scope

- Native render graph generation.
- Default cutover.
- Removing TS fallback.

## Success Criteria

- [ ] Rust computes layout and hit-testing from native scene graph.
- [ ] JS no longer needs to walk native-enabled scenes for layout or input.
- [ ] Interaction parity passes for focus, scroll, pointer capture, bubbling, and offscreen scroll children.
