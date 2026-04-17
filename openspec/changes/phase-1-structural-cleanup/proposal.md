# Proposal: Phase 1 — Structural Cleanup

## Intent

The v0.1 codebase has 23 physical packages under `packages/`: **7 are pure ghosts** (zero source files, no `package.json`), **6 are stubs** (1–2 files, mostly historical), and the remaining 10 are meaningful but still named `@tge/*` with undeclared dependencies and cross-package imports using relative paths (`../../otro-paquete/src/...`). This is impossible to enforce as a monorepo. Phase 1 brings the package graph to a lean, CI-enforceable baseline so Phase 2 can rip out native duplication without fighting package boundaries.

**Non-goal of Phase 1**: restructuring into the final 4-layer architecture (`@vexart/engine` + primitives + headless + styled). That consolidation happens across Phase 2 (native) and Phase 3 (loop decomposition). Phase 1 ships a **renamed-but-still-multi-package** monorepo.

## Scope

### In Scope
- Delete the 7 ghost packages (empty dirs with no `package.json`): `compat-software`, `compat-text-ansi`, `compositor`, `output-compat`, `render-graph`, `scene`, `text`.
- Delete `@tge/windowing` entirely (21 files). Package is bug-ridden and slated for a clean re-implementation post-v0.9. Any examples or demos that depend on it are either deleted or ported to a simple `<box floating>` equivalent — whichever is cheaper per demo.
- Evaluate and fold the 6 stub packages into sensible neighbors:
  - `@tge/output-kitty` (1 file) → fold into `@tge/output`.
  - `@tge/platform-terminal` (1 file) → fold into `@tge/terminal`.
  - `@tge/renderer` (2 files) → fold into `@tge/renderer-solid`.
  - `@tge/layout-clay` (1 file) → fold into consumer (probably `@tge/runtime`); Clay binding is deleted entirely in Phase 2 so placement is temporary.
  - `@tge/gpu` (1 file) → fold into `@tge/core` (where the WGPU bridge lives).
  - `@tge/devtools` (2 files) → keep as internal package (dev tool, not runtime).
- Rename every remaining `@tge/*` package to `@vexart/*` (name field in `package.json` + all imports + workspace references).
- Declare explicit `dependencies` in every surviving `package.json` (currently most omit them, relying on hoisting).
- Replace every cross-package relative import (`../../otro-paquete/src/...`) with the package-name import (`@vexart/otro-paquete`).
- Resolve any import cycles that emerge from making the graph explicit.
- Install and configure `dependency-cruiser` with Phase-1-appropriate rules (no circular deps, no `../../<sibling>/` imports); wire into CI so violations fail the build.
- Update `examples/*`, `scripts/*`, and `package.json` workspace scripts to use the new names.
- Update root `package.json` name (`tge` → `vexart`).

### Out of Scope
- Merging runtime/core/input/output/renderer-solid/terminal into a single `@vexart/engine` package (Phase 3 when `loop.ts` decomposition happens).
- Creating `@vexart/primitives`, `@vexart/headless`, `@vexart/styled` as new packages (Phase 3).
- Deleting `zig/`, `vendor/clay*`, `@tge/pixel` (Phase 2 — native consolidation).
- Re-implementing OS-style floating windows. `@tge/windowing` is **deleted entirely** in this phase (see below). A clean re-implementation lands as a separate future change after v0.9 ships.
- `api-extractor` snapshots, public API hardening (Phase 4).
- Any native code change.

## Capabilities

### New Capabilities
- `package-boundaries`: formal rules about which packages may import from which others, enforced by `dependency-cruiser` in CI.

### Modified Capabilities
- None. No existing specs.

## Approach

1. **Delete ghosts** (trivial, no consumer impact by definition — no package.json means nothing imported them).
2. **Fold stubs** (merge file content into target package, update imports at call sites, delete stub dir).
3. **Rename** using a scripted codemod: build a mapping `@tge/X → @vexart/X`, then `ripgrep`-replace across `packages/`, `examples/`, `scripts/`, `tsconfig.json`, `package.json` workspace globs.
4. **Declare deps** by reading the actual `import` statements of each package, computing the true set of siblings used, and writing them into `package.json`.
5. **Replace relative imports** by another codemod pass: `../../<sibling>/src/foo` → `@vexart/<sibling>/...`.
6. **Install dependency-cruiser** with a `.dependency-cruiser.cjs` config, allowed-list edges, and a `bun run lint:boundaries` script.

Each step is a separate task in `tasks.md`. Most can be completed in a single Claude session. The scripted codemods are idempotent — re-running produces the same output.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/compat-software`, `compat-text-ansi`, `compositor`, `output-compat`, `render-graph`, `scene`, `text` | Removed | Ghost directories deleted |
| `packages/windowing` | Removed | Bug-ridden, re-implemented post-v0.9 |
| `packages/output-kitty`, `platform-terminal`, `renderer`, `layout-clay`, `gpu` | Removed (folded) | Content merged into neighbor packages |
| All remaining `packages/*/package.json` | Modified | `name` renamed `@tge/*` → `@vexart/*`, `dependencies` declared |
| All `packages/*/src/**/*.ts{,x}` | Modified | Imports rewritten `@tge/X` → `@vexart/X`; relative sibling imports rewritten to package names |
| `examples/**`, `scripts/**`, `solid-plugin.ts` | Modified | Imports updated |
| `package.json` (root) | Modified | `name: vexart`, workspace globs unchanged |
| `tsconfig.json` | Modified | Path mappings updated if any reference `@tge/*` |
| `.dependency-cruiser.cjs` | New | CI boundary rules |
| `openspec/specs/package-boundaries/spec.md` | New | After archive, documents the rules |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Codemod misses an import, `bun run typecheck` fails | Medium | Full typecheck after each task; fix-forward per failure |
| Circular dependency emerges when declaring explicit deps | Medium | Use `dependency-cruiser` to detect; resolve by moving shared code to the smaller dependency or accepting a temporary loose coupling flagged for Phase 3 |
| Example/demo breaks after `windowing` deletion | Medium | Audit `examples/windowing-demo.tsx` and `window-drag-repro.tsx` first; port to `<box floating>` if cheap, delete otherwise |
| `@tge/layout-clay` stub has Clay-specific types consumers depend on | Medium | Inline types into consumer, delete Clay binding in Phase 2 anyway |
| Breaking examples/demos | High | Examples are run manually; each codemod task runs `bun --conditions=browser run examples/hello.tsx` as smoke check |
| Losing git blame history on renamed files | Medium | Use `git mv` for folded packages; document rename in commit message |

## Rollback Plan

Each task is a separate commit on the `phase-1-structural-cleanup` branch. Reverting any task is `git revert <sha>`. If the whole phase needs rollback before merge, delete the branch — `main` never sees partial state.

Ghost directory deletions are trivially reversible from git history. Fold operations preserve file content with `git mv`, so `git log --follow` continues to work.

## Dependencies

- `phase-0-alignment` must be archived first (establishes SDD workflow + master docs).
- No external dependencies.

## Success Criteria

- [ ] `packages/` contains zero `@tge/*` package names and zero empty directories.
- [ ] Every surviving `package.json` declares all `@vexart/*` siblings it imports.
- [ ] Zero relative cross-package imports (`../../otro-paquete/src/...`) remain anywhere in the repo.
- [ ] `bun install` succeeds with no warnings about undeclared peer deps.
- [ ] `bun run typecheck` passes.
- [ ] `bun test` passes.
- [ ] `bun run lint:boundaries` (dependency-cruiser) passes with zero violations.
- [ ] `bun --conditions=browser run examples/showcase.tsx` runs without startup errors.
- [ ] Commit history on the branch follows conventional commits (`chore:`, `refactor:`).
