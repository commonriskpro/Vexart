# Verify Report: Phase 3f — Native Default Cutover

## Status

Implemented.

## Implemented

- Defaulted the retained scene/event/layout/render stack on for Kitty-compatible transports by changing `createRenderLoop()` cutover semantics from opt-in to opt-out.
- Added global emergency fallback override `VEXART_RETAINED=0`, while preserving narrower per-feature `=0` overrides for debugging.
- Added structured fallback reasons for scene graph, event dispatch, scene layout, and render graph flags.
- Updated debug overlay state so it now reports `retained=default` vs `retained=fallback` with aggregate fallback reasons.
- Added `packages/engine/src/loop/native-default-cutover.test.ts` to verify:
  - Kitty transports default to retained mode,
  - explicit opt-out still works,
  - global fallback disables the full retained stack,
  - direct Kitty transport keeps retained enabled,
  - global fallback still disables the full retained stack.
- Updated user/docs wording to describe retained default behavior and the compatibility-window fallback.
- Full automated interaction/unit suite passed via `bun test`.
- Retained-path benchmark gate passed via `bun run perf:check`.
- Phase 3e frame-orchestrator FFI benchmark still passes via `bun run perf:frame-orchestrator` after explicitly keeping that benchmark scoped to the original frame-orchestrator budget rather than the broader retained-scene cutover.

## Gate Status

- ✅ Interaction parity suite — covered by `bun test` (289 passing tests, including focus/pointer/native retained interaction coverage).
- ✅ Retained-path benchmarks against baseline — `bun run perf:check` passes within the configured threshold (latest run: `-2.0%` vs baseline).
- ✅ Frame-orchestrator FFI benchmark — `bun run perf:frame-orchestrator` passed (`0` no-op / `6` dirty in direct and SHM for the Phase 3e benchmark scope).
- ✅ Golden image suite — `bun run test:visual` now passes (`colors`, `hello`, `layout` all at `0.00%` diff) after fixing the flat rectangle GPU path.
- ✅ API extractor gate is now executable — `bun run api:update` generated and refreshed `.api.md` snapshots for `engine`, `primitives`, `headless`, and `styled`.
- ✅ API report hygiene follow-up is clean — the latest `bun run api:update` completes without the prior `ae-missing-release-tag`, `ae-forgotten-export`, or malformed-TSDoc warning set.

## Current Cutover Decision

- The runtime default flip itself is implemented.
- The Phase 3f cutover work is implemented and verified.
- Remaining follow-up work is real-terminal smoke confidence, not the default-cutover implementation itself.

## Required Verification

- Real-terminal emergency fallback smoke (`VEXART_RETAINED=0`) is still recommended before archival even though automated fallback coverage now exists.
