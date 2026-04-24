# Spec: Performance Gates

## ADDED Requirements

### Requirement: SHM transport performance gate

The repository SHALL provide a command that runs the frame breakdown benchmark with SHM transport and fails when p95 scenario thresholds are exceeded.

#### Scenario: SHM gate passes

- **WHEN** the SHM gate is run
- **THEN** `dashboard-1080p`, `dirty-region`, `compositor-only`, and `noop-retained` p95 values are checked
- **AND** the command exits successfully only when all thresholds pass.

### Requirement: File transport performance gate

The repository SHALL provide a command that runs the frame breakdown benchmark with file transport and fails when p95 scenario thresholds are exceeded.

#### Scenario: File gate passes

- **WHEN** the file gate is run
- **THEN** `dashboard-1080p`, `dirty-region`, `compositor-only`, and `noop-retained` p95 values are checked
- **AND** the command exits successfully only when all thresholds pass.

### Requirement: Direct transport is compatibility-only

Direct transport SHALL NOT be used as a 1080p performance target gate.

#### Scenario: Direct gate requested

- **WHEN** the gate script is run for direct transport
- **THEN** it reports that direct has no p95 performance gate
- **AND** it exits successfully without enforcing SHM/file thresholds.
