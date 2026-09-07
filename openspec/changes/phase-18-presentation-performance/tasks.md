# Tasks: Phase 18 — Presentation performance measurement validity

## 1. SDD and measurement contract

- [x] 1.1 Add proposal, Given/When/Then delta spec, design, and task list.
- [x] 1.2 Record the existing full-frame-only boundary, stage 2 native criteria,
  and regional presentation deferral.

## 2. Benchmark harness

- [x] 2.1 Make native presentation default to the runtime default and label
  internal timing versus terminal-visible latency accurately.
- [x] 2.2 Replace compositor descriptor-only setup with deterministic updates to
  an actual node transform prop/state and include transform evidence in reports.
- [x] 2.3 Keep report output and cadence cleanup bounded to explicit benchmark
  artifacts; do not modify engine/native/runtime files.

## 3. Gate and focused checks

- [x] 3.1 Add focused script helpers/tests for CLI defaults, compositor evidence,
  and fail-closed report validation.
- [x] 3.2 Align scenario thresholds with PRD 7.3, including no-op p99.
- [x] 3.3 Validate required scenarios, metrics, sample counts, dimensions, and
  transport before evaluating thresholds.

## 4. Stage 2 transport optimization (separate worker; evidence-gated)

- [x] 4.1 Identify the payload/digest boundary before native edits and add
  focused tests for one digest reuse, changed-payload emission, and complete-
  frame fallback safety. The single-FNV-digest transport test slice passes and
  has a release build; this does not claim a PRD target.
- [x] 4.2 Repeat same-machine measurements over the actual workload and varied
  buffers, comparing serial FNV with an in-process standard-library candidate
  such as `DefaultHasher`; adopt the candidate only when the evidence supports
  it. The digest must remain process-local with no persisted format, FFI/ABI,
  public API, renderer, or dependency change. Initial 30-iteration hash
  measurements and three after isolates are recorded; native automated
  correctness is verified. Real Kitty evidence was not rerun.
- [x] 4.3 Report digest/emit/readback/compress/write metrics without duplicate
  hash work or false de-duplication, then inspect the complete repeated
  300-frame before/after isolates before claiming any target achieved. Dirty
  region remains over budget, so this is not an all-green performance result.

## 5. Stage 3 readback-copy reduction (active, evidence-gated)

- [x] 5.1 Specify the existing intermediate CPU readback allocation/copy seam,
  including exact dimensions, row pitch/stride, and ownership/lifetime rules.
- [x] 5.2 Add focused exact-pixel, padded-row/stride, and resource-lifetime
  tests for success and failure before changing the readback implementation.
- [x] 5.3 Evaluate a bounded allocation/copy reduction that preserves identical
  full-frame pixels and presentation. No asynchronous or regional output,
  FFI/ABI/public contract, renderer behavior, or dependency change is allowed;
  full-frame presentation remains mandatory.
- [x] 5.4 Repeat same-machine measurements and inspect complete reports before
  attributing a gain or claiming any PRD target achieved. Typical total p50 and
  average improved for all three key scenarios, but p95 is not uniformly under
  budget (dirty-region misses all three runs; dashboard misses one).

## 6. Verification

- [x] 6.1 Run focused script tests and typecheck.
- [x] 6.2 Run a short benchmark only when coordinated by the root agent; inspect
  report and gate output. The repeated stage3 isolates and gate logs are
  recorded; real Kitty proof was not rerun.
- [x] 6.3 Keep regional presentation deferred pending separate correctness and
  attribution evidence.
- [x] 6.4 Report known limits: mock-terminal internal timings do not establish
  Kitty-visible latency; no regional optimization is included.

## 7. Remaining release evidence

- [ ] 7.1 Bring dirty-region p95 under the strict PRD 7.3 `< 5 ms` budget and
  make dashboard-1080p p95 consistently `< 10 ms` across repeated runs; then
  re-run the complete repeated gate before claiming all performance targets.
- [ ] 7.2 Capture physical Kitty-visible proof; existing effects/legacy process
  evidence remains preserved but is not a new Phase 18 capture.
