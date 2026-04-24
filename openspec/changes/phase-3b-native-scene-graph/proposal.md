# Proposal: Phase 3b — Native Scene Graph Skeleton

## Intent

Introduce a Rust-retained scene graph behind `nativeSceneGraph` without replacing rendering yet. SolidJS mutations are mirrored into Rust so tree, prop, and text ownership can be validated before layout/render cutover.

**PRD trace**: `docs/PRD.md §6.7`, `docs/PRD.md §11 retained overlay R3`, `docs/PRD-RUST-RETAINED-ENGINE.md §7-10`, `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 3`.

## Scope

### In Scope

- Add Rust scene graph modules for nodes, props, tree order, dirty flags, and snapshots.
- Add `vexart_scene_*`, `vexart_node_*`, and `vexart_text_set_content` FFI exports.
- Add generated/stable prop ID registry and binary prop encoder.
- Mirror Solid create/insert/remove/update/text mutations into Rust when flagged.
- Keep TS `TGENode` as compatibility mirror for rendering in this phase.

### Out of Scope

- Native layout/rendering cutover.
- Native hit-testing/event ownership.
- Deleting the TS tree.

## Success Criteria

- [ ] Native scene snapshot equals TS tree snapshot for fixture UIs.
- [ ] Create/insert/remove/reorder/text/prop updates pass parity tests.
- [ ] Public JSX API unchanged.
- [ ] Feature flag can be enabled without rendering changes.
