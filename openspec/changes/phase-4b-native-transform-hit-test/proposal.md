# Proposal: Phase 4b — Native Transform-Aware Hit Testing

## Problem

Phase 4a moved retained interaction frames to Rust, but `composite.ts` still disables native interaction dispatch whenever any interactive rect has a transform matrix. That keeps transformed hit-testing in the TypeScript compatibility loop and prevents the retained path from being fully native-owned for transformed controls.

## Goal

Let the Rust retained scene graph hit-test transformed nodes directly so native interaction dispatch remains enabled for transform-bearing trees.

## Scope

- Parse supported JSX transform props already mirrored to the native scene as JSON strings.
- Match the TypeScript transform-origin and matrix semantics used by `packages/engine/src/ffi/matrix.ts`.
- Apply accumulated ancestor transforms during native hit-testing.
- Preserve pointer capture, pointer passthrough, scroll viewport culling, min hit-area expansion, and event records.
- Remove the transform-specific native interaction fallback gate from `composite.ts`.

## Non-goals

- Removing the full TypeScript compatibility interaction loop.
- Moving JS callback execution to Rust.
- Changing visual transform rendering behavior.
- Implementing arbitrary CSS transform strings; this change covers the existing structured `transform` prop object.

## Verification

- Rust unit tests for transformed hit-test inclusion/exclusion.
- TypeScript FFI tests proving `nativeInteractionFrame()` can hit transformed nodes.
- Existing layout, interaction, visual, typecheck, and performance gates remain green.

## Rollback

- Set `VEXART_NATIVE_EVENT_DISPATCH=0` to return to the TypeScript interaction loop.
- Re-enable the transform fallback gate in `composite.ts` if native matrix behavior diverges.
