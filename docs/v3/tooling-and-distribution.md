# Tooling, Distribution, Governance & Packaging

This document specifies Vexart's internal developer tooling, automated test gates, production distribution format, and public API governance policies.

---

## 1. Internal Tooling Infrastructure

Vexart includes three internal workspace packages to accelerate automated testing, asset generation, and layout compilation:

### 1.1 Model Context Protocol (MCP) DevTools Server (`@vexart/internal-devtools`)
Located in `packages/internal-devtools/src/server.ts`, this package runs a standard Model Context Protocol (MCP) server over Stdio (`@modelcontextprotocol/sdk`). It provides automated agents, test runners, and CI pipelines with direct programmatic control over a live Kitty terminal window.

The server registers **exactly 11 MCP tools**:

| Tool Identifier | Parameters | Core Responsibility |
| :--- | :--- | :--- |
| `vexart_status` | *(none)* | Queries the Kitty remote control socket; lists open OS windows, tabs, windows, dimensions, and active running demos. |
| `vexart_launch` | `script: string, name?: string, env?: Record<string, string>` | Spawns a Vexart demo script in a new Kitty tab and tracks the process handle. |
| `vexart_screenshot`| `name?: string, windowId?: number` | Captures a live PNG screenshot of the demo terminal window, returning image data. |
| `vexart_send_key` | `key: string, name?: string` | Injects raw keyboard sequences and modifier keys (e.g. `ctrl+c`, `j`, `Tab`, `enter`). |
| `vexart_send_text`| `text: string, name?: string` | Simulates keyboard typing by writing arbitrary UTF-8 characters. |
| `vexart_click` | `col: number, row: number, button?: number, name?: string` | Injects mouse click events. **Coordinates are in terminal cells (col, row), NOT pixels!** |
| `vexart_drag` | `fromCol, fromRow, toCol, toRow, durationMs?: number` | Injects click-and-drag motion sequences between two cell coordinates. |
| `vexart_scroll` | `col, row, direction: "up" \| "down", delta?: number` | Dispatches mouse wheel scroll events at specified cell coordinates. |
| `vexart_get_text` | `name: string` | Retrieves visible text content from the running terminal demo window (for inspecting logs, output, or error frames). |
| `vexart_stop` | `name?: string, windowId?: number` | Terminates the demo child process and closes its Kitty window. |
| `vexart_resize` | `width: number, height: number` | Dynamically resizes the Kitty terminal window to target dimensions (window dimensions in pixels, min 200). |

> **COORDINATE CALIBRATION INVARIANT**:
> Automated tools (`vexart_click`, `vexart_drag`, `vexart_scroll`) receive coordinates in **terminal cells (column, row)**, not screen pixels. A typical cell in Kitty is approximately 7–8px wide by 14–16px tall.

### 1.2 Offline Font Atlas Generator (`@vexart/internal-atlas-gen`)
Located in `packages/internal-atlas-gen/`:
- Converts TrueType (`.ttf`) and OpenType (`.otf`) vector font outlines into pre-baked 1024×1024 Multi-channel Signed Distance Field (MSDF) texture atlases.
- Generates `{font_name}.png` (16×16 character grid covering standard printable ASCII 32–126) and a companion `{font_name}.json` containing per-glyph UV bounding coordinates, advance widths, and layout ascender/descender metrics.
- Output artifacts are embedded directly into `dist/` for zero-overhead startup.

### 1.3 Vendored Flexily Layout Engine (`packages/internal-flexily`)
- Pure TypeScript/JavaScript implementation of the Yoga Flexbox specification and modern CSS Grid layout algorithm.
- Zero external dependencies.
- Retained layout nodes (`flexily.Node`) integrate directly with `TGENode._flexNode`, avoiding all native FFI allocations during layout calculation.

---

## 2. Quality Verification Gates

Vexart enforces five rigorous, automated verification gates that must pass prior to any release or commit:

### 2.1 Static Typecheck Gate
- **Command**: `bun run typecheck` (`tsc --noEmit`)
- **Requirement**: Zero TypeScript errors across all monorepo packages, examples, tests, and configuration scripts.

### 2.2 Reconciler & Universal Test Suite Gate
- **Command**: `bun run test`
- **Runner Configuration**: `bun --conditions=browser test --preload ./solid-plugin.ts`
- **Scope**: Reconciler damage tracking, layout writeback atomicity, transform projective math, focus tree manipulation, hover/drag hooks, and router reactivity.

### 2.3 Rust Native Test Gate
- **Command**: `cd native/libvexart && cargo test`
- **Scope**: Headless WGPU device creation, vertex buffer expansion and 120-frame decay cooldown, instance buffer stride alignment, Kitty protocol zlib compression, and POSIX SHM allocation.

### 2.4 Golden Visual Regression Gate
- **Command**: `bun run test:visual` (`scripts/visual-test/runner.ts`)
- **Update Baselines**: `bun run test:visual:update`
- **Methodology**: Renders reference JSX fixtures to an offscreen WGPU target, synchronously reads back the RGBA framebuffer, and compares pixels against golden PNG snapshots in `scripts/visual-test/references/`.

### 2.5 Architectural Boundaries Gate
- **Command**: `bun run lint:boundaries`
- **Tool**: `dependency-cruiser` (`.dependency-cruiser.cjs`)
- **Rule**: Enforces strict inward layering:
  $$\text{app} \longrightarrow \text{styled} \longrightarrow \text{headless} \longrightarrow \text{engine} \longrightarrow \text{libvexart}$$
  Lower tiers are forbidden from importing symbols from higher tiers.

---

## 3. NPM Distribution Architecture (`dist/`)

The distribution bundle is built via `scripts/build-dist.ts` (`bun run build:dist`):

### 3.1 Output Layout
```
dist/
├── vexart.js            # Unified barrel (@vexart/app + styled + headless + engine hooks)
├── vexart.d.ts          # TypeScript declarations for root barrel
├── engine.js            # Standalone @vexart/engine bundle (custom reconcilers, low-level FFI)
├── engine.d.ts          # TypeScript declarations for engine
├── cli.js               # Published executable CLI binary ("bin": { "vexart": "./cli.js" })
├── components.d.ts      # Component prop typings referenced by vexart.d.ts
├── void.d.ts            # Void design token declarations referenced by vexart.d.ts
├── solid-plugin.ts      # Babel JSX transformation preload script for Bun
├── jsx-runtime.d.ts     # Intrinsic definitions for <box>, <text>, <img>, <canvas>
├── package.json         # Manifest declaring optionalDependencies for target platforms
└── platform/            # Platform-specific native binary packages
    ├── darwin-arm64/    # libvexart.dylib + package.json (@vexart-native/darwin-arm64)
    ├── linux-x64/       # libvexart.so + package.json (@vexart-native/linux-x64)
    └── linux-arm64/     # libvexart.so + package.json (@vexart-native/linux-arm64)
```

### 3.2 Platform Resolution Strategy (`bun:ffi`)
1. **Development Mode**: `packages/engine/src/ffi/vexart-bridge.ts` resolves local compilation artifacts in `native/libvexart/target/release/`.
2. **Distribution Mode**: When running from an installed npm package (`process.env.VEXART_DIST === "true"`), the bridge loads `libvexart` from the platform package installed in `node_modules/@vexart-native/<platform>/`.

### 3.3 Target Size Budgets
- **`vexart.js` Bundle**: Strictly budgeted at **< 250 KB** (unminified JS).
- **`libvexart` Native Binary**: Strictly budgeted at **< 15 MB** (stripped release cdylib).

---

## 4. Public API Policy & Governance

Defined in `docs/API-POLICY.md`, these policies ensure stability for downstream consumers:

### 4.1 The `public.ts` Contract & Prohibition of `export *`
Every package in the monorepo exposes its public API through an explicit `src/public.ts` file:
- **`export *` is Strictly Banned**: Wildcard exports risk accidentally leaking internal helper functions, unstable structures, or native handles into the public API.
- **Explicit Named Exports**: Every exported function, class, and type is reviewed, typed, and annotated.

### 4.2 SemVer Classification Rules
- **Patch (0.9.x)**: Internal bug fixes, documentation corrections, performance improvements, and non-breaking internal refactors.
- **Minor (0.x.0)**: Additive, backward-compatible public features (new headless primitives, new styling utilities, new config flags).
- **Major (x.0.0)**: Breaking changes to public signatures in `public.ts`, removal of deprecated APIs, or modifications to core architectural invariants.

### 4.3 Deprecation Lifecycle
Before any public symbol is removed:
1. **`@deprecated` JSDoc Annotation**: The symbol is marked in `public.ts` with instructions on its replacement.
2. **Runtime Warning**: The function body calls `warnOnceDeprecated("symbolName", "Use newSymbol instead")`.
3. **6-Month Window**: The deprecated symbol must remain functional for at least six months before removal in a subsequent major release.
