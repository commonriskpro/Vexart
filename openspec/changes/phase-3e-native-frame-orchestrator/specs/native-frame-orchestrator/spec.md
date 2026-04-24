# Spec: Native Frame Orchestrator

## ADDED Requirements

### Requirement: Rust MUST choose frame presentation strategy for native scenes

When the native retained path is enabled, Rust MUST choose between `skip-present`, `layered-dirty`, `layered-region`, and `final-frame`.

#### Scenario: No visible damage

- **Given** no native scene, resource, animation, or terminal state changed
- **When** a frame is requested
- **Then** Rust MUST choose `skip-present`
- **And** no terminal output MUST be emitted

#### Scenario: Dirty region is bounded

- **Given** damage is smaller than a layer
- **When** terminal transport supports the selected region path
- **Then** Rust SHOULD choose `layered-region`
- **And** stats MUST report dirty rect count and emitted bytes

### Requirement: Native frame stats MUST be structured

Every native frame MUST expose strategy, dirty area, painted/reused layers, emitted bytes, readback bytes, timings, resource usage, and event count.
