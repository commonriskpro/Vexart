# Tasks: Phase 9c — Presentation Transport Fast Path

## 1. Benchmark modes

- [x] 1.1 Add `--transport=direct|file|shm` to frame breakdown benchmark.
- [x] 1.2 Configure Kitty transport manager for mock-terminal benchmark runs.
- [x] 1.3 Stop forcing final-frame strategy by default.

## 2. Presentation path

- [x] 2.1 Add regional payload metadata to renderer backend paint results.
- [x] 2.2 Add layer presence query to GPU/layer composers.
- [x] 2.3 Read back target regions when regional repaint is viable.
- [x] 2.4 Patch existing Kitty layers with regional payloads.

## 3. Damage policy

- [x] 3.1 Avoid dirtying lower layers for static upper-layer visual changes.
- [x] 3.2 Remove layer-count-only full repaint classification for small dirty areas.

## 4. Verification

- [x] 4.1 Run direct/file/shm frame breakdown smoke benchmarks.
- [x] 4.2 Run typecheck, tests, API check, and diff check.
- [x] 4.3 Write verification report.
