> **REVERTED by phase-14-rust-retained-cleanup** (April 2026) — Rust retained scene graph / render graph / layout / event dispatch was reverted based on cosmic-shell-1080p bench evidence (TS path 4.8× faster). See `openspec/changes/phase-14-rust-retained-cleanup/proposal.md` and DEC-014 in PRD v0.7.

# Proposal: Phase 3f — Native Default Cutover

## Intent

Make the Rust-retained path the default runtime after parity, performance, and API gates pass.

**PRD trace**: `docs/PRD.md §6.7`, retained overlay R7, `docs/PRD-RUST-RETAINED-ENGINE.md §14`, `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 7`.

## Scope

### In Scope

- Flip native retained feature flags to default-on.
- Keep emergency fallback via environment variable for one compatibility window.
- Update docs, examples, debug messaging, and architecture notes.
- Verify API extractor shows no unapproved public breaks.
- Run golden and interaction parity gates.

### Out of Scope

- Deleting old fallback code; cleanup phase handles deletion/isolation.

## Success Criteria

- [ ] Native retained path is default.
- [ ] Public API remains stable.
- [ ] Fallback can still be enabled for emergency compatibility window.
- [ ] Goldens, interaction parity, and benchmarks meet targets.
