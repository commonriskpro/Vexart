# Proposal: Phase 18 — Presentation performance measurement validity

## Intent

Make the existing frame-breakdown harness a truthful first performance gate:
measure the runtime's default native presentation mode, distinguish internal
timings from terminal-visible latency, exercise a real deterministic compositor
transform, and fail closed on incomplete or malformed reports.

Phase 18 is staged: stage 1 is measurement/baseline (this implementation),
stage 2 is a single-digest transport optimization with truthful de-duplication
statistics, stage 3 is a bounded readback-copy reduction, and safe regional
presentation is a later stage pending evidence.
Within stage 2, the native worker may evaluate an in-process digest
implementation (including the standard-library `DefaultHasher`) against the
existing serial FNV reference when repeated same-machine measurements support
the change. This is an evidence-driven implementation detail, not a persisted
hash contract.

## Problem

The current harness defaults `nativePresentation` off even though the runtime
defaults it on, and its compositor scenario registers a descriptor without
proving that the rendered node's transform changes between frames. The gate
uses p95 for no-op despite PRD 7.3 requiring p99, has looser-than-PRD thresholds
for several scenarios, and accepts missing samples/metrics or incomplete
transport metadata. These can produce false-green performance claims.

## Scope

- Update `scripts/frame-breakdown.tsx` to:
  - default to native presentation on;
  - label the report as internal benchmark timing, not terminal-visible latency;
  - make compositor frames mutate a real node transform deterministically and
    expose enough evidence to verify the mutation;
  - preserve full-frame presentation as the only current presentation path.
- Update `scripts/frame-breakdown-gate.ts` to validate report metadata,
  required scenarios, sample counts, required metrics, transport, and PRD
  gates: dashboard 1080p <10 ms p95, dirty region <5 ms p95, compositor-only
  <8.33 ms p95, and no-op <1 ms p99.
- Add focused script-level helpers/tests only under `scripts/`.
- Add this SDD proposal, delta spec, design, and task list.

Stage 2 is separately authorized for the native worker. It may replace the
serial FNV implementation used for in-process payload comparison with a
standard-library hasher only after repeated same-machine measurements over the
actual workload and varied buffers. The digest remains process-local: no hash
is persisted, exposed through FFI/ABI, or added to a public API. No new
dependency, renderer change, regional path, or weakening of the full-frame
fallback is in scope. The three after isolates are now available for review;
final native automated coverage is complete, while real Kitty proof remains
pending before stage 2 is closed or any broad performance target is claimed
achieved.

Stage 2b now has same-machine evidence: the expanded 30-iteration hash
benchmark favors the standard-library candidate over serial FNV, and the three
300-frame after isolates bring dashboard-1080p and compositor-only p95 under
their PRD budgets. Dirty-region remains above its PRD budget, so these results
do not close the phase or claim all targets achieved. Final native automated
coverage is complete; real Kitty proof was not rerun.

Stage 3 is an active, separately authorized native-worker slice in this change.
It reduces the intermediate CPU readback allocation/copy (about 8.3 MB at
1920×1080) while preserving exact full-frame output. GPU equivalence coverage
for source pixels, padded rows, callback errors, and panic cleanup passes, and
three same-machine 300-frame isolates show lower typical p50/average timing for
dashboard-1080p, dirty-region, and compositor-only. Its p95 is not uniformly
within budget (dirty-region misses all three runs and dashboard misses one), so
the phase remains incomplete. It must not add async or regional presentation,
change renderer behavior, alter FFI/ABI/public contracts, or add dependencies;
full-frame presentation remains mandatory. The native worker owns the readback
specification and source edits.

Affected packages for the whole staged phase: `@vexart/engine` and
`libvexart` only for the separately authorized native stages 2 and 3; this
stage edits only benchmark/gate scripts and focused script tests. The native
worker owns the source, payload-spec, and readback-spec edits for those stages.
No public API, FFI/ABI, dependency, package, golden, or unrelated renderer
files are changed.

## Rollback

Revert each staged implementation to its introducing files, preserving reports
and focused evidence. For stage 1, revert this change directory plus owned
script/helper/test changes. Stage 2 must retain the full-frame path as its
rollback-safe fallback. A hasher candidate can be reverted to the FNV reference
without changing any persisted format or ABI. Stage 3 can revert to the
pre-existing intermediate readback copy without changing full-frame semantics.

## Alignment

- PRD 7.3: no-op, dirty-region, compositor-only, and full-dashboard budgets;
  measurement-first performance program and non-goal of promising terminal-visible
  frame rate.
- ARCHITECTURE.md 2.5, 4.2, 5.1: TypeScript owns scene/layout/render graph;
  Rust owns paint/composite/Kitty transport; preserve the current full-frame
  presentation path.
- API-POLICY.md 11: no public API or FFI contract change.
