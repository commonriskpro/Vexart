# Spec: Native Render Graph

## ADDED Requirements

### Requirement: Native scene path MUST generate render graph operations in Rust

When native render graph is enabled, Rust MUST generate ordinary render operations from native scene and layout data.

#### Scenario: Visual prop maps to native material

- **Given** a node has visual props such as gradient, shadow, filter, opacity, or transform
- **When** Rust generates render ops
- **Then** the corresponding native material/pipeline MUST be selected
- **And** TypeScript MUST NOT pack an ordinary `cmd_kind` batch for that node

### Requirement: Native render graph MUST preserve visual parity

The native render path MUST match the fallback render path within the golden image threshold for showcase and effect-specific scenes.
