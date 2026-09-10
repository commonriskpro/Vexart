# Tooling, Distribution & Verification Architecture

This document covers the build pipelines, packaging distribution format, test and quality gates, internal developer tooling, and showcase applications in Vexart.

---

## 1. NPM Distribution Architecture (`dist/`)

The distribution package is built using `bun run build:dist` (`scripts/build-dist.ts`). It compiles the monorepo into an npm package layout consumable by third-party terminal applications.

### Output Layout
```
dist/
├── vexart.js           # Unified barrel: @vexart/app + styled + headless + engine hooks
├── vexart.d.ts         # TypeScript declarations for root barrel
├── engine.js           # Low-level @vexart/engine bundle (power users, custom reconcilers)
├── engine.d.ts         # TypeScript declarations for engine
├── cli.js              # Published executable CLI tool ("bin": { "vexart": "./cli.js" })
├── components.d.ts     # Component prop declarations referenced by vexart.d.ts
├── void.d.ts           # Void design tokens declarations referenced by vexart.d.ts
├── solid-plugin.ts     # Babel preload script transforming Solid JSX for Bun
├── jsx-runtime.d.ts    # TypeScript definitions for intrinsic <box>, <text>, <img>, <canvas>
├── tree-sitter/        # Syntax highlighting WebAssembly grammars, parser worker & SCM query files
│   ├── assets/         # Grammar .wasm and query .scm files
│   └── parser.worker.ts# Tree-sitter background WebWorker parser
├── package.json        # Manifest specifying optionalDependencies for target platforms
└── platform/           # Platform-specific native binary packages
    ├── darwin-arm64/   # libvexart.dylib + package.json (@vexart-native/darwin-arm64)
    ├── linux-x64/      # libvexart.so + package.json (@vexart-native/linux-x64)
    └── linux-arm64/    # libvexart.so + package.json (@vexart-native/linux-arm64)
```

### Native Binary Resolution (`bun:ffi`)
In development, `packages/engine/src/ffi/vexart-bridge.ts` searches relative paths (`target/release/libvexart.*`, `native/libvexart/target/release/libvexart.*`). In distribution builds (`process.env.VEXART_DIST === "true"`), the bridge resolves the native library from `@vexart-native/<platform>` optional dependencies installed alongside `vexart`.

### Solid Universal JSX Compilation
Consumer JSX components must compile through Babel with `babel-preset-solid`:
```json
["babel-preset-solid", { "generate": "universal", "moduleName": "vexart/engine" }]
```
`dist/solid-plugin.ts` provides this preset configured out-of-the-box for Bun runtime preloading (`bunfig.toml` preload).

---

## 2. Test Suites & Quality Verification Gates

Vexart enforces five independent verification layers:

### 2.1 Static Typecheck
- **Command**: `bun run typecheck` (`tsc --noEmit`)
- **Scope**: Entire monorepo workspace including TypeScript packages and example suites. Zero type errors permitted.

### 2.2 Reconciler & Universal Unit Tests
- **Command**: `bun run test`
- **Runner**: `bun --conditions=browser test --preload ./solid-plugin.ts`
- **Scope**: Reconciler damage tracking, layout adapter, hit-testing, focus scoping, and reactive hooks.

### 2.3 Rust Native Test Suite
- **Command**: `bun run rust:test` (`cargo test` inside `native/libvexart`)
- **Scope**: Tests WGPU headless device creation, SDF corner calculations, blur alpha de-fringing, shadow falloff math, MSDF glyph layout, and Kitty protocol encoding.

### 2.4 Visual Regression & Golden Image Gate
- **Runner**: `bun run test:visual` (`scripts/visual-test/runner.ts`)
- **Update Baselines**: `bun run test:visual:update`
- **Methodology**: Renders test scenes into offscreen GPU targets, synchronously reads back RGBA buffers, and executes pixel-by-pixel comparisons against golden PNG references in `scripts/visual-test/references/`.
- **Key Visual Scenarios**:
  - `components-button-variants.tsx`, `components-button-sizes.tsx`
  - `effects-gradient-linear.tsx`, `effects-gradient-radial.tsx`, `effects-glow.tsx`, `effects-shadow.tsx`
  - `effects-backdrop-blur.tsx`, `effects-backdrop-filters.tsx`
  - `theming-cards.tsx`, `theming-typography.tsx`
  - `interaction-hover.tsx`, `interaction-press.tsx`, `interaction-focus.tsx`

### 2.5 Architectural Boundaries Lint
- **Command**: `bun run lint:boundaries`
- **Tool**: `dependency-cruiser` with configuration in `.dependency-cruiser.cjs`
- **Rule**: Enforces strict inward layering (`app` $\to$ `styled` $\to$ `headless` $\to$ `engine`). Lower-level packages are forbidden from importing higher-level packages.

### 2.6 Performance & Frame Breakdown Benchmarking
- **Command**: `bun run bench:frame-breakdown` (`scripts/frame-breakdown.tsx`)
- **Transport Benchmarks**:
  - `bun run perf:transport:shm`: Benchmarks POSIX shared memory transport frame throughput.
  - `bun run perf:transport:file`: Benchmarks file transport frame throughput.
- **Metrics Collected**: Time per frame broken down into Flexily layout, TS render graph construction, WGPU GPU paint, compositor readback, and Kitty escape serialization.

---

## 3. Internal Developer Tooling Packages

### 3.1 Model Context Protocol (MCP) DevTools Server (`@vexart/internal-devtools`)
Located in `packages/internal-devtools/`:
- **Executable**: `packages/internal-devtools/src/server.ts`
- **Protocol**: Standard MCP over Stdio (`@modelcontextprotocol/sdk`)
- **Target Audience**: AI agents and automated testing workflows interacting with a live Kitty terminal window.
- **Exposed MCP Tools**:
  - `vexart_status`: Shows running demo instances and Kitty socket connection status.
  - `vexart_launch`: Starts a Vexart demo in a new Kitty terminal window or tab.
  - `vexart_screenshot`: Captures a live PNG screenshot of the demo terminal window.
  - `vexart_send_key`: Dispatches keyboard sequences and special key actions to the active demo.
  - `vexart_send_text`: Writes arbitrary text characters into the demo window.
  - `vexart_click`: Injects mouse button click events at terminal pixel coordinates.
  - `vexart_drag`: Injects click-and-drag motion sequences between coordinates.
  - `vexart_scroll`: Injects vertical or horizontal mouse wheel scroll events.
  - `vexart_stop`: Terminates a running demo process and closes its Kitty window.
  - `vexart_get_text`: Extracts ANSI text content from the Kitty terminal screen buffer.
  - `vexart_resize`: Resizes the target Kitty window to specified pixel dimensions.

### 3.2 Offline Font Atlas Generator (`@vexart/internal-atlas-gen`)
Located in `packages/internal-atlas-gen/`:
- **Executable**: `packages/internal-atlas-gen/src/gen.ts`
- **Purpose**: Pre-bakes TrueType (`.ttf`) fonts into 1024×1024 atlas PNGs and glyph metrics JSON.
- **Usage**:
  ```bash
  bun run packages/internal-atlas-gen/src/gen.ts --input path/to/font.ttf --output path/to/output/ --size 48
  ```
- **Output**: Produces `{font_name}.png` (16×16 glyph grid containing ASCII 32–126) and `{font_name}.json` containing per-glyph UV texture coordinates and layout bounding metrics.

### 3.3 Vendored Flexily Layout Engine (`packages/internal-flexily`)
- **Package Name**: `"flexily"`
- **Architecture**: A pure TypeScript/JavaScript implementation of the flexbox and CSS Grid layout algorithms, providing full Yoga-compatible API with zero external dependencies.
- **Integration**: Linked into `@vexart/engine` via monorepo workspace dependencies (`"flexily": "workspace:*"`).

---

## 4. Showcase Applications & Demos

Located in `examples/`:
- **`examples/void-showcase.tsx`** (`bun run showcase`):
  Comprehensive interactive showcase featuring the Void design system across 6 tabbed views:
  1. *Inputs*: Buttons, switches, sliders, text inputs, radio groups.
  2. *Display*: Badges, cards, progress bars, avatars, skeletons.
  3. *Collections*: Tables, lists, virtual lists.
  4. *Code & Docs*: Tree-sitter syntax highlighting, markdown rendering, diff viewer.
  5. *Overlays*: Dialogs, tooltips, popovers, toast notifications.
  6. *Typography*: Complete font and heading scale.
- **`examples/effects-showcase.tsx`** (`bun run effects-showcase`):
  Demonstrates hardware WGPU effects: per-corner radii, analytic multi-shadows, radial/linear gradients, glowing halos, and real-time backdrop blur.
- **`examples/ps5/`**:
  Full-scale replica of the PlayStation 5 operating system dashboard, demonstrating high-performance image decoding, cover flow carousels, responsive layout, and smooth game switching.
- **`examples/facebook-app.tsx`** (`bun run facebook-app`):
  Multi-panel desktop feed application stressing nested layout scrolling and component state.

---

## 5. API Governance & Stability Policy

Vexart enforces strict API surface governance governed by `docs/API-POLICY.md` to guarantee stability, prevent accidental leakage of internal implementation details, and maintain predictable SemVer upgrade paths.

### 5.1 The `public.ts` Contract
`public.ts` is the sole authoritative API surface for each package:
- Every public package exposes its API exclusively through `packages/{name}/src/public.ts`.
- Direct deep imports into internal files (e.g. `import { foo } from "@vexart/engine/src/internal/render-graph"`) are strictly forbidden and unsupported; internal modules may be refactored, renamed, or moved at any time without notice.
- Consumers import strictly from the package root (e.g. `import { mount } from "@vexart/engine"` or `import { Button } from "vexart"`).
- Public APIs are snapshotted and audited using Microsoft's `api-extractor`, generating committed `.api.md` reports (e.g., `packages/engine/etc/engine.api.md`) that gate CI on any unreviewed signature changes.

### 5.2 The `export *` Ban
`export *` is forbidden across the codebase to prevent uncontrolled leakage of internals and unintended API surface growth:
- No module or public entry point may use wildcard re-exports (`export * from "./internal/..."`). Every exported symbol must be explicitly and individually named in `public.ts`.
- The **sole exception** is the single 1-line re-export in the package entry `index.ts`:
  ```typescript
  export * from "./public"
  ```
  This exception is safe because it re-exports only what `public.ts` has already explicitly declared. CI automatically lints and rejects any other occurrence of `export *`.

### 5.3 SemVer Change Classification
Changes across Vexart packages are classified into three strict tiers:
1. **Additive (Minor Bump)**:
   - Addition of new symbols to `public.ts`, new optional props or fields on existing types, or new optional parameters at the end of existing functions.
   - Observable behavior remains backwards-compatible with existing consumer code.
   - Triggers a minor version bump (`0.9.0 → 0.10.0` or `1.2.0 → 1.3.0`).
2. **Breaking (Major Bump)**:
   - Renaming, removing, or changing the type signature of any public symbol or required parameter.
   - Altering default prop values, changing return types, raising runtime environment minimums, or deleting previously deprecated symbols.
   - Triggers a major version bump (`1.2.0 → 2.0.0`; during pre-1.0 developer preview, minor bumps track breaking changes).
   - Requires a mandatory migration guide in the changelog with before/after code snippets.
3. **Internal (Patch Bump)**:
   - Internal refactoring, algorithm optimizations, bug fixes that preserve public types, test improvements, or comments.
   - No modifications to committed `.api.md` snapshots and no user-visible behavior breakage.
   - Triggers a patch version bump (`1.2.0 → 1.2.1`).

### 5.4 Deprecation Lifecycle
Public symbols are never removed abruptly. They follow an explicit deprecation cycle:
- **Requirements**: Deprecating a symbol requires **both** an `@deprecated` TSDoc annotation (specifying the target removal version, rationale, and replacement migration code) and a runtime warning via `console.warn` (`warnOnceDeprecated`).
- **Runtime Throttling**: Warnings are emitted at most once per process session per symbol to prevent terminal spam, enabled by default via `VEXART_WARN_DEPRECATED=1` (can be silenced in production via `VEXART_WARN_DEPRECATED=0`).
- **Minimum Window**: Deprecated APIs must remain functional for at least **1 minor release cycle (minimum 6 months)** before removal (in post-v1.0 releases, at least 2 minor versions). Removal occurs strictly on a major version boundary.

### 5.5 Stability Tags
Every export in `public.ts` must include a JSDoc stability level tag monitored by `api-extractor`:
- **`@stable`** (or **`@public`**): Production-ready, fully supported, and covered by the full deprecation policy.
- **`@beta`** : Usable and feature-complete, but subject to refinement or non-breaking API adjustments across minor releases.
- **`@alpha`** : Early development preview; interface may change significantly based on feedback.
- **`@experimental`** : Proof-of-concept capabilities undergoing exploratory design; may be altered or removed at any time.
- **`@deprecated`** : Marked for scheduled removal in an upcoming major release; replacement path provided.

---

## 6. Documentation Website (`website/`)

Located in `website/`:
- **Framework**: Astro 6 + Starlight (`@astrojs/starlight`) with React 19 and Tailwind CSS.
- **Development**: `bun run docs:dev` (runs `astro dev` on port 4321).
- **Production Build**: `bun run docs:build` (runs `astro build`).
- **Preview**: `bun run docs:preview` (runs `astro preview`).
