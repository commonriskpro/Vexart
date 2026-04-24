# Tasks: Phase 10 — Compositor Readback Fast Path

## 1. Baseline

- [ ] 1.1 Run SHM 300-frame frame breakdown baseline.
- [ ] 1.2 Capture real Kitty benchmark baseline if available.
- [ ] 1.3 Identify compositor-only and dashboard readback/native emit stages.

## 2. Instrumentation

- [ ] 2.1 Add backend-native substage timings for composite/readback/emit.
- [ ] 2.2 Expose substage summaries in frame breakdown report.

## 3. Optimization

- [ ] 3.1 Avoid readback in compositor-only native presentation path where possible.
- [ ] 3.2 Reuse compositor targets/layers to reduce backend end cost.
- [ ] 3.3 Preserve TS fallback and direct/file compatibility paths.

## 4. Verification

- [ ] 4.1 Run typecheck and tests.
- [ ] 4.2 Run SHM/file transport perf gates.
- [ ] 4.3 Run real terminal validation when available.
- [ ] 4.4 Write verify report.
