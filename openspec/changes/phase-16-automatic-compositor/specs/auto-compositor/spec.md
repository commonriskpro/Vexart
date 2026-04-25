# Auto-Compositor Specification

**Ref**: PRD v0.7 §7.3 (DEC-013 120fps program), DEC-014 (TS/Rust boundary).

## Purpose

Automatic GPU layer promotion so developers write `<box>` and get composited caching without explicit `layer={true}`. Targets the readback bottleneck (4.28 ms p95, ~49% of frame) identified in `PERF-AUDIT-PHASE-15.md`.

## Requirements

### REQ-AC-001: Backdrop-blur auto-promotion

A node with `backdropBlur` set to a non-zero value SHALL be auto-promoted to its own GPU layer.

#### Scenario: Glassmorphism panel auto-promoted

- GIVEN a `<box backdropBlur={12}>` rendering at 200×300 px
- WHEN `findLayerBoundaries` runs during frame layout
- THEN the node is assigned its own layer without explicit `layer={true}`

### REQ-AC-002: Backdrop-filter auto-promotion

A node with any backdrop filter prop (`backdropBrightness`, `backdropContrast`, `backdropSaturate`, `backdropGrayscale`, `backdropInvert`, `backdropSepia`, `backdropHueRotate`) set to a non-default value SHALL be auto-promoted.

#### Scenario: Backdrop-saturate node auto-promoted

- GIVEN a `<box backdropSaturate={0}>` (grayscale effect) at 150×150 px
- WHEN `findLayerBoundaries` evaluates promotion candidates
- THEN the node is promoted to its own layer

### REQ-AC-003: Stable-subtree auto-promotion

A subtree that produces identical render output for N=3 consecutive frames SHALL be auto-promoted. The stability counter resets on any `setProperty` within the subtree (B1-02 equality check prevents false increments).

#### Scenario: Static sidebar promoted after 3 stable frames

- GIVEN a sidebar panel has rendered identical output for 3 consecutive frames
- WHEN frame 4 is processed
- THEN the subtree is auto-promoted and its GPU layer cached

#### Scenario: Rapid toggle — hysteresis prevents premature promotion

- GIVEN a node alternates between stable and unstable each frame (1 stable, 1 change, 1 stable, …)
- WHEN 6 frames elapse
- THEN the node is NOT promoted (never reaches N=3 consecutive stable frames)

### REQ-AC-004: Auto-layer tag

Every auto-promoted layer SHALL be tagged with `_autoLayer: true` on the owning TGENode.

#### Scenario: Debug tooling identifies auto-layers

- GIVEN a node was auto-promoted for backdrop blur
- WHEN inspecting the node in debug output
- THEN `node._autoLayer === true` is visible

### REQ-AC-005: De-promotion with hysteresis

An auto-promoted layer SHALL be de-promoted after M=3 consecutive frames where the subtree content changes. On de-promotion, `_autoLayer` is cleared and the GPU layer is released.

#### Scenario: Animated panel de-promoted after 3 unstable frames

- GIVEN an auto-promoted layer starts animating (content changes each frame)
- WHEN 3 consecutive frames show content changes
- THEN the layer is de-promoted and `_autoLayer` cleared

#### Scenario: Intermittent change — hysteresis prevents thrashing

- GIVEN an auto-promoted layer changes on frame 1, is stable on frame 2, changes on frame 3
- WHEN frame 4 is processed
- THEN the layer remains promoted (unstable counter never reaches M=3 consecutively)

### REQ-AC-006: Manual layer override

A node with explicit `layer={true}` SHALL always be composited, regardless of auto-promotion decisions. Manual layers SHALL NOT be subject to de-promotion.

#### Scenario: Manual layer preserved regardless of stability

- GIVEN a `<box layer={true}>` with rapidly changing content
- WHEN auto-promotion evaluation runs
- THEN the layer remains composited (manual flag overrides auto-heuristics)

### REQ-AC-007: Budget cap

The engine SHALL enforce a maximum of 8 auto-promoted layers. When the budget is full, no new auto-promotions occur until an existing layer is de-promoted.

#### Scenario: 9th panel not promoted — budget full

- GIVEN 8 auto-promoted layers already exist
- AND a new backdrop-blur panel qualifies for promotion
- WHEN `findLayerBoundaries` evaluates the candidate
- THEN the 9th panel is NOT promoted (remains inline)
- AND an existing auto-layer is NOT displaced

#### Scenario: Slot freed — waiting candidate promoted

- GIVEN 8 auto-layers exist and one is de-promoted
- AND a qualified candidate was previously rejected
- WHEN the next frame processes
- THEN the candidate fills the freed slot

### REQ-AC-008: Size threshold

Nodes with a bounding box smaller than 64×64 pixels SHALL NOT be auto-promoted.

#### Scenario: Small icon skipped

- GIVEN a 40×40 px node with `backdropBlur={8}`
- WHEN `findLayerBoundaries` evaluates candidates
- THEN the node is NOT auto-promoted (below 64×64 threshold)

### REQ-AC-009: Visual fidelity invariant

Auto-promotion SHALL NOT change visual output. The rendered pixels SHALL be identical with auto-compositor enabled vs. disabled (verified by golden image diff).

#### Scenario: Golden image parity

- GIVEN a scene with 3 auto-promoted backdrop-blur panels
- WHEN rendered with `forceLayerRepaint=true` (no caching) and `forceLayerRepaint=false` (caching)
- THEN the two outputs are pixel-identical (0 diff)

### REQ-AC-010: Event-handling invariant

Auto-promotion SHALL NOT alter event handling. Hit-testing, focus, hover, and active states SHALL behave identically with auto-compositor enabled vs. disabled.

#### Scenario: Click target preserved after promotion

- GIVEN a `<box focusable onPress={handler} backdropBlur={12}>` auto-promoted to its own layer
- WHEN the user clicks within the box bounds
- THEN `onPress` fires exactly as it would without auto-promotion
- AND focus is set to the node
