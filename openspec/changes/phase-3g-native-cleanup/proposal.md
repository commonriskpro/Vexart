# Proposal: Phase 3g — Native Cleanup And Simplification

## Intent

Delete or isolate dead TypeScript hot-path ownership after native retained cutover, leaving TS as a thin public API and binding shell.

**PRD trace**: `docs/PRD.md §6.7`, retained overlay R8, `docs/PRD-RUST-RETAINED-ENGINE.md §13`, `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 8`.

## Scope

### In Scope

- Delete TS render graph hot path if no longer needed.
- Delete TS layer target cache and sprite orchestration.
- Delete old backend result modes that return raw presentation buffers in normal mode.
- Keep explicit screenshot/offscreen/debug readback APIs.
- Rename remaining TS backend files to reflect binding-shell role.
- Update tests and docs to remove stale hybrid ownership assumptions.

### Out of Scope

- Public API breaking changes.
- Removing explicit screenshot/offscreen APIs.

## Success Criteria

- [ ] TS renderer internals are a thin binding shell.
- [ ] Rust is the only implementation owner for rendering behavior.
- [ ] Tests and docs no longer describe stale hybrid ownership.
