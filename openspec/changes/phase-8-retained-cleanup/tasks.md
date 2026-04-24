# Tasks: Phase 8 — Retained Cleanup And Simplification

## 1. Inventory

- [ ] 1.1 Inventory TS retained render graph, layer cache, sprite orchestration, backend result modes, and fallback/test paths.
- [ ] 1.2 Classify every path as `native-owned`, `binding-shell`, `compat-fallback`, `test/offscreen`, or `delete`.
- [ ] 1.3 Add grep gates for stale hybrid ownership language.

## 2. Remove Dead Implementation Paths

- [ ] 2.1 Delete TS render graph hot path after native image/canvas ownership is complete.
- [ ] 2.2 Delete obsolete TS layer target cache and sprite orchestration.
- [ ] 2.3 Delete old backend result modes returning raw presentation buffers unless used by explicit readback APIs.

## 3. Isolate Remaining Fallbacks

- [ ] 3.1 Keep native-disabled compatibility behind explicit flags.
- [ ] 3.2 Keep offscreen/screenshot APIs with intentional readback names.
- [ ] 3.3 Ensure fallback tests cover all retained fallback entry points.

## 4. Rename And Document Binding Shell

- [ ] 4.1 Rename or annotate TS bridge files that now only translate, dispatch callbacks, or expose test snapshots.
- [ ] 4.2 Update docs to reflect Rust as the retained runtime owner.
- [ ] 4.3 Archive stale hybrid docs/spec fragments.

## 5. Verification

- [ ] 5.1 Run typecheck, full tests, visual native render graph, perf, API check, and grep gates.
- [ ] 5.2 Write final cleanup verify report.
- [ ] 5.3 Archive completed SDD changes into canonical docs/specs.
