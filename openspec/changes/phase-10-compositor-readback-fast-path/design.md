# Design: Phase 10 — Compositor Readback Fast Path

## Current evidence

Phase 9 real Kitty local validation:

```txt
transport       : shm
native present  : on
dashboard-1080p : 6.01ms p95
dirty-region    : 4.74ms p95
compositor-only : 3.88ms p95
```

Synthetic SHM/file gates also pass. The next performance headroom target is compositor/readback overhead rather than terminal transport.

## Candidate bottlenecks

- `paintBackendEndMs` in final-frame composition.
- `vexart_composite_readback_rgba` in compositor-only paths.
- compositor target begin/update/end churn.
- unnecessary final-frame readback when native presentation is available.

## Approach

1. Extend stage instrumentation to isolate:
   - compositor target composition
   - compositor uniform updates
   - readback
   - native emit
2. Audit native backend strategy outputs for compositor-only frames.
3. Prefer direct native target emission over JS readback where possible.
4. Add or adjust smoke gates only after stable measurements prove the reduction.

## Safety

- Preserve existing retained transport gates.
- Keep fallback path intact when native presentation is disabled.
- Avoid changing rendering semantics; all changes are path-selection or retained resource reuse.
