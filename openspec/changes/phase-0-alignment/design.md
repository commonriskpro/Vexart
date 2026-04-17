# Design: Phase 0 — Architectural Alignment

## Overview

This change is **pure documentation and tooling**. No code under `packages/`, `zig/`, `native/`, `vendor/`, or any build script is modified. Work is strictly retroactive: the three master docs (`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API-POLICY.md`), the `openspec/` scaffold, and `.atl/skill-registry.md` already exist on disk but are **untracked**. Five pre-PRD legacy docs still live at the repo root and must be archived. `AGENTS.md` still describes the old "TGE" project and has no pointer to the master docs.

The design here covers HOW to land that state — commit sequence, file-movement mechanics (case-insensitive FS gotcha), the exact `AGENTS.md` edit, and how each `REQ-PG-XXX` requirement is verified. No architectural decisions are introduced — all of them come from PRD + ARCHITECTURE + API-POLICY, which this change simply formalizes.

Per `openspec/config.yaml` rules.design, no dependency diagram is included (package boundaries are untouched), and no deviations from `ARCHITECTURE.md` exist to document.

## Execution order

1. **Commit master docs** — `docs/PRD.md`, `docs/API-POLICY.md`, and uppercase-rename of `docs/architecture.md` → `docs/ARCHITECTURE.md`.
   *Why first:* every later step cites them. Landing them first means the rename reference stays consistent across the change.
2. **Create `docs/archive/` and move legacy docs** via `git mv` (see table below).
   *Why second:* archive must exist before `AGENTS.md` can safely redirect agents away from the legacy set.
3. **Update `AGENTS.md`** to add the "Authoritative documents" section pointing at the three master docs.
   *Why third:* the section quotes the paths established in step 1 and the archive path established in step 2.
4. **Commit `openspec/` scaffold and `.atl/skill-registry.md`**.
   *Why fourth:* these reference `docs/PRD.md §…`, `docs/ARCHITECTURE.md §…`, and the master-doc hierarchy that now exists on `main`.
5. **Validate governance** — run the `ls` / `grep` checks in the traceability table below, then archive the change via `sdd-archive`.
   *Why last:* verification must see the final committed state, not an intermediate one.

Each step is a conventional commit (`docs:`, `chore:` for scaffold).

## Legacy doc archive strategy

All five files move with `git mv` to preserve rename detection in history:

| Source (repo root)               | Target                                        |
|----------------------------------|-----------------------------------------------|
| `TGE-ARCHITECTURE-REPORT.md`     | `docs/archive/TGE-ARCHITECTURE-REPORT.md`     |
| `TGE-AUDIT.md`                   | `docs/archive/TGE-AUDIT.md`                   |
| `TGE-ROADMAP.md`                 | `docs/archive/TGE-ROADMAP.md`                 |
| `MIGRATION-ANALYSIS.md`          | `docs/archive/MIGRATION-ANALYSIS.md`          |
| `docs.md`                        | `docs/archive/docs.md`                        |

Command sequence (must create the target dir first):

```
mkdir -p docs/archive
git mv TGE-ARCHITECTURE-REPORT.md docs/archive/TGE-ARCHITECTURE-REPORT.md
git mv TGE-AUDIT.md               docs/archive/TGE-AUDIT.md
git mv TGE-ROADMAP.md             docs/archive/TGE-ROADMAP.md
git mv MIGRATION-ANALYSIS.md      docs/archive/MIGRATION-ANALYSIS.md
git mv docs.md                    docs/archive/docs.md
```

Filenames at the target are preserved so any pre-existing inbound links (in prior Git history, external write-ups) keep resolving via path rewrite rather than rename. No content edits — the files are archived as-is.

### ARCHITECTURE.md casing gotcha

Currently the file on disk is `docs/architecture.md` (lowercase). The master-doc path in every other artifact is `docs/ARCHITECTURE.md` (uppercase). On macOS (case-insensitive HFS+/APFS default), a direct `git mv architecture.md ARCHITECTURE.md` is a no-op. Use the two-step rename so Git actually records the case change:

```
git mv docs/architecture.md docs/ARCHITECTURE-tmp.md
git mv docs/ARCHITECTURE-tmp.md docs/ARCHITECTURE.md
```

This is part of step 1 above, not a separate commit.

## AGENTS.md modification

**Current state (verified by reading `/Users/dev/vexart/AGENTS.md`):** the file is a 573-line TGE-era reference. It describes `@tge/*` packages, Zig FFI, JSX effects, and component catalogs. It does **not** mention `docs/PRD.md`, `docs/ARCHITECTURE.md`, or `docs/API-POLICY.md` anywhere. The title is still `# TGE — Terminal Graphics Engine`.

**Scope of edit for this change:** add one new section immediately after the H1 and before the `## What is TGE` section. Phase 0 does NOT rename the project inside `AGENTS.md` — that is Phase 1 scope (package renames `@tge/*` → `@vexart/*` propagate into agent guidance there). Here we only install the authoritative-docs pointer so agents stop reasoning from the TGE body when a master doc covers the topic.

Exact section to insert (verbatim):

```markdown
## Authoritative documents

Vexart's source of truth lives in three master documents under `docs/`. When their
guidance conflicts with anything described below, **the master documents win** and
the content below is treated as legacy TGE reference pending Phase 1 rewrite.

- [`docs/PRD.md`](docs/PRD.md) — product requirements, phased roadmap, decision log.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — target layered package structure and
  native boundary.
- [`docs/API-POLICY.md`](docs/API-POLICY.md) — public vs. internal API rules.

Every change is executed through the SDD workflow under `openspec/` (see
`openspec/README.md`). Legacy pre-PRD documents (`TGE-*`, `MIGRATION-ANALYSIS.md`,
`docs.md`) have been archived to `docs/archive/` and MUST NOT be used as a reference
for new work.
```

No other edits in Phase 0. Existing TGE content stays intact and will be rewritten in Phase 1 when package renames land.

## openspec/ validation

The scaffold already on disk (untracked) MUST contain:

| Path                               | Required content                                                         |
|------------------------------------|--------------------------------------------------------------------------|
| `openspec/config.yaml`             | `schema: spec-driven`, phase rules, test commands — already authored.     |
| `openspec/README.md`               | Master-doc pointers + workflow summary + naming convention — already authored. |
| `openspec/specs/`                  | Directory exists (empty on Phase 0; populated as changes archive).        |
| `openspec/changes/`                | Directory exists with `phase-0-alignment/` and eventual siblings.         |
| `openspec/changes/archive/`        | Directory exists (empty on Phase 0; populated after `sdd-archive`).       |

`.atl/skill-registry.md` is committed in the same step as the scaffold (same conceptual concern: AI agent wiring).

No edits are needed to these files during Phase 0 — verification is existence + readability only.

## Requirement traceability

Each `REQ-PG-XXX` from `specs/project-governance/spec.md` maps to a concrete, runnable check:

| Requirement | Verification check |
|-------------|--------------------|
| **REQ-PG-001** — Master docs are authoritative | `ls docs/PRD.md docs/ARCHITECTURE.md docs/API-POLICY.md` all exist on `main`; `grep -l "docs/PRD.md\|docs/ARCHITECTURE.md\|docs/API-POLICY.md" openspec/changes/phase-0-alignment/{proposal,specs/project-governance/spec}.md` finds citations in both artifacts. |
| **REQ-PG-002** — Proposals cite PRD sections | `grep -E 'docs/PRD\.md §[0-9]' openspec/changes/phase-0-alignment/proposal.md` returns at least one hit (proposal cites `docs/PRD.md` section range in each REQ rationale — already present in the spec). |
| **REQ-PG-003** — SDD workflow is only valid path | `ls openspec/changes/phase-0-alignment/{proposal.md,specs,design.md}` resolves (this file completes it). After verify + archive: `ls openspec/changes/archive/2026-04-17-phase-0-alignment/` exists. |
| **REQ-PG-004** — Legacy docs archived out of root | `ls docs/archive/TGE-ARCHITECTURE-REPORT.md docs/archive/TGE-AUDIT.md docs/archive/TGE-ROADMAP.md docs/archive/MIGRATION-ANALYSIS.md docs/archive/docs.md` all exist; `ls TGE-ARCHITECTURE-REPORT.md TGE-AUDIT.md TGE-ROADMAP.md MIGRATION-ANALYSIS.md docs.md 2>&1 \| grep -c "No such file"` returns `5`. |
| **REQ-PG-005** — AGENTS.md points agents to master docs | `grep -E 'docs/PRD\.md\|docs/ARCHITECTURE\.md\|docs/API-POLICY\.md' AGENTS.md` returns 3+ matches, all inside an "Authoritative documents" section. |
| **REQ-PG-006** — OpenSpec scaffolding exists | `ls openspec/config.yaml openspec/README.md` both exist; `ls -d openspec/specs openspec/changes openspec/changes/archive` all resolve. |
| **REQ-PG-007** — Skill routing metadata exists | `ls .atl/skill-registry.md` exists; `grep -E 'docs/PRD\.md\|openspec' .atl/skill-registry.md` returns at least one match. |

These checks are encoded in `tasks.md` (by `sdd-tasks`) and re-run by `sdd-verify` to produce `verify-report.md`.

## Non-deviations

This change **does not deviate from `docs/ARCHITECTURE.md` in any way.** All work is pure governance, documentation, and tooling. No package boundary is touched, no new dependency is introduced, no API surface is added or removed, no native code is modified, no build step changes. The scaffold (`openspec/`, `.atl/`) is explicitly required by PRD §11 Phase 0 and DEC-007 and is therefore part of — not a departure from — the target architecture.

Per `openspec/config.yaml` rules.design, this section is present so reviewers can confirm the absence of deviation explicitly rather than infer it.

## Risks addressed at design time

- **Case-insensitive rename of `architecture.md`** is the only non-obvious step. Addressed inline above with the two-step `git mv` pattern.
- **Ordering of `AGENTS.md` edit vs archive move**: if the edit lands before the moves, the section would reference a non-existent `docs/archive/` path. Execution order puts archive moves (step 2) strictly before the `AGENTS.md` edit (step 3).
- **Agents keeping stale TGE context** (risk from proposal): handled by the `AGENTS.md` prefix section explicitly labeling the rest of the file as "legacy TGE reference pending Phase 1 rewrite" — so agents reading top-down hit the authoritative redirect before the stale content.

## Open questions

None. All inputs (PRD, ARCHITECTURE, API-POLICY, proposal, spec, on-disk state) are fully defined. Ready for `sdd-tasks`.
