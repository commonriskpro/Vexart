# Proposal: Phase 8 — Retained Cleanup And Simplification

## Problem

After native retained cutover, the codebase still contains compatibility paths, legacy naming, and hybrid ownership documentation. Keeping those paths indefinitely makes ownership ambiguous: TypeScript looks like an implementation owner even when Rust is the retained runtime source of truth.

## Goal

Simplify the codebase after native image assets and canvas display lists land: TypeScript becomes a binding/callback shell, while Rust owns retained rendering behavior.

## Scope

- Identify retained TS hot paths that are now fallback-only.
- Remove or isolate obsolete render graph, layer cache, sprite orchestration, and backend result modes.
- Rename files/types where names imply TS implementation ownership.
- Update docs/tests to describe Rust ownership and explicit fallback boundaries.
- Keep intentional offscreen/screenshot/readback APIs.

## Prerequisites

- Phase 4c native image asset handles complete.
- Phase 4d native canvas display-list API complete.
- Native visual, perf, and API gates stable.
- One compatibility window for emergency fallback has passed or is explicitly retained by policy.

## Non-goals

- Removing public APIs.
- Removing test/offscreen helpers that intentionally run without native presentation.
- Changing user-facing JSX semantics.

## Verification

- Grep gates prove removed stale ownership terms and dead imports.
- Full test/typecheck/visual/perf/API gates pass.
- Docs mention compatibility fallback only where intentionally supported.

## Rollback

- Cleanup changes should be split into small commits so accidental removal can be reverted independently.
- Keep environment fallback until the team explicitly removes it.
