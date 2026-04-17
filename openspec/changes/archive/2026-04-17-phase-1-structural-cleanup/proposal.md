# Proposal: Phase 1 — Structural Cleanup and Four-Layer Consolidation

## Intent

This proposal rewrites the active change to match the authoritative migration baseline: **Phase 1 consolidates the package graph into the four-layer architecture**, not a conservative rename-only pass (`docs/PRD.md §12 DEC-006`, `docs/ARCHITECTURE.md §2.2`, `docs/ARCHITECTURE.md Appendix A`). The prior conservative scope (10 packages surviving after rename/lint) is explicitly rejected and replaced by Option B scope selected by the founder.

The target shape for this phase is: four public packages (`@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, `@vexart/styled`) plus one internal package for dev tooling (`@vexart/internal-devtools`), with strict directional boundaries and CI enforcement (`docs/PRD.md §6.2`, `docs/PRD.md §12 DEC-006`, `docs/ARCHITECTURE.md §2.2`, `docs/ARCHITECTURE.md Appendix A`).

## Scope

### In Scope
- **Verify ghost packages stay absent**: `compat-software`, `compat-text-ansi`, `compositor`, `output-compat`, `render-graph`, `scene`, `text` are already removed from `packages/`; this phase keeps them absent and does not add a deletion task (`docs/ARCHITECTURE.md Appendix A`).
- **Delete `@tge/windowing` completely**, including `examples/windowing-demo.tsx` and `examples/window-drag-repro.tsx`; no port or reimplementation in this phase (founder decision, package considered pre-refactor and bug-ridden).
- **Create `@vexart/engine`** with reconciler, loop, FFI, hooks, input, terminal lifecycle, Kitty output, animation, scheduler, and resources observability; native binary resides under `native/{platform}/libvexart.{dylib,so}` (`docs/PRD.md §6.1`, `docs/ARCHITECTURE.md §2.2`, `docs/ARCHITECTURE.md §3.1`).
- **Create `@vexart/primitives`** as thin typed wrappers for JSX intrinsics: `<Box>`, `<Text>`, `<Image>`, `<Canvas>`, `<Span>`, `<RichText>` (`docs/PRD.md §6.1`, `docs/ARCHITECTURE.md §3.2`).
- **Create `@vexart/headless`** for logic/accessibility/state/keyboard components using `ctx.*Props` render-prop contracts (`docs/PRD.md §6.1`, `docs/ARCHITECTURE.md §3.3`).
- **Create `@vexart/styled`** for Void theme tokens and styled wrappers over headless components plus typography primitives (`H1..H4`, `P`, `Lead`, `Large`, `Small`, `Muted`) (`docs/PRD.md §6.1`, `docs/ARCHITECTURE.md §3.4`).
- **Create internal package `@vexart/internal-devtools`** by moving current `@tge/devtools` and marking it internal/not published (internal-package convention aligned with `docs/ARCHITECTURE.md §2.2` internal tier).
- **Consolidate current packages/stubs into destinations**:
  - `@tge/core` → `@vexart/engine/src/ffi/`
  - `@tge/runtime` → `@vexart/engine/src/reconciler/` + `src/loop/`
  - `@tge/input` → `@vexart/engine/src/input/` + `src/hooks/`
  - `@tge/terminal` → `@vexart/engine/src/terminal/`
  - `@tge/output` + stub `@tge/output-kitty` → `@vexart/engine/src/output/`
  - `@tge/renderer-solid` + stub `@tge/renderer` → `@vexart/engine/src/reconciler/`
  - `@tge/pixel` → `@vexart/engine/src/paint-legacy/` (temporary; removed in Phase 2 per DEC-004)
  - stub `@tge/gpu` → `@vexart/engine/src/ffi/`
  - stub `@tge/layout-clay` → `@vexart/engine/src/loop/` (temporary; removed in Phase 2)
  - stub `@tge/platform-terminal` → `@vexart/engine/src/terminal/`
  - `@tge/components` → split by criterion below
  - `@tge/void` → `@vexart/styled/`
  - `@tge/devtools` → `@vexart/internal-devtools/`
  (`docs/PRD.md §12 DEC-006`, `docs/ARCHITECTURE.md §2.2`, `docs/ARCHITECTURE.md Appendix A`, `docs/PRD.md DEC-004`).
- **Apply founder-approved component split criterion**:
  - state/keyboard/accessibility/`ctx.*Props` components → `@vexart/headless`
  - typed intrinsic wrappers (`Box/Text/Span/RichText/Image/Canvas`) → `@vexart/primitives`
  (`docs/ARCHITECTURE.md §3.2`, `docs/ARCHITECTURE.md §3.3`).
- **Declare explicit `workspace:*` dependencies** in every new package `package.json` with this direction:
  - `@vexart/engine` → no Vexart package dependencies
  - `@vexart/primitives` → `@vexart/engine`
  - `@vexart/headless` → `@vexart/engine`, `@vexart/primitives`
  - `@vexart/styled` → `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`
  - `@vexart/internal-devtools` → may depend on any layer (internal only)
  (`docs/PRD.md §6.2`, `docs/ARCHITECTURE.md §2.2`).
- **Replace all cross-package relative imports** (`../../otro-paquete/src/...`) with bare package imports (`@vexart/*`) (`docs/PRD.md §6.2`, `docs/ARCHITECTURE.md Appendix A`).
- **Install and wire dependency-cruiser** as `bun run lint:boundaries` enforcing: layer direction, no same-layer lateral imports, no circular dependencies, and no cross-package relative paths; CI must fail on violations (`docs/PRD.md §6.2`, `docs/PRD.md §12 DEC-006`).
- **Update root/project wiring**:
  - root `package.json` name → `"vexart"`
  - update imports/references in `examples/*`, `scripts/*`, `solid-plugin.ts`
  - update `tsconfig.json` path mappings to `@vexart/*`
  (`docs/ARCHITECTURE.md Appendix A`).
- **Preserve git blame** via `git mv` wherever feasible for moved files.

### Out of Scope
- Native code changes (`docs/PRD.md §6.3`, phase sequencing in `docs/PRD.md §11`).
- Deleting `zig/`, `vendor/clay*`, or `libwgpu-canvas-bridge` sources (`docs/PRD.md §5.3`, `docs/ARCHITECTURE.md Appendix A`).
- API extractor/public API locking via `public.ts` CI gates (`docs/API-POLICY.md`, scheduled later).
- Golden image tests (`docs/PRD.md §11`, Phase 4).
- MSDF/compositor animations/self filters/`willChange`/`contain` (`docs/PRD.md §12 DEC-008`, Phase 2b).
- Loop decomposition into phase files and frame-budget scheduler (`docs/ARCHITECTURE.md Appendix A`, Phase 3).
- Viewport culling and frame-budget scheduler delivery (`docs/ARCHITECTURE.md Appendix A`, Phase 3).

## Capabilities

### New Capabilities
- `package-boundaries`: enforce four-layer dependency direction, explicit package dependencies, no cross-package relative imports, no lateral/upward imports, and no cycles through `dependency-cruiser` + CI (`docs/PRD.md §6.2`, `docs/PRD.md §12 DEC-006`).

### Modified Capabilities
- None.

## Approach

1. Verify the seven ghost names remain absent in `packages/` and document as invariant (no deletion task).
2. Delete `packages/windowing/` plus `examples/windowing-demo.tsx` and `examples/window-drag-repro.tsx` (no replacement).
3. Scaffold the new package roots: `packages/engine`, `packages/primitives`, `packages/headless`, `packages/styled`, `packages/internal-devtools` with initial `package.json` and export entrypoints.
4. Consolidate sources using `git mv` from current packages/stubs into target destinations, including temporary `engine/src/paint-legacy/` for `@tge/pixel` (DEC-004 follow-up in Phase 2).
5. Split `@tge/components` by contract: behavior + `ctx.*Props` to headless, typed intrinsic wrappers to primitives (`docs/ARCHITECTURE.md §3.2`, `§3.3`).
6. Rewrite all imports to bare `@vexart/*` specifiers and remove cross-package relative references.
7. Declare exact `workspace:*` dependencies in each new package according to PRD layer rules (`docs/PRD.md §6.2`).
8. Add `dependency-cruiser` config and `bun run lint:boundaries`; enforce non-zero exit in CI for boundary/cycle/relative-path violations.
9. Update root identity and integration points (`package.json` name, `tsconfig.json` paths, `examples/*`, `scripts/*`, `solid-plugin.ts`) to the new package names.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/windowing/` | Removed | Package deleted wholesale (founder-confirmed) |
| `examples/windowing-demo.tsx` | Removed | Windowing example deleted |
| `examples/window-drag-repro.tsx` | Removed | Window drag repro deleted |
| `packages/engine/` | New | New engine package with reconciler/loop/ffi/hooks/input/terminal/output and native payload path |
| `packages/primitives/` | New | New typed wrappers package for JSX intrinsics |
| `packages/headless/` | New | New logic/accessibility component package with `ctx.*Props` contracts |
| `packages/styled/` | New | New void-theme and styled wrapper package |
| `packages/internal-devtools/` | New | Internal devtools package (rename from `@tge/devtools`) |
| `packages/core/` | Removed (folded) | Consolidated into `packages/engine/src/ffi/` |
| `packages/runtime/` | Removed (folded) | Consolidated into `packages/engine/src/reconciler/` + `src/loop/` |
| `packages/input/` | Removed (folded) | Consolidated into `packages/engine/src/input/` + `src/hooks/` |
| `packages/terminal/` | Removed (folded) | Consolidated into `packages/engine/src/terminal/` |
| `packages/output/` | Removed (folded) | Consolidated into `packages/engine/src/output/` |
| `packages/output-kitty/` | Removed (folded stub) | Folded into engine output module |
| `packages/renderer-solid/` | Removed (folded) | Consolidated into `packages/engine/src/reconciler/` |
| `packages/renderer/` | Removed (folded stub) | Folded into engine reconciler module |
| `packages/pixel/` | Removed (folded) | Moved into temporary `packages/engine/src/paint-legacy/` |
| `packages/gpu/` | Removed (folded stub) | Folded into engine ffi module |
| `packages/layout-clay/` | Removed (folded stub) | Folded into engine loop module (temporary until Phase 2) |
| `packages/platform-terminal/` | Removed (folded stub) | Folded into engine terminal module |
| `packages/components/` | Removed (split) | Split into `packages/primitives/` and `packages/headless/` by contract |
| `packages/void/` | Removed (folded) | Folded into `packages/styled/` |
| `packages/devtools/` | Removed (renamed) | Renamed/moved to `packages/internal-devtools/` |
| `packages/*/package.json` (new packages) | Modified/New | Explicit `workspace:*` dependencies and publication flags |
| `packages/**/src/**/*.{ts,tsx}` | Modified | Import specifiers rewritten to `@vexart/*` |
| `.dependency-cruiser.cjs` (or equivalent) | New | Layer boundary + cycle + relative-path rules |
| `package.json` (root) | Modified | Rename root package to `vexart`; add `lint:boundaries` |
| `tsconfig.json` | Modified | Paths remapped to `@vexart/*` |
| `examples/**` | Modified | Imports updated to new package names (except deleted windowing files) |
| `scripts/**` | Modified | Imports/scripts updated to new package names |
| `solid-plugin.ts` | Modified | Import references updated to new package names |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Git blame continuity lost during moves | Medium | Prefer `git mv`; avoid copy/delete unless necessary; verify history with `git log --follow` |
| Circular dependencies emerge after consolidation | Medium | Enforce `dependency-cruiser` cycle rule from first consolidation commit |
| Codemod/manual rewrite misses imports | Medium | Run repo-wide import checks and typecheck gates after each migration slice |
| Showcase/examples break after package and windowing changes | Medium | Update all example imports and remove only the two confirmed windowing examples |
| Component split misclassifies files between primitives/headless | Medium | Apply explicit contract test: `ctx.*Props`/state/keyboard/accessibility => headless; intrinsic wrappers => primitives (`docs/ARCHITECTURE.md §3.2`, `§3.3`) |

## Rollback Plan

Rollback model is commit-level revert on `main`: `git revert <sha>` for each migration slice (founder is solo and not using feature branches).

Suggested revert granularity: (1) windowing deletion, (2) package scaffolding, (3) fold/move batches, (4) import rewrites, (5) dependency-cruiser enforcement, (6) root/examples/scripts/tsconfig rewiring. This keeps rollback surgical while preserving successful prior slices.

## Dependencies

- `phase-0-alignment` archived (done).
- No additional prerequisite changes.

## Success Criteria

- [ ] `packages/` contains no resurrected ghost package directories: `compat-software`, `compat-text-ansi`, `compositor`, `output-compat`, `render-graph`, `scene`, `text`.
- [ ] `packages/windowing/`, `examples/windowing-demo.tsx`, and `examples/window-drag-repro.tsx` are fully removed.
- [ ] Exactly four public packages exist: `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, `@vexart/styled`.
- [ ] `@tge/devtools` is replaced by internal `@vexart/internal-devtools` (not published as public API).
- [ ] All consolidation mappings in Scope are completed into the new destinations.
- [ ] `@tge/components` split is complete and follows ARCH contracts (`§3.2`, `§3.3`).
- [ ] Every new package `package.json` declares explicit `workspace:*` dependencies matching `docs/PRD.md §6.2`.
- [ ] Zero cross-package relative imports remain inside `packages/`.
- [ ] `bun run lint:boundaries` exists, runs dependency-cruiser rules, and exits non-zero on boundary/cycle violations.
- [ ] Root `package.json` name is `vexart`; `examples/*`, `scripts/*`, `solid-plugin.ts`, and `tsconfig.json` reference `@vexart/*`.
- [ ] `bun install`, `bun run typecheck`, `bun test`, and `bun run lint:boundaries` pass.
