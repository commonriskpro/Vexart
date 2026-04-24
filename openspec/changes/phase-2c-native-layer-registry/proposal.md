# Proposal: Phase 2c — Native Layer Registry

## Intent

Move layer target ownership, terminal image IDs, and layer lifecycle into `libvexart` after Native Presentation, while keeping TypeScript layer assignment as the compatibility input for this phase.

**PRD trace**:
- `docs/PRD.md §6.7` — Rust-retained engine ownership target.
- `docs/PRD.md §11 Rust-retained engine migration overlay` — R2 Native Layer Registry.
- `docs/PRD-RUST-RETAINED-ENGINE.md §11.2` — layer retention requirements.
- `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 2` — Native Layer Registry.

## Scope

### In Scope

- Add Rust `LayerRegistry` owned by `ResourceManager` or adjacent native resource module.
- Track stable layer keys, GPU targets, terminal image IDs, bounds, z-order, dirty state, and last-used frame.
- Add FFI for layer upsert, dirty marking, reuse, removal, and dirty presentation.
- Route native-presentation layer lifecycle through Rust when `nativeLayerRegistry` is enabled.
- Keep TypeScript layer assignment as the source of layer descriptors for this phase.
- Expose native layer stats through existing debug/resource stats.

### Out of Scope

- Rust-retained scene graph.
- Native layout, hit-testing, or layer assignment.
- Native render graph generation.
- Removing the TS fallback path.

## Approach

1. Define the native layer descriptor and registry invariants.
2. Add Rust registry operations and unit tests for create/reuse/remove/evict.
3. Add FFI wrappers in `packages/engine/src/ffi/`.
4. Route native presentation path to pass stable layer descriptors instead of owning target/image IDs in TS.
5. Preserve fallback behavior under feature flag/env override.

## Success Criteria

- [ ] Rust owns all GPU targets used for native terminal presentation.
- [ ] TypeScript no longer tracks terminal image IDs on the native path.
- [ ] Resource stats include layer target and terminal image memory.
- [ ] Eviction never deletes visible layers.
- [ ] Existing showcase output remains visually equivalent.
