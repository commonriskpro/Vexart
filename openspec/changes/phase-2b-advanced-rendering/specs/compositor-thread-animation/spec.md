# compositor-thread-animation Specification

## Purpose

Transform/opacity animation fast path that bypasses reconciler, walk-tree, layout, assign-layers, and paint. Persistent GPU targets per compositor-animated node. 60fps maintained under saturated main thread.

**PRD trace**: `docs/PRD.md §757-761` (compositor-thread animations), `docs/PRD.md §12 DEC-008`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §7` (compositor-thread animation path).

## Requirements

### REQ-2B-301: Animation descriptor registration

When `createTransition` or `createSpring` animates `transform` or `opacity`, the system SHALL register an animation descriptor: `{ nodeId, property, from, to, easing, startTime }`. The target node MUST have explicit layer backing (from `layer={true}` or `willChange`).

#### Scenario: Spring animation on transform

- GIVEN a node with `layer={true}` and `transform` animated via `createSpring`
- WHEN the animation starts
- THEN a descriptor is registered with `property='transform'`, `from`, `to`, and spring parameters

#### Scenario: Opacity transition

- GIVEN a node with `willChange="opacity"` and opacity animated via `createTransition`
- WHEN the transition starts
- THEN a descriptor is registered with `property='opacity'`

### REQ-2B-302: Persistent GPU target per animated node

Compositor-animated nodes SHALL receive persistent GPU targets (not recreated each frame). The target stores the node's last painted content. Per-frame updates only modify transform/opacity uniforms, not paint commands.

#### Scenario: Target persists across frames

- GIVEN a compositor-animated node
- WHEN 60 frames of animation execute
- THEN the node's GPU target is created once and reused for all 60 frames
- AND no paint dispatch occurs for that node during animation

#### Scenario: Target eviction forces fallback

- GIVEN `ResourceManager` evicts the node's persistent target (memory pressure)
- WHEN the next animation frame runs
- THEN the system falls back to the full paint path for that frame
- AND a `console.warn` is emitted

### REQ-2B-303: Compositor fast-path frame

During an animation frame where ONLY compositor-animated properties change, the system SHALL skip: reconciler traversal, walk-tree, layout, assign-layers, and paint. Only the composite uniform update + output phases run.

#### Scenario: 60fps under main-thread saturation

- GIVEN a compositor-animated node and a saturated main thread (10ms of JS work per frame)
- WHEN the animation loop runs
- THEN 60fps is maintained (frame time ≤16.6ms)
- AND only uniform update + composite + output execute in the hot path

#### Scenario: Mixed animated and non-animated changes

- GIVEN one compositor-animated node AND one node whose `backgroundColor` changes
- WHEN a frame runs
- THEN the non-animated node goes through the full paint path
- AND the animated node skips paint (only uniform update)

### REQ-2B-304: Four-condition qualification enforcement

A node qualifies for the compositor path ONLY if ALL of (per ARCHITECTURE §7.1): (1) animated properties ⊆ {transform, opacity}, (2) node has explicit layer backing, (3) no other property mutates during animation, (4) animation driven by `createTransition` or `createSpring`. If any condition fails at runtime, the system SHALL fall back to the normal path with `console.warn`.

#### Scenario: Non-animatable property change triggers fallback

- GIVEN a compositor-animated node
- WHEN its `width` changes mid-animation
- THEN the node falls back to the full paint path
- AND `console.warn` identifies the node and the offending property

#### Scenario: No layer backing triggers fallback

- GIVEN a node animated via `createSpring` on `transform` but without `layer={true}` or `willChange`
- WHEN the animation starts
- THEN the system falls back immediately with `console.warn`

### REQ-2B-305: Fallback conditions

Fall-back to full frame MUST occur when: (1) size-mutating properties change, (2) node subtree adds/removes children, (3) layer backing is evicted by `ResourceManager`, (4) animation completes and node returns to normal rendering.

#### Scenario: Animation completes

- GIVEN a compositor-animated node running a 300ms spring
- WHEN the spring reaches equilibrium
- THEN the descriptor is deregistered
- AND the node resumes normal paint-path rendering

#### Scenario: Child added during animation

- GIVEN a compositor-animated node
- WHEN a child node is added to its subtree
- THEN the node falls back to full paint path
- AND the persistent GPU target is repainted with the new subtree
