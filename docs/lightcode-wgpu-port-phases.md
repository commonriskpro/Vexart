# Lightcode WGPU Port Phases

## Goal

Port the Lightcode mock to the WGPU canvas path by completing the missing canvas renderer capabilities in a disciplined order.

---

## Phase 1 — Geometry base

Implement these WGPU canvas primitives:

1. `circle` with `fill` / `stroke`
2. `polygon` with `fill` / `stroke`
3. `bezier`

### Why

These unlock the structural core of the Lightcode graph:

- `SceneNode` depends on circle/polygon
- `SceneEdge` depends on bezier

---

## Phase 2 — UI visual features

Implement:

1. `rect` with `radius + stroke`
2. `glow`

### Why

These unlock:

- background card polish
- node halos
- overlay chip visuals
- panel-like surfaces

---

## Phase 3 — Text

Implement:

1. `text`

### Why

This unlocks:

- node labels
- sublabels
- overlay content
- status chip text

---

## Phase 4 — Port and validate

1. Port the Lightcode mock scene to WGPU
2. Keep the original CPU reference demo intact and validate WGPU in a separate harness (`examples/lightcode-gpu.tsx`)
3. Validate visually in Kitty
4. Benchmark CPU vs WGPU
5. Decide heuristics / defaults

---

## Current status

### Already supported on WGPU

- `rect` (flat fill only)
- `image`
- `linearGradient`
- `radialGradient`
- mixed composition of the above

### In progress now

- Phase 4 port + validation

### Completed

- Phase 1 geometry base
  - `circle`
  - `polygon`
  - `bezier`
- Phase 2 UI visual features
  - rounded/stroked `rect`
  - `glow`
- Phase 3 text
  - `text` via cached raster sprite composed through the WGPU image path

---

## Notes

- CPU fallback remains mandatory until the full feature set is complete.
- The WGPU path should only claim support for commands it can render faithfully.
- Performance validation should happen after each phase, not only at the end.
