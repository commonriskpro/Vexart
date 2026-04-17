# Proposal: Phase 0 — Architectural Alignment

## Intent

Lock product and architecture decisions before any code is written or deleted. Vexart was previously "TGE" with scattered decisions. This phase establishes three immutable master docs and the SDD workflow so every subsequent phase has a single source of truth and a traceable execution path. **This proposal is retroactive** — it formalizes work already done in docs/ and openspec/ bootstrap.

## Scope

### In Scope
- Commit `docs/PRD.md` v0.3 (1091 lines, 10 DECs, 8-phase roadmap).
- Commit `docs/ARCHITECTURE.md` v0.1 (target architecture post-Phase 5).
- Commit `docs/API-POLICY.md` v0.1 (public/internal contract rules).
- Bootstrap `/openspec/` with config.yaml + README + specs/ + changes/archive/.
- Create `.atl/skill-registry.md` for AI agent skill routing.
- Move legacy pre-PRD docs to `docs/archive/` so agents stop reading stale context.
- Update root `AGENTS.md` to reference the three master docs as authoritative.

### Out of Scope
- Any code change in `packages/*` (Phase 1).
- Any change to native code in `zig/`, `native/`, or `vendor/` (Phase 2).
- Renaming `@tge/*` packages (Phase 1).
- Creating `openspec/specs/` entries for product capabilities (grows organically per phase).

## Capabilities

### New Capabilities
- `project-governance`: defines the master doc hierarchy, the SDD workflow rules, and how proposals must cite PRD sections.

### Modified Capabilities
- None. No pre-existing specs to modify.

## Approach

Pure documentation + tooling. Three files under `docs/` are the permanent reference. `openspec/` is the execution framework. Legacy docs are archived — not deleted — so the migration history survives. No package, native, or build-system changes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/PRD.md` | New | Product requirements, master |
| `docs/ARCHITECTURE.md` | New | Target architecture, master |
| `docs/API-POLICY.md` | New | Public API rules, master |
| `docs/archive/` | New | Holds legacy TGE-* docs |
| `openspec/` | New | SDD framework bootstrap |
| `.atl/skill-registry.md` | New | Agent skill router |
| `AGENTS.md` | Modified | Reference master docs |
| `TGE-ARCHITECTURE-REPORT.md`, `TGE-AUDIT.md`, `TGE-ROADMAP.md`, `MIGRATION-ANALYSIS.md`, `docs.md` | Moved | → `docs/archive/` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Agents keep reading legacy docs from repo root | Low | Archive move + AGENTS.md update redirect them |
| Master docs drift from reality during Phases 1-5 | Medium | Each phase updates ARCHITECTURE.md Appendix A "known debt" only; structural edits need PRD amendment |
| SDD framework feels like overhead | Low | Founder already committed via DEC-007; reviews bi-weekly with advisor |

## Rollback Plan

Git revert the commits. All changes are additive (new docs + new dirs) or archival (moves into `docs/archive/`). Nothing is deleted. Legacy docs restorable via `git mv docs/archive/<file> .`.

## Dependencies

None. Phase 0 is the foundation everything else depends on.

## Success Criteria

- [ ] `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API-POLICY.md` present on `main`.
- [ ] `openspec/config.yaml` valid YAML, `openspec/README.md` present.
- [ ] `docs/archive/` holds TGE-ARCHITECTURE-REPORT.md + TGE-AUDIT.md + TGE-ROADMAP.md + MIGRATION-ANALYSIS.md + docs.md.
- [ ] `AGENTS.md` references the three master docs as authoritative.
- [ ] Change archived under `openspec/changes/archive/2026-04-17-phase-0-alignment/` after verify.
