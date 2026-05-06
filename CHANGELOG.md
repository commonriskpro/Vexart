# Changelog

All notable changes to Vexart are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version scheme: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.0-beta.19] — 2026-05-06

### Performance

- **Native-only presentation** — eliminated TS readback entirely. All GPU readback + compress + Kitty emit now happens inside Rust. Direct/file/SHM transport all native. ~4ms/frame saved.
- **Reactive Flexily tree** — Flexily layout nodes persist on TGENode and sync incrementally from the reconciler. No more full tree rebuild every frame (~40-60% layout time reduction).
- **Lazy scroll offsets** — eliminated O(N) `applyOffsetToDescendants()` mutation. Scroll offsets applied lazily via map lookup during hit-testing.
- **Skip re-layout on hover** — visual-only hover transitions no longer trigger full Flexily layout recomputation.
- **Per-frame allocation reduction** — pre-allocated Maps, cached depth values, text buffer reuse, eliminated `.slice()` copies on the hot path.
- Added hotpath audit infrastructure with per-stage p95 gates, visual correctness golden tests, and before/after comparison scripts.

### Features

- Wire `fontFamily`/`fontWeight`/`fontStyle` from JSX props to MSDF renderer — full font variant support.
- Native Rust font measurement via FFI (`vexart_font_measure`) — replaces Pretext dependency.
- Hex color support (`"#rrggbb"` / `"#rrggbbaa"`) in `shadow` and `gradient` props.
- `gen:types` script for regenerating dist type declarations.
- Babel JSX transform deps included in published dist package.

### Bug Fixes

- **Mouse-move flicker** — scoped dirty marking to only affected layers on hover state change (was marking ALL layers dirty).
- **Backdrop filters** — fixed 3 issues: empty layer targets, text accumulation in filter layers, and incorrect sampling by pre-compositing lower layers before backdrop reads.
- **FFI segfault** — added packed-buffer length params to 5 FFI exports that had argument count mismatch on ARM64.

### Removed

- Eliminated Pretext (`@chenglou/pretext`) dependency — replaced by native Rust font measurement.
- Eliminated `@napi-rs/canvas` dependency.
- Removed legacy bitmap text rendering path (MSDF is the only text pipeline).
- Removed dead Taffy dependency from Cargo.toml.
- Removed remaining legacy code (TS readback fallback, old allocation patterns).

### Documentation

- Comprehensive documentation audit — synced all docs (AGENTS.md, ARCHITECTURE.md, API-POLICY.md, PRD.md, README, developer guide) with actual code state.
- Updated README to reflect reactive layout and native-only presentation architecture.
- Replaced all internal `@vexart/*` import paths with consumer-facing paths in docs/examples.

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
