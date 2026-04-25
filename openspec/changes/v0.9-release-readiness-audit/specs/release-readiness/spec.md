# Release Readiness Delta Spec

## Requirement: PRD criteria SHALL be tracked with evidence

Every v0.9 release criterion from `docs/PRD.md` §9.1 SHALL be represented in the release-readiness task list with one of these states:

- satisfied with repo evidence,
- blocker,
- verification required,
- founder/manual evidence required.

### Scenario: release criterion has evidence

Given a PRD release criterion is marked complete
When the verify report is reviewed
Then it SHALL cite file paths, commands, or external/manual evidence proving completion.

### Scenario: release criterion lacks evidence

Given a PRD release criterion cannot be proven from repo evidence
When the audit classifies it
Then it SHALL remain unchecked and be labeled as verification or founder/manual evidence required.

## Requirement: Active OpenSpec changes SHALL be reconciled

All active OpenSpec changes SHALL be classified before v0.9 release as one of:

- still active and blocking,
- still active but non-blocking,
- complete and ready to archive,
- stale/superseded and requiring reconciliation,
- orphan/spec-only and requiring cleanup.

### Scenario: active change contains unchecked tasks

Given an active change has unchecked tasks
When it is audited
Then each unchecked task group SHALL be classified as release blocker, verification blocker, cleanup, or follow-up.

### Scenario: active change appears complete

Given an active change has no substantive unchecked implementation tasks
When it is audited
Then the release-readiness tasks SHALL include an archive/reconciliation action before v0.9.

## Requirement: Retained-engine ownership SHALL match the architecture contract

The engine SHALL not claim retained-engine cutover complete until Rust owns the normal frame-critical path required by `docs/ARCHITECTURE.md` §2.5 and the PRD retained migration overlay.

### Scenario: TypeScript still owns normal render graph generation

Given TypeScript still generates ordinary render graph commands for the native path
When release readiness is evaluated
Then native render graph completion SHALL remain a release blocker.

### Scenario: TypeScript fallback remains

Given a TS fallback remains for compatibility or one migration window
When release readiness is evaluated
Then it SHALL be explicitly labeled fallback-only and not the normal frame-critical path.

## Requirement: Public API SHALL be lockable for v0.9

Before v0.9 release, public entry points SHALL follow the API policy and `.api.md` snapshots SHALL be clean.

### Scenario: entry points use wildcard exports

Given package entry points still use `export *`
When API readiness is evaluated
Then API public surface cleanup SHALL remain a release blocker or explicit founder-approved exception.

### Scenario: API snapshots are updated

Given `bun run api:check` is executed
When generated snapshots are clean or intentionally changed
Then the verify report SHALL record the command and resulting git state.

## Requirement: Developer preview documentation SHALL be internally consistent

Docs and examples SHALL not reference removed stacks (`@tge/*`, Clay, Zig runtime paths) in v0.9 user-facing guidance.

### Scenario: stale docs are found

Given docs or examples reference old package names or removed technologies
When release readiness is evaluated
Then docs/examples freshness SHALL remain a release blocker.

## Requirement: Release validation SHALL use PRD target workloads

Performance readiness SHALL be proven against PRD §7.3 workloads, especially `1920×1080` dashboard and retained no-op/dirty/compositor categories.

### Scenario: only smoke/dev benchmark exists

Given only an 800×600 or non-release benchmark is recorded
When performance readiness is evaluated
Then the criterion SHALL remain verification-required.

### Scenario: release benchmark passes

Given the 1080p dashboard and retained category gates pass on reference hardware
When the verify report records exact commands and p95/p99 values
Then performance readiness MAY be marked satisfied.
