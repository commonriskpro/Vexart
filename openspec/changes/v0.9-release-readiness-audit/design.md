# Design: v0.9 Release Readiness Audit

## Strategy

This change is a control-plane artifact. It does not directly implement product features; it prevents scope drift by turning the PRD into an executable release checklist.

The audit uses three inputs:

1. **Policy source** — `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API-POLICY.md`.
2. **Implementation evidence** — repo files, scripts, package structure, tests, docs, examples.
3. **Execution state** — active OpenSpec changes and unchecked tasks.

## Classification model

Each item is classified as one of four categories:

### Release blocker

The item blocks v0.9 because it is explicitly required by PRD §5.1, §7.3, §9.1, or the retained-engine overlay.

Examples:

- Full native render graph coverage if native retained cutover is claimed complete.
- API policy violations before API lock.
- Missing visual golden pass.
- Failing performance release gates.

### Verification blocker

Implementation may exist, but release readiness is not proven.

Examples:

- Real Kitty/Ghostty/WezTerm manual smoke.
- Showcase parity in an interactive terminal.
- Security audit / zero vulnerability evidence.

### Cleanup/archive

The work is likely complete or superseded but still creates process noise because it remains active or unchecked.

Examples:

- Stale OpenSpec changes with old unchecked task lists.
- Orphan active spec directories without proposal/tasks.

### Follow-up

Useful work that can move after v0.9 only if the PRD allows it or founder records a new decision.

## Priority order

The audit prioritizes by release risk, not by implementation size:

1. **Retained render graph completion** — core architecture and visual parity blocker.
2. **Retained layout/damage ownership** — correctness and dirty-region performance blocker.
3. **API public surface lock** — semver/release contract blocker.
4. **Docs/examples freshness** — developer preview usability blocker.
5. **Visual/performance/release validation** — proof blocker.
6. **OpenSpec archive/reconciliation** — process hygiene blocker.

## Deliverables

- `specs/release-readiness/spec.md` — requirements and scenarios for release readiness.
- `tasks.md` — prioritized checklist with PRD evidence.
- `verify-report.md` — populated as blockers are validated/closed.

## Safety

- Do not mark a requirement complete based only on "code exists" when the PRD requires runtime proof.
- Do not delete or archive active OpenSpec changes until their tasks are reconciled against the real repo state.
- Do not lower performance targets inside this change.
