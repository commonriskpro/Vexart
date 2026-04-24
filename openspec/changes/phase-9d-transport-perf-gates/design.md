# Design: Phase 9d — Transport Performance Gates

## Gate policy

```txt
SHM  = primary performance gate
file = fallback performance gate
direct = compatibility-only, no p95 performance target
```

## Thresholds

Initial smoke thresholds:

| Transport | Scenario | p95 threshold |
| --- | --- | ---: |
| shm | dashboard-1080p | 9.0ms |
| shm | dirty-region | 5.0ms |
| shm | compositor-only | 4.0ms |
| file | dashboard-1080p | 10.0ms |
| file | dirty-region | 5.5ms |
| file | compositor-only | 4.0ms |

Both transports also require `noop-retained <= 1.0ms`.

## Execution

The gate runs in two steps:

1. Generate `scripts/frame-breakdown-report.json` with `scripts/frame-breakdown.tsx`.
2. Validate scenario p95 values with `scripts/frame-breakdown-gate.ts`.

Package scripts provide the stable entrypoints for local/CI usage.

## CI

Transport gates run in a dedicated GitHub workflow so they can evolve independently from API/visual gates.
