# Spec: Terminal Transport Validation

## ADDED Requirements

### Requirement: Terminal transport matrix report

The repository SHALL provide a command that writes a terminal transport matrix report with terminal kind, capability state, selected transport, transport manager state, and native presentation state.

#### Scenario: Non-interactive run

- **WHEN** the command is run without an interactive TTY
- **THEN** it uses static capability inference
- **AND** it writes a JSON report without attempting active terminal probes.

#### Scenario: Interactive run

- **WHEN** the command is run inside an interactive TTY
- **THEN** it runs the existing terminal probes
- **AND** it records the selected transport and native presentation state.

### Requirement: Optional benchmark embedding

The terminal transport matrix command SHALL optionally run the frame breakdown benchmark with the detected transport and embed scenario p95 values.

#### Scenario: Benchmark requested

- **WHEN** the command is run with `--bench`
- **THEN** it runs the frame breakdown benchmark with the detected transport
- **AND** the report includes scenario p95 summaries.
