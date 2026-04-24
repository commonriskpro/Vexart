# performance-dirty-region Delta Spec

## ADDED Requirements

### Requirement: Visual-only node changes SHALL support scoped dirty invalidation

When a node-local visual state changes without requiring structural relayout, the runtime SHOULD damage the affected node/layer region instead of marking every layer dirty.

#### Scenario: Hover changes damage a node region

- **GIVEN** pointer movement changes hover state for an interactive node
- **WHEN** the frame is scheduled
- **THEN** the affected node is queued as scoped visual damage where layout information is available

### Requirement: Unknown dirty marks SHALL remain conservative

Dirty marks without a safe scope MUST keep full dirty invalidation.

#### Scenario: Structural mutation occurs

- **GIVEN** a JSX structural change marks the tree dirty without node visual scope
- **WHEN** the frame is scheduled
- **THEN** all layers are marked dirty as before

### Requirement: Dirty-region benchmark SHALL remain measurable

The frame breakdown benchmark MUST continue reporting the `dirty-region` scenario after scoped invalidation changes.

#### Scenario: Dirty-region benchmark runs

- **GIVEN** `bun run bench:frame-breakdown -- --frames=3 --warmup=1`
- **WHEN** benchmark completes
- **THEN** the `dirty-region` scenario reports p50/p95/p99 timings
