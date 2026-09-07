# Design: Phase 18 — Presentation performance measurement validity

## Design goal

Strengthen the existing two-step measurement seam (benchmark JSON -> gate)
without adding a new renderer or changing runtime ownership. Keep transport
optimization and regional presentation as explicit later seams.

## Flow and ownership

scripts/frame-breakdown.tsx
  -> existing @vexart/engine loop + Solid scene
  -> existing TS render graph / full-frame native presentation
  -> report JSON
  -> scripts/frame-breakdown-gate.ts

The stage 1 script remains an external measurement harness. TypeScript scene
state and transform props remain owned by the engine; Rust/native presentation
remains untouched in stage 1. No package boundary or public API changes.

## Stage 1 measurement model

- Native presentation defaults to true, matching createRenderLoop runtime
  defaults. An explicit opt-out is retained only as a truthful harness mode
  label; it is not described as suppressing all final native output.
- Report metadata includes a measurement-scope label and the fact that this
  mock-terminal run does not measure visible terminal latency.
- Compositor frames use a stable target node and deterministic transforms
  (alternating values derived from frame index). The scene is rendered with a
  real transform prop; focused real tests inspect the node props and the
  engine's resolved transform matrix and verify the evidence changes.
- No-op uses p99 because PRD 7.3 names p99. The remaining scenario budgets use
  p95 exactly as specified.
- Gate validation is structural and fail-closed: scenario presence, exact
  transport, dimensions, requested/measured sample counts, required summary
  objects, and finite percentile values are checked before thresholds.
- The benchmark writes only the caller-selected report path (defaulting to an
  explicit /tmp artifact) and cleans the existing cadence log as before.

## Stage 2 native criteria (evidence-gated native worker edits)

The worker must first identify the current payload production boundary and then
prove with focused tests that one digest is reused for unchanged-payload
decisions and report statistics; changed payloads still emit complete frames;
readback, digest, compression, and write timings are independently truthful;
and full-frame presentation remains the fallback. The native worker owns the
source and payload-spec edits for this stage.

The existing serial FNV digest is the reference implementation. A candidate
in-process replacement such as Rust's standard-library `DefaultHasher` is
allowed only as an evidence-driven optimization: repeat measurements on the
same machine over the real workload and varied buffer sizes must support the
choice. Microbenchmarks and a single isolate are diagnostic, not acceptance
evidence; the three 300-frame before/after isolates are now captured and native
automated coverage passes, but final external proof still requires real Kitty
validation and inspection of the complete reports. Current single-digest FNV
evidence is useful to attribute duplicate-scan cost, but it does not claim that
every PRD target is met.

The digest is process-local and metadata-aware. It is not persisted, serialized,
or passed through a public API or FFI/ABI, and the candidate must use only the
existing standard library (no new dependency). The change must not rely on
terminal-visible timing or regional output.

## Stage 3 bounded readback-copy reduction (active evidence-gated slice)

The separately authorized native worker reduced the intermediate CPU readback
allocation/copy in the existing full-frame path (approximately 8.3 MB for a
1920×1080 RGBA frame). `readback_full_with` consumes mapped bytes through a
callback, borrowing tightly packed rows directly and using an exact packed
fallback for padded rows. An unmap guard covers callback errors and panics.
The existing `readback_full` compatibility path remains available.

Focused GPU equivalence coverage passes for source pixels, padded rows, and
callback error/panic cleanup. Three same-machine 300-frame SHM isolates show
lower total p50 and average timing for dashboard-1080p, dirty-region, and
compositor-only versus the stage2b after isolates. The p95 result is not a
uniform budget completion: dirty-region misses all three runs, dashboard misses
one run, and compositor tails are variable (including a higher p95 than the
stage2b after median). These measurements support the typical-cost reduction
but do not claim all PRD targets are met.

The slice does not introduce asynchronous presentation, regional output, an
FFI/ABI or public API change, a new dependency, or renderer behavior changes.
Full-frame presentation remains mandatory, and the native worker owns the
readback specification and source edits. Physical Kitty proof is not newly
performed.

## Future seam

Regional presentation is deliberately deferred. It requires separate correctness
and attribution evidence and must not be simulated by this measurement harness
or by weakening full-frame safety.
