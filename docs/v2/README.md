# Vexart Architecture & Developer Documentation (v2)

Vexart is a pixel-native, GPU-accelerated terminal UI engine. Applications compile JSX with SolidJS universal reconciliation, compute layout via Flexily, construct render graphs in TypeScript, and rasterize browser-grade visuals (anti-aliasing, multi-shadows, radial/linear/conic gradients, glow, backdrop blur, MSDF typography) through a native Rust WGPU pipeline transmitted directly to terminal emulators via Kitty graphics protocols.

---

## 1. 4-Tier Architecture Stack

The Vexart architecture strictly partitions responsibilities across four layers spanning TypeScript and native Rust:

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: App Framework (@vexart/app)                        │
│  - Application lifecycle (createApp, mountApp)              │
│  - File-system router, nested layouts, specificity scoring  │
│  - className compiler (Tailwind utility subset, caching)    │
│  - Primitives: Box, Text (wrapping engine intrinsics)       │
│  - Unified barrel entrypoint ("vexart")                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Tier 2: Design System (@vexart/styled)                     │
│  - Void design system (OLED-calibrated dark theme tokens)   │
│  - Reactive runtime theming via Solid signals & getters     │
│  - 28+ styled UI components & typography hierarchy          │
│  - Variant style merging with intrinsic props               │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Tier 3: Headless Components (@vexart/headless)             │
│  - 25 headless interaction primitives                       │
│  - Render props, prop getters, compound context factories   │
│  - Terminal accessibility: focus contracts, Vim navigation  │
│  - Zero styling opinions, full behavioral contracts         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  Tier 4: Core Engine (@vexart/engine)                       │
│  - SolidJS universal reconciler (createRenderer)            │
│  - Retained scene graph (TGENode: box, text, img, canvas)   │
│  - Layout engine (Flexily integration, layout writeback)    │
│  - Frame scheduler, damage tracking, layer promotion        │
│  - Terminal lifecycle, ANSI/Kitty parser, input dispatch    │
│  - FFI bridge (bun:ffi) to native runtime                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ bun:ffi (packed memory buffers)
┌──────────────────────────────▼──────────────────────────────┐
│  Native Runtime (libvexart - Rust / WGPU)                   │
│  - Headless WGPU device & 22 render pipelines               │
│  - Persistent on-disk pipeline & MSDF shader cache          │
│  - MSDF text generation (fdsm, fontdb) & dynamic atlas      │
│  - Visual effects: SDF corners, Gaussian blur, shadows      │
│  - Composite targets & layer registry                       │
│  - Kitty transport: direct zlib chunking, POSIX SHM, tmux   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Critical Architectural Invariants

Every subsystem in Vexart conforms to these non-negotiable runtime rules:

1. **Reconciler Singleton Invariant**: The published `vexart` barrel and `vexart/engine` must share exactly one SolidJS universal reconciler instance (`createRenderer`). Consumer JSX is configured with `moduleName: "vexart/engine"`. Instantiating multiple reconcilers breaks reactive node tracking and leaks layout state.
2. **Ownership Boundary (DEC-014)**: TypeScript strictly owns the scene graph, reactivity, tree walking, Flexily layout calculation, render graph queue construction, event dispatch, focus scopes, and hit-testing. Rust strictly owns WGPU hardware pipelines, compositing, Kitty protocol encoding, SHM/direct/tmux transport, image assets, canvas display lists, GPU memory budgets, and presentation. Rust-retained scene graphs are deprecated and prohibited.
3. **Alpha Representation Invariant**: GPU render targets use **premultiplied alpha** ($[R \cdot A, G \cdot A, B \cdot A, A]$) to ensure linear filtering and blur correctness without dark fringing. Image assets and host CPU buffers use **straight alpha** ($[R, G, B, A]$). Region readback operations must explicitly execute an unpremultiply pass (`image_unpremultiply` pipeline) before serializing data back to host memory.
4. **ARM64 FFI Parameter Invariant**: Foreign function interface calls from Bun to `libvexart` must never exceed **8 register arguments**. Any operation requiring more parameters must pack arguments into a contiguous binary struct passed by pointer (`*const u8` / `*mut u8`).
5. **Terminal Accessibility Invariant**: Vexart runs in terminal emulators where no browser DOM, web accessibility tree, or ARIA attributes exist. Accessibility is implemented through explicit focus graphs (`FocusScope`), circular tab cycling, Vim navigation keymaps (`h`/`j`/`k`/`l`), and focus traps for modal overlays.

---

## 3. Package Roles & Dependency Topology

```
                  ┌───────────────────────┐
                  │        vexart         │ (Unified barrel)
                  └───────────┬───────────┘
                              │
                  ┌───────────▼───────────┐
                  │      @vexart/app      │
                  └─────┬───────────┬─────┘
                        │           │
          ┌─────────────▼┐         ┌▼────────────┐
          │@vexart/styled│         │ internal    │
          └─────┬────────┘         │ tooling     │
                │                  └─────────────┘
          ┌─────▼──────────┐
          │@vexart/headless│
          └─────┬──────────┘
                │
          ┌─────▼──────────┐
          │ @vexart/engine │
          └─────┬──────────┘
                │ bun:ffi
          ┌─────▼──────────┐
          │   libvexart    │ (Rust cdylib)
          └────────────────┘
```

- `@vexart/engine`: Universal reconciler, Flexily layout adapter, render graph builder, frame coordinator, terminal lifecycle manager, and native FFI bridge.
- `@vexart/headless`: 25 unstyled UI behavior primitives with keyboard navigation, focus management, and compound component contracts.
- `@vexart/styled`: Void design system, OLED token palette, dynamic reactive getters for zero-remount theme switching, and 28+ styled components.
- `@vexart/app`: Application container, file-system router with nested layouts and specificity routing, Tailwind-compatible `className` compiler, and CLI suite.
- `flexily` (`packages/internal-flexily`): Zero-dependency Yoga-compatible layout engine, vendored directly as an internal workspace package.
- `@vexart/internal-devtools`: Internal Model Context Protocol (MCP) server providing Kitty window control, screen capture, simulated input injection, and IPC inspection for AI agents and test runners.
- `@vexart/internal-atlas-gen`: Internal font atlas generator compiling TTF fonts into 1024×1024 pre-baked atlas PNGs and JSON metrics.
- `libvexart`: Rust native library compiling to `libvexart.dylib` / `libvexart.so` / `vexart.dll`, executing WGPU pipelines and Kitty presentation.

---

## 4. Context Pointers Table

Use this index to route directly to detailed architectural documentation based on task branch:

| Leading Word / Area | Exact Trigger Condition | Sub-Document |
| :--- | :--- | :--- |
| `reconciler`, `layout`, `engine` | Modifying Solid universal reconciler, `TGENode` hierarchy, Flexily layout synchronization, frame damage scheduling, terminal ANSI modes, input parsing, or hit-testing. | [`engine-runtime.md`](engine-runtime.md) |
| `ffi`, `pipeline`, `wgpu`, `transport` | Modifying Rust native bridge, `vexart_*` FFI signatures, packed binary command buffer, WGPU render pipelines, WGSL shaders, MSDF font generator, GPU resource manager, or Kitty transport (direct, SHM, tmux). | [`native-wgpu-boundary.md`](native-wgpu-boundary.md) |
| `headless`, `accessibility`, `primitive` | Creating or modifying unstyled interaction components, focus contracts, Vim keymaps, prop getters, render prop state contracts, or compound contexts. | [`headless-primitives.md`](headless-primitives.md) |
| `theme`, `tokens`, `styled` | Adjusting Void design system tokens, OLED color calibration, reactive `themeColors` getters, zero-remount theme swapping, or styled component variants. | [`styled-void-system.md`](styled-void-system.md) |
| `app`, `router`, `className`, `cli` | Modifying application lifecycle (`createApp`), file-system routing rules, nested layouts, specificity matching, Tailwind utility compiler, or CLI tools (`vexart dev/build`). | [`app-framework.md`](app-framework.md) |
| `tooling`, `build`, `test`, `dist` | Building npm packages, distribution layout, platform binary resolution, visual regression tests, MCP devtools server, font atlas generator, or benchmark gates. | [`tooling-and-distribution.md`](tooling-and-distribution.md) |

---

## 5. Architectural Decision Records Ledger (DEC-001 through DEC-015)

The architectural evolution of Vexart is codified across 15 foundational Decision Records (documented in `docs/PRD.md` §12):

- **DEC-001: Product Name Vexart** — Adopted "Vexart" as the permanent product name, replacing the internal codename "TGE" and unifying all monorepo packages under `@vexart/*`.
- **DEC-002: User Persona** — Established CLI tool builders, individual developers, and terminal UI developers as the primary audience, prioritizing intuitive DX and turnkey components over complex manual configuration.
- **DEC-003: Dual-Licensing Model** — Established a source-available dual license: free for personal, open-source, and small commercial use under a $1M ARR threshold; commercial licensing ($299/dev/yr) required at or above $1M ARR.
- **DEC-004: Two-Language Stack** — Standardized strictly on TypeScript (Bun runtime) + Rust (`libvexart` single cdylib). Deleted C, Zig, and C++ paths to eliminate cross-language FFI fragmentation.
- **DEC-005: Kitty Graphics Protocol Exclusivity** — Restricted native rendering to terminal emulators supporting the Kitty graphics protocol (Kitty, Ghostty, WezTerm), eliminating legacy ASCII/halfblock fallbacks. Later amended to support tmux 3.4+ via Kitty Unicode placeholder passthrough and local SHM transport.
- **DEC-006: 4-Tier Package Hierarchy** — Structured the architecture into four unidirectional layers (`@vexart/app` $\to$ `@vexart/styled` $\to$ `@vexart/headless` $\to$ `@vexart/engine`), enforcing clean separation of concerns and preventing cyclic dependencies.
- **DEC-007: Spec-Driven Development (SDD) Methodology** — Adopted the atomic Spec-Driven Development workflow (Proposal $\to$ Spec $\to$ Design $\to$ Tasks $\to$ Apply $\to$ Verify $\to$ Archive) for structured engineering.
- **DEC-008: Option B Feature Scope** — Expanded v0.9 feature scope to deliver state-of-the-art terminal visuals: Multi-channel Signed Distance Field (MSDF) vector typography, compositor-thread animations for transform/opacity, CSS self-filters (`filter`), and declarative compositor hints (`willChange`, `contain`).
- **DEC-009: WGPU as Permanent Cross-Platform GPU Abstraction** — Selected WGPU as the permanent cross-platform GPU interface over Metal, Vulkan, and DirectX 12; rejected per-platform native renderers in favor of single-source WGSL shaders and maintainable cross-platform pipelines.
- **DEC-010: Engine Optimizations Tier 1 & Tier 2** — Added five architectural optimizations to v0.9: Tier 1 (native Kitty base64/zlib encoding in Rust, persistent on-disk `PipelineCache`, unified 128MB `ResourceManager` with LRU eviction) and Tier 2 (AABB viewport culling in `walkTree`, 3-priority frame budget scheduler).
- **DEC-011: Text Rendering Exception** — Skipped temporary bitmap font porting during Phase 2 to prevent redundant development ("doble trabajo"), bridging directly to hardware MSDF text rendering in Phase 2b.
- **DEC-012: Rust-Retained Engine Exploration** — Explored migrating the retained scene graph, layout, and event dispatch into native Rust (subsequently reverted by DEC-014).
- **DEC-013: 120fps / 5ms Performance Program** — Committed the runtime to 120fps-class responsiveness targets, establishing explicit frame budgets: `<1ms` for no-op frames, `<5ms` for small dirty regions, and `<8.33ms` for compositor animations.
- **DEC-014: Rust-Retained Scene Graph Reverted** — Reverted native Rust retained scene graph, layout, and event dispatch based on definitive empirical benchmarks: on `cosmic-shell-1080p`, the TypeScript path was **4.8× faster at p95** (15.84ms vs 75.42ms). Firmly established the permanent ownership boundary: TypeScript retains the scene graph, Solid reactivity, Flexily layout, and event dispatch; Rust owns WGPU paint pipelines, compositing, Kitty encoding, and terminal transport.
- **DEC-015: Flexily Layout Engine in TypeScript Adopted** — Adopted Flexily (pure JavaScript, zero external dependencies, Yoga-compatible flexbox engine) for TypeScript layout computation, replacing Clay (C) and vestigial Taffy FFI bindings with a clean, zero-allocation hot-path layout adapter.
