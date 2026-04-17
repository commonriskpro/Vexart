# Design: Phase 1 — Structural Cleanup and Four-Layer Consolidation

## 1. Context

Vexart currently ships 16 `@tge/*` workspace packages with overlapping responsibilities, cross-package relative imports, and no CI enforcement of architectural boundaries. `docs/PRD.md §12 DEC-006` commits the project to a four-layer public package graph (`engine → primitives → headless → styled`) plus a minimal internal tier. The founder has explicitly selected **Option B** for Phase 1: consolidate the graph to the four-layer target *now* rather than rename-in-place and defer, because every subsequent phase (native consolidation in Phase 2, compositor path in Phase 2b, loop decomposition in Phase 3) assumes the target layout exists. Leaving `@tge/*` in place through Phase 2 would force every Phase 2 change to bridge two package universes.

Phase 1 is also the first change that installs `dependency-cruiser`, so this is the cheapest moment to land boundary rules: there is no legacy to grandfather yet. Per `openspec/config.yaml` `rules.design`, a dependency diagram and deviation register are mandatory when package boundaries move, and this design document is where they live.

The scope is TypeScript-only. Native code (`zig/`, `vendor/clay/`, `libwgpu-canvas-bridge`) is untouched; `@vexart/engine` retains the current FFI surface. Native consolidation belongs to Phase 2 (`docs/PRD.md §12 DEC-004`). The `rules.design` clause for Rust crate versions is therefore not applicable to this phase.

## 2. Target dependency diagram

```
PUBLIC PACKAGES (downward arrows only, CI-enforced)

┌─────────────────────────────────────┐
│  @vexart/styled                     │  depends on: headless, primitives, engine
│  — Void tokens + themed wrappers    │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  @vexart/headless                   │  depends on: primitives, engine
│  — Behavior, keyboard, state,       │
│    ctx.*Props render-prop contracts │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  @vexart/primitives                 │  depends on: engine
│  — Typed wrappers of JSX intrinsics │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  @vexart/engine                     │  depends on: (no @vexart/* package)
│  — Reconciler, loop, FFI, hooks,    │
│    input, terminal, output, paint-  │
│    legacy (Phase 1 only)            │
└──────────────┬──────────────────────┘
               ▼
      libvexart (placeholder — Phase 2
      delivers the Rust cdylib; Phase 1
      keeps the existing Zig/Clay/wgpu
      bridge behind engine/src/ffi/)

INTERNAL PACKAGES (not published)

┌─────────────────────────────────────┐
│  @vexart/internal-devtools          │  may depend on any public layer
│  — Kitty protocol inspector server  │
└─────────────────────────────────────┘
```

Mirrors `docs/ARCHITECTURE.md §2.2` with two Phase-1-only deviations: `paint-legacy/` lives inside engine (removed in Phase 2, DEC-004) and `libvexart` is a placeholder name for the current triple-binary setup (collapsed in Phase 2).

## 3. Current → target package map

Source: proposal.md §Scope, `docs/ARCHITECTURE.md §3.1–3.5`, `docs/ARCHITECTURE.md Appendix A`.

| Current | New Destination | Notes |
|---|---|---|
| `@tge/core` | `@vexart/engine/src/ffi/` | WGPU/Clay FFI bridge; was already scoped to native glue |
| `@tge/runtime` | `@vexart/engine/src/reconciler/` + `@vexart/engine/src/loop/` | Split internally: reconciler code → `reconciler/`, loop/walkTree/paintCommand → `loop/` |
| `@tge/input` | `@vexart/engine/src/input/` + `@vexart/engine/src/hooks/` | Parsing/dispatch → `input/`, SolidJS `useKeyboard`/`useMouse`/`useFocus` → `hooks/` |
| `@tge/terminal` | `@vexart/engine/src/terminal/` | Lifecycle, raw mode, caps |
| `@tge/output` | `@vexart/engine/src/output/` | Backends collapsed here |
| `@tge/output-kitty` | `@vexart/engine/src/output/` | Stub folded into output |
| `@tge/renderer-solid` | `@vexart/engine/src/reconciler/` | SolidJS universal renderer lands next to reconciler |
| `@tge/renderer` | `@vexart/engine/src/reconciler/` | Stub folded |
| `@tge/pixel` | `@vexart/engine/src/paint-legacy/` | **TEMPORARY** — deleted wholesale in Phase 2 per DEC-004. See §9 for rationale |
| `@tge/gpu` | `@vexart/engine/src/ffi/` | Stub folded (FFI adjacent) |
| `@tge/layout-clay` | `@vexart/engine/src/loop/` | Stub folded, **TEMPORARY** — deleted in Phase 2 when Taffy replaces Clay |
| `@tge/platform-terminal` | `@vexart/engine/src/terminal/` | Stub folded |
| `@tge/components` | **split** — `@vexart/primitives` and `@vexart/headless` | See §4 |
| `@tge/void` | `@vexart/styled/` | Full move: tokens, theme, styled wrappers, typography |
| `@tge/devtools` | `@vexart/internal-devtools/` | Renamed, `"private": true` |
| `@tge/windowing` | **DELETED** | Package + `examples/windowing-demo.tsx` + `examples/window-drag-repro.tsx` removed |

## 4. Component split table (`@tge/components` → primitives vs headless)

Classification criterion (REQ-PB-008, ARCH §3.2/§3.3): a file is **primitives** iff it is a typed wrapper of a JSX intrinsic with no state, no reactivity, no event handling, no focus/keyboard/accessibility logic. Otherwise it is **headless**. Verified against each file's actual imports and source header.

| File | Destination | Reason |
|---|---|---|
| `box.tsx` | primitives | Typed wrapper over `<box>` intrinsic, no state/reactivity (ARCH §3.2) |
| `text.tsx` | primitives | Typed wrapper over `<text>` intrinsic, no state (ARCH §3.2) |
| `rich-text.tsx` | primitives | Multi-span typed wrapper; also contains `Span` export, both belong here (ARCH §3.2) |
| `wrap-row.tsx` | primitives | Pure layout helper; no reactivity or handlers (justified as intrinsic-adjacent wrapper) |
| `button.tsx` | headless | Exposes `ctx.buttonProps`, focusable, onPress (REQ-PB-008) |
| `checkbox.tsx` | headless | `ctx.toggleProps`, focus, keyboard toggle |
| `switch.tsx` | headless | `ctx.toggleProps`, focus, keyboard toggle |
| `radio-group.tsx` | headless | `ctx.optionProps`, focus scope |
| `input.tsx` | headless | Text input state, cursor, keyboard |
| `textarea.tsx` | headless | 2D cursor, syntax, keybindings, state |
| `slider.tsx` | headless | Drag + keyboard + `setPointerCapture` |
| `select.tsx` | headless | Dropdown keyboard nav, focus trap, state |
| `combobox.tsx` | headless | Autocomplete state + keyboard |
| `progress-bar.tsx` | headless | Lives under ARCH §3.3 `display/` (target layout is authoritative) |
| `tabs.tsx` | headless | `ctx.tabProps`, keyboard, state |
| `list.tsx` | headless | `ctx.itemProps`, keyboard selection |
| `virtual-list.tsx` | headless | Virtualization state, hover/click, keyboard |
| `table.tsx` | headless | `ctx.rowProps`, selection state |
| `scroll-view.tsx` | headless | ScrollHandle state, scrollbar, wheel events (ARCH §3.3 `containers/`) |
| `portal.tsx` | headless | Container that mounts into overlay root (ARCH §3.3 `containers/`) |
| `overlay-root.tsx` | headless | Overlay infrastructure for Portal/Dialog/Tooltip (supports `containers/`) |
| `dialog.tsx` | headless | Focus trap, Escape keyboard, state (ARCH §3.3 `overlays/`) |
| `tooltip.tsx` | headless | Delayed hover state (ARCH §3.3 `overlays/`) |
| `toast.tsx` | headless | Imperative state store, auto-dismiss timers (ARCH §3.3 `overlays/`) |
| `router.tsx` | headless | Navigation state, stack (ARCH §3.3 `navigation/`) |
| `diff.tsx` | headless | Tree-sitter reactivity, syntax state (ARCH §3.3 `navigation/` per target) |
| `code.tsx` | headless | Tree-sitter highlighting, `createSignal`/`createEffect` (ARCH §3.3 `display/`) |
| `markdown.tsx` | headless | Marked lexer, syntax state (ARCH §3.3 `display/`) |
| `form.tsx` | headless | `createForm` factory, validation state (ARCH §3.3 `forms/`) |
| `scene-canvas.tsx` | **headless** (flagged — see §11 Open Q1) | 2D scene graph with hit-testing + reactive state; not in ARCH §3.3 enumeration |
| `space-background.ts` | **DELETED** (flagged — see §11 Open Q2) | Depends on `@tge/pixel` (Zig paint); dies with paint-legacy in Phase 2 |
| `index.ts` | **regenerated per package** | Split into `packages/primitives/src/index.ts` and `packages/headless/src/index.ts` |

Component count after split: **4 primitives** (box, text, rich-text+span, wrap-row) + **~28 headless** files (ambiguity on `scene-canvas.tsx`/`space-background.ts` flagged for founder).

## 5. Directory scaffolding plan

Only directories that actually receive files during Phase 1 are created. Future-phase directories (`scheduler/`, `animation/`, `resources/`, `debug/`) remain unscaffolded to avoid empty placeholders. Target shape per `docs/ARCHITECTURE.md §3.1–3.5`.

### `packages/engine/src/`

- `public.ts`, `index.ts`, `mount.ts` (from existing runtime/terminal entrypoints)
- `reconciler/` — from `@tge/runtime` (reconciler pieces) + `@tge/renderer-solid` + `@tge/renderer` stub
- `loop/` — from `@tge/runtime` (loop/walkTree) + `@tge/layout-clay` stub
- `hooks/` — from `@tge/input` (`useKeyboard`, `useMouse`, `useFocus`, `useDrag`, `useHover`, `useInput`)
- `input/` — from `@tge/input` (parser, dispatch, hit-test, pointer-capture, bracketed-paste)
- `terminal/` — from `@tge/terminal` + `@tge/platform-terminal` stub
- `output/` — from `@tge/output` + `@tge/output-kitty` stub
- `ffi/` — from `@tge/core` + `@tge/gpu` stub
- `paint-legacy/` — from `@tge/pixel` (TEMPORARY, Phase 1 only)
- `types.ts` (TGEProps)

### `packages/primitives/src/`

Flat layout per ARCH §3.2:
- `public.ts`, `index.ts`, `box.tsx`, `text.tsx`, `rich-text.tsx` (contains `Span`), `wrap-row.tsx`

`<Image>` and `<Canvas>` are listed in ARCH §3.2 but have no source today. Not scaffolded.

### `packages/headless/src/`

Per ARCH §3.3 subdirs:
- `public.ts`, `index.ts`
- `inputs/` — button, checkbox, switch, radio-group, input, textarea, slider, select, combobox
- `display/` — progress-bar, code, markdown (no `badge`/`avatar`/`skeleton`/`separator` today; added in Phase 3+ from void source)
- `containers/` — scroll-view, tabs, portal, overlay-root *(overlay-root is supporting infrastructure, see §10)*
- `collections/` — list, virtual-list, table
- `overlays/` — dialog, tooltip, toast *(no `popover.tsx` in components today; void has one — stays in styled)*
- `navigation/` — router, diff
- `forms/` — form.tsx (exports `createForm`)

### `packages/styled/src/`

Per ARCH §3.4:
- `public.ts`, `index.ts`
- `tokens/` — from `@tge/void/tokens.ts` (split by colors/radius/space/typography/shadows as files)
- `theme/` — from `@tge/void/theme.ts` (create-theme, provider, use-theme)
- `components/` — void's 17 styled wrappers (button, card, badge, avatar, skeleton, separator, dialog, select, switch, checkbox, radio-group, slider, combobox, dropdown-menu, popover, progress, input, tabs, table, toast, tooltip)
- `typography/` — from `@tge/void/typography.tsx` (split into h1–h4, p, lead, large, small, muted)

### `packages/internal-devtools/src/`

Flat:
- `public.ts`, `index.ts`, `kitty.ts`, `server.ts` (from existing `@tge/devtools`)
- `package.json` marks `"private": true`

## 6. Import rewriting strategy

**Tool**: `ripgrep` + `sed` for the 90% bulk pass; `@tge/Edit` tool for residual surgical fixes. **Rejected**: `jscodeshift`/`ast-grep` — overkill for a pure string rename, would require TS grammar setup. `sed` suffices because every `@tge/X` specifier is unique and literal.

**Order of operations**:

1. **Delete first** (`windowing/`, examples). Removes noise from subsequent passes.
2. **Scaffold new package roots** with empty `src/` + minimal `package.json` + `tsconfig.json`. Do NOT add `workspace:*` deps yet — nothing imports them.
3. **Move files with `git mv` in tight slices** (see §8). After each slice, update only that slice's own internal imports. Do NOT rewrite consumer imports yet — consumers still import from `@tge/*` paths that no longer exist, so typecheck will fail inside the slice but old `@tge/*` package names still compile for everything else until the final sweep.
4. **After ALL moves**: run the global codemod that rewrites every `@tge/X` → `@vexart/Y` specifier across `packages/`, `examples/`, `scripts/`, `solid-plugin.ts`, and `tsconfig.json`. Mapping table:

   | Old specifier | New specifier |
   |---|---|
   | `@tge/core`, `@tge/runtime`, `@tge/input`, `@tge/terminal`, `@tge/output`, `@tge/output-kitty`, `@tge/renderer-solid`, `@tge/renderer`, `@tge/pixel`, `@tge/gpu`, `@tge/layout-clay`, `@tge/platform-terminal` | `@vexart/engine` |
   | `@tge/components` | `@vexart/primitives` OR `@vexart/headless` (per §4) |
   | `@tge/void` | `@vexart/styled` |
   | `@tge/devtools` | `@vexart/internal-devtools` |

   The `@tge/components` mapping requires the split table as lookup; the codemod must read §4 and rewrite per-symbol. Safest: one sed pass per destination file (e.g., `rg -l "from \"@tge/components\"" | xargs sed ...`) but **with explicit barrel files** it resolves cleanly — consumers import `Button` from either `@vexart/primitives` or `@vexart/headless`; each barrel re-exports what it owns. If a consumer imports a symbol from the wrong barrel, typecheck catches it.

5. **Rewrite cross-package relative imports**: `rg -n "from ['\"]\\.\\./\\.\\./" packages/` identifies every cross-package traversal. Replace with bare `@vexart/*` (REQ-PB-006).
6. **Declare `workspace:*` deps** in each new `package.json` per REQ-PB-005. Run `bun install`.
7. **Install dependency-cruiser**, wire `lint:boundaries`, verify zero violations.

**Idempotency**: sed rewrites are idempotent (same input → same output, repeat runs are no-ops). `git mv` is not idempotent — if re-run after the move, it fails loudly, which is the desired signal. The codemod script logs every file modified; re-running produces zero writes.

**Relative path awareness**: since multiple old packages fold into `@vexart/engine`, a relative path like `../../runtime/src/reconciler` inside `@tge/input`'s old source becomes `../reconciler/foo` AFTER both move into `engine/src/`. This is why §8 moves the engine-bound packages first (slices 3–10) and only runs the bare-specifier codemod at the end (slice 14) — by then the relative paths are intra-package and don't need rewriting.

## 7. dependency-cruiser config shape

Pin `dependency-cruiser@^16.10.0` (latest stable, v16 is the current major as of 2026-04). Config lives at repo root as `.dependency-cruiser.cjs`. Required rule sketches:

- **no-circular** — forbidden rule on `circular: true`, severity `error`.
- **no-upward-import** — four `forbidden` rules, one per public layer. Example: *from* `packages/engine/src` *to* `packages/(primitives|headless|styled)/src` → error. Mirror for primitives→(headless|styled), headless→styled.
- **no-relative-cross-package** — `forbidden` rule matching paths like `^packages/([^/]+)/src/.*` importing `^packages/(?!\\1)([^/]+)/src/.*` via relative specifier (`../../`). Implements REQ-PB-006.
- **no-same-layer-lateral** — in Phase 1 there is exactly one package per layer, so the rule is trivially satisfied. Config includes it as a placeholder with comment: "Invariant during Phase 1; becomes operational when layer sibling packages are introduced (none planned)."
- **no-orphans** — OPT-IN, severity `warn`. Catches dead code but doesn't fail CI.

Options block: `{ tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } }`. Script in root `package.json`: `"lint:boundaries": "depcruise packages --config .dependency-cruiser.cjs"`. Exit code is non-zero on any `error`-severity match, satisfying REQ-PB-007.

## 8. Operational order (commit slicing)

Solo founder, no branches. Each slice = one commit; repo MUST typecheck at every commit (`bun run typecheck`). Typecheck is the safety gate; `bun test` is run at the end of risky slices (14, 15).

| # | Commit | Risk | Notes |
|---|---|---|---|
| 1 | `chore: remove @tge/windowing package and its two examples` | low | Delete `packages/windowing/`, `examples/windowing-demo.tsx`, `examples/window-drag-repro.tsx`. Remove from root `package.json` workspaces if listed. |
| 2 | `chore(engine,primitives,headless,styled,internal-devtools): scaffold empty package roots` | low | Create 5 dirs with `package.json` (name only, no deps), `tsconfig.json`, `src/public.ts` (empty), `src/index.ts` (re-export from public). Register in root `workspaces`. |
| 3 | `refactor(engine): fold @tge/core into engine/src/ffi` | low | `git mv packages/core/src packages/engine/src/ffi`. Delete `packages/core/`. Leave `@tge/core` imports intact — engine re-exports ffi via public.ts temporarily? No — cleaner: engine package is not yet imported; typecheck passes because nothing imports `@vexart/engine` yet and `@tge/core` still exists as an empty stub? **Correction**: after git mv, `packages/core/package.json` is gone; callers of `@tge/core` break. Safer approach: slices 3–13 each keep a thin re-export shim at the old `@tge/X` path until slice 14 rewrites consumers. **This shim pattern is the default throughout slices 3–13.** |
| 4 | `refactor(engine): fold @tge/runtime into engine/src/reconciler + engine/src/loop` | medium | Split by directory: `runtime/src/reconciler.ts` → `engine/src/reconciler/`, `runtime/src/loop.ts` + `walkTree.ts` → `engine/src/loop/`. Keep shim. |
| 5 | `refactor(engine): fold @tge/input into engine/src/input + engine/src/hooks` | medium | Split parsing vs hooks by file role. |
| 6 | `refactor(engine): fold @tge/terminal + platform-terminal into engine/src/terminal` | low | Double move. |
| 7 | `refactor(engine): fold @tge/output + output-kitty into engine/src/output` | low | Double move. |
| 8 | `refactor(engine): fold @tge/renderer-solid + renderer into engine/src/reconciler` | low | Double move; merge index barrels. |
| 9 | `refactor(engine): fold @tge/pixel into engine/src/paint-legacy` | low | Flagged temporary (§9, §10). |
| 10 | `refactor(engine): fold @tge/layout-clay + gpu stubs into engine` | low | Each into its sibling dir. |
| 11 | `refactor(primitives,headless): split @tge/components per §4 table` | **HIGH** | Misclassification is the main risk. Verify against §4 table file-by-file. Regenerate both `index.ts` barrels. |
| 12 | `refactor(styled): fold @tge/void into @vexart/styled` | medium | Subdirectorize per ARCH §3.4. |
| 13 | `refactor(internal-devtools): rename @tge/devtools to @vexart/internal-devtools` | low | Mark `"private": true`. |
| 14 | `refactor: rewrite all @tge/* imports to @vexart/*` | **HIGH** | Global codemod across `packages/`, `examples/`, `scripts/`, `solid-plugin.ts`, `tsconfig.json`. Drop shim packages. Component split requires per-symbol routing (see §6). |
| 15 | `chore(deps): declare workspace:* dependencies on all new packages` | medium | Edit each `package.json`. Run `bun install`. Typecheck. |
| 16 | `chore(lint): add dependency-cruiser config and lint:boundaries script` | low | Verify passes. |
| 17 | `chore: rename root package to vexart and update tsconfig paths` | low | Root `package.json` name → `vexart`; `tsconfig.json` paths → `@vexart/*`. |
| 18 | `chore(ci): run typecheck + test + lint:boundaries as verification` | low | Final green commit. |

Slices 11 and 14 are the high-risk commits. If a slice fails typecheck, revert at that commit boundary — all earlier slices remain good.

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Circular dependency discovered mid-consolidation | Medium | High | dependency-cruiser no-circular rule runs on every commit from slice 16; if a cycle appears during slices 3–13 it is caught by `bun run typecheck` (TS errors surface most cycles); for cycles that only depcruise catches, revert slice and refactor |
| Import rewrite misses a file | Medium | High | Codemod script logs every file touched; after slice 14, run `rg "@tge/" packages examples scripts solid-plugin.ts tsconfig.json` and expect zero matches; failing `bun run typecheck` also catches orphan imports |
| `paint-legacy/` creates confusion vs deleting now | Low | Low | See §10 deviation register — documented as Phase 1-only, annotated in `engine/src/paint-legacy/README.md`, explicit Phase 2 removal ticket |
| Component split misclassifies a file | Medium | High | §4 table is explicit per-file; slice 11 reviewed file-by-file against REQ-PB-008; barrel re-exports mean misplacement surfaces as a TS import error in slice 14, not a silent runtime bug |
| `git mv` broken on case-insensitive macOS filesystem | Low | Low | All renames are case-preserving, no casing flip; if a rename changes case (e.g., `RichText.tsx` → `rich-text.tsx`), use the two-step `git mv Foo.tsx foo.tmp && git mv foo.tmp foo.tsx` pattern |
| `tsc` memory blowup during large refactor | Low | Medium | Typecheck is incremental; if it spikes, run per-package with `tsc --noEmit -p packages/engine/tsconfig.json` and serialize |
| Examples / scripts not caught by codemod | Medium | Medium | Slice 14 explicitly globs `examples/`, `scripts/`, `solid-plugin.ts`; post-slice `rg "@tge/"` assertion is the gate |
| `space-background.ts` depends on Zig paint and breaks after pixel fold | Medium | Low | Flagged in §11 Open Q2; default action is delete in slice 11 (it is only used by `examples/space-demo.tsx` if that example exists; otherwise no consumer) |
| Shim-package pattern leaves dead `@tge/*` packages through slices 3–13 | Medium | Low | Shims are deleted in slice 14 along with the codemod; slice 14 includes removal of `packages/core|runtime|input|…` root entries from workspace and filesystem |
| Dependency-cruiser rule regex wrong → false negatives | Low | High | Slice 16 includes a positive test: temporarily add a bad import, confirm lint fails, revert; keep test as a `scripts/test-depcruise.ts` smoke check |

## 10. Deviations from ARCHITECTURE.md

| Deviation | Justification | Resolved in |
|---|---|---|
| No `@vexart/internal-atlas-gen` package (ARCH §2.2, §3.5) | MSDF pipeline arrives in Phase 2b per `docs/PRD.md §12 DEC-008`; no atlas tooling exists yet | Phase 2b |
| No `@vexart/internal-benchmarks` package (ARCH §2.2, §3.5) | Benchmark suite is a Phase 4 deliverable | Phase 4 |
| `@vexart/engine/src/paint-legacy/` exists (not in ARCH §3.1) | Holds Zig-backed `@tge/pixel` sources until Phase 2 replaces with Rust WGPU paint. Moving vs deleting now is defensible because (a) DEC-006 requires `@tge/pixel` gone in Phase 1, (b) deleting its content wholesale in Phase 1 breaks current showcase/examples that still render via the Zig path, (c) Phase 2 is the *only* phase with the authority per DEC-004 to remove the Zig pipeline, (d) the quarantine name `paint-legacy/` + a README warning ensures nobody imports new code from it. Deleting the package identity (as required by REQ-PB-003) while preserving the source under a clearly-marked temp path is the only option that satisfies both constraints. | Phase 2 (DEC-004) |
| `@vexart/engine/src/loop/` contains Clay-era files (not pure ARCH §3.1 shape) | `@tge/layout-clay` stub and loop/walkTree that calls Clay must survive until Taffy lands. Loop decomposition into `walk-tree.ts`/`layout.ts`/`assign-layers.ts`/`paint.ts`/`composite.ts`/`output.ts` is a Phase 3 task per Appendix A | Phase 2 (Clay removal) + Phase 3 (loop decomposition) |
| `@vexart/engine/src/ffi/` contains Zig + Clay + wgpu-bridge loaders, not a single `libvexart` | Triple-binary consolidation is the central Phase 2 work per DEC-004 | Phase 2 |
| `@vexart/engine/src/` lacks `scheduler/`, `animation/`, `resources/`, `debug/` directories from ARCH §3.1 | Per `rules.design`: scaffolding only creates directories that actually receive files in Phase 1. These arrive in Phase 2b/3 | Phase 2b (animation, resources) + Phase 3 (scheduler, debug) |
| `@vexart/headless/src/containers/` includes `overlay-root.tsx` (not in ARCH §3.3 enumeration) | Supporting infrastructure for Portal/Dialog/Tooltip overlays; ARCH §3.3 lists Portal but not the overlay root it mounts into. Placement follows Portal's directory | Reviewed in Phase 3 when overlay/portal system is audited |
| `@vexart/headless/src/display/` contains `code.tsx` and `markdown.tsx` but not `badge`/`avatar`/`skeleton`/`separator` (ARCH §3.3) | Those four components exist only in `@tge/void` (styled layer) today; no headless sibling exists. Creating headless versions is new work, out of scope for pure consolidation | Phase 3 when headless parity with styled is audited |
| `@vexart/headless/src/overlays/popover.tsx` absent (ARCH §3.3) | `@tge/void/popover.tsx` is the only popover today, stays in styled | Phase 3 (create headless version) |
| Root `package.json` renamed to `vexart` before native consolidation | Needed now so every downstream change uses the new name; `libvexart` arrives in Phase 2 | Phase 2 (matches native name) |

## 11. Open questions

**Q1 — `scene-canvas.tsx` classification.** The file is a 2D scene graph on top of `<surface>` with reactive state and hit-testing. It is not enumerated in `docs/ARCHITECTURE.md §3.3`. Default: route to `@vexart/headless/src/display/` (it is display-adjacent, stateful, ctx-less). Founder decision: confirm or redirect to a new `graphics/` directory, or deprecate alongside `space-background.ts`.

**Q2 — `space-background.ts` fate.** The file imports from `@tge/pixel` (Zig starfield/nebula primitives), is a `.ts` module (not a component), and is not referenced in ARCH. Consumed only by demo code. Default action in slice 11: **DELETE**, since the Zig pipeline it relies on dies in Phase 2 regardless. Founder decision: confirm deletion, or move to `examples/` as a non-library fixture per ARCH Appendix A row "starfield / nebula Zig primitives → Moved to examples/ or deleted".

**Q3 — Dialog/Popover duplication.** `@tge/components/dialog.tsx` (headless) and `@tge/void/dialog.tsx` (styled) coexist today. The plan routes the former to `@vexart/headless` and the latter to `@vexart/styled`. Founder confirm: styled Dialog should wrap headless Dialog, not duplicate logic. No Phase 1 refactor, but flag for Phase 3.

**Q4 — Shim-package strategy during slices 3–13.** The operational plan in §8 keeps a thin re-export shim at each old `@tge/X` path through slices 3–13, then drops them in slice 14. Alternative: batch all moves as a single slice to skip shims. Founder decision: solo-founder `main`-branch workflow favors smaller slices; shim strategy recommended. Confirm.
