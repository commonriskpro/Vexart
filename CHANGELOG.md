# Changelog

All notable changes to Vexart are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version scheme: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.0-preview] — 2026-04-22

First public developer preview. Five phases of migration from the TGE prototype
to Vexart's production architecture.

### Phase 5 — Polish, Docs, Launch

- Rewrote `README.md` with current package names, architecture, and quick-start for v0.9
- Added `CHANGELOG.md`
- Added dual-license `LICENSE` (source-available, $1M ARR threshold — DEC-003)
- Added `scripts/perf-baseline.ts` — offscreen frame-time benchmark; saves JSON baseline
- Added `perf:baseline` and `perf:check` npm scripts
- Added `examples/README.md` — index of all examples with descriptions and run commands

### Phase 4 — Public API & Visual Testing

- Added explicit named exports in all 4 packages via `public.ts`; removed `export *` from entry points
- Eliminated all `as any` casts in the reconciler; replaced with discriminated-union prop handlers
- Auto-generated `jsx-runtime.d.ts` from `TGEProps` via `scripts/gen-jsx-runtime.ts`
- Implemented golden image test harness (`scripts/visual-test/`) with offscreen `renderToBuffer`
- Added 3 initial golden scenes: hello, layout, colors
- Added `test:visual` and `test:visual:update` npm scripts

### Phase 3 — Loop Decomposition

- Decomposed 3030-line `loop.ts` god module into 6 pipeline modules + a 3-priority frame scheduler
- Modules: `walker.ts`, `layout-bridge.ts`, `paint-commands.ts`, `effects.ts`, `compositor.ts`, `scheduler/`
- Added AABB viewport culling — off-screen nodes skip paint
- Removed all legacy Clay-era code paths: spatial overlap fallback, counter-based node mapping, deprecated stubs
- Fixed scroll system: Taffy `overflow:Scroll` + TS-side scroll offset + content-height from children
- Fixed alignment bugs from Clay→Taffy axis-swap (column/row alignment now correct)
- Fixed interactivity: global dirty tracker now chains to layer store `markAllDirty`

### Phase 2b — Advanced Rendering

- Implemented MSDF (Multi-channel Signed Distance Field) text rendering — sharp at any size
- Implemented compositor-thread animations for `transform` and `opacity` — 60 fps without main-thread paint
- Implemented self-filters (`filter` prop): blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate
- Added declarative compositor hints: `willChange` and `contain` props (CSS semantics)
- Deleted bitmap font atlas path (89-glyph ASCII); MSDF is the only text path

### Phase 2 — Native Consolidation (Zig → Rust, Clay → Taffy)

- Replaced Zig pixel engine (`zig/`) with Rust WGPU GPU backend (`native/`)
- Replaced Clay layout engine (`vendor/clay.h`) with Taffy (Rust flexbox) — no more C FFI
- Consolidated 16 `@tge/*` packages into 4 `@vexart/*` layers: engine, primitives, headless, styled
- Renamed product from TGE to Vexart (DEC-001)
- Single `libvexart` cdylib replaces all previous native libraries
- Deleted `@tge/pixel`, `@tge/output` (halfblock/placeholder backends), `@tge/terminal` (merged into engine)
- Kitty graphics protocol is the only supported output backend (DEC-005)

### Phase 1 — Foundation

- Initial monorepo structure: packages, openspec, scripts, examples
- SDD (Spec-Driven Development) workflow established across all phases (DEC-007)
- Dual-license model decided: source-available with $1M ARR commercial threshold (DEC-003)
- Four-layer package architecture decided: engine → primitives → headless → styled (DEC-006)
- WGPU chosen as permanent GPU abstraction — no native per-platform backends (DEC-009)

---

## [0.0.1] — 2026-04-17

Initial prototype (TGE). Clay + Zig + SolidJS. Internal use only.
