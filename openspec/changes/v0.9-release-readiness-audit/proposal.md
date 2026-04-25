# Proposal: v0.9 Release Readiness Audit

## Problem

The performance/native SHM work is now substantially healthier, but the full v0.9 PRD is not complete. The remaining work is spread across active OpenSpec changes, roadmap phases, docs, examples, API policy, visual tests, performance targets, and release-process requirements.

Without a single release-readiness audit change, we risk confusing "engine performance progress" with "v0.9 ready". That is dangerous because the PRD's release criteria are broader than the current Phase 10 performance track.

## PRD sections satisfied by this change

- `docs/PRD.md` §5.1 — v0.9 in-scope product surface.
- `docs/PRD.md` §7.3 — performance targets.
- `docs/PRD.md` §9.1 — v0.9 release criteria.
- `docs/PRD.md` §10.3 — SDD process constraint.
- `docs/PRD.md` §11 — roadmap and retained-engine migration overlay.
- `docs/ARCHITECTURE.md` §2.5 — retained ownership rule.
- `docs/API-POLICY.md` — public/internal API lock requirements.

## Intent

Create a single source of truth for what remains before v0.9 can be considered release-ready. The output is not a feature; it is a prioritized execution map with evidence-backed blockers, verification gates, and cleanup/archive actions.

## Scope

- Audit PRD release criteria against repo evidence.
- Audit active OpenSpec changes and unchecked tasks.
- Classify remaining work into:
  - release blockers,
  - verification blockers,
  - cleanup/archive tasks,
  - post-v0.9/non-blocking follow-ups.
- Identify the next highest-impact implementation change after the audit.
- Produce a verification checklist for v0.9 readiness.

## Non-goals

- Do not silently change the PRD.
- Do not mark ambiguous runtime/manual criteria complete without evidence.
- Do not implement every blocker inside this audit change.
- Do not relax v0.9 targets without a founder-approved PRD decision.

## Current evidence

Clearly present in the repo:

- Four public packages exist: `engine`, `primitives`, `headless`, `styled`.
- Rust `libvexart` exists and uses WGPU/Taffy.
- Zig/Clay runtime artifacts appear removed.
- API snapshots exist.
- Visual test harness and reference PNGs exist.
- Performance frame-breakdown and transport gates exist.
- License and docs website artifacts exist.
- Native SHM raw-default presentation policy is measured and committed.

Clearly not release-complete yet:

- Root/package versions are still `0.0.1`, not v0.9.
- Some docs/examples still reference old `@tge/*`, Clay, or Zig wording.
- Entrypoints still use `export *` even though the API policy wants explicit public exports.
- Some PRD surface details are missing or uncertain, including margin props and exact JSX intrinsic naming for `image`/`canvas`.
- Pipeline cache manager exists, but the WGPU pipeline cache appears disabled in the active context path.
- Active OpenSpec changes still contain unchecked retained-engine and release-verification tasks.
- Private beta, deployed docs, zero P0 bugs, and zero vulnerabilities are not proven by repo evidence.

## Success criteria

- A release-readiness spec exists with evidence-based requirements.
- A task list exists that prioritizes blockers in execution order.
- The top next implementation phase is unambiguous.
- Ambiguous/manual criteria are explicitly labeled as requiring human/runtime validation.
- Completed/stale OpenSpec changes are identified for archive/reconciliation.
