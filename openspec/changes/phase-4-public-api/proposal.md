# Proposal: Phase 4 — Public API & Visual Testing

## Intent

Lock Vexart's public API surface to v0.9-rc stability. Right now all four packages use barrel `export *` chains through `public.ts`, `jsx-runtime.d.ts` is a 459-line hand-maintained file, and ~20 `any` casts remain in the engine. Golden-image visual testing doesn't exist. This change makes the API explicit, type-strict, and visually testable — prerequisites for v0.9 release per `docs/PRD.md § Phase 4 (lines 840-854)` and `docs/API-POLICY.md §2.2, §3, §10.2`.

## Scope

### In Scope

1. **Explicit exports** — Convert `public.ts` in each of the 4 public packages to explicit named exports (no `export *`), organized per `API-POLICY.md §3` section headers.
2. **Package entry cleanup** — Each `package.json` points `main`/`types` at `public.ts`; `index.ts` contains only `export * from "./public"` (the one allowed re-export per `API-POLICY.md §2.3`).
3. **jsx-runtime.d.ts generation** — Script (`scripts/gen-jsx-runtime.ts`) auto-generates `types/jsx-runtime.d.ts` from `TGEProps`, eliminating the hand-maintained file.
4. **Type tightening** — Eliminate the ~20 `any` casts in the engine (reconciler, walk-tree, FFI helpers). Replace with discriminated unions or typed interfaces.
5. **Golden test harness (offscreen)** — Render scenes to a pixel buffer without a terminal; compare against committed reference images. Command: `bun run test:visual`. Update command: `bun run test:visual:update`.

### Out of Scope

- `api-extractor` + `.api.md` snapshot gating (requires CI setup — Phase 5 concern)
- CI workflow definition (no CI exists yet)
- CI gates for api.md diffs and pixel diffs (depends on CI)
- JSDoc stability tags on every public symbol (follow-up after explicit exports land)
- 40-scene golden test suite (harness first; scenes expanded incrementally)

## Capabilities

### New Capabilities

- `explicit-exports`: Rules for converting barrel exports to explicit named exports per `public.ts`, including section headers, the `index.ts` re-export convention, and the `export *` ban enforcement.
- `visual-testing`: Offscreen golden-image test harness — pixel-buffer rendering without terminal, PNG comparison, update workflow.

### Modified Capabilities

None — existing specs (`package-boundaries`, `project-governance`) are not changed at the requirement level by this work.

## Approach

Five sequential slices, each completable independently:

| Slice | Deliverable | Packages |
|-------|-------------|----------|
| 1 | Explicit `public.ts` — all 4 packages converted to named exports, section-organized | engine, primitives, headless, styled |
| 2 | Package entry cleanup — `index.ts` → `export * from "./public"` only; `package.json` main/types point to public.ts | all 4 |
| 3 | `gen-jsx-runtime.ts` — reads `TGEProps` type, emits `types/jsx-runtime.d.ts`; verified by round-trip diff | engine (script at root) |
| 4 | Type tightening — replace 20 `any` casts with proper types | engine |
| 5 | Offscreen golden test harness — `test:visual` / `test:visual:update` commands; 5 seed scenes | engine |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/*/src/public.ts` | Modified | Replaced `export *` with explicit named exports |
| `packages/*/src/index.ts` | Modified | Simplified to single re-export from public.ts |
| `packages/*/package.json` | Modified | main/types entries updated |
| `scripts/gen-jsx-runtime.ts` | New | Auto-generation script for jsx-runtime.d.ts |
| `types/jsx-runtime.d.ts` | Modified | Now auto-generated, not hand-maintained |
| `packages/engine/src/reconciler/*.ts` | Modified | `any` elimination |
| `packages/engine/src/loop/walk-tree.ts` | Modified | `any` elimination |
| `packages/engine/src/ffi/*.ts` | Modified | `any` elimination |
| `scripts/visual-test/` | New | Offscreen renderer harness, scene runner, PNG diff |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Offscreen renderer output diverges from Kitty terminal output | Medium | Use same paint path (Zig FFI) for both; add kitty-vs-offscreen comparison smoke test |
| Missing exports during barrel → explicit conversion | Low | Exhaustive audit of each `index.ts` barrel before conversion; compile check |
| `TGEProps` shape changes break gen-jsx-runtime | Low | Script parses AST, not regex — resilient to formatting changes |
| Type tightening introduces regressions | Low | `bun run typecheck` + `bun test` gates each slice |

## Rollback Plan

Each slice is a self-contained commit. Revert the offending slice's commit to restore previous state. The highest-risk slice (5 — golden harness) is additive and touches no existing code.

## Dependencies

- Zig shared lib must be built (`zig build -Doptimize=ReleaseFast`) for offscreen rendering in slice 5.
- No new npm dependencies required.

## Success Criteria

- [ ] Zero `export *` in any `public.ts` across all 4 public packages
- [ ] `bun run typecheck` passes with zero `any` in engine source (test files excluded)
- [ ] `bun run gen:jsx-runtime` produces output identical to committed `types/jsx-runtime.d.ts`
- [ ] `bun run test:visual` runs 5 golden scenes and passes
- [ ] `bun run test:visual:update` regenerates reference PNGs
- [ ] Each `index.ts` contains exactly one line: `export * from "./public"`
