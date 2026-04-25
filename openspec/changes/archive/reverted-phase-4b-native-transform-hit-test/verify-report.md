# Verify Report: Phase 4b — Native Transform-Aware Hit Testing

## Status

Implemented for the Phase 4b scope. Native interaction dispatch no longer falls back to the TypeScript interaction loop solely because transformed nodes are present.

## Implemented

- Added Rust matrix helpers matching the TypeScript 3×3 row-major transform model.
- Parsed structured `transform` JSON props and `transformOrigin` strings/objects from the native scene graph.
- Applied accumulated ancestor transforms in native hit-testing by rebasing composed absolute transforms into node-local coordinates.
- Updated native hit-test and hovered-node collection to use transformed local coordinates while preserving axis-aligned behavior for untransformed nodes.
- Removed the transform-specific native interaction dispatch fallback gate in `composite.ts`.
- Kept event payload semantics unchanged: `nodeX` / `nodeY` remain pointer coordinates relative to layout origin.

## Verification Run

- `cargo build --quiet --manifest-path native/libvexart/Cargo.toml` — passed.
- `cargo test --quiet --manifest-path native/libvexart/Cargo.toml` — 148 passed.
- `bun test packages/engine/src/ffi/native-scene.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/loop/composite.test.ts` — 19 passed.
- `bun run typecheck` — passed.
- `bun test` — 301 passed.
- `bun run test:visual:native-render-graph` — 40 passed, 0 failed.
- `bun run perf:check` — passed (`15.17 ms/frame`, +3.0% vs baseline, below threshold).
- `git diff --check` — passed.

## Added Coverage

- Rust unit test: direct transformed visual hit-test includes transformed bounds and excludes original pre-transform bounds.
- Rust unit test: ancestor transforms are accumulated before hit-testing a child.
- TypeScript FFI test: `nativeInteractionFrame()` emits hover for a transformed visual position and not for the original layout position.

## Remaining Gaps

- Transform parsing duplicates TypeScript matrix semantics in Rust. This is intentional for native ownership, but a shared transform representation could reduce long-term drift.
- JSON parsing is done on demand during hit-testing. Cache transformed matrices later if profiling shows this path becoming hot.

## Rollback

- Set `VEXART_NATIVE_EVENT_DISPATCH=0` to use the TypeScript compatibility interaction loop.
- Reintroduce the transform fallback gate in `composite.ts` if native transform parity regresses.
