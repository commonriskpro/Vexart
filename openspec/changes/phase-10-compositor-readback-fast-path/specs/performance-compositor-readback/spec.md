# Spec: Performance Compositor Readback

## ADDED Requirements

### Requirement: Compositor readback stages SHALL be measurable

The frame breakdown profiler SHALL expose enough native backend timing to distinguish compositor composition, readback, and native emit costs.

#### Scenario: Compositor-only benchmark reports backend detail

- **WHEN** the compositor-only benchmark runs
- **THEN** the report identifies whether the p95 cost is composition, readback, emit, or JS orchestration.

### Requirement: Native presentation SHOULD avoid unnecessary JS readback

When native presentation is enabled and a frame can be emitted from a native target, the backend SHOULD avoid returning full RGBA payloads to JavaScript.

#### Scenario: Native target emission available

- **GIVEN** native presentation is enabled with SHM transport
- **WHEN** a compositor-only frame can be emitted from a native target
- **THEN** the backend emits natively without `vexart_composite_readback_rgba` crossing into JavaScript.

### Requirement: Existing transport gates SHALL remain valid

Compositor/readback optimization MUST NOT regress SHM/file transport performance gates.

#### Scenario: Transport gates after optimization

- **WHEN** compositor/readback changes are applied
- **THEN** `perf:transport:shm` and `perf:transport:file` still pass.
