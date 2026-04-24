# Tasks: Phase 3e — Native Frame Orchestrator

## 1. Native Frame Core

- [x] 1.1 Add frame orchestrator modules and strategy enum.
- [x] 1.2 Implement no-op frame skipping.
- [x] 1.3 Implement dirty layer and dirty region strategy selection.
- [x] 1.4 Implement final-frame fallback strategy.

## 2. Animation And Stats

- [x] 2.1 Integrate compositor animation fast path for transform/opacity.
- [x] 2.2 Add structured native frame stats.
- [x] 2.3 Expose stats through TS debug overlay.

## 3. TS Loop Reduction

- [x] 3.1 Reduce TS native path to request/render/present calls.
- [x] 3.2 Keep JS scheduler only for user-facing timing and fallback.
- [x] 3.3 Add tests for resize invalidation and resource pressure.

## 4. Verification

- [x] 4.1 Benchmark FFI calls per no-op and dirty frame.
- [x] 4.2 Verify compositor animation avoids layout when valid.
- [x] 4.3 Verify native frame stats explain strategy choice.
