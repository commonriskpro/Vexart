> **REVERTED by phase-14-rust-retained-cleanup** (April 2026) — Rust retained scene graph / render graph / layout / event dispatch was reverted based on cosmic-shell-1080p bench evidence (TS path 4.8× faster). See `openspec/changes/phase-14-rust-retained-cleanup/proposal.md` and DEC-014 in PRD v0.7.

# Proposal: Phase 3d — Native Render Graph And Pipeline Batching

## Intent

Move ordinary render graph generation and pipeline batching into Rust so shader/material reachability is owned by the native scene path instead of duplicated between TS and Rust.

**PRD trace**: `docs/PRD.md §6.7`, retained overlay R5, `docs/PRD-RUST-RETAINED-ENGINE.md §11`, `docs/ROADMAP-RUST-RETAINED-ENGINE.md Phase 5`.

## Scope

### In Scope

- Generate render ops from native scene + native layout data.
- Batch by WGPU pipeline in Rust.
- Connect rects, borders, shadows, glow, gradients, backdrop filters, self filters, images, transforms, and text through Rust prop handling.
- Keep TS render graph only as fallback while the feature flag is off.

### Out of Scope

- Default cutover.
- Deleting fallback code.
- Adding new visual features beyond existing v0.9 commitments.

## Success Criteria

- [ ] Native scene path renders showcase without TS render graph generation.
- [ ] Effect-specific golden tests pass.
- [ ] Shader/material features are reachable through Rust prop handling.
