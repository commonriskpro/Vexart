# Delta Spec — Rust-retained mutation protocol

## Requirement: Batched native scene mutations

The engine SHALL provide an internal binary mutation protocol that applies multiple scene graph operations to the Rust scene graph through a single FFI call.

### Scenario: Apply create/insert/props/text/layout in one batch

Given a native scene exists
When JS sends one mutation buffer containing node creation, insertion, props, text, and layout
Then Rust applies all operations in order
And the scene snapshot reflects the retained tree state.

## Requirement: Stable JS node IDs

The native scene graph SHALL accept explicit node IDs for batched-created nodes.

### Scenario: JS-owned IDs are preserved

Given JS creates a node with id `42`
When the batched mutation is applied
Then Rust stores the node under id `42`
And later mutations can reference id `42`.

## Requirement: Compatibility fallback

Existing direct native scene FFI calls SHALL remain available.

### Scenario: Batch mode disabled

Given `VEXART_NATIVE_MUTATION_BATCH=0`
When the reconciler mirrors mutations to Rust
Then the existing direct FFI calls are used.

## Requirement: No stale native reads

Queued mutations SHALL flush before native layout or native render graph consumers read the Rust scene graph.

### Scenario: Native render graph after queued layout

Given layout writeback queued native layout mutations
When the native render graph snapshot is requested
Then queued mutations are applied before snapshot generation.
