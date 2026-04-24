# Proposal: Phase 9c — Presentation Transport Fast Path

## Problem

Phase 9b instrumentation showed 1080p and dirty-region frames were dominated by presentation/I/O, not layout or render graph work. The benchmark also forced direct/final-frame behavior, which hid the performance difference between direct base64 transport and low-payload file/SHM transports.

## Intent

Make presentation bottlenecks measurable by transport mode and remove unnecessary repaint amplification in retained dirty-region paths.

## Scope

- Add explicit frame benchmark transport selection (`direct`, `file`, `shm`).
- Stop forcing `final-frame-raw` by default in the profiler.
- Add regional readback payload metadata for TS fallback presentation.
- Patch existing Kitty layers when a regional payload is available.
- Avoid damaging lower layers when an upper layer only has visual damage and did not move or resize.
- Refine full-repaint classification so a small dirty region in the only dirty layer does not automatically become a full repaint.

## Non-goals

- Do not change terminal probing defaults.
- Do not make direct base64 transport meet the 1080p target; direct remains the universal but slow fallback.
- Do not enable native presentation for non-SHM transports in this slice.
