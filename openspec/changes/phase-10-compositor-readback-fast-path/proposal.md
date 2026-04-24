# Proposal: Phase 10 — Compositor Readback Fast Path

## Problem

Phase 9 proved the terminal transport path is healthy when SHM is available. Real Kitty validation showed `dashboard-1080p p95=6.01ms`, `dirty-region p95=4.74ms`, and `compositor-only p95=3.88ms` with native presentation on.

The next recurring bottleneck is no longer terminal transport. The frame breakdown points at `paintBackendEndMs` and compositor/readback work, especially in dashboard 1080p and compositor-only scenarios.

## Intent

Reduce compositor/readback overhead so the engine has more headroom under the 8.33ms 120fps budget, especially for compositor-only and final-frame composition paths.

## Scope

- Instrument native compositor/readback sub-stages more deeply if needed.
- Separate compositor update, target composition, readback, and native emit timings.
- Avoid unnecessary `vexart_composite_readback_rgba` in compositor-only paths when native presentation can emit directly.
- Reuse compositor targets/layers where safe to reduce `paintBackendEndMs`.
- Keep SHM/file/direct transport policy unchanged.

## Non-goals

- Do not optimize direct base64 transport as a performance target.
- Do not change public JSX APIs.
- Do not loosen Phase 9 performance gates.

## Success criteria

- `compositor-only` p95 stays below `3ms` in SHM smoke runs, with target below `2ms` if feasible.
- `dashboard-1080p` keeps p95 below `8.33ms` in real Kitty SHM runs.
- Frame breakdown can identify whether remaining cost is native composite, readback, or emit.
