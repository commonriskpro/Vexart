# Verify Report: Phase 18 — Presentation performance measurement validity

## Result

Stage 1 measurement validity is verified. The frame-breakdown harness now
defaults to requested native presentation, labels its output as internal
frame timing, preserves the full-frame presentation path, and records changing
transform evidence for the compositor scenario. Stage 2b has same-machine
evidence for the in-process `DefaultHasher` candidate and Stage 3 has executed
the bounded readback-copy reduction. Native automated correctness is verified,
but the phase is not complete: dirty-region remains above its PRD budget,
dashboard misses one after run, and physical Kitty proof was not rerun.

## Automated evidence

- `bun test scripts/frame-breakdown-contract.test.ts scripts/frame-breakdown-gate.test.ts` — **19 measurement tests passed**, 0 failed.
- `bun test` with the repository's Solid preload — **389 TypeScript tests passed**, 0 failed, 924 assertions across 57 files.
- Effects contract suite — **8 groups passed**, 0 failed (native/TypeScript contract coverage).
- `bun typecheck` — passed.
- Final native verification: `cargo test --release --locked -p libvexart --features gpu-tests` — **172 passed, 0 failed, 1 ignored** (166 unit, 1 alpha, 1 backdrop, 3 transform, 1 shadow); `/tmp/vexart-phase18-final-native.log`.
- Final TypeScript/script verification — **408 passed, 0 failed, 977 assertions across 59 files**; typecheck passed; `/tmp/vexart-phase18-final-ts.log` and `/tmp/vexart-phase18-final-typecheck.log`.
- Final effects contract suite — **8 GPU groups passed**, 0 failed; `/tmp/vexart-phase18-final-effects.log`.

All checks above were run and verified by the root agent.

## Baseline measurement

Three serial 300-frame runs were collected with `warmup=30`, `transport=shm`,
requested native presentation enabled, report version 4, and the full-frame
presentation path. These are mock-terminal **internal-frame-timing** samples;
they do not measure visible Kitty terminal latency.

Artifacts:

- `/tmp/vexart-phase18-before/run-1.json`
- `/tmp/vexart-phase18-before/run-2.json`
- `/tmp/vexart-phase18-before/run-3.json`
- `/tmp/vexart-phase18-before/gate.log`

The observed `summary.totalMs` percentile ranges across the three runs were:

| Scenario | PRD gate | p95 range (ms) | p99 range (ms) | Outcome |
| --- | ---: | ---: | ---: | --- |
| dashboard-1080p | `< 10` p95 | 17.28–17.37 | 17.73–18.53 | fail |
| dirty-region | `< 5` p95 | 22.16–24.05 | 22.62–25.38 | fail |
| compositor-only | `< 8.33` p95 | 21.86–21.91 | 22.11–22.63 | fail |
| noop-retained | `< 1` p99 | 0.0017–0.0021 | 0.0096–0.0142 | pass |

The compositor report contains 300 transform samples and
`compositorTransformChanged=true` in each run. The baseline gate therefore
reports the real budget misses while confirming complete sample counts and the
required workload evidence.

## Stage 2b digest evidence (diagnostic, not final completion)

The native `DefaultHasher` candidate was built from release source at:

`cbe2d8d2a831ca34942bfa94bc8f67f685495fdbb44d336ca56eee86d4655105`

An expanded 30-iteration same-machine hash benchmark measured:

| Input set | Serial FNV (ms) | `DefaultHasher` (ms) |
| --- | ---: | ---: |
| 1080p UI buffers | 9.144 | 1.628 |
| Varied buffers | 9.428 | 1.586 |

Three serial 300-frame SHM after isolates were captured in
`/tmp/vexart-phase18-after/run-{1,2,3}.json`. `summary.totalMs.p95` values
were:

| Scenario | Before median p95 (ms) | After p95 (ms) | PRD gate | Outcome |
| --- | ---: | --- | ---: | --- |
| dashboard-1080p | 17.337 | 9.885 / 9.895 / 9.896 | `< 10` | pass in all three |
| dirty-region | 22.166 | 6.446 / 6.809 / 6.785 | `< 5` | miss in all three |
| compositor-only | 21.906 | 6.324 / 5.339 / 5.471 | `< 8.33` | pass in all three |

The noop-retained p99 remained within its `< 1 ms` PRD gate. The changed-frame
improvement attributes roughly 8 ms of the prior cost to duplicate digest work,
while the remaining dirty-region miss remains visible. These are internal
full-frame timing results, not terminal-visible latency, and do not claim that
all targets are achieved.

## Stage 3 readback-copy evidence (active, not all-green)

The native worker executed the bounded reduction in
`native/libvexart/src/composite/readback.rs` and
`native/libvexart/src/kitty/transport.rs`. The callback path borrows tightly
packed mapped rows directly, uses an exact packed fallback for padded rows, and
unmaps safely across callback errors and panics. The pre-existing
`readback_full` compatibility path and full-frame presentation remain.
The release native build used for these isolates is identified by SHA
`6a12ddcb37b05abdd4723eb9d2e19945be3c7af858485895100a8b564de56ddc`.

GPU equivalence coverage passed for source pixels, padded rows, callback error,
and panic cleanup (3 GPU tests). Three serial 300-frame SHM runs with
`warmup=30` were captured in `/tmp/vexart-phase18-readback/run-{1,2,3}.json`:

| Scenario | p95 (runs 1 / 2 / 3, ms) | PRD gate | Typical timing evidence | Outcome |
| --- | --- | ---: | --- | --- |
| dashboard-1080p | 9.740 / 10.086 / 9.677 | `< 10` | p50 7.148–7.458 vs stage2b 8.607–8.683; avg 7.674–8.131 vs 8.514–8.533 | 2/3 p95 pass |
| dirty-region | 6.250 / 6.215 / 6.224 | `< 5` | p50 3.702–3.788 vs stage2b 4.059–4.350; avg 4.068–4.194 vs 4.398–4.718 | miss all 3 |
| compositor-only | 6.050 / 6.046 / 6.046 | `< 8.33` | p50 3.525–3.532 vs stage2b 3.863–4.008; avg 3.916–3.927 vs 4.056–4.310 | pass all 3; p95 higher than stage2b median 5.471 |
| noop-retained | p99 0.01575 / 0.012916 / 0.012042 | `< 1` p99 | — | pass all 3 |

The reduction lowers total p50 and average for all three key scenarios, but the
p95 tails are variable and do not complete the PRD budget gate. Gate runs 1/2/3
all exit 1 on the actual thresholds: dirty-region fails all three, and
dashboard fails run 2. Logs are `/tmp/vexart-phase18-readback/gate-{1,2,3}.log`.

## Scope and limits

- Stage 1 changes only benchmark/gate helpers, focused script tests, and SDD
  documentation. Stage 2/3 native slices are separately owned and documented
  above; this report does not claim they close every performance budget.
- `nativePresentation=false` remains an explicit harness opt-out, but the
  report truthfully records the requested mode rather than claiming to suppress
  all native output.
- Regional presentation remains deferred pending separate correctness and
  attribution evidence.
- The mock terminal does not establish terminal-visible latency or Kitty
  presentation performance.
- Physical Kitty proof was not rerun for Phase 18; existing effects/legacy
  process evidence was preserved and is not a new Phase 18 capture.
