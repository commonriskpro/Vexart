# Proposal: Phase 9a — Frame Breakdown Profiler

## Problem

Vexart now has a Rust-retained runtime and a 120fps/5ms performance contract, but the current benchmark only reports aggregate frame time. Without per-stage timings, FFI call counts, and workload-specific scenes, optimization would be guesswork.

## Goal

Add a frame breakdown benchmark that measures the 1080p dashboard release workload plus no-op, dirty-region, and compositor-only scenarios. The benchmark must produce terminal-readable output and machine-readable JSON.

## Scope

- Add benchmark scenarios for:
  - dashboard 800×600 smoke baseline
  - dashboard 1080p release workload
  - no-op retained frame
  - small dirty-region frame
  - compositor-only transform/opacity frame
- Capture frame timings by pipeline stage using existing frame cadence profiling.
- Capture FFI call counts and per-symbol counts.
- Emit p50/p95/p99 stats and JSON artifact.
- Add package scripts for local and CI use.

## Non-goals

- Optimizing the measured bottlenecks in this slice.
- Claiming 120fps success before the 1080p benchmark exists.
- Removing fallback/readback paths.
- Building full native canvas command replay.

## Verification

- `bun run bench:frame-breakdown -- --frames=3 --warmup=1` completes and writes JSON.
- `bun run typecheck` passes.
- `git diff --check` passes.

## Rollback

- Remove the benchmark script, package scripts, and SDD artifacts. No runtime behavior should change.
