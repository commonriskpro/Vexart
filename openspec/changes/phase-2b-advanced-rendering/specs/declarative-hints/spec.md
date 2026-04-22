# declarative-hints Specification

## Purpose

`willChange` and `contain` props that allow developers to hint compositor behavior: pre-promoting layers and short-circuiting invalidation at boundaries.

**PRD trace**: `docs/PRD.md §768-771` (declarative hints), `docs/PRD.md §12 DEC-008`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §7.1` (qualification references `willChange`).

## Requirements

### REQ-2B-501: willChange prop

`TGEProps` SHALL include `willChange?: string | string[]`. Accepted values: `"transform"`, `"opacity"`, `"filter"`, `"scroll"`. When present, the compositor SHALL pre-promote the node to its own GPU layer, avoiding the cost of layer promotion at animation time.

#### Scenario: willChange pre-promotes layer

- GIVEN an element with `willChange="transform"`
- WHEN the layer assignment phase runs (no animation active)
- THEN the element is assigned to its own compositing layer
- AND no runtime layer promotion cost occurs when animation starts

#### Scenario: willChange with multiple values

- GIVEN an element with `willChange=["transform", "opacity"]`
- WHEN layer assignment runs
- THEN the element gets its own layer backing both properties

#### Scenario: willChange without animation

- GIVEN an element with `willChange="transform"` that never animates
- WHEN frames render
- THEN the extra GPU memory for the layer is accounted in `ResourceManager` budget
- AND `getRendererResourceStats()` reports the layer

#### Scenario: Invalid willChange value ignored

- GIVEN an element with `willChange="invalid-prop"`
- WHEN the prop is processed
- THEN the value is silently ignored (no layer promotion)
- AND a `console.warn` is emitted in debug mode

### REQ-2B-502: contain prop

`TGEProps` SHALL include `contain?: 'none' | 'layout' | 'paint' | 'strict'`. This tells the engine to short-circuit invalidation at the boundary.

- `'none'`: no containment (default).
- `'layout'`: changes inside this node do not affect ancestors' layout.
- `'paint'`: content is clipped to the node's bounds; no overflow visible.
- `'strict'`: equivalent to `'layout'` + `'paint'`.

#### Scenario: contain="paint" clips overflow

- GIVEN an element with `contain="paint"` and a child that overflows its bounds
- WHEN rendered
- THEN the overflowing content is clipped at the element boundary

#### Scenario: contain="layout" limits invalidation

- GIVEN a parent with `contain="layout"` and a child whose width changes
- WHEN the child's width changes
- THEN the parent's siblings are NOT re-laid out
- AND invalidation is scoped within the contained subtree

#### Scenario: contain="strict" combines both

- GIVEN an element with `contain="strict"`
- WHEN a child modifies size and overflows
- THEN the parent's siblings skip re-layout AND the overflow is clipped

### REQ-2B-503: willChange and compositor qualification

A node with `willChange` containing `"transform"` or `"opacity"` satisfies condition (2) of ARCHITECTURE §7.1 compositor qualification (explicit layer backing), enabling the compositor-thread animation fast path.

#### Scenario: willChange enables compositor path

- GIVEN a node with `willChange="transform"` animated via `createSpring`
- WHEN the animation runs
- THEN it qualifies for the compositor-thread fast path
- AND skips reconciler + layout + paint per frame

### REQ-2B-504: Performance documentation

`docs/performance.md` SHALL document the performance implications of `willChange` (GPU memory cost of pre-promoted layers) and `contain` (invalidation scoping benefits). The document MUST include guidance on when to use each hint.

#### Scenario: Performance docs exist

- GIVEN Phase 2b is complete
- WHEN a user checks `docs/performance.md`
- THEN sections for `willChange` and `contain` exist with usage guidance
