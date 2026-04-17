# Tasks: Phase 1 — Structural Cleanup and Four-Layer Consolidation

## Overview

This document breaks the Phase 1 structural cleanup into 18 commit slices following `design.md §8`. Slices 1–2 delete the windowing package and scaffold five new package roots. Slices 3–10 fold existing `@tge/*` packages into `@vexart/engine` using a **shim pattern**: each old `@tge/X` path keeps a thin re-export shim so every intermediate commit leaves `bun run typecheck` green. Slice 11 splits `@tge/components` into primitives + headless (HIGH risk). Slice 12 folds void into styled. Slice 13 renames devtools. Slice 14 performs the global codemod that rewrites all `@tge/*` imports to `@vexart/*` and drops every shim (HIGH risk). Slices 15–18 declare workspace dependencies, wire dependency-cruiser, update root identity, and run final verification.

**Hard invariant**: every slice (except 18) ends with `bun install && bun run typecheck` passing before the commit is created.

**Founder-resolved constraints** (from open questions Q1–Q4):
- **Q1**: `scene-canvas.tsx` → DELETED. Do NOT move to headless/display.
- **Q2**: `space-background.ts` → DELETED. Also audit and delete `examples/nebula-demo.tsx` (imports `createSpaceBackground`) and `examples/scene-test.tsx` (imports `SceneCanvas`).
- **Q3**: Dialog/Popover duplication between components and void → POSTPONED to Phase 3. Move `components/dialog.tsx` → headless, `void/dialog.tsx` → styled. Do NOT refactor for composition.
- **Q4**: Shim-package strategy → CONFIRMED. Slices 3–13 keep thin re-export shims. All shims dropped in slice 14.

## 1. Delete @tge/windowing and its examples (slice 1)

- [x] 1.1 Delete `packages/windowing/` directory entirely (REQ-PB-003)
- [x] 1.2 Delete `examples/windowing-demo.tsx` (REQ-PB-003)
- [x] 1.3 Delete `examples/window-drag-repro.tsx` (REQ-PB-003)
- [x] 1.4 Remove all `@tge/windowing` re-exports from `packages/components/src/index.ts` (lines 48–49 and lines 88–90) — these are the `export { createWindowManager, ... }` and `export type { ... }` blocks that reference `@tge/windowing`
- [x] 1.5 Remove `"demo17"` and `"demo18"` scripts from root `package.json` (they reference the deleted examples)
- [x] 1.6 Remove `@tge/windowing` path mapping from `tsconfig.json` (line 29)
- [x] 1.7 Run `bun install && bun run typecheck` — must be green
- [x] 1.8 Commit: `chore: remove @tge/windowing package and its two examples`

## 2. Scaffold five new package roots (slice 2)

- [x] 2.1 Create `packages/engine/` with `package.json` (name: `@vexart/engine`, no deps), `tsconfig.json` inheriting root config, `src/public.ts` (empty), `src/index.ts` (`export * from "./public"`)
- [x] 2.2 Create `packages/primitives/` with same shape (name: `@vexart/primitives`)
- [x] 2.3 Create `packages/headless/` with same shape (name: `@vexart/headless`)
- [x] 2.4 Create `packages/styled/` with same shape (name: `@vexart/styled`)
- [x] 2.5 Create `packages/internal-devtools/` with same shape + `"private": true` (name: `@vexart/internal-devtools`)
- [x] 2.6 Add path mappings to `tsconfig.json` for all five `@vexart/*` packages pointing to their `src/index.ts`
- [x] 2.7 Run `bun install && bun run typecheck` — must be green (new packages have no consumers yet)
- [x] 2.8 Commit: `chore(engine,primitives,headless,styled,internal-devtools): scaffold empty package roots`

## 3. Fold @tge/core into engine/src/ffi (slice 3)

- [x] 3.1 `git mv packages/core/src packages/engine/src/ffi` — moves all 21 source files from core into engine's ffi directory (REQ-PB-010)
- [x] 3.2 Update all internal imports within the moved files — any relative cross-references between the moved files remain valid (they moved as a unit), but verify no references to `../../<other-package>/src/` remain; if found, rewrite to use the tsconfig path alias for the other package
- [x] 3.3 Update `packages/engine/src/public.ts` to re-export all symbols that `packages/core/src/index.ts` previously exported (reference the moved `ffi/index.ts`)
- [x] 3.4 Update `packages/engine/src/index.ts` to re-export from `./public`
- [x] 3.5 Create shim: new `packages/core/src/index.ts` containing `export * from "@vexart/engine"`. Update `packages/core/package.json` to add `@vexart/engine: "workspace:*"` in dependencies
- [x] 3.6 Verify `tsconfig.json` still has `@tge/core` path mapping pointing to `packages/core/src/index.ts` (shim) — it does; confirm no change needed
- [x] 3.7 Run `bun install && bun run typecheck` — must be green (all old `@tge/core` consumers resolve through the shim)
- [x] 3.8 Commit: `refactor(engine): fold @tge/core into engine/src/ffi with shim`

## 4. Fold @tge/runtime into engine/src/reconciler + loop (slice 4)

- [x] 4.1 Create `packages/engine/src/reconciler/` and `packages/engine/src/loop/` directories
- [x] 4.2 Classify runtime source files: reconciler-bound files (`router.ts`, `pointer.ts`, `selection.ts`, `hover.ts`, `hit-test.ts`, `interaction.ts`, `focus.ts`, `drag.ts`, `extmarks.ts`, `dirty.ts`, `handle.ts`, `data.ts`) → `engine/src/reconciler/`; loop-bound files (`loop.ts`, `input.ts`, `scroll.ts`, `image.ts`, `frame-scheduler.ts`, `animation.ts`, `debug.ts`) → `engine/src/loop/`; tree-sitter directory (`tree-sitter/`) → `engine/src/reconciler/tree-sitter/` (syntax highlighting is reconciler-adjacent)
- [x] 4.3 `git mv` each runtime source file to its classified destination (one command per file group for atomicity)
- [x] 4.4 Update all internal imports within the moved files — relative paths between runtime files that are now split across `reconciler/` and `loop/` must be updated (e.g., `./loop` becomes `../loop/loop`, `./focus` becomes `../reconciler/focus`)
- [x] 4.5 Create `packages/engine/src/reconciler/index.ts` barrel that re-exports all symbols from files in this directory
- [x] 4.6 Create `packages/engine/src/loop/index.ts` barrel that re-exports all symbols from files in this directory
- [x] 4.7 Update `packages/engine/src/public.ts` to re-export the reconciler and loop symbols that `@tge/runtime` previously exposed
- [x] 4.8 Create shim: rewrite `packages/runtime/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/runtime/package.json` to add `@vexart/engine: "workspace:*"` dependency. Delete any remaining source files in `packages/runtime/src/` that were moved (the old barrel and moved files)
- [x] 4.9 Run `bun install && bun run typecheck` — must be green
- [x] 4.10 Commit: `refactor(engine): fold @tge/runtime into engine/src/reconciler + loop with shim`

## 5. Fold @tge/input into engine/src/input + hooks (slice 5)

- [x] 5.1 Create `packages/engine/src/input/` and `packages/engine/src/hooks/` directories
- [x] 5.2 Classify input source files: parsing/dispatch files (`parser.ts`, `mouse.ts`, `keyboard.ts`, `types.ts`) → `engine/src/input/`; no hook files exist in `@tge/input` currently (hooks like `useKeyboard`/`useMouse`/`useFocus` live in runtime). Move all input source files to `engine/src/input/`
- [x] 5.3 `git mv packages/input/src/parser.ts packages/input/src/mouse.ts packages/input/src/keyboard.ts packages/input/src/types.ts packages/engine/src/input/`
- [x] 5.4 Move tests: `git mv packages/input/src/mouse.test.ts packages/input/src/parser.test.ts packages/input/src/keyboard.test.ts packages/engine/src/input/`
- [x] 5.5 Create `packages/engine/src/input/index.ts` barrel re-exporting all input symbols
- [x] 5.6 Update internal imports within moved files — verify no broken relative paths
- [x] 5.7 Update `packages/engine/src/public.ts` to re-export input symbols
- [x] 5.8 Create shim: rewrite `packages/input/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/input/package.json` to add `@vexart/engine: "workspace:*"` dependency. Delete remaining moved files from old location
- [x] 5.9 Run `bun install && bun run typecheck` — must be green
- [x] 5.10 Commit: `refactor(engine): fold @tge/input into engine/src/input + hooks with shim`

## 6. Fold @tge/terminal + platform-terminal into engine/src/terminal (slice 6)

- [x] 6.1 Create `packages/engine/src/terminal/` directory
- [x] 6.2 `git mv packages/terminal/src/*.ts packages/engine/src/terminal/` — moves `index.ts`, `detect.ts`, `size.ts`, `lifecycle.ts`, `caps.ts`, `tmux.ts`
- [x] 6.3 `git mv packages/platform-terminal/src/index.ts packages/engine/src/terminal/platform.ts` — platform-terminal is a single-file stub; rename to avoid collision with terminal's index.ts
- [x] 6.4 Update internal imports within moved files — `platform.ts` may import from `@tge/terminal` (now sibling); update to relative `./` paths or keep bare `@tge/terminal` (shim still exists)
- [x] 6.5 Create `packages/engine/src/terminal/index.ts` barrel re-exporting all terminal + platform symbols
- [x] 6.6 Update `packages/engine/src/public.ts` to re-export terminal symbols
- [x] 6.7 Create shim for `@tge/terminal`: rewrite `packages/terminal/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/terminal/package.json` to add `@vexart/engine: "workspace:*"` dependency
- [x] 6.8 Create shim for `@tge/platform-terminal`: rewrite `packages/platform-terminal/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/platform-terminal/package.json` to add `@vexart/engine: "workspace:*"` dependency
- [x] 6.9 Run `bun install && bun run typecheck` — must be green
- [x] 6.10 Commit: `refactor(engine): fold @tge/terminal + platform-terminal into engine/src/terminal with shim`

## 7. Fold @tge/output + output-kitty into engine/src/output (slice 7)

- [x] 7.1 Create `packages/engine/src/output/` directory
- [x] 7.2 `git mv packages/output/src/*.ts packages/engine/src/output/` — moves `index.ts`, `kitty.ts`, `kitty-shm-native.ts`, `layer-composer.ts`, `transport-manager.ts`
- [x] 7.3 `git mv packages/output-kitty/src/index.ts packages/engine/src/output/kitty-stub.ts` — output-kitty is a single-file stub; rename to avoid collision
- [x] 7.4 Update internal imports within moved files — fix any cross-package relative paths
- [x] 7.5 Create `packages/engine/src/output/index.ts` barrel re-exporting all output symbols
- [x] 7.6 Update `packages/engine/src/public.ts` to re-export output symbols
- [x] 7.7 Create shim for `@tge/output`: rewrite `packages/output/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/output/package.json` to add `@vexart/engine: "workspace:*"` dependency. Delete remaining moved files from old location
- [x] 7.8 Create shim for `@tge/output-kitty`: rewrite `packages/output-kitty/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/output-kitty/package.json` to add `@vexart/engine: "workspace:*"` dependency
- [x] 7.9 Run `bun install && bun run typecheck` — must be green
- [x] 7.10 Commit: `refactor(engine): fold @tge/output + output-kitty into engine/src/output with shim`

## 8. Fold @tge/renderer-solid + renderer into engine/src/reconciler (slice 8)

- [x] 8.1 `git mv packages/renderer-solid/src/reconciler.ts packages/renderer-solid/src/plugins.ts packages/renderer-solid/src/jsx.d.ts packages/engine/src/reconciler/` — move core reconciler files
- [x] 8.2 Move renderer tests: `git mv packages/renderer/src/handle.test.ts packages/renderer/src/node.test.ts packages/engine/src/reconciler/`
- [x] 8.3 Update internal imports within moved reconciler files — `renderer-solid/src/index.ts` had relative imports to `../../runtime/src/index`, `../../runtime/src/input`, `../../core/src/index`, etc. Now that runtime and core are in engine, update these to relative paths like `../loop/index`, `../reconciler/input`, `../ffi/index`
- [x] 8.4 Update `packages/engine/src/reconciler/index.ts` barrel to include the new reconciler files and their exports
- [x] 8.5 Update `packages/engine/src/public.ts` to re-export reconciler symbols (SolidJS control flow, mount, createComponent, createElement, etc.)
- [x] 8.6 Create shim for `@tge/renderer-solid`: rewrite `packages/renderer-solid/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/renderer-solid/package.json` to add `@vexart/engine: "workspace:*"` dependency. Delete moved files from old location
- [x] 8.7 Create shim for `@tge/renderer`: rewrite `packages/renderer/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/renderer/package.json` to add `@vexart/engine: "workspace:*"` dependency (note: renderer had no index.ts, only tests — create a minimal shim)
- [x] 8.8 Run `bun install && bun run typecheck` — must be green
- [x] 8.9 Commit: `refactor(engine): fold @tge/renderer-solid + renderer into engine/src/reconciler with shim`

## 9. Fold @tge/pixel into engine/src/paint-legacy (slice 9)

- [x] 9.1 Create `packages/engine/src/paint-legacy/` directory
- [x] 9.2 `git mv packages/pixel/src/*.ts packages/engine/src/paint-legacy/` — moves `index.ts`, `ffi.ts`, `composite.ts`, `buffer.ts`, `dirty.ts`, and test files
- [x] 9.3 Update internal imports within moved files — `ffi.ts` likely imports from `@tge/core` (now `@vexart/engine`); update accordingly. Since both are now in the same package, convert cross-module imports to relative paths (e.g., `../ffi/`)
- [x] 9.4 Create `packages/engine/src/paint-legacy/README.md` with warning: "TEMPORARY — Phase 1 only. Deleted wholesale in Phase 2 per DEC-004. Do not add new imports from this directory."
- [x] 9.5 Create `packages/engine/src/paint-legacy/index.ts` barrel if not already the moved one
- [x] 9.6 Update `packages/engine/src/public.ts` to re-export paint-legacy symbols
- [x] 9.7 Create shim: rewrite `packages/pixel/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/pixel/package.json` to add `@vexart/engine: "workspace:*"` dependency. Delete remaining moved files from old location
- [x] 9.8 Run `bun install && bun run typecheck` — must be green
- [x] 9.9 Commit: `refactor(engine): fold @tge/pixel into engine/src/paint-legacy with shim`

## 10. Fold @tge/layout-clay + gpu stubs into engine (slice 10)

- [x] 10.1 `git mv packages/layout-clay/src/index.ts packages/engine/src/loop/clay-layout.ts` — layout-clay is a single-file stub; rename to descriptive name in loop/ directory
- [x] 10.2 `git mv packages/gpu/src/index.ts packages/engine/src/ffi/gpu-stub.ts` — gpu is a single-file stub; rename to descriptive name in ffi/ directory
- [x] 10.3 Update internal imports within moved files — verify no broken references
- [x] 10.4 Update `packages/engine/src/loop/index.ts` barrel to include clay-layout exports
- [x] 10.5 Update `packages/engine/src/ffi/index.ts` barrel to include gpu-stub exports (or merge into existing ffi barrel)
- [x] 10.6 Update `packages/engine/src/public.ts` to re-export any new symbols
- [x] 10.7 Create shim for `@tge/layout-clay`: rewrite `packages/layout-clay/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/layout-clay/package.json` to add `@vexart/engine: "workspace:*"` dependency
- [x] 10.8 Create shim for `@tge/gpu`: rewrite `packages/gpu/src/index.ts` to `export * from "@vexart/engine"`. Update `packages/gpu/package.json` to add `@vexart/engine: "workspace:*"` dependency
- [x] 10.9 Run `bun install && bun run typecheck` — must be green
- [x] 10.10 Commit: `refactor(engine): fold @tge/layout-clay + gpu stubs into engine with shim`

## 11. Split @tge/components per design §4 table (slice 11) — ⚠️ HIGH RISK

> **Risk**: Misclassification of components between primitives and headless. Every file is verified against the explicit table in `design.md §4`. Founder-resolved: `scene-canvas.tsx` is DELETED (not moved); `space-background.ts` is DELETED (not moved).

- [x] 11.1 **Delete `scene-canvas.tsx`**: Remove `packages/components/src/scene-canvas.tsx` (founder Q1: DEPRECATED, no replacement in Phase 1)
- [x] 11.2 **Delete `space-background.ts`**: Remove `packages/components/src/space-background.ts` (founder Q2: DELETED)
- [x] 11.3 **Audit examples for deleted files**: `rg "createSpaceBackground\|SpaceBackground\|SceneCanvas\|SceneNode\|SceneEdge\|SceneParticles\|SceneOverlay" examples/`. Delete `examples/nebula-demo.tsx` (imports `createSpaceBackground`) and `examples/scene-test.tsx` (imports `SceneCanvas`). Remove any root `package.json` scripts referencing these files if they exist
- [x] 11.4 **Create headless subdirectory structure** in `packages/headless/src/`: `inputs/`, `display/`, `containers/`, `collections/`, `overlays/`, `navigation/`, `forms/`
- [x] 11.5 **Move primitives files** (4 files → `packages/primitives/src/`):
  - `git mv packages/components/src/box.tsx packages/primitives/src/box.tsx`
  - `git mv packages/components/src/text.tsx packages/primitives/src/text.tsx`
  - `git mv packages/components/src/rich-text.tsx packages/primitives/src/rich-text.tsx`
  - `git mv packages/components/src/wrap-row.tsx packages/primitives/src/wrap-row.tsx`
- [x] 11.6 **Move headless inputs/** (9 files):
  - `git mv packages/components/src/button.tsx packages/headless/src/inputs/button.tsx`
  - `git mv packages/components/src/checkbox.tsx packages/headless/src/inputs/checkbox.tsx`
  - `git mv packages/components/src/switch.tsx packages/headless/src/inputs/switch.tsx`
  - `git mv packages/components/src/radio-group.tsx packages/headless/src/inputs/radio-group.tsx`
  - `git mv packages/components/src/input.tsx packages/headless/src/inputs/input.tsx`
  - `git mv packages/components/src/textarea.tsx packages/headless/src/inputs/textarea.tsx`
  - `git mv packages/components/src/slider.tsx packages/headless/src/inputs/slider.tsx`
  - `git mv packages/components/src/select.tsx packages/headless/src/inputs/select.tsx`
  - `git mv packages/components/src/combobox.tsx packages/headless/src/inputs/combobox.tsx`
- [x] 11.7 **Move headless display/** (3 files):
  - `git mv packages/components/src/progress-bar.tsx packages/headless/src/display/progress-bar.tsx`
  - `git mv packages/components/src/code.tsx packages/headless/src/display/code.tsx`
  - `git mv packages/components/src/markdown.tsx packages/headless/src/display/markdown.tsx`
- [x] 11.8 **Move headless containers/** (4 files):
  - `git mv packages/components/src/scroll-view.tsx packages/headless/src/containers/scroll-view.tsx`
  - `git mv packages/components/src/tabs.tsx packages/headless/src/containers/tabs.tsx`
  - `git mv packages/components/src/portal.tsx packages/headless/src/containers/portal.tsx`
  - `git mv packages/components/src/overlay-root.tsx packages/headless/src/containers/overlay-root.tsx`
- [x] 11.9 **Move headless collections/** (3 files):
  - `git mv packages/components/src/list.tsx packages/headless/src/collections/list.tsx`
  - `git mv packages/components/src/virtual-list.tsx packages/headless/src/collections/virtual-list.tsx`
  - `git mv packages/components/src/table.tsx packages/headless/src/collections/table.tsx`
- [x] 11.10 **Move headless overlays/** (3 files):
  - `git mv packages/components/src/dialog.tsx packages/headless/src/overlays/dialog.tsx`
  - `git mv packages/components/src/tooltip.tsx packages/headless/src/overlays/tooltip.tsx`
  - `git mv packages/components/src/toast.tsx packages/headless/src/overlays/toast.tsx`
- [x] 11.11 **Move headless navigation/** (2 files):
  - `git mv packages/components/src/router.tsx packages/headless/src/navigation/router.tsx`
  - `git mv packages/components/src/diff.tsx packages/headless/src/navigation/diff.tsx`
- [x] 11.12 **Move headless forms/** (1 file):
  - `git mv packages/components/src/form.tsx packages/headless/src/forms/form.tsx`
- [x] 11.13 **Update internal imports in moved files** — each moved file imports from `@tge/renderer-solid`, `@tge/core`, `@tge/runtime`, etc. Leave these as bare `@tge/*` imports for now (shims still exist). Fix any relative imports that broke due to the move (e.g., `./overlay-root` → `../containers/overlay-root` if cross-referenced)
- [x] 11.14 **Generate `packages/primitives/src/index.ts`** barrel re-exporting: `Box`, `Text`, `RichText`, `Span`, `WrapRow` plus all type exports from the 4 primitive files
- [x] 11.15 **Generate `packages/primitives/src/public.ts`** re-exporting from `./index`
- [x] 11.16 **Generate subdirectory barrels for headless**: create `inputs/index.ts`, `display/index.ts`, `containers/index.ts`, `collections/index.ts`, `overlays/index.ts`, `navigation/index.ts`, `forms/index.ts` — each re-exports its directory's symbols
- [x] 11.17 **Generate `packages/headless/src/index.ts`** barrel re-exporting all subdirectory barrels plus any root-level exports. Include all type exports. Exclude `scene-canvas`, `space-background`, and all windowing symbols
- [x] 11.18 **Generate `packages/headless/src/public.ts`** re-exporting from `./index`
- [x] 11.19 **Create shim**: rewrite `packages/components/src/index.ts` to re-export from both `@vexart/primitives` and `@vexart/headless`. Update `packages/components/package.json` to add both as `workspace:*` dependencies. The shim must export all symbols that the old barrel exported (minus deleted scene-canvas, space-background, and windowing symbols)
- [x] 11.20 **Remove `@tge/windowing` re-exports from components shim** — these were already removed in slice 1; verify they are absent
- [x] 11.21 Run `bun install && bun run typecheck` — must be green
- [x] 11.22 Commit: `refactor(primitives,headless): split @tge/components per design §4 table`

## 12. Fold @tge/void into @vexart/styled (slice 12)

- [x] 12.1 Create subdirectory structure in `packages/styled/src/`: `tokens/`, `theme/`, `components/`, `typography/`
- [x] 12.2 `git mv packages/void/src/tokens.ts packages/styled/src/tokens/tokens.ts`
- [x] 12.3 `git mv packages/void/src/theme.ts packages/styled/src/theme/theme.ts`
- [x] 12.4 `git mv packages/void/src/typography.tsx packages/styled/src/typography/typography.tsx`
- [x] 12.5 Move all styled component files to `packages/styled/src/components/`:
  - `git mv packages/void/src/button.tsx packages/styled/src/components/button.tsx`
  - `git mv packages/void/src/card.tsx packages/styled/src/components/card.tsx`
  - `git mv packages/void/src/badge.tsx packages/styled/src/components/badge.tsx`
  - `git mv packages/void/src/avatar.tsx packages/styled/src/components/avatar.tsx`
  - `git mv packages/void/src/skeleton.tsx packages/styled/src/components/skeleton.tsx`
  - `git mv packages/void/src/separator.tsx packages/styled/src/components/separator.tsx`
  - `git mv packages/void/src/dialog.tsx packages/styled/src/components/dialog.tsx`
  - `git mv packages/void/src/select.tsx packages/styled/src/components/select.tsx`
  - `git mv packages/void/src/switch.tsx packages/styled/src/components/switch.tsx`
  - `git mv packages/void/src/checkbox.tsx packages/styled/src/components/checkbox.tsx`
  - `git mv packages/void/src/radio-group.tsx packages/styled/src/components/radio-group.tsx`
  - `git mv packages/void/src/slider.tsx packages/styled/src/components/slider.tsx`
  - `git mv packages/void/src/combobox.tsx packages/styled/src/components/combobox.tsx`
  - `git mv packages/void/src/dropdown-menu.tsx packages/styled/src/components/dropdown-menu.tsx`
  - `git mv packages/void/src/popover.tsx packages/styled/src/components/popover.tsx`
  - `git mv packages/void/src/progress.tsx packages/styled/src/components/progress.tsx`
  - `git mv packages/void/src/input.tsx packages/styled/src/components/input.tsx`
  - `git mv packages/void/src/tabs.tsx packages/styled/src/components/tabs.tsx`
  - `git mv packages/void/src/table.tsx packages/styled/src/components/table.tsx`
  - `git mv packages/void/src/toast.tsx packages/styled/src/components/toast.tsx`
  - `git mv packages/void/src/tooltip.tsx packages/styled/src/components/tooltip.tsx`
- [x] 12.6 Update internal imports within moved files — leave `@tge/*` bare imports as-is (shims exist). Fix any relative paths broken by the move
- [x] 12.7 Create subdirectory barrels: `tokens/index.ts`, `theme/index.ts`, `components/index.ts`, `typography/index.ts`
- [x] 12.8 Generate `packages/styled/src/index.ts` barrel re-exporting all subdirectory barrels, matching the old `@tge/void` export surface
- [x] 12.9 Update `packages/styled/src/public.ts` to re-export from `./index`
- [x] 12.10 Create shim: rewrite `packages/void/src/index.ts` to `export * from "@vexart/styled"`. Update `packages/void/package.json` to add `@vexart/styled: "workspace:*"` dependency. Delete moved files from old location
- [x] 12.11 Run `bun install && bun run typecheck` — must be green
- [x] 12.12 Commit: `refactor(styled): fold @tge/void into @vexart/styled with shim`

## 13. Rename @tge/devtools to @vexart/internal-devtools (slice 13)

- [x] 13.1 `git mv packages/devtools/src/kitty.ts packages/internal-devtools/src/kitty.ts`
- [x] 13.2 `git mv packages/devtools/src/server.ts packages/internal-devtools/src/server.ts`
- [x] 13.3 Update internal imports within moved files — verify no broken references
- [x] 13.4 Generate `packages/internal-devtools/src/index.ts` barrel re-exporting kitty and server symbols
- [x] 13.5 Update `packages/internal-devtools/src/public.ts` to re-export from `./index`
- [x] 13.6 Update `packages/internal-devtools/package.json`: set `"private": true`, ensure name is `@vexart/internal-devtools` (REQ-PB-002)
- [x] 13.7 Create shim: rewrite `packages/devtools/src/index.ts` to `export * from "@vexart/internal-devtools"`. Update `packages/devtools/package.json` to add `@vexart/internal-devtools: "workspace:*"` dependency. Delete moved files from old location
- [x] 13.8 Run `bun install && bun run typecheck` — must be green
- [x] 13.9 Commit: `refactor(internal-devtools): rename @tge/devtools to @vexart/internal-devtools with shim`

## 14. Rewrite all @tge/* imports to @vexart/* and drop shims (slice 14) — ⚠️ HIGH RISK

> **Risk**: Global codemod across the entire repo. Missing a file or misrouting a `@tge/components` import is the primary risk. The codemod is broken into sub-tasks to keep each step verifiable and reversible.

- [x] 14.1 **Rewrite engine-bound imports**: Replace all `from "@tge/core"`, `from "@tge/runtime"`, `from "@tge/input"`, `from "@tge/terminal"`, `from "@tge/output"`, `from "@tge/output-kitty"`, `from "@tge/renderer-solid"`, `from "@tge/renderer"`, `from "@tge/pixel"`, `from "@tge/gpu"`, `from "@tge/layout-clay"`, `from "@tge/platform-terminal"` with `from "@vexart/engine"` across `packages/`, `examples/`, `scripts/`
- [x] 14.2 **Rewrite component imports**: Replace all `from "@tge/components"` with the correct destination — symbols that live in `@vexart/primitives` (Box, Text, RichText, Span, WrapRow + their types) must import from `@vexart/primitives`; all other symbols must import from `@vexart/headless`. Use `rg -l "from \"@tge/components\""` to find all consumer files, then rewrite each file's import statement splitting primitives vs headless symbols per the §4 split table
- [x] 14.3 **Rewrite void imports**: Replace all `from "@tge/void"` with `from "@vexart/styled"` across `packages/`, `examples/`, `scripts/`
- [x] 14.4 **Rewrite devtools imports**: Replace all `from "@tge/devtools"` with `from "@vexart/internal-devtools"` across `packages/`, `examples/`, `scripts/`
- [x] 14.5 **Update `solid-plugin.ts`**: Replace any `@tge/*` references with `@vexart/*` equivalents
- [x] 14.6 **Update `tsconfig.json` paths**: Remove all `@tge/*` path mappings. Ensure all `@vexart/*` path mappings exist and point to correct `packages/*/src/index.ts` files. Add any missing: `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, `@vexart/styled`, `@vexart/internal-devtools`
- [x] 14.7 **Update root `package.json` scripts**: Replace any `@tge/*` references in script commands (e.g., `devtools` script references `packages/devtools/`) with `@vexart/*` equivalents (e.g., `packages/internal-devtools/`)
- [x] 14.8 **Rewrite cross-package relative imports**: Run `rg "from ['\"]\\.\\./\\.\\./" packages/` and replace any remaining cross-package relative imports with bare `@vexart/*` specifiers (REQ-PB-006)
- [x] 14.9 **Delete all shim package directories**: Remove `packages/core/`, `packages/runtime/`, `packages/input/`, `packages/terminal/`, `packages/output/`, `packages/output-kitty/`, `packages/renderer-solid/`, `packages/renderer/`, `packages/pixel/`, `packages/gpu/`, `packages/layout-clay/`, `packages/platform-terminal/`, `packages/components/`, `packages/void/`, `packages/devtools/` — these are now empty (only contained shims)
- [x] 14.10 **Remove old `@tge/*` path mappings from `tsconfig.json`** — should be empty after 14.6 but verify
- [x] 14.11 **Assert zero `@tge/` references**: Run `rg "@tge/" packages examples scripts solid-plugin.ts tsconfig.json` and expect ZERO matches. If any remain, fix before proceeding
- [x] 14.12 Run `bun install && bun run typecheck` — must be green
- [x] 14.13 Run `bun test` — must be green
- [x] 14.14 Commit: `refactor: rewrite all @tge/* imports to @vexart/* and drop shims`

## 15. Declare workspace:* dependencies on all new packages (slice 15)

- [ ] 15.1 **Audit `@vexart/engine`**: Run `rg "from ['\"]@vexart" packages/engine/src/` — engine MUST import zero `@vexart/*` packages (REQ-PB-004). If any found, this is a layer violation; fix before proceeding
- [ ] 15.2 **Audit `@vexart/primitives`**: Run `rg "from ['\"]@vexart" packages/primitives/src/` — primitives may import `@vexart/engine`. Add `"@vexart/engine": "workspace:*"` to `packages/primitives/package.json` dependencies
- [ ] 15.3 **Audit `@vexart/headless`**: Run `rg "from ['\"]@vexart" packages/headless/src/` — headless may import `@vexart/engine` and `@vexart/primitives`. Add both as `workspace:*` dependencies
- [ ] 15.4 **Audit `@vexart/styled`**: Run `rg "from ['\"]@vexart" packages/styled/src/` — styled may import `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`. Add all found as `workspace:*` dependencies
- [ ] 15.5 **Audit `@vexart/internal-devtools`**: Run `rg "from ['\"]@vexart" packages/internal-devtools/src/` — may depend on any public layer. Add found dependencies as `workspace:*`
- [ ] 15.6 Run `bun install` — must resolve all workspace references cleanly
- [ ] 15.7 Run `bun run typecheck` — must be green (REQ-PB-005)
- [ ] 15.8 Commit: `chore(deps): declare workspace:* dependencies on all new packages`

## 16. Add dependency-cruiser config and lint:boundaries script (slice 16)

- [ ] 16.1 Pin `dependency-cruiser@^16.10.0` as devDependency in root `package.json`. Run `bun install`
- [ ] 16.2 Create `.dependency-cruiser.cjs` at repo root with rules implementing REQ-PB-004, REQ-PB-006, REQ-PB-007:
  - **no-circular**: forbidden rule on `circular: true`, severity `error`
  - **no-upward-import** (4 rules): engine → (primitives|headless|styled) = error; primitives → (headless|styled) = error; headless → styled = error
  - **no-relative-cross-package**: forbidden rule matching `^packages/([^/]+)/src/.*` importing via relative `../../` into a different `packages/(?!\\1)` directory
  - **no-same-layer-lateral**: placeholder rule with comment "Invariant during Phase 1; becomes operational when layer sibling packages are introduced"
  - Options: `{ tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } }`
- [ ] 16.3 Add `"lint:boundaries": "depcruise packages --config .dependency-cruiser.cjs"` script to root `package.json`
- [ ] 16.4 Run `bun run lint:boundaries` — must exit 0 with zero violations
- [ ] 16.5 **Smoke test**: Temporarily insert an illegal import in `packages/primitives/src/` (e.g., `import {} from "@vexart/headless"`). Run `bun run lint:boundaries` — must exit non-zero with error. Revert the illegal import
- [ ] 16.6 Run `bun install && bun run typecheck` — must be green
- [ ] 16.7 Commit: `chore(lint): add dependency-cruiser config and lint:boundaries script`

## 17. Rename root package to vexart and update tsconfig paths (slice 17)

- [ ] 17.1 Update root `package.json` `name` field from `"tge"` to `"vexart"` (REQ-PB-009)
- [ ] 17.2 Verify `tsconfig.json` paths — all should already be `@vexart/*` after slice 14. Confirm no `@tge/*` remnants
- [ ] 17.3 Run `rg "@tge/" examples/ scripts/ solid-plugin.ts tsconfig.json package.json` — expect ZERO matches (REQ-PB-009)
- [ ] 17.4 Run `bun install && bun run typecheck` — must be green
- [ ] 17.5 Commit: `chore: rename root package to vexart and update tsconfig paths`

## 18. Final verification — typecheck + test + lint:boundaries (slice 18) — verification only

> This slice produces no commit. It is a verification gate confirming all 17 prior slices are correct.

- [ ] 18.1 Run `bun install` — clean install with no errors
- [ ] 18.2 Run `bun run typecheck` — passes with zero errors
- [ ] 18.3 Run `bun test` — passes
- [ ] 18.4 Run `bun run lint:boundaries` — passes with zero violations
- [ ] 18.5 Run `bun --conditions=browser run examples/showcase.tsx` — starts without error (smoke check; manually verify and kill)
- [ ] 18.6 Review `git log --oneline` — all 17 conventional commits present, no "Co-Authored-By" in any commit message
- [ ] 18.7 Verify `packages/` contains exactly: `engine/`, `primitives/`, `headless/`, `styled/`, `internal-devtools/` and no other directories (REQ-PB-001, REQ-PB-003)
- [ ] 18.8 Verify `packages/internal-devtools/package.json` has `"private": true` (REQ-PB-002)
- [ ] 18.9 Run `rg "from ['\"]\\.\\./\\.\\./(?!node_modules)" packages/` — zero cross-package relative imports (REQ-PB-006)

## Summary

| Slice | Risk | Sub-tasks | Key REQ |
|-------|------|-----------|---------|
| 1 | low | 8 | REQ-PB-003 |
| 2 | low | 8 | — |
| 3 | low | 8 | REQ-PB-010 |
| 4 | medium | 10 | REQ-PB-010 |
| 5 | medium | 10 | REQ-PB-010 |
| 6 | low | 10 | REQ-PB-010 |
| 7 | low | 10 | REQ-PB-010 |
| 8 | low | 9 | REQ-PB-010 |
| 9 | low | 9 | REQ-PB-010 |
| 10 | low | 10 | REQ-PB-010 |
| 11 | **HIGH** | 22 | REQ-PB-003, REQ-PB-008 |
| 12 | medium | 12 | REQ-PB-010 |
| 13 | low | 9 | REQ-PB-002 |
| 14 | **HIGH** | 14 | REQ-PB-004, REQ-PB-006 |
| 15 | medium | 8 | REQ-PB-004, REQ-PB-005 |
| 16 | low | 7 | REQ-PB-007 |
| 17 | low | 5 | REQ-PB-009 |
| 18 | low | 9 | All |
| **Total** | | **178** | |

**Gaps and notes**:

1. **`@tge/components` shim complexity (slice 11)**: The components shim must re-export from BOTH `@vexart/primitives` AND `@vexart/headless`. This means `packages/components/package.json` needs both as `workspace:*` dependencies. Consumers importing e.g. `Box` from `@tge/components` will get it via `@vexart/primitives` through the shim, and consumers importing `Button` will get it via `@vexart/headless`. Both paths are valid during the shim phase.

2. **Relative imports in `renderer-solid/src/index.ts`**: This file has direct relative imports to `../../runtime/src/` and `../../core/src/` (lines 12–24 in current code). After slices 3 and 4 move those packages into engine, slice 8 must rewrite these to relative paths within engine. This is called out in sub-task 8.3.

3. **`packages/` glob workspace**: Root `package.json` uses `"workspaces": ["packages/*"]` (glob), not an explicit array. This means new directories under `packages/` are automatically picked up by bun, and deleted directories are automatically dropped. No manual workspace array edits needed for any slice.

4. **No `@tge/runtime` path in tsconfig**: The current `tsconfig.json` does NOT have a path mapping for `@tge/runtime`. Resolution relies on the bun workspace + package.json `main` field. The shim in slice 4 still works because bun resolves `@tge/runtime` → `packages/runtime/src/index.ts` via workspace resolution.

5. **Test files moved alongside source**: Slices 5 and 8 move test files alongside their source files. These tests may reference `@tge/*` imports that break after slice 14's codemod. The slice 14 codemod must cover test files too.
