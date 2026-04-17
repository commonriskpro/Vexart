# Spec: package-boundaries

## Overview

This capability defines the Phase 1 package-boundary contract for the DEC-006 consolidation from the legacy `@tge/*` workspace into the Vexart four-layer architecture. It exists so Phase 1 lands the target public package graph, enforces strict downward dependencies, and removes the obsolete package surface described in the migration table. The capability also formalizes explicit workspace dependency declarations, bare-package import rules, and CI enforcement so the package graph remains auditable after the consolidation. These rules follow `docs/PRD.md §6.2`, `docs/PRD.md §12 DEC-006`, `docs/ARCHITECTURE.md §2.2`, and `docs/ARCHITECTURE.md Appendix A`.

## Requirements

### REQ-PB-001: Four public packages exist as the Phase 1 target

Phase 1 MUST leave `packages/` with exactly four public packages: `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, and `@vexart/styled`. No `@tge/*` public package MAY remain after this change, per `docs/PRD.md §6.1`, `docs/PRD.md §12 DEC-006`, and `docs/ARCHITECTURE.md §2.2`.

#### Scenario: Four-layer public package set is present

- **Given** Phase 1 structural cleanup is complete
- **When** a reviewer inspects `packages/*/package.json` for published package identities
- **Then** the only public package names are `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, and `@vexart/styled`
- **And** no public package retains an `@tge/*` name

#### Scenario: Extra or legacy public package is rejected

- **Given** a fifth public package exists or a public package still uses `@tge/*`
- **When** boundary validation runs
- **Then** the repository is non-compliant with the Phase 1 package target
- **And** the change MUST NOT be treated as complete until the public package set matches the four-layer contract

### REQ-PB-002: Internal devtools package is internal-only

`@vexart/internal-devtools` MUST exist as an internal non-published package, and its `package.json` MUST include `"private": true`. It MUST NOT appear in public API documentation, per `docs/ARCHITECTURE.md §2.2` internal tier.

#### Scenario: Internal devtools package is private

- **Given** `packages/internal-devtools/package.json` exists
- **When** a reviewer inspects its publication metadata
- **Then** the package name is `@vexart/internal-devtools`
- **And** the file marks the package with `"private": true`

#### Scenario: Internal devtools package is excluded from public surface

- **Given** repository API or package documentation is reviewed
- **When** the reviewer checks the public package inventory
- **Then** `@vexart/internal-devtools` is absent from public API documentation
- **And** any attempt to present it as a public package is rejected

### REQ-PB-003: Removed packages and examples stay absent

The ghost directories `compat-software`, `compat-text-ansi`, `compositor`, `output-compat`, `render-graph`, `scene`, and `text`; the deleted package `packages/windowing/`; the consolidated package directories `packages/core`, `packages/runtime`, `packages/input`, `packages/terminal`, `packages/output`, `packages/output-kitty`, `packages/renderer-solid`, `packages/renderer`, `packages/pixel`, `packages/gpu`, `packages/layout-clay`, `packages/platform-terminal`, `packages/components`, `packages/void`, and `packages/devtools`; and the deleted examples `examples/windowing-demo.tsx` and `examples/window-drag-repro.tsx` MUST NOT exist after Phase 1, per `docs/PRD.md §12 DEC-006`, `docs/ARCHITECTURE.md Appendix A`, and proposal `§Scope`.

#### Scenario: Obsolete package and example paths remain absent

- **Given** Phase 1 consolidation has been applied
- **When** a reviewer inspects the repository tree for removed and folded paths
- **Then** none of the listed package directories exists as a standalone path
- **And** the two deleted windowing examples are absent

#### Scenario: Reintroduced removed path fails compliance

- **Given** one listed package directory or deleted example path exists after consolidation
- **When** boundary review or CI validation runs
- **Then** the repository is non-compliant
- **And** the resurrected path MUST be removed before the change is complete

### REQ-PB-004: Layer dependency direction is unidirectional

The public package dependency graph MUST be acyclic and strictly downward: `@vexart/engine` depends on NO other `@vexart/*` package; `@vexart/primitives` depends on `@vexart/engine`; `@vexart/headless` depends on `@vexart/engine` and `@vexart/primitives`; and `@vexart/styled` depends on `@vexart/engine`, `@vexart/primitives`, and `@vexart/headless`. Any upward import MUST be rejected, and any same-layer lateral import MUST be rejected as a standing invariant, per `docs/PRD.md §6.2` and `docs/ARCHITECTURE.md §2.2`.

#### Scenario: Public packages depend only downward

- **Given** the four public packages exist
- **When** a reviewer inspects their internal imports and declared sibling dependencies
- **Then** each package depends only on the allowed lower layers for its tier
- **And** the graph contains no cycle across public packages

#### Scenario: Upward or lateral dependency is rejected

- **Given** a public package imports from a higher layer or from a disallowed same-layer sibling
- **When** boundary validation runs
- **Then** the dependency direction rule is violated
- **And** the invalid import MUST be rejected

### REQ-PB-005: Explicit workspace dependencies are declared

Every public package `package.json` MUST declare every imported `@vexart/*` sibling in its `dependencies` field using the `workspace:*` protocol, and workspace hoisting MUST NOT be relied upon. `@vexart/internal-devtools` MAY depend on any public package because it is internal-only, per `docs/PRD.md §6.2` and `docs/ARCHITECTURE.md §3`.

#### Scenario: Imported siblings are declared with workspace protocol

- **Given** a public package imports one or more `@vexart/*` siblings
- **When** its `package.json` is reviewed
- **Then** every imported sibling appears in `dependencies` with `workspace:*`
- **And** no imported sibling is left implicit through workspace hoisting

#### Scenario: Missing sibling dependency is rejected

- **Given** a public package imports `@vexart/<sibling>` without declaring it in `dependencies`
- **When** dependency validation runs
- **Then** the package is non-compliant
- **And** the missing declaration MUST be added before completion

### REQ-PB-006: Cross-package relative imports are prohibited

No `.ts` or `.tsx` file under `packages/*/src/` SHALL import another package through a relative sibling path such as `../../<sibling>/src/...` or `../../<sibling>/...`. Cross-package imports MUST use the bare `@vexart/<sibling>` specifier, while intra-package relative imports MAY remain, per `docs/PRD.md §6.2` and `docs/ARCHITECTURE.md Appendix A`.

#### Scenario: Cross-package import uses bare package name

- **Given** a source file under `packages/*/src/` imports code from another package
- **When** the import statement is reviewed
- **Then** it uses the bare `@vexart/<sibling>` specifier
- **And** it does not traverse into another package with `../` segments

#### Scenario: Relative sibling traversal is rejected

- **Given** a source file under `packages/*/src/` contains `../../<sibling>/src/...` or equivalent sibling traversal
- **When** boundary validation runs
- **Then** the import is non-compliant
- **And** it MUST be rewritten to the matching `@vexart/<sibling>` import

### REQ-PB-007: dependency-cruiser enforces boundaries in CI

The repository MUST contain a `.dependency-cruiser.cjs` or equivalent dependency-cruiser configuration enforcing: unidirectional layer rules from REQ-PB-004, no circular dependencies, no cross-package relative imports from REQ-PB-006, and no same-layer lateral imports between public packages. A root `bun run lint:boundaries` script MUST invoke that configuration and MUST exit non-zero on any violation, per `docs/PRD.md §6.2` and `docs/PRD.md §12 DEC-006`.

#### Scenario: Boundary lint is configured from the repository root

- **Given** the repository root is inspected for package-boundary enforcement
- **When** a reviewer checks lint configuration and scripts
- **Then** a dependency-cruiser config exists with rules for direction, cycles, relative-import bans, and lateral-import bans
- **And** `bun run lint:boundaries` invokes that config from the root workspace

#### Scenario: Boundary violation fails CI signal

- **Given** a dependency cycle, upward import, lateral import, or cross-package relative import exists
- **When** `bun run lint:boundaries` runs
- **Then** the command exits non-zero
- **And** CI rejects the change until the violation is fixed

### REQ-PB-008: Component split criterion

Files from the former `@tge/components` package MUST be split by contract: components that expose `ctx.*Props` render-prop objects or manage state, keyboard, focus, or accessibility MUST move to `@vexart/headless`, while typed wrappers of JSX intrinsics with no behavior — `Box`, `Text`, `Image`, `Canvas`, `Span`, and `RichText` — MUST move to `@vexart/primitives`, per `docs/ARCHITECTURE.md §3.2` and `docs/ARCHITECTURE.md §3.3`.

#### Scenario: Behavior-bearing components land in headless

- **Given** a former `@tge/components` file exposes `ctx.*Props` or owns state, keyboard, focus, or accessibility logic
- **When** the consolidation mapping is reviewed
- **Then** that file belongs to `@vexart/headless`
- **And** it is not classified as a primitive wrapper

#### Scenario: Pure intrinsic wrapper is rejected from headless

- **Given** a former `@tge/components` file is only a typed wrapper around a JSX intrinsic with no behavior
- **When** the split is reviewed
- **Then** that file belongs to `@vexart/primitives`
- **And** placing it in `@vexart/headless` is non-compliant

### REQ-PB-009: Root workspace identity uses vexart naming

The root `package.json` MUST declare `"name": "vexart"`. Files under `examples/*`, `scripts/*`, `solid-plugin.ts`, and `tsconfig.json` path mappings MUST reference `@vexart/*` and MUST NOT reference `@tge/*`, per `docs/PRD.md §12 DEC-001` and `docs/ARCHITECTURE.md Appendix A`.

#### Scenario: Root identity and references use vexart names

- **Given** the Phase 1 rename and consolidation are complete
- **When** a reviewer inspects the root package manifest and repository-level integration points
- **Then** the root package name is `vexart` and those files reference `@vexart/*`
- **And** no listed integration point still references `@tge/*`

#### Scenario: Legacy tge reference is rejected

- **Given** the root `package.json`, `examples/*`, `scripts/*`, `solid-plugin.ts`, or `tsconfig.json` still references legacy TGE naming
- **When** boundary review runs
- **Then** the repository is non-compliant with Phase 1 naming rules
- **And** the legacy reference MUST be removed before completion

### REQ-PB-010: Git history preservation during consolidation

File moves performed during package consolidation SHOULD use `git mv` rather than delete-and-copy, and `git log --follow` MUST continue to show pre-rename history for moved source files, per proposal `§Approach` step 4.

#### Scenario: Consolidated source file preserves prior history

- **Given** a source file is moved from a legacy package into a Phase 1 destination package
- **When** a reviewer checks its rename history with `git log --follow`
- **Then** the file shows pre-consolidation history across the rename
- **And** the move was performed with history preservation intent

#### Scenario: Copy-delete move without preserved history is flagged

- **Given** a moved source file no longer retains traceable pre-rename history
- **When** consolidation review checks history continuity
- **Then** the move is treated as non-compliant with the preservation guideline
- **And** a history-preserving move SHOULD be used where feasible
