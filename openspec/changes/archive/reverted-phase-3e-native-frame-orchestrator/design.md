# Design: Phase 3e — Native Frame Orchestrator

## Technical Approach

Rust receives frame requests and chooses the cheapest valid presentation strategy based on native damage, layer registry state, terminal transport, resource budget, and compositor animation descriptors.

## Native Modules

- `frame/mod.rs`
- `frame/scheduler.rs`
- `frame/strategy.rs`
- `frame/stats.rs`

## Frame Strategies

- `skip-present` — no visible damage.
- `layered-dirty` — present dirty layers.
- `layered-region` — present bounded dirty regions.
- `final-frame` — compose and emit final full frame when cheaper or required.

## TS Role After This Phase

TS loop becomes a binding shell: request frames, forward events, dispatch callbacks, and surface stats. It does not choose strategy for native-enabled scenes.
