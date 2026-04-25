# Tasks: Phase 3f — Native Default Cutover

## 1. Default Flip

- [x] 1.1 Flip retained feature flags to default-on.
- [x] 1.2 Preserve env override for emergency fallback.
- [x] 1.3 Update debug mode to show retained/default state.

## 2. Documentation And Examples

- [x] 2.1 Update user docs and architecture docs to remove hybrid-default wording.
- [x] 2.2 Update examples if they reference fallback paths.
- [x] 2.3 Document fallback compatibility window.

## 3. Release Gates

- [x] 3.1 Run API extractor and review public API diff.
- [x] 3.2 Run golden image suite.
- [x] 3.3 Run interaction parity suite.
- [x] 3.4 Run retained-path benchmarks against baseline.
- [x] 3.5 Record verify report and cutover decision.
