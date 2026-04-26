# Vexart 120fps / 5ms Performance Plan

**Status**: Active execution plan  
**Owner**: Founder  
**PRD decision**: DEC-013  
**Baseline date**: 2026-04-24

## 1. Goal

Move Vexart from a Rust-retained architecture that is currently ~60-70fps-class on the temporary 800×600 dashboard smoke benchmark toward 120fps-class retained fast paths measured against a real 1080p (`1920×1080`) dashboard workload.

This plan is intentionally category-based. A terminal UI engine should not pretend every frame has the same cost.

| Frame category | Target | Why |
| --- | ---: | --- |
| No-op retained frame | `<1 ms p99` | Nothing changed; the engine should mostly short-circuit. |
| Small dirty-region frame | `<5 ms p95` | Hover, focus, cursor, button state, and small UI edits need 120fps headroom. |
| Compositor-only transform/opacity | `<8.33 ms p95` | Required for 120fps-class animations. |
| Full dashboard 1080p (`1920×1080`) | `<10 ms gate`, `<8.33 ms aspirational` | Normal desktop terminal workload. |
| Input-to-visual compositor path | `<16 ms p95` | User-perceived responsiveness target. |

Current measured baseline:

```txt
bun run perf:check
dashboard 800×600 offscreen: 14.23 ms/frame
```

That is good enough for ~70fps-class offscreen work at 800×600, but it is not 120fps-class and it is not the release workload. P0 must add a 1080p dashboard benchmark before any full-dashboard claim is accepted.

## 2. Non-Goals

- Do not claim terminal-visible 120fps universally. Kitty, Ghostty, WezTerm, OS compositor, terminal protocol, and display refresh can cap perceived output.
- Do not optimize by deleting public JSX semantics.
- Do not hide fallback/readback work inside normal presentation paths.
- Do not accept “Rust-native” as proof of performance. Only measurements count.

## 3. Measurement Contract

Before optimizing, add a profiler that reports every frame as a structured budget:

```txt
frame.total
├─ js.reconcile
├─ ts.walk_tree
├─ ts.layout                  // Flexily
├─ ts.hit_test
├─ ts.render_graph
├─ rust.paint_dispatch
├─ rust.composite
├─ rust.kitty_encode
├─ terminal.write
└─ idle/scheduler_gap
```

Every optimization PR must include before/after numbers for the affected category.

## 4. Phase Plan

### P0 — Profiling Truth

**Objective**: know where time goes at both the current 800×600 smoke benchmark and the required 1080p release workload.

Tasks:

- Add `bench:frame-breakdown` for dashboard 800×600 smoke coverage.
- Add `bench:dashboard-1080p` for the real `1920×1080` release workload.
- Commands:
  - `bun run bench:frame-breakdown -- --frames=300 --warmup=5`
  - `bun run bench:frame-breakdown -- --frames=3 --warmup=1` for smoke checks
  - `bun run bench:dashboard-1080p` for the full release benchmark sweep
- Add benchmark scenes:
  - no-op retained frame
  - one dirty button/hover frame
  - compositor-only transform frame
  - full dashboard 1080p frame
  - 1000-node culling frame
- Emit p50/p95/p99 over at least 300 frames, not 5 frames.
- Record JS allocation count/bytes per frame.
- Record FFI call count by symbol.
- Save machine/environment metadata.

Exit criteria:

- We can answer: “which three stages dominate the 1080p dashboard frame?”
- Bench output is stable enough for CI thresholds.

### P1 — No-Op And Dirty-Region Short-Circuit

**Objective**: avoid doing work when retained state says nothing changed.

Tasks:

- Add native retained dirty version counters per scene/layer/subtree.
- Skip `walk-tree` paint queue work when no JSX mutation or interaction state changed.
- Skip native render graph snapshot translation when native scene version is unchanged.
- Add dirty-region fast path for hover/focus/active style changes.
- Ensure no-op frame does not allocate hot-path objects.

Targets:

- No-op retained frame `<1 ms p99`.
- Small dirty-region frame `<5 ms p95`.

### P2 — Native Canvas Display-List Replay

**Objective**: remove canvas command replay from the JS/backend path when display-list handles exist.

Tasks:

- Define native display-list binary command format.
- Parse/replay supported commands in Rust:
  - line
  - bezier
  - rect
  - circle/ellipse
  - polygon
  - text
  - image handle
  - linear/radial gradient
  - glow
- Keep unsupported commands loud/fallback-only.
- Add visual parity fixture for `<canvas>` native replay.

Targets:

- Canvas-heavy primitive benchmark improves by ≥30%.
- No hidden TS canvas sprite cache returns.

### P3 — FFI And Allocation Collapse

**Objective**: reduce per-frame JS allocation and FFI overhead.

Tasks:

- Replace per-op JS object translation with reusable typed-array snapshots where possible.
- Batch native scene prop updates by node.
- Batch render graph op transfer into contiguous buffers.
- Reuse TextEncoder/TextDecoder and command buffers.
- Add CI budget for FFI calls/frame.

Targets:

- Dashboard JS allocations reduced by ≥50%.
- FFI calls/frame reduced by ≥30% on dashboard.

### P4 — Native Paint/Composite Fast Paths

**Objective**: make dirty and compositor paths cheap inside Rust.

Tasks:

- Add retained paint command cache keyed by material/effect/render-op hash.
- Reuse GPU bind groups/pipelines aggressively.
- Avoid full target begin/end when only uniforms changed.
- Add compositor-only path for transform/opacity with no render graph rebuild.
- Validate WGPU pipeline cache hit rate.

Targets:

- Compositor-only frame `<8.33 ms p95`.
- Small dirty-region frame remains `<5 ms p95` with effects enabled.

### P5 — Terminal Presentation Budget

**Objective**: separate engine production time from terminal-visible time.

Tasks:

- Measure `kitty_encode`, `terminal.write`, and terminal ACK/pacing independently.
- Prefer dirty-region/layer emits over full-frame emits.
- Add adaptive presentation throttling when terminal cannot display at producer rate.
- Report producer FPS vs presented FPS separately.

Targets:

- Native Kitty encode remains `<0.5 ms` for full 1920×1080.
- Small dirty-region terminal write remains inside the `<5 ms` engine-side target when terminal accepts writes.

### P6 — CI Gates And Release Criteria

**Objective**: prevent regression once targets are reached.

Tasks:

- Add CI jobs:
  - `bench:frame-breakdown`
  - `bench:no-op-retained`
  - `bench:dirty-region`
  - `bench:compositor-only`
  - `bench:dashboard-800x600` smoke/dev baseline
  - `bench:dashboard-1080p` release benchmark
- Fail PRs on >10% regression from `main` for established categories.
- Fail PRs on exceeding hard gates after a category is marked “locked”.
- Store historical JSON benchmark artifacts.

## 5. Execution Order

Do NOT start with random micro-optimizations.

Correct order:

1. P0 profiling truth.
2. P1 no-op/dirty-region short-circuit.
3. P3 allocation/FFI collapse if JS dominates.
4. P4 native paint/composite fast paths if Rust/GPU dominates.
5. P2 native canvas replay if canvas shows up in traces.
6. P5 terminal presentation once engine-side frame time is below target.
7. P6 CI gates once each category stabilizes.

## 6. Success Definition

The 120fps program is successful when all of these are true on reference hardware:

- no-op retained frame `<1 ms p99`
- small dirty-region frame `<5 ms p95`
- compositor-only transform/opacity frame `<8.33 ms p95`
- full dashboard 1080p (`1920×1080`) frame `<10 ms p95`
- no raw RGBA crosses into JS during normal terminal presentation
- CI has category-specific performance gates
- docs show producer FPS and terminal-presented FPS as separate concepts

## 7. First SDD Change To Create

```txt
phase-9a-frame-breakdown-profiler
```

Scope:

- benchmark harness
- per-stage timers
- allocation/FFI counters
- JSON output
- dashboard 1080p/no-op/dirty/compositor scenes

Exit gate:

- one command tells us exactly where the 1080p dashboard frame is spent, while still reporting the legacy 800×600 smoke baseline for continuity.
