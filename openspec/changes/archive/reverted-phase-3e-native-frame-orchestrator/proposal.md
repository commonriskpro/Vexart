> **REVERTED by phase-14-rust-retained-cleanup** (April 2026) — Rust retained scene graph / render graph / layout / event dispatch was reverted based on cosmic-shell-1080p bench evidence (TS path 4.8× faster). See `openspec/changes/phase-14-rust-retained-cleanup/proposal.md` and DEC-014 in PRD v0.7.

# Proposal: Phase 3e — Native Frame Orchestrator

## Intent

Move native frame lifecycle and strategy selection into Rust so the retained path owns no-op skipping, dirty-layer presentation, dirty-region presentation, final-frame fallback, compositor animation fast path, and frame stats.

**PRD trace**: `docs/PRD.md §6.7`, retained overlay R6, `docs/PRD-RUST-RETAINED-ENGINE.md §11-12`, `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 6`.

## Scope

### In Scope

- Add native frame orchestrator modules.
- Implement frame strategies: `skip-present`, `layered-dirty`, `layered-region`, `final-frame`.
- Integrate compositor animation fast path for transform/opacity.
- Emit structured frame stats.
- Reduce TS loop to request frames, forward terminal/input events, call native render/present, dispatch callbacks, and show debug stats.

### Out of Scope

- Default cutover.
- Removing fallback.

## Success Criteria

- [ ] Native path owns frame lifecycle from mutation to terminal presentation.
- [ ] FFI calls per dirty frame meet target.
- [ ] No raw RGBA crosses to JS in normal mode.
- [ ] No-op frames do not repaint.
