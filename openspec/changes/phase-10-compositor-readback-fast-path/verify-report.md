# Verify Report: Phase 10 — Compositor Readback Fast Path

## Baseline: SHM 300-frame mock terminal

Command:

```bash
bun run bench:frame-breakdown -- --frames=300 --warmup=5 --transport=shm
```

Result:

```txt
dashboard-800x600  total p95=4.90ms paint p95=4.13ms paintBackendEndMs=2.83ms
dashboard-1080p    total p95=7.35ms paint p95=6.15ms paintBackendEndMs=4.24ms paintPresentationMs=0.74ms
noop-retained      total p95=0.00ms
dirty-region       total p95=4.53ms paint p95=3.55ms paintBackendEndMs=3.24ms paintPresentationMs=0.88ms
compositor-only    total p95=2.89ms paint p95=2.86ms paintBackendPaintMs=2.86ms
```

## Interpretation

- `dashboard-1080p` remains under the 8.33ms target in SHM mock-terminal baseline, but most paint cost is still backend-end work.
- `dirty-region` remains under the 5ms target, with `paintBackendEndMs` dominating paint.
- `compositor-only` already meets the Phase 10 `<3ms` gate, but its top FFI includes `vexart_composite_readback_rgba`, so avoiding unnecessary readback is still the next headroom target.
- Terminal presentation is no longer the main bottleneck in SHM baseline; backend composition/readback is.

## Instrumentation smoke: backend substages

Command:

```bash
bun run bench:frame-breakdown -- --frames=20 --warmup=2 --transport=shm
```

Result after adding backend substage profile fields:

```txt
dashboard-1080p    paintBackendEndMs=3.03ms paintBackendReadbackMs=2.96ms
dirty-region       paintBackendEndMs=2.38ms paintBackendReadbackMs=2.31ms
compositor-only    paintBackendPaintMs=2.45ms paintBackendReadbackMs=2.30ms paintBackendUniformMs=0.08ms paintBackendCompositeMs=0.07ms
```

Outcome: the dominant backend-end/compositor cost is confirmed as RGBA readback, not uniform update or target composition.

## Native presentation path: no RGBA crossing JavaScript

The frame breakdown runner now supports:

```bash
bun run bench:frame-breakdown -- --frames=10 --warmup=1 --transport=shm --native-presentation
```

Native presentation smoke result:

```txt
compositor-only p95=9.70ms
paintBackendNativeEmitMs=9.24ms
paintBackendReadbackMs=0.00ms
top ffi: vexart_kitty_emit_frame_with_stats:1
```

Interpretation:

- The native target presentation path successfully avoids `vexart_composite_readback_rgba` crossing into JavaScript.
- Cost moves from `paintBackendReadbackMs` to `paintBackendNativeEmitMs`, which includes native Kitty emission and Rust-side transport work.
- The agent/non-interactive smoke is not a performance target for native presentation because the native path writes Kitty escapes to stdout; real Kitty validation is still required for accurate terminal timings.
- Default frame breakdown remains `nativePresentation=off` so CI/mock transport gates stay clean and do not emit Kitty graphics escapes.

## Real Kitty validation: native presentation enabled

Command run in an interactive Kitty terminal:

```bash
bun --conditions=browser run scripts/terminal-transport-matrix.ts --bench --frames=60 --warmup=5
```

Result:

```txt
terminal        : kitty
interactive     : yes
active probe    : yes
transport       : shm
native present  : on

dashboard-800x600  7.40ms
dashboard-1080p    13.34ms
noop-retained      0.01ms
dirty-region       8.82ms
compositor-only    8.46ms
```

Interpretation:

- Native presentation is functionally active in real Kitty.
- It removes RGBA readback crossing JavaScript, but it does **not** improve total frame time yet.
- Compared to the previous real Kitty benchmark where the frame-breakdown runner forced native presentation off (`dashboard-1080p 6.01ms`, `dirty-region 4.74ms`, `compositor-only 3.88ms`), the native target emit path is currently slower.
- The next bottleneck is Rust-side native emit work: target readback, zlib compression, SHM preparation, and Kitty escape emission.
- Do not make native presentation the default benchmark/performance path until `paintBackendNativeEmitMs` is optimized below the current TS fallback path.

## Native SHM compression measurement: zlib vs raw

The native presentation stats struct was extended to report Rust-side transfer substages:

- `paintBackendNativeReadbackMs`
- `paintBackendNativeCompressMs`
- `paintBackendNativeShmPrepareMs`
- `paintBackendNativeWriteMs`
- `paintBackendNativeRawBytes`
- `paintBackendNativePayloadBytes`

The SHM path now defaults to raw/uncompressed RGBA. zlib can be forced for comparison:

```bash
VEXART_KITTY_SHM_COMPRESSION=1 bun run bench:frame-breakdown -- --frames=60 --warmup=5 --transport=shm --native-presentation
```

Comparison against default zlib SHM:

```txt
scenario           zlib total p95  raw total p95  delta    zlib emit p95  raw emit p95  zlib compress p95  raw shm p95
dashboard-800x600  7.51ms          4.72ms         -2.79ms  5.35ms         2.88ms        2.67ms             0.20ms
dashboard-1080p    15.34ms         6.67ms         -8.66ms  11.30ms        3.58ms        8.24ms             0.72ms
dirty-region       10.24ms         4.03ms         -6.22ms  9.14ms         3.54ms        6.84ms             0.74ms
compositor-only    8.82ms          3.74ms         -5.09ms  8.55ms         3.55ms        6.84ms             0.70ms
```

Payload comparison:

```txt
dashboard-1080p zlib payload ≈ 43KB  raw payload ≈ 8100KB
dirty-region    zlib payload ≈ 11KB  raw payload ≈ 8100KB
compositor-only zlib payload ≈ 12KB  raw payload ≈ 8100KB
```

Interpretation:

- For local SHM, zlib's reduced payload size does not compensate for compression CPU time on the tested scenes.
- At 1080p, zlib spends ~8.24ms p95 compressing, while raw SHM prepare/copy is ~0.72ms p95.
- Raw SHM brings native presentation back into the same performance class as the previous TS fallback while preserving the no-JS-readback architecture.
- SHM now defaults to raw/uncompressed RGBA unless `VEXART_KITTY_SHM_COMPRESSION=1|true|on` explicitly forces zlib for experiments.
- Future content-aware compression policy must prove a scenario-specific win before re-entering the SHM happy path.

## Verification

- `bun run typecheck` — passed.
- `bun run bench:frame-breakdown -- --frames=20 --warmup=2 --transport=shm` — passed and showed backend readback substage output.
- `bun run api:check` — passed and updated `packages/engine/etc/engine.api.md`; snapshot whitespace normalized after generation.
- `git diff --check` — passed after API snapshot normalization.
- `bun test` — 306 passed.
- `bun run perf:transport:shm` — passed (`dashboard-1080p p95=7.31ms`, `dirty-region p95=4.65ms`, `compositor-only p95=2.39ms`).
- `bun run perf:transport:file` — passed (`dashboard-1080p p95=8.30ms`, `dirty-region p95=4.74ms`, `compositor-only p95=2.67ms`).
- `bun run bench:frame-breakdown -- --frames=60 --warmup=5 --transport=shm --native-presentation --output=/tmp/vexart-zlib.json` — captured the previous default zlib native SHM baseline before flipping the policy.
- `VEXART_KITTY_SHM_COMPRESSION=0 bun run bench:frame-breakdown -- --frames=60 --warmup=5 --transport=shm --native-presentation --output=/tmp/vexart-raw.json` — captured raw native SHM comparison before raw became the default.
- `cargo test` — 155 passed after making raw SHM the default and adding compression policy tests.
- `cargo build --release` — passed.
- `cargo build` — passed and refreshed the debug dylib used by Bun FFI.
- `bun run typecheck` — passed.
- `bun test` — 306 passed.
- `bun run bench:frame-breakdown -- --frames=5 --warmup=1 --transport=shm --native-presentation --output=/tmp/vexart-default-raw.json` — confirmed default native SHM omits `o=z`, reports `compress=0.00ms`, and uses `payload=raw`.
- `bun run perf:transport:shm` — passed after the policy flip (`dashboard-1080p p95=6.95ms`, `dirty-region p95=4.70ms`, `compositor-only p95=2.77ms`).
- `bun run perf:transport:file` — passed after the policy flip (`dashboard-1080p p95=9.08ms`, `dirty-region p95=5.04ms`, `compositor-only p95=2.09ms`).
