# Tasks: Phase 3d — Native Render Graph And Pipeline Batching

## 1. Native Render Graph Core

- [x] 1.1 Add native render graph modules and operation types.
- [ ] 1.2 Convert native scene + layout into render ops (initial rect/border/text/effect/image/canvas snapshot path landed; mixed native/TS command-level translation now runs in paint, but full scene coverage still pending).
- [x] 1.3 Batch render ops by pipeline/material in the snapshot path.
- [x] 1.4 Add render graph fixture tests for the initial snapshot path.

## 2. Material And Effect Coverage

- [ ] 2.1 Wire rect/rounded/per-corner fill and stroke.
- [ ] 2.2 Wire shadows, glow, gradients, and blend modes.
- [ ] 2.3 Wire backdrop filters and self filters.
- [ ] 2.4 Wire images, transforms, opacity, and text (initial snapshot reachability landed; paint-path cutover still pending).
- [ ] 2.5 Add effect-specific golden tests.

## 3. TS Cutback

- [ ] 3.1 Stop packing `cmd_kind` batches for native scene path (paint path now mixes native graph translation with TS fallback per command instead of dropping whole layers back to compat, but full cutback still pending).
- [ ] 3.2 Keep TS render graph fallback-only.
- [ ] 3.3 Record shader reachability validation in verify report.
