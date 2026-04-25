# Delta for performance-gates

Refs: `docs/PRD.md §8` (performance budgets), `docs/PRD.md §12 DEC-014`, proposal `§Evidence — bench results`, proposal `§Success criteria`.

## MODIFIED Requirements

### Requirement: SHM transport performance gate

The repository SHALL provide a command that runs the frame breakdown benchmark with SHM transport and fails when p95 scenario thresholds are exceeded. The gate MUST test the TS-only path (no Rust retained path exists).

(Previously: gate tested both TS and Rust retained paths. Now: only the TS path is benchmarked — the Rust retained path has been removed.)

#### Scenario: cosmic-shell-1080p SHM gate passes

- **WHEN** the SHM gate is run on `examples/opencode-cosmic-shell/app.tsx` at 1080p
- **THEN** the TS-path p95 total frame time MUST be ≤ 16 ms
- **AND** no Rust-retained benchmark variant is measured or reported

#### Scenario: dashboard-1080p SHM gate passes

- **WHEN** the SHM gate is run on the dashboard synthetic workload at 1080p
- **THEN** the TS-path p95 total frame time MUST be ≤ 6 ms
- **AND** no Rust-retained benchmark variant is measured or reported

### Requirement: File transport performance gate

The repository SHALL provide a command that runs the frame breakdown benchmark with file transport and fails when p95 scenario thresholds are exceeded. The gate MUST test the TS-only path.

(Previously: same structure. Now: explicitly states TS-only path.)

#### Scenario: File gate passes

- **WHEN** the file gate is run
- **THEN** TS-path p95 values are checked against thresholds
- **AND** the command exits successfully only when all thresholds pass

## REMOVED Requirements

None.
