# Tasks: Phase 9b — Retained Dirty-Region Fast Path

## 1. SDD

- [x] 1.1 Create proposal, design, tasks, and specs.

## 2. Audit

- [x] 2.1 Audit dirty tracker and global dirty subscriber.
- [x] 2.2 Audit layer damage APIs and pointer interaction state changes.

## 3. Implementation

- [x] 3.1 Add dirty scope types to the dirty tracker.
- [x] 3.2 Route node visual dirty to layer damage instead of full dirty.
- [x] 3.3 Use scoped dirty for pointer/hover/focus/active visual changes.
- [x] 3.4 Preserve full dirty fallback for unknown/structural changes.
- [x] 3.5 Add per-path frame instrumentation for layout, interaction, layer assignment, render graph, backend paint/end, presentation, and cleanup.
- [x] 3.6 Update frame breakdown benchmark output with top p95 bottleneck stages.
- [x] 3.7 Stop forcing full layer repaint for retained dirty-region/compositor-only benchmark scenarios.

## 4. Verification

- [x] 4.1 Run frame breakdown smoke benchmark.
- [x] 4.2 Run typecheck and tests.
- [x] 4.3 Run `git diff --check`.
- [x] 4.4 Write verify report.
