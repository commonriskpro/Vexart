# Verify Report: Phase 9a — Frame Breakdown Profiler

## Status

Implemented. The benchmark runner now measures dashboard 800×600 smoke, dashboard 1080p release workload, no-op retained, dirty-region, and compositor-only scenarios. It prints p50/p95/p99 summaries and writes JSON output to `scripts/frame-breakdown-report.json`.

## Implemented

- Added `scripts/frame-breakdown.tsx`.
- Added package scripts:
  - `bench:frame-breakdown`
  - `bench:dashboard-1080p`
- Added internal frame profile sink in `loop.ts` so benchmark code can collect structured frame profiles without relying only on cadence log parsing.
- Made native render graph snapshot buffer retry up to 1 MiB to avoid truncated JSON for larger 1080p scenes.
- Added `scripts/frame-breakdown-report.json` to `.gitignore` because it is a generated benchmark artifact.
- Updated `docs/PERFORMANCE-120FPS-PLAN.md` with real commands.

## Verification Run

- `bun run typecheck` — passed.
- `git diff --check` — passed.
- `bun run bench:frame-breakdown -- --frames=3 --warmup=1` — passed and wrote JSON artifact.
- `bun test` — 306 passed.
- `bun run check:retained-cleanup` — passed.

## Smoke Benchmark Output

```txt
dashboard-800x600  800×600    p95=9.86 ms
dashboard-1080p    1920×1080  p95=13.51 ms
noop-retained      1920×1080  p95=0.09 ms
dirty-region       1920×1080  p95=10.02 ms
compositor-only    1920×1080  p95=2.01 ms
```

## Notes

- Smoke run uses only 3 measured frames. Real readings should use `bun run bench:dashboard-1080p` or `bun run bench:frame-breakdown -- --frames=300 --warmup=5`.
- The first real bottleneck from smoke is dirty-region/full dashboard, not no-op/compositor-only.
