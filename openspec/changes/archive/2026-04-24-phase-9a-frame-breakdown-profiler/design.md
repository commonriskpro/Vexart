# Design: Phase 9a — Frame Breakdown Profiler

## Measurement approach

The render loop already supports structured cadence profiling when `TGE_DEBUG_CADENCE=1`. Phase 9a reuses that instrumentation instead of adding another runtime profiling subsystem.

The benchmark runner:

1. enables `TGE_DEBUG_CADENCE=1` before dynamically importing engine modules;
2. clears `/tmp/tge-cadence.log` per scenario;
3. mounts a scene into a mock terminal;
4. runs warmup frames;
5. measures scenario frames;
6. parses cadence profile lines into structured records;
7. samples FFI counts from `vexart-bridge`;
8. emits summary and JSON.

## Scenario design

| Scenario | Size | Purpose |
| --- | --- | --- |
| `dashboard-800x600` | 800×600 | Continuity with the existing smoke baseline. |
| `dashboard-1080p` | 1920×1080 | Release dashboard workload required by DEC-013. |
| `noop-retained` | 1920×1080 | Cost of calling `frame()` when retained state is clean. |
| `dirty-region` | 1920×1080 | Pointer hover/focus style style invalidation. |
| `compositor-only` | 1920×1080 | Retained layer/compositor-only fast path measurement. |

## Output contract

The JSON artifact includes:

- metadata: timestamp, frame count, warmup count, runtime, platform;
- scenario summaries: p50/p95/p99 for total/layout/prep/paint/io/sync;
- aggregate FFI call counts and top FFI symbols;
- per-frame raw records.

## Tradeoffs

- Parsing cadence logs is less elegant than a first-class profiler callback, but it avoids changing public engine APIs.
- No-op frames do not produce cadence lines because the loop correctly returns early; the runner records manual `frame()` call time for that scenario.
- 1080p benchmark may be slower locally; CLI flags allow short smoke runs.

## Future work

- Promote cadence profiling into a structured internal profiler API if the log parser becomes too limiting.
- Add allocation sampling when Bun exposes stable per-frame allocation counters or when Vexart adds internal counters.
- Add CI artifact retention for historical trend charts.
