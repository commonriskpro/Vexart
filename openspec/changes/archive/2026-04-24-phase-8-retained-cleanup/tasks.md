# Tasks: Phase 8 — Retained Cleanup And Simplification

## 1. Inventory

- [x] 1.1 Inventory TS retained render graph, layer cache, sprite orchestration, backend result modes, and fallback/test paths.
- [x] 1.2 Classify every path as `native-owned`, `binding-shell`, `compat-fallback`, `test/offscreen`, or `delete`.
- [x] 1.3 Add grep gates for stale hybrid ownership language.

## 2. Remove Dead Implementation Paths

- [x] 2.1 Isolate TS render graph build as fallback/test path after native image/canvas ownership is complete.
- [x] 2.2 Delete obsolete TS canvas sprite orchestration and classify remaining target caches as native-handle bookkeeping.
- [x] 2.3 Keep raw presentation buffers only for explicit readback/fallback APIs.

## 3. Isolate Remaining Fallbacks

- [x] 3.1 Keep native-disabled compatibility behind explicit flags.
- [x] 3.2 Keep offscreen/screenshot APIs with intentional readback names.
- [x] 3.3 Ensure fallback tests cover all retained fallback entry points.

## 4. Rename And Document Binding Shell

- [x] 4.1 Rename or annotate TS bridge files that now only translate, dispatch callbacks, or expose test snapshots.
- [x] 4.2 Update docs to reflect Rust as the retained runtime owner.
- [x] 4.3 Archive stale hybrid docs/spec fragments behind explicit historical/roadmap exclusions.

## 5. Verification

- [x] 5.1 Run typecheck, full tests, visual native render graph, perf, API check, and grep gates.
- [x] 5.2 Write final cleanup verify report.
- [x] 5.3 Archive completed SDD changes into canonical docs/specs.
