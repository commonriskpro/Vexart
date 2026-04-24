# Spec: Native Layout, Damage, And Hit-Testing

## ADDED Requirements

### Requirement: Rust MUST compute layout from the native scene graph

When `nativeSceneGraph` is enabled for this phase, Rust MUST compute layout and damage from retained native scene data.

#### Scenario: Dirty prop affects layout

- **Given** a node layout prop changes
- **When** a frame is requested
- **Then** Rust MUST recompute affected layout
- **And** Rust MUST report bounded damage for affected regions

### Requirement: Rust MUST own hit-testing for native scenes

Pointer and keyboard targeting MUST be derived from Rust-native layout, clipping, focus, and interaction metadata.

#### Scenario: Offscreen scroll child is clicked

- **Given** a child is outside its scroll container viewport
- **When** the pointer overlaps its absolute coordinates
- **Then** Rust MUST NOT target the offscreen child

#### Scenario: Press event bubbles

- **Given** a child without `onPress` is clicked inside a parent with `onPress`
- **When** Rust emits event records
- **Then** JS MUST dispatch the parent press handler
- **And** propagation MUST stop when a handler calls `stopPropagation()`
