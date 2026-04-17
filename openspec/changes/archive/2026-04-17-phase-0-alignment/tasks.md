# Tasks: Phase 0 — Architectural Alignment

## Strategy

Each group = one conventional commit. Execution follows the dependency order from `design.md`: master docs land first (they are cited by everything else), legacy docs archive second (clears the root), AGENTS.md update third (references docs from groups 1–2), openspec + .atl scaffold fourth (references master docs), traceability verification fifth. Groups 2 and 4 are likely already on disk from this session — the implementer should verify and skip if present.

## 1. Pre-flight verification

- [x] **1.1** Verify clean working tree and create branch.
  - Run: `git status --short` — confirm only expected untracked/modified files.
  - Run: `git checkout -b phase-0-alignment` if not already on a phase branch.
  - Expected: clean-ish working tree, on `phase-0-alignment` branch.
  - **Commit**: none (pre-flight).

## 2. Master documents

> **NOTE**: These files likely already exist on disk from the current session. The implementer MUST verify existence + content before skipping.

- [x] **2.1** Ensure `docs/PRD.md` exists and is committed.
  - Run: `ls -l docs/PRD.md` — must exist (~67 KB).
  - If missing: the file was not written in this session — check `docs/PRD.md` for content and proceed to add.
  - **Commit**: none standalone (committed as part of 2.3).

- [x] **2.2** Ensure `docs/API-POLICY.md` exists and is committed.
  - Run: `ls -l docs/API-POLICY.md` — must exist (~29 KB).
  - If missing: source from the session or regenerate per PRD §11.
  - **Commit**: none standalone (committed as part of 2.3).

- [x] **2.3** Uppercase-rename `docs/architecture.md` → `docs/ARCHITECTURE.md` (macOS case-safety).
  - Verify current state: `ls docs/ | grep -i architecture` — if only lowercase `architecture.md` shown, proceed with rename.
  - Two-step rename (macOS case-insensitive FS gotcha):
    ```
    git mv docs/architecture.md docs/ARCHITECTURE-tmp.md
    git mv docs/ARCHITECTURE-tmp.md docs/ARCHITECTURE.md
    ```
  - Verify: `ls docs/ | grep -i architecture` → must show `ARCHITECTURE.md` exactly.
  - Stage master docs: `git add docs/PRD.md docs/API-POLICY.md docs/ARCHITECTURE.md`.
  - **Commit**: `docs: add master PRD, ARCHITECTURE, API-POLICY`

## 3. Archive legacy docs

- [x] **3.1** Create `docs/archive/` and move legacy TGE documents.
  - Run: `mkdir -p docs/archive`.
  - Move all five files (must exist at repo root):
    ```
    git mv TGE-ARCHITECTURE-REPORT.md docs/archive/TGE-ARCHITECTURE-REPORT.md
    git mv TGE-AUDIT.md               docs/archive/TGE-AUDIT.md
    git mv TGE-ROADMAP.md             docs/archive/TGE-ROADMAP.md
    git mv MIGRATION-ANALYSIS.md      docs/archive/MIGRATION-ANALYSIS.md
    git mv docs.md                    docs/archive/docs.md
    ```
  - Verify: `ls docs/archive/` shows all 5 files.
  - Verify: `ls TGE-ARCHITECTURE-REPORT.md TGE-AUDIT.md TGE-ROADMAP.md MIGRATION-ANALYSIS.md docs.md 2>&1` → all "No such file or directory".
  - **Commit**: `chore: archive legacy TGE docs to docs/archive/`

## 4. AGENTS.md update

- [x] **4.1** Add "Authoritative documents" section to `AGENTS.md`.
  - Read current `AGENTS.md` — the H1 is `# TGE — Terminal Graphics Engine`.
  - Insert the following section **immediately after the H1 line and before `## What is TGE`**:
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
  - Verify: `grep -c 'Authoritative documents' AGENTS.md` → 1.
  - **Commit**: `docs: add authoritative documents section to AGENTS.md`

## 5. OpenSpec scaffold and skill registry

> **NOTE**: These files/dirs likely already exist on disk from the current session. The implementer MUST verify existence before skipping.

- [x] **5.1** Verify OpenSpec scaffold paths exist and stage.
  - Verify each path:
    ```
    ls openspec/config.yaml openspec/README.md
    ls -d openspec/specs openspec/changes openspec/changes/archive
    ```
  - If any path is missing: create it (see `design.md` §openspec/ validation table).
  - Stage: `git add openspec/`.
  - **Commit**: none standalone (committed as part of 5.2).

- [x] **5.2** Verify `.atl/skill-registry.md` exists and stage.
  - Run: `ls .atl/skill-registry.md` — must exist.
  - If missing: recreate per PRD §10.3 guidance.
  - Stage: `git add .atl/`.
  - Verify combined staging: `git diff --cached --stat` shows both `openspec/` and `.atl/` additions.
  - **Commit**: `chore: bootstrap openspec scaffold and AI skill registry`

## 6. Traceability verification

- [x] **6.1** Run all REQ-PG-XXX verification checks from design.md.
  - Execute each check and print PASS/FAIL:

    **REQ-PG-001** — Master docs exist + cited:
    ```
    ls docs/PRD.md docs/ARCHITECTURE.md docs/API-POLICY.md
    grep -rl 'docs/PRD.md\|docs/ARCHITECTURE.md\|docs/API-POLICY.md' openspec/changes/phase-0-alignment/proposal.md openspec/changes/phase-0-alignment/specs/project-governance/spec.md
    ```

    **REQ-PG-002** — Proposal cites PRD sections:
    ```
    grep -E 'PRD §|PRD\.md §' openspec/changes/phase-0-alignment/proposal.md
    ```
    Must return ≥1 hit.

    **REQ-PG-003** — SDD workflow artifacts present:
    ```
    ls openspec/changes/phase-0-alignment/proposal.md
    ls -d openspec/changes/phase-0-alignment/specs
    ls openspec/changes/phase-0-alignment/design.md
    ls openspec/changes/phase-0-alignment/tasks.md
    ```

    **REQ-PG-004** — Legacy docs archived:
    ```
    ls docs/archive/TGE-ARCHITECTURE-REPORT.md docs/archive/TGE-AUDIT.md docs/archive/TGE-ROADMAP.md docs/archive/MIGRATION-ANALYSIS.md docs/archive/docs.md
    ls TGE-ARCHITECTURE-REPORT.md TGE-AUDIT.md TGE-ROADMAP.md MIGRATION-ANALYSIS.md docs.md 2>&1 | grep -c "No such file"
    ```
    Must return 5.

    **REQ-PG-005** — AGENTS.md references master docs:
    ```
    grep -E 'docs/PRD\.md|docs/ARCHITECTURE\.md|docs/API-POLICY\.md' AGENTS.md
    ```
    Must return 3+ matches inside "Authoritative documents" section.

    **REQ-PG-006** — OpenSpec scaffold paths:
    ```
    ls openspec/config.yaml openspec/README.md
    ls -d openspec/specs openspec/changes openspec/changes/archive
    ```

    **REQ-PG-007** — Skill registry exists + references master docs:
    ```
    ls .atl/skill-registry.md
    grep -E 'docs/PRD\.md|openspec' .atl/skill-registry.md
    ```
    Must return ≥1 hit.

  - If any FAIL: fix the issue, amend the relevant commit, and re-run.
  - **Commit**: none (verification only — produces `verify-report.md` via `sdd-verify`).

## 7. Merge preparation

- [x] **7.1** Verify commit history and prepare for merge.
  - Run: `git log --oneline phase-0-alignment --not main` — should show 4 commits:
    1. `docs: add master PRD, ARCHITECTURE, API-POLICY`
    2. `chore: archive legacy TGE docs to docs/archive/`
    3. `docs: add authoritative documents section to AGENTS.md`
    4. `chore: bootstrap openspec scaffold and AI skill registry`
  - Run: `git diff main...HEAD --stat` — review no unexpected files changed.
  - Do NOT merge — leave branch ready for PR or manual merge.
  - **Commit**: none (preparation only).
