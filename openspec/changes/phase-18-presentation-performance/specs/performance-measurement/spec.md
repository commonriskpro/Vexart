# Presentation performance measurement capability delta

## Requirement: truthful benchmark metadata

The benchmark MUST default to the runtime's native presentation mode and MUST
record that mode, selected transport, workload dimensions, requested/measured
sample counts, and that reported durations are internal benchmark timings rather
than terminal-visible latency.

### Scenario: default invocation

- **GIVEN** the benchmark is invoked without a presentation flag
- **WHEN** it writes a report
- **THEN** `nativePresentation` MUST be true
- **AND** the report MUST identify its measurement scope as internal timing
- **AND** the report MUST NOT claim that terminal-visible latency was measured.

### Scenario: explicit presentation mode

- **GIVEN** an explicit native-presentation flag
- **WHEN** the benchmark runs
- **THEN** the report and console label MUST describe the actual selected mode
- **AND** no flag may imply that the current runtime suppresses final output
  unless the runtime actually provides that behavior.

## Requirement: real compositor mutation

The compositor-only workload MUST change a real node's transform props between
frames using a deterministic sequence, without layout or paint regeneration
being presented as the optimization under test. The report MUST retain evidence
that the target transform changed across measured frames.

### Scenario: compositor frames

- **GIVEN** the compositor-only scenario is selected for at least two measured
  frames
- **WHEN** the benchmark completes
- **THEN** consecutive measured frames MUST contain distinct transform evidence
- **AND** the evidence MUST come from the target node's actual props/render state,
  not only from registering an animation descriptor.

## Requirement: fail-closed PRD gates

The gate MUST require all four PRD scenarios and enough measured samples for the
requested run. It MUST require finite p95 values for dashboard, dirty-region,
and compositor totals, and a finite p99 value for no-op. Missing reports,
scenarios, metrics, invalid sample counts, mismatched transport, or non-finite
values MUST fail.

The release thresholds are:
- dashboard 1080p total p95 < 10 ms;
- dirty-region total p95 < 5 ms;
- compositor-only total p95 < 8.33 ms;
- no-op retained total p99 < 1 ms.

A gate MAY retain stricter supplemental stage thresholds only when they are
clearly labelled as supplemental and do not replace the PRD thresholds.

### Scenario: incomplete report

- **GIVEN** a report omits a required scenario, metric, sample, or transport
- **WHEN** the gate reads it
- **THEN** the gate MUST fail with a diagnostic naming the missing/invalid field.

### Scenario: valid report

- **GIVEN** a report has all required scenarios, metadata, finite metrics, and
  sufficient samples under the PRD limits
- **WHEN** the gate runs
- **THEN** it MUST pass only if every required threshold passes.

## Requirement: presentation safety

This stage MUST NOT add a regional emit/readback path or disable the current
full-frame presentation path. Benchmark side effects MUST be limited to the
explicit report output and existing cadence log cleanup.

### Scenario: measurement-only changes

- **GIVEN** the benchmark or gate is run
- **WHEN** output is produced
- **THEN** no visual golden, source scene, engine/native implementation, package,
  or dependency file is modified.


## Requirement: staged native optimization criteria

Stage 2 native changes MUST identify the existing payload boundary before
editing native code. A single digest MUST be reusable for unchanged-payload
decisions and report statistics; changed payloads MUST still emit complete
full-frame output; timing and byte counters MUST distinguish readback, digest,
compression, and write work without double-counting; and the full-frame path
MUST remain the safe fallback. Regional presentation remains deferred until
these criteria have focused evidence.
