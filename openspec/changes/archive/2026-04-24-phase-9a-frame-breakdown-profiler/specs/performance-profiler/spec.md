# performance-profiler Delta Spec

## ADDED Requirements

### Requirement: Frame profiler SHALL report category-specific frame budgets

The benchmark runner MUST measure no-op, dirty-region, compositor-only, dashboard 800×600, and dashboard 1080p workloads separately.

#### Scenario: 1080p dashboard benchmark runs

- **GIVEN** the frame breakdown benchmark is executed
- **WHEN** it runs the dashboard release scenario
- **THEN** it measures a `1920×1080` dashboard workload and reports p50/p95/p99 timings

### Requirement: Frame profiler SHALL expose stage timings

The benchmark runner MUST report available frame stage timings for layout, prep, paint, I/O, sync, and total frame time.

#### Scenario: Stage summary is emitted

- **GIVEN** a scenario renders measured frames
- **WHEN** the benchmark completes
- **THEN** the terminal summary and JSON output include stage timing percentiles

### Requirement: Frame profiler SHALL report FFI usage

The benchmark runner MUST report total FFI calls and top native symbols per scenario.

#### Scenario: FFI counts are recorded

- **GIVEN** a scenario invokes native functions
- **WHEN** the benchmark completes
- **THEN** the JSON output includes total FFI calls and per-symbol counts

### Requirement: Frame profiler SHALL produce machine-readable artifacts

The benchmark runner MUST write JSON output suitable for CI archival and future regression gates.

#### Scenario: JSON artifact is written

- **GIVEN** the benchmark is run with default settings
- **WHEN** all scenarios complete
- **THEN** `scripts/frame-breakdown-report.json` contains metadata, summaries, and per-frame records
