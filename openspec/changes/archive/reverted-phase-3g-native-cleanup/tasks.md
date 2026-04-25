# Tasks: Phase 3g — Native Cleanup And Simplification

## 1. Deletion Plan

- [x] 1.1 Inventory TS render graph, layer cache, and raw presentation code paths.
- [x] 1.2 Classify each path as delete, test-only, debug-only, or fallback-window.
- [x] 1.3 Confirm founder decision for fallback removal timing.

## 2. Code Cleanup

- [x] 2.1 Delete TS render graph hot path after replacement coverage exists.
- [x] 2.2 Delete TS layer target cache and sprite orchestration.
- [x] 2.3 Remove normal-mode raw RGBA backend result variants.
- [x] 2.4 Rename remaining TS backend files to binding-shell naming.

## 3. Tests And Docs

- [x] 3.1 Update tests to assert native retained ownership.
- [x] 3.2 Keep explicit screenshot/offscreen readback tests.
- [x] 3.3 Update docs and architecture references.
- [x] 3.4 Run search/static checks for stale hybrid wording.

## 4. Verification

- [x] 4.1 Run typecheck, tests, visual suite, and retained benchmarks.
- [x] 4.2 Record verify report with deleted paths and remaining intentional readback APIs.
