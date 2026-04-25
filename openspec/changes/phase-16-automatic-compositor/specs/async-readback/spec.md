# Async Readback Specification (DEFERRED)

**Status**: Placeholder — deferred to a separate slice after Phase 16 ships.
**Ref**: PRD v0.7 §7.3 (DEC-013 stretch goal).

## Purpose

Double-buffer async GPU→CPU readback to overlap `copy_texture_to_buffer` with the next frame's paint work. 1 frame of latency is acceptable. Only pursued if layer caching alone doesn't close the 120fps gap.

## Requirements (DEFERRED)

### REQ-AR-001: Async double-buffer readback

**DEFERRED** — The engine SHOULD support double-buffer async readback where GPU readback for frame N overlaps with paint work for frame N+1. One frame of presentation latency is acceptable.

#### Scenario: Async readback overlaps with next-frame paint

- GIVEN async readback is enabled
- WHEN frame N completes GPU paint
- THEN readback for frame N begins asynchronously
- AND frame N+1 starts paint immediately (not blocked by readback)
- AND frame N's readback result is composited during frame N+1's presentation

### REQ-AR-002: Double readback buffer

**DEFERRED** — When async readback is active, the `TargetRecord` SHALL maintain two readback buffers that alternate per frame (ping-pong pattern).

#### Scenario: Ping-pong buffer alternation

- GIVEN async readback is active with buffers A and B
- WHEN frame 1 reads back into buffer A
- THEN frame 2 reads back into buffer B while buffer A is composited
- AND frame 3 reads back into buffer A while buffer B is composited
