# Proposal: Phase 12 Canvas Display-List Replay

## Intent

Complete Vexart `<canvas>` rendering so display-list commands captured from TypeScript `CanvasContext` can be replayed into a renderable image handle instead of failing GPU frames.

## Source documents satisfied

- `docs/PRD.md` — supports richer terminal-native pixel UI.
- `docs/ARCHITECTURE.md` — keeps rendering in the native boundary and Vexart engine layers.
- `docs/API-POLICY.md` — makes an existing public JSX/API feature operational without widening public API unnecessarily.

## Scope

- Parse serialized canvas display-list commands.
- Rasterize supported commands into an RGBA buffer/image resource.
- Cache rasterized canvas output by display-list handle/hash and target size.
- Connect canvas render ops to the GPU backend image batching path.
- Cover the path with native and TypeScript tests.

## Out of scope

- Perfect browser Canvas2D parity.
- Text shaping beyond the existing simple canvas text command.
- Advanced blend modes for canvas commands.

## Rollback

Revert the canvas replay implementation and keep `<canvas>` disabled/unsupported in examples.
