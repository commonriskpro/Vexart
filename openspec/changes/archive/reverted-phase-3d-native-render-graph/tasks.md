# Tasks: Phase 3d — Native Render Graph And Pipeline Batching

## 1. Native Render Graph Core

- [x] 1.1 Add native render graph modules and operation types.
- [x] 1.2 Convert native scene + layout into render ops (rect/border/text/effect/image/canvas snapshot path landed; direct Rust scene-paint lowering now exists for supported retained ops).
- [x] 1.3 Batch render ops by pipeline/material in the snapshot path.
- [x] 1.4 Add render graph fixture tests for the initial snapshot path.
- [x] 1.5 Track fully-covered vs mixed native/TS fallback layer coverage from native render graph translation.

## 2. Material And Effect Coverage

- [x] 2.1 Wire rect/rounded/per-corner fill and stroke for the direct scene-paint path.
- [ ] 2.2 Wire shadows, glow, gradients, and blend modes (linear/radial gradients, shadows, and glow now lower through direct scene paint; blend modes still pending).
- [ ] 2.3 Wire backdrop filters and self filters.
- [ ] 2.4 Wire images, transforms, opacity, and text (opacity, native-handle images, and text glyph batching now have direct scene-paint support; canvas callbacks and transform semantics still pending/fallback-gated).
- [ ] 2.5 Add effect-specific golden tests.

## 3. TS Cutback

- [ ] 3.1 Stop packing `cmd_kind` batches for native scene path (supported fully-covered rect/border/text/native-image/simple-effect/linear-gradient/radial-gradient/shadow/glow layers now dispatch through `vexart_scene_paint_dispatch`; canvas callbacks, filters/backdrop, transform/masking, and blend semantics still fall back to TS packing).
- [ ] 3.2 Keep TS render graph fallback-only (native scene paint coverage now uses the binary `VXRF` paint-ref snapshot on the hot path instead of JSON render graph snapshot parsing; unsupported/dirty fallback still builds TS render graph).
- [x] 3.3 Record shader reachability validation in verify report.
