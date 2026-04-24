# Tasks: Phase 10 — Compositor Readback Fast Path

## 1. Baseline

- [x] 1.1 Run SHM 300-frame frame breakdown baseline.
- [x] 1.2 Capture real Kitty benchmark baseline if available.
- [x] 1.3 Identify compositor-only and dashboard readback/native emit stages.

## 2. Instrumentation

- [x] 2.1 Add backend-native substage timings for composite/readback/emit.
- [x] 2.2 Expose substage summaries in frame breakdown report.

## 3. Optimization

- [x] 3.1 Avoid readback in compositor-only native presentation path where possible.
- [ ] 3.2 Reuse compositor targets/layers to reduce backend end cost.
- [x] 3.3 Preserve TS fallback and direct/file compatibility paths.
- [x] 3.4 Default native SHM presentation to raw RGBA and keep zlib behind an explicit benchmark flag.

## 4. Verification

- [x] 4.1 Run typecheck and tests.
- [x] 4.2 Run SHM/file transport perf gates.
- [x] 4.3 Run real terminal validation when available.
- [x] 4.4 Write verify report.
