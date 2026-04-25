# Spec: Native Scene Graph Skeleton

## ADDED Requirements

### Requirement: Solid mutations MUST mirror into Rust scene graph

When `nativeSceneGraph` is enabled, every Solid create, insert, remove, prop update, and text update MUST update the Rust-retained scene graph.

#### Scenario: Node insertion preserves order

- **Given** a parent with existing native children
- **When** Solid inserts a child before an anchor
- **Then** Rust MUST insert the native child at the same ordered position
- **And** a scene snapshot MUST match the TS compatibility tree

#### Scenario: Callback props are capabilities only

- **Given** a node has `onPress` or mouse handlers
- **When** props are encoded for Rust
- **Then** Rust MUST receive interaction capability flags
- **And** the JS callback closure MUST remain in the JS callback registry

### Requirement: Native scene graph MUST be behavior-neutral during skeleton phase

Enabling `nativeSceneGraph` in this phase MUST NOT change rendering output or public JSX behavior.
