# Readback-Elimination Specification

**Ref**: PRD v0.7 §7.3 (DEC-013: 120fps targets), DEC-014, `PERF-AUDIT-PHASE-15.md` (readback = 4.28 ms p95).

## Purpose

Skip GPU→CPU readback for layers whose content has not changed. The previously presented Kitty image remains on-screen and is reused. Targets DEC-013 idle (<1 ms p99), dirty-region (<5 ms p95), and full-dashboard (<10 ms) budgets.

## Requirements

### REQ-RE-001: Clean-layer readback skip

Clean layers (generation counter unchanged, per `compositor-dirty-tracking` REQ-DT-004) SHALL skip `vexart_composite_readback_rgba` entirely. The previously transmitted Kitty image SHALL be reused without re-encoding or re-transmitting.

#### Scenario: Idle frame — zero readback

- GIVEN all layers are clean (no `setProperty` since last frame)
- WHEN the frame is processed
- THEN `vexart_composite_readback_rgba` is NOT called for any layer
- AND no Kitty image data is transmitted
- AND the previous frame's images remain on-screen

#### Scenario: forceLayerRepaint=true disables readback skip

- GIVEN `forceLayerRepaint=true` is set in mount options
- AND all layers are clean
- WHEN the frame is processed
- THEN all layers are force-repainted and readback runs (escape hatch active)

### REQ-RE-002: Regional readback for small dirty rects

When a layer has a dirty region smaller than 50% of its total area, the engine SHALL use `vexartCompositeReadbackRegionRgba` (region readback) instead of full-layer readback.

#### Scenario: Small cursor update uses region readback

- GIVEN a 1920×200 px editor layer with a 20×20 px dirty rect (cursor blink)
- WHEN readback is processed
- THEN `vexartCompositeReadbackRegionRgba` is called with the 20×20 region bounds
- AND full-layer readback is NOT called

#### Scenario: Large repaint uses full readback

- GIVEN a 1920×200 px editor layer with a 1200×180 px dirty region (scroll)
- WHEN readback is processed (dirty area > 50%)
- THEN full `vexart_composite_readback_rgba` is used

### REQ-RE-003: Idle performance target

In "idle" state (no property changes, no input), frame time SHALL be ≤ 1 ms p95. Zero readback, zero paint.

#### Scenario: Cosmic-shell idle — sub-millisecond

- GIVEN `cosmic-shell-1080p` with no user interaction and no signals firing
- WHEN 60 idle frames are measured
- THEN p95 frame time ≤ 1 ms

### REQ-RE-004: Typing performance target

In "typing" state (only the editor layer changes per keystroke), frame time SHALL be ≤ 4 ms p95.

#### Scenario: Cosmic-shell typing — only editor repaints

- GIVEN `cosmic-shell-1080p` with the editor focused
- WHEN 60 keystroke frames are simulated
- THEN p95 frame time ≤ 4 ms
- AND only the editor layer is repainted/read back

### REQ-RE-005: Full-repaint no-regression target

In "full repaint" state (all layers dirty), frame time SHALL NOT regress beyond ≤ 9 ms p95.

#### Scenario: Cosmic-shell full repaint — no regression

- GIVEN `cosmic-shell-1080p` with all layers marked dirty (e.g. terminal resize)
- WHEN 60 full-repaint frames are measured
- THEN p95 frame time ≤ 9 ms
- AND the result is not worse than the pre-phase-16 baseline
