# Proposal: Phase 0 — Architectural Alignment

## PRD citations

This proposal satisfies the following sections of the master product requirements document:

- `docs/PRD.md §11` — Phase 0 of the v0.9 roadmap ("Architectural Alignment" exit criteria).
- `docs/PRD.md §10.3` — Process constraints (solo dev, SDD workflow mandated).
- `docs/PRD.md §12 DEC-007` — SDD adopted as the single execution methodology for every change.
- `docs/PRD.md §12 DEC-001` — "Vexart" replaces "TGE" as the product name (informs legacy doc archiving).
- `docs/ARCHITECTURE.md §1.3` — Relationship between PRD, ARCHITECTURE, and API-POLICY.
- `docs/API-POLICY.md §1` — Master doc hierarchy as the basis for API governance.

## Intent

Lock product and architecture decisions before any code is written or deleted, per `docs/PRD.md §11` Phase 0. Vexart was previously "TGE" with scattered decisions. This phase establishes three immutable master docs and the SDD workflow (`docs/PRD.md §12 DEC-007`) so every subsequent phase has a single source of truth and a traceable execution path. **This proposal is retroactive** — it formalizes work already done in `docs/` and `openspec/` bootstrap.

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

Maps to `docs/PRD.md §11` Phase 0 exit criteria and REQ-PG-001 through REQ-PG-007 in the `project-governance` spec.

- [ ] `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API-POLICY.md` present on `main` (satisfies `docs/PRD.md §11` — "docs/ARCHITECTURE.md with the 4-layer architecture", "docs/API-POLICY.md with the public/internal contract policy").
- [ ] `openspec/config.yaml` valid YAML, `openspec/README.md` present (satisfies `docs/PRD.md §11` — "SDD framework initialized in `/openspec/`" + `docs/PRD.md §12 DEC-007`).
- [ ] `docs/archive/` holds TGE-ARCHITECTURE-REPORT.md + TGE-AUDIT.md + TGE-ROADMAP.md + MIGRATION-ANALYSIS.md + docs.md (enforces `docs/PRD.md §11` Phase 0 scope — legacy docs must not confuse agents).
- [ ] `AGENTS.md` references the three master docs as authoritative (supports `docs/PRD.md §10.3` — AI agents execute tasks, founder verifies).
- [ ] Change archived under `openspec/changes/archive/2026-04-17-phase-0-alignment/` after verify (satisfies the SDD lifecycle per `docs/PRD.md §12 DEC-007`).
