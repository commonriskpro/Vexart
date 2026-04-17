# Vexart — Spec-Driven Development

This directory holds all Vexart engineering artifacts produced by the SDD workflow.

## Master documents (source of truth)

These three live in `docs/` and are **immutable during phase execution**. Every change proposal in `openspec/changes/` MUST cite which sections of these it satisfies.

- [`docs/PRD.md`](../docs/PRD.md) — what and why (v0.3).
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — target code organization (v0.1).
- [`docs/API-POLICY.md`](../docs/API-POLICY.md) — public vs. internal rules (v0.1).

## Structure

```
openspec/
├── config.yaml              ← detected project context + phase rules
├── README.md                ← this file
├── specs/                   ← main specs (source of truth per domain)
│   └── {domain}/spec.md
└── changes/                 ← active changes
    ├── archive/             ← completed changes (YYYY-MM-DD-{name}/)
    └── {change-name}/
        ├── proposal.md
        ├── specs/           ← delta specs per domain
        ├── design.md
        ├── tasks.md
        └── verify-report.md
```

## Workflow (per change)

1. **Propose** (`/sdd-propose`) — intent, scope, approach, rollback plan.
2. **Spec** (`/sdd-spec`) — requirements with Given/When/Then scenarios.
3. **Design** (`/sdd-design`) — architecture decisions with rationale.
4. **Tasks** (`/sdd-tasks`) — hierarchical, session-sized checklist.
5. **Apply** (`/sdd-apply`) — implement tasks, mark `[x]` as done.
6. **Verify** (`/sdd-verify`) — validate spec scenarios, run tests.
7. **Archive** (`/sdd-archive`) — merge deltas into main specs, move to archive.

## Naming

Change names use `phase-N-short-slug` format so the roadmap maps 1:1 onto the archive.

Examples:
- `phase-0-alignment`
- `phase-1-structural-cleanup`
- `phase-2-native-consolidation`
- `phase-2b-advanced-rendering-tier1`
- `phase-3-loop-decomposition-tier2`
- `phase-4-public-api-visual-testing`
- `phase-5-polish-launch`

## Strict TDD

Currently **disabled** (see `config.yaml`). Activate via config edit when Phase 2b starts — native rendering work benefits from RED-GREEN-REFACTOR.
