# Delta for package-boundaries

## MODIFIED Requirements

### Requirement: REQ-PB-004: Layer dependency direction is unidirectional

The public package dependency graph MUST be acyclic and strictly downward: `@vexart/engine` depends on NO other `@vexart/*` package; `@vexart/primitives` depends on `@vexart/engine`; `@vexart/headless` depends on `@vexart/engine` and `@vexart/primitives`; and `@vexart/styled` depends on `@vexart/engine`, `@vexart/primitives`, and `@vexart/headless`. Any upward import MUST be rejected, and any same-layer lateral import MUST be rejected as a standing invariant, per `docs/PRD.md §6.2` and `docs/ARCHITECTURE.md §2.2`.

Additionally, within `@vexart/engine`, the `loop/` directory MUST follow internal dependency rules: `index.ts` (coordinator) MAY import from all sibling modules; individual pipeline modules (`walk-tree.ts`, `layout.ts`, `assign-layers.ts`, `paint.ts`, `composite.ts`) MUST NOT import from `index.ts` or from each other. Shared types and state bags flow downward from coordinator to modules via function arguments.

(Previously: Only covered public package boundaries; no internal loop/ dependency rules.)

#### Scenario: Public packages depend only downward

- GIVEN the four public packages exist
- WHEN a reviewer inspects their internal imports and declared sibling dependencies
- THEN each package depends only on the allowed lower layers for its tier
- AND the graph contains no cycle across public packages

#### Scenario: Upward or lateral dependency is rejected

- GIVEN a public package imports from a higher layer or from a disallowed same-layer sibling
- WHEN boundary validation runs
- THEN the dependency direction rule is violated
- AND the invalid import MUST be rejected

#### Scenario: Loop pipeline modules have no circular deps

- GIVEN `loop/walk-tree.ts` is inspected for imports
- WHEN its dependency graph is traced
- THEN it does not import from `loop/index.ts`, `loop/layout.ts`, `loop/assign-layers.ts`, `loop/paint.ts`, or `loop/composite.ts`
- AND the same holds for every other pipeline module

#### Scenario: Coordinator imports from pipeline modules

- GIVEN `loop/index.ts` is inspected for imports
- WHEN its imports are listed
- THEN it imports from `loop/walk-tree.ts`, `loop/layout.ts`, `loop/assign-layers.ts`, `loop/paint.ts`, `loop/composite.ts`
- AND no pipeline module imports back from `loop/index.ts`

### Requirement: REQ-PB-007: dependency-cruiser enforces boundaries in CI

The repository MUST contain a `.dependency-cruiser.cjs` or equivalent dependency-cruiser configuration enforcing: unidirectional layer rules from REQ-PB-004, no circular dependencies, no cross-package relative imports from REQ-PB-006, no same-layer lateral imports between public packages, AND no circular imports within `loop/` pipeline modules. A root `bun run lint:boundaries` script MUST invoke that configuration and MUST exit non-zero on any violation.

(Previously: Did not cover internal loop/ module dependency rules.)

#### Scenario: Boundary lint is configured from the repository root

- GIVEN the repository root is inspected for package-boundary enforcement
- WHEN a reviewer checks lint configuration and scripts
- THEN a dependency-cruiser config exists with rules for direction, cycles, relative-import bans, lateral-import bans, and loop/ internal circular deps
- AND `bun run lint:boundaries` invokes that config from the root workspace

#### Scenario: Boundary violation fails CI signal

- GIVEN a dependency cycle, upward import, lateral import, cross-package relative import, or loop/ circular import exists
- WHEN `bun run lint:boundaries` runs
- THEN the command exits non-zero
- AND CI rejects the change until the violation is fixed

#### Scenario: Loop module circular dependency is caught

- GIVEN `loop/paint.ts` imports from `loop/walk-tree.ts`
- WHEN `bun run lint:boundaries` runs
- THEN the command exits non-zero
- AND the violation is reported as a loop/ internal cycle
