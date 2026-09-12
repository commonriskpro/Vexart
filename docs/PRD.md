# Vexart — Product Requirements Document

**Version**: 0.10
**Status**: Closed — v0.9 performance contract locked
**Owner**: Founder (solo developer)
**Last updated**: September 2026

**Changelog from v0.9 / v0.8**:
- DEC-015 added: Flexily (pure JavaScript, zero-dependencies, Yoga-compatible API) replaces Taffy for TypeScript-side layout. Taffy is completely purged from `libvexart/Cargo.toml` and the repository.
- WGPU upgraded to 29.0.1 across native pipelines.
- Closed open box-shadow issue: dedicated analytic Gaussian box-shadow pipeline implemented (`cmd_kind = 20`, `shadow.rs`, `shadow.wgsl`).
- Reassigned JSX intrinsic elements (`<box>`, `<text>`, `<image>`, `<canvas>`) to `@vexart/engine`, while `<Box>` and `<Text>` component wrappers with `className` live in `@vexart/app`.
- Headless primitives inventory calibrated to exactly 25 primitives (23 unstyled UI components + 2 state factories: `createForm` and `createToaster`), renaming navigation component to `Diff`.
- Styled package updated to Void Design System (`Void*` component prefixes, `VoidDropdownMenu` added), and `ThemeProvider`/`useTheme` purged in favor of zero-remount reactive signal getters on `themeColors` and `setTheme()`.
- Clarified that gradients in Rust shaders support `conic` and multi-stop pipelines, while public TypeScript `GradientConfig` currently models `linear` and `radial` with 2 stops.
- Clarified compositor animations as an architectural fast-path bypass in the synchronous JS render loop, not multi-threaded concurrency.
- Synchronized completed v1.0 release criteria (`createTransition`/`createSpring` and `filter` self-filter) and release benchmark scripts (`bench:dashboard-1080p`, `perf:check`).
- Documented internal packages (`@vexart/internal-atlas-gen`, `@vexart/internal-devtools`, `@vexart/internal-flexily`) and engine's dependency on `flexily`.

**Changelog from v0.7 (historical snapshot, September 7, 2026)**:
- Added an experimental tmux presentation route. tmux 3.4+ can carry Kitty
  graphics through a configured Kitty or Ghostty outer terminal using native
  full-frame composition, Kitty Unicode placeholders, and DCS passthrough.
- This is a narrow transport exception to DEC-005, not a new renderer or a
  character-art fallback. Direct Kitty/Ghostty/WezTerm support is unchanged;
  Unicode-placeholder support through tmux is not claimed for WezTerm.
- Added [`docs/tmux.md`](./tmux.md) with user-applied setup, read-only
  diagnostics, limits, and the physical-smoke checklist.
- Recorded the user-approved tmux target: one full composited frame through
  local SHM only, with no automatic direct/file fallback. The current physical
  gate uses a real Kitty window and tmux 3.6a; it compares direct and tmux
  viewport, rect, readback, SHM, and passthrough evidence. Regions still wait
  for a later performance decision.

**Current tmux status (September 8, 2026):** The requested Kitty parity gate is
verified on a real Kitty window with tmux 3.6a: direct and tmux runs consume
the native SHM path and agree on viewport, rect, bytes, SHM names, and
passthrough routing. This is a physical transport gate, not pixel-exact
cross-terminal coverage, exhaustive interaction, Ghostty visual-parity, or FPS
certification. Automated results are summarized in
[`docs/tmux-parity-report.md`](./tmux-parity-report.md); internal live producer
timings are reported separately in
[`docs/tmux-performance-report.md`](./tmux-performance-report.md).

**Changelog from v0.6**:
- DEC-014 added: Rust retained scene graph / render graph / layout / event dispatch reverted based on cosmic-shell-1080p bench evidence (TS path 4.8× faster, 15.84 ms p95 vs 75.42 ms p95). TS retains scene graph, reactivity, layout (Flexily in TS), event dispatch, and canvas rasterization. Rust retains paint pipelines (WGPU), composite, Kitty encoding, SHM/file/direct transport, and image assets. DEC-012 partially superseded — only paint/composite/transport portion stands.
- Section 6 updated to reflect new TS/Rust boundary.
- Section 11 phase overlay updated: phases 3b-3g, 4a, 4b, 13 marked as reverted with evidence.
- Four public experimental flags removed from mount() API: `nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, `nativeEventDispatch`.

**Changelog from v0.5**:
- DEC-013 added: 120fps / 5ms performance program adopted as an aspirational v0.9+ execution track, with hard gates for no-op, dirty-region, compositor-only, and full-dashboard frame categories.
- Section 7.3 extended with explicit 120fps-class frame budgets. The release performance contract targets a 1080p (`1920×1080`) dashboard workload; the current `14.23 ms/frame` 800×600 offscreen measurement remains only a temporary dev baseline until the 1080p benchmark lands.
- Performance execution plan added for profiling, optimization phases, and CI gates (historical doc removed).

**Changelog from v0.4**:
- DEC-012 added: Rust-retained engine roadmap adopted as the execution path for the remaining engine migration (companion docs removed after DEC-014 revert).
- Section 6 extended with the retained-engine target: Rust owns scene graph, layout, damage, layer registry, render graph, frame orchestration, resources, paint, composite, hit-testing, and Kitty presentation; TypeScript remains the Solid/JSX shell, public API, hooks, callback registry, and compatibility fallback.
- Section 11 extended with a Rust-retained migration overlay that supersedes older TS-owned frame-pipeline assumptions after Native Presentation.

**Changelog from v0.3**:
- DEC-011 added: Phase 2 text rendering exception. Bitmap text is NOT ported to Rust during Phase 2. Text nodes render as placeholder (invisible or minimal fallback) until Phase 2b delivers MSDF. Rationale: founder decision to avoid ~200 LOC of bitmap Rust code that would be deleted in Phase 2b.
- Section 11 Phase 2 exit criteria modified to exclude text-bearing regions from the "visually identical" check for that phase only.

**Changelog from v0.2**:
- DEC-010 added: engine optimization Tier 1 + Tier 2 (Kitty encoding moved to Rust, WGPU PipelineCache, unified GPU memory budget, viewport culling, frame budget scheduler).
- Timeline adjusted: v0.9 from ~7 months to ~8 months to absorb Tier 1+2 optimizations.
- Section 5.1 extended with "Engine optimization (performance-critical)" subsection.
- Section 7.3 extended with cold-start-with-cache, encoding, VRAM budget, and viewport culling metrics.
- Phase 2b extended from 3-4 weeks to 5-6 weeks (absorbs Tier 1).
- Phase 3 extended from 3 weeks to 4 weeks (absorbs Tier 2).

**Changelog from v0.1**:
- DEC-008 added: Option B scope expansion (MSDF text, compositor-thread animations, filter on self, `will-change`/`contain` hints).
- DEC-009 added: WGPU confirmed as permanent cross-platform GPU abstraction. Native per-platform renderers (Metal/DX12/Vulkan directly) rejected.
- Timeline adjusted: v0.9 from ~6 months to ~7 months to accommodate DEC-008.
- Scope sections 5.1 and 5.2 updated accordingly.
- Performance targets in 7.3 extended with compositor animation metrics.

---

## ⚠️ How to use this document

This PRD records Vexart's product requirements, roadmap, and decisions. Read it
alongside the current code, tests, and
[docs/ARCHITECTURE.md](./ARCHITECTURE.md).

**Guidance for readers:**

- Use the requirements and decisions as product context and design intent.
- The Decisions Log includes historical process and migration decisions; those
  entries are labeled when they no longer govern current execution.
- If prose and implementation differ, inspect the current behavior and
  reconcile the smallest in-scope change rather than stopping automatically.

**Guidance for changes to this document:**

- Product scope or architecture changes should have founder approval and a dated
  Decisions Log entry.
- Renaming, scope changes, or monetization shifts should include a version bump.

---

## 1. Executive Summary

**Vexart** is a GPU-accelerated UI engine for the modern terminal. Developers write JSX (SolidJS), and Vexart renders browser-quality interfaces — anti-aliased corners, drop shadows, gradients, glow effects, backdrop filters, transforms — as real pixels in terminals that support the Kitty graphics protocol (Kitty, WezTerm, Ghostty). An experimental tmux route carries the same Kitty pixels through a Kitty or Ghostty outer terminal when tmux passthrough is configured; it does not introduce a cell-art fallback.

Unlike existing terminal UI libraries (Textual, Ratatui, Bubbletea, Ink, OpenTUI) which render ASCII-art UIs into character cells, Vexart renders **actual pixels**. The result looks like a web application rendered natively inside the terminal.

The product targets CLI tool builders as primary users, dev tool companies as commercial buyers, and terminal app builders as showcase users. Monetization follows a dual licensing model: free for personal use and small companies, commercial license required above $1M ARR.

Vexart is built on **state-of-the-art graphics technology**: SDF anti-aliased primitives, MSDF text rendering, WGPU cross-platform GPU pipeline (dispatches natively to Metal on macOS, Vulkan on Linux, DirectX 12 on Windows), compositor-thread animations for transform and opacity, and CSS-parity visual effects (shadows, gradients, glow, backdrop filters, self filters, blend modes). No feature ships using legacy techniques when a modern equivalent exists.

**v0.9** (this planning cycle, ~8 months) ships a developer preview with a stable public API, tested visual fidelity, a curated component set, and a fully optimized engine (native Kitty protocol encoding, unified GPU memory budget, viewport culling, pipeline cache, frame scheduler). **v1.0** follows once adoption signals validate production-readiness.

---

## 2. Product Vision

### 2.1 The problem

Terminal UIs are stuck in 1985. Developers building CLI tools, TUIs, or dev dashboards face a painful choice:

- **Cell-based TUI frameworks** (Textual, Ratatui, Bubbletea, Ink): constrained by character grids. Rounded corners are ASCII art. "Shadows" are gray characters. Interactive elements look dated regardless of how elegant the library API is.
- **Web-based Electron apps**: beautiful UI but launch in 3-5 seconds, eat 200MB RAM, and feel alien inside a terminal workflow.

Modern terminals (Kitty, WezTerm, Ghostty) have supported graphics protocols for years. The primitive is there. What's missing is an engine that turns JSX into GPU-accelerated pixel output without forcing developers to learn a new paradigm.

### 2.2 The solution

Vexart bridges JSX + SolidJS reactivity to a Rust-native GPU rendering pipeline using the Kitty graphics protocol. Developers write the UI the way they write React web apps. TypeScript owns scene graph, reactivity, layout (Flexily), render graph generation, event dispatch, and canvas rasterization; Rust owns paint (WGPU), composite, Kitty encoding, transport, and image assets.

The result:

- Pixel-perfect anti-aliased shapes using SDF primitives.
- CSS-parity visual effects: shadows, gradients, glow, backdrop filters, opacity, transforms.
- Reactive updates via SolidJS signals — no VDOM diffing.
- Adaptive render loop (8-60fps based on activity) so idle UIs don't burn CPU.
- Two-layer API: headless components (logic + accessibility, no styling) + styled defaults (opinionated theme).

### 2.3 Why now

- **Terminal graphics protocols are mature**: Kitty stabilized in 2018, WezTerm and Ghostty both support it, tmux supports passthrough via placeholders.
- **Developer preference shifted**: CLI-first dev tools are premium products (Warp, Zed, Charm's tooling, Supabase CLI, Vercel CLI). Market wants CLIs that look as good as web apps.
- **Rust ecosystem matured**: WGPU reached v29.0.1 stability, modern GPU abstractions enable universal cross-compilation via `cargo`.
- **AI dev tools need better terminal UIs**: agents, pair programmers, and CLI-first workflows are exploding. Whoever builds the visual layer for that ecosystem captures it.

### 2.4 Positioning statement

> **Vexart — terminal UIs that don't look like 1985.**
>
> The first GPU-accelerated UI engine for the modern terminal. Write JSX. Get pixel-perfect, anti-aliased interfaces in Kitty, WezTerm, and Ghostty. No ASCII boxes. No cell grids. Real browser-quality UI, rendered natively.

---

## 3. Target Users

### 3.1 Primary persona — "CLI tool builder"

**Profile**: Individual developer or small team building open-source or commercial CLI tools. Comfortable with TypeScript/React, values developer experience, uses Kitty/WezTerm/Ghostty as daily driver.

**Examples of what they build**: git TUIs (`lazygit`-like), Kubernetes dashboards, package managers, dev environment switchers, database clients, AI agent interfaces.

**Why they pick Vexart**:
- Ships better-looking CLIs with less effort than building custom ASCII art.
- Reuses React muscle memory.
- Drop-in primitives + styled components.

**Success metric**: 1000+ npm downloads/week of `@vexart/engine` by v1.0.

### 3.2 Secondary persona — "Dev tool company"

**Profile**: Company building a developer product (database, framework, CLI, cloud platform) that needs a polished terminal UI. Examples: Supabase, Vercel, PlanetScale, Neon, Turso, Astro.

**Why they pick Vexart**:
- Their CLI UX is a brand differentiator.
- Commercial license with SLA and custom theming.
- Polished components out of the box.

**Success metric**: 3+ commercial licenses signed by v1.0.

### 3.3 Tertiary persona — "Terminal app builder"

**Profile**: Ambitious developer building a full "app" for the terminal — editors, dashboards, games, note-taking tools, email clients, music players.

**Why they pick Vexart**:
- Needs advanced features: virtualization, animations, syntax highlighting, forms.
- Wants to showcase technical ambition.
- Produces viral demos that market Vexart for us.

**Success metric**: 5+ notable showcase apps by v1.0 (measured by GitHub stars or Twitter engagement).

### 3.4 Non-users (explicit exclusions)

- Developers who require pure-ASCII output (CI logs, plain terminals, screen readers).
- Users of terminals without Kitty graphics protocol support (iTerm2 with image protocol is out of scope for v0.9).
- Windows Terminal users (Windows support deferred to v1.x).
- SSH remote-only users (local-first in v0.9; remote tunneling of Kitty protocol deferred).

---

## 4. Value Proposition

### 4.1 Core promise

**"If you can build it with React, you can build it with Vexart — but it runs native, GPU-accelerated, in your terminal."**

### 4.2 Differentiation matrix

| | Textual (Python) | Ratatui (Rust) | Bubbletea (Go) | Ink (Node) | **Vexart** |
|---|---|---|---|---|---|
| **Language / API** | Python | Rust | Go | React/JSX | **React/JSX (Solid)** |
| **Rendering model** | Cell grid | Cell grid | Cell grid | Cell grid | **GPU pixel** |
| **Corner radius** | ASCII art | ASCII art | ASCII art | ASCII art | **SDF anti-aliased** |
| **Shadows** | Gray cells | Gray cells | Gray cells | None | **Real blur** |
| **Gradients** | Limited | None | None | None | **Linear / radial / conic** |
| **Backdrop blur** | No | No | No | No | **Yes** |
| **Transforms** | No | No | No | No | **Matrix (rotate/scale/skew)** |
| **Animations** | CSS-subset | Manual | Manual | Manual | **Declarative + spring physics + compositor-thread** |
| **Text rendering** | Cell fonts | Cell fonts | Cell fonts | Cell fonts | **MSDF (multi-channel signed distance field)** |
| **Virtualization** | Yes | Manual | Manual | Manual | **Built-in** |
| **GPU backend** | N/A (CPU) | N/A (CPU) | N/A (CPU) | N/A (CPU) | **WGPU (Metal / Vulkan / DirectX 12)** |
| **Required terminal** | Any | Any | Any | Any | **Kitty / WezTerm / Ghostty** (or experimental tmux over Kitty/Ghostty) |

**Core tradeoff we are making**: universal compatibility (ASCII works everywhere) in exchange for visual fidelity (pixels only work in modern terminals).

### 4.3 Pitch variations

**Technical audience (docs, GitHub README)**:
> "The first GPU-accelerated UI engine for the modern terminal. Write JSX, get pixel-perfect anti-aliased interfaces. No ASCII boxes. No cell grids. Real browser-quality UI in Kitty, WezTerm and Ghostty."

**Marketing / landing page**:
> "Vexart — terminal UIs that don't look like 1985."

**Investor / business**:
> "Vexart brings the web's design language to the terminal. If you can build it with React, you can build it with Vexart — but it runs native, GPU-accelerated, in your terminal."

---

## 5. Product Scope — v0.9 Developer Preview

### 5.1 In scope (must ship)

#### Primitives (JSX Intrinsics in `@vexart/engine`, App Components in `@vexart/app`)

The historical `@vexart/primitives` package was permanently purged and merged into `@vexart/app`. JSX intrinsic elements (`<box>`, `<text>`, `<image>`, `<canvas>`) are owned and recognized directly by `@vexart/engine`. The canonical `<Box>` and `<Text>` component wrappers with `className` support are provided by `@vexart/app`.

- `<box>`, `<text>`, `<image>`, `<canvas>` intrinsic elements (`@vexart/engine`).
- `<Box>`, `<Text>` application component wrappers with `className` compiler (`@vexart/app`).
- Layout: flexbox (row/column, gap, align, padding, sizing: fixed/grow/fit/percent).
- `margin` (per-side + shorthand).
- Sizing constraints: minWidth, maxWidth, minHeight, maxHeight.
- Absolute positioning: `floating`, `zIndex`, `floatOffset`, `floatAttach`.
- Scrolling: `scrollX`, `scrollY`, programmatic scroll via `createScrollHandle`.

#### Visual effects

- `cornerRadius` + per-corner (`cornerRadii`).
- `border` (uniform + per-side).
- `backgroundColor` (hex string or u32).
- `gradient`: linear, radial, and conic pipelines exist in Rust shaders (with multi-stop support); public TypeScript `GradientConfig` currently exposes `linear` and `radial` variants with 2 stops (`from`, `to`).
- `shadow`: dedicated analytic Gaussian box-shadow pipeline (`cmd_kind = 20`, `shadow.rs`, `shadow.wgsl`) supporting offset `(x, y)`, `blur`, `spread`, `color`, and multi-shadow arrays.
- `glow`: outer glow with plateau + falloff.
- `backdropBlur`, `backdropBrightness`, `backdropContrast`, `backdropSaturate`, `backdropGrayscale`, `backdropInvert`, `backdropSepia`, `backdropHueRotate`.
- `opacity` (element-level with isolated compositing).
- `transform` (declarative: translate, rotate, scale, skew — matrix-composed).
- **`filter` on own element** (self blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate — in addition to existing `backdrop-*` variants). CSS `filter:` parity.

#### Advanced rendering (state-of-the-art)

These features place Vexart at the cutting edge of graphics tech. All ship in v0.9.

- **MSDF text rendering** (Multi-channel Signed Distance Field):
  - Glyphs compiled to MSDF atlas once; rendered sharp at any font size with a single texture.
  - Replaces the v0.1 bitmap atlas path entirely for any font the user loads at runtime.
  - Shader-based, GPU-native, compositor-friendly.
  - Target: pixel-perfect text from 8px to 72px using one 1024×1024 atlas per font.
- **Compositor animations**:
  - Animations targeting `transform` and `opacity` on layer-backed nodes run on a dedicated compositor fast path.
  - Bypasses SolidJS reconciler traversal, Flexily layout recomputation, and paint command building, updating only GPU uniforms via FFI (`vexart_composite_update_uniform`).
  - Note: Bun/JS executes synchronously on a single event loop; this is an architectural loop-bypass optimization, not multi-threaded concurrency with a blocked JS thread.
  - Target: input-to-visual latency < 16ms during interaction bursts.
- **Declarative hints for the compositor**:
  - `willChange` prop — mirrors CSS `will-change`. Tells the compositor which properties will animate, enabling layer pre-promotion.
  - `contain` prop — mirrors CSS `contain: layout | paint | strict`. Tells the engine that a subtree is isolated, skipping invalidation propagation beyond the boundary.
- **WGPU cross-platform GPU backend**:
  - Single Rust codebase dispatching automatically to Metal (macOS), Vulkan (Linux), DirectX 12 (Windows, future).
  - WGSL shaders compiled once, run natively on every platform.
  - No per-platform renderer maintenance.

#### tmux presentation (experimental)

- tmux 3.4+ is supported as a narrow transport path when the outer terminal is
  Kitty or Ghostty, effective `allow-passthrough all` is applied by the user,
  the attached client advertises `RGB`, and runtime capability probes pass.
  The lower bound is conservative; verified PTY evidence is tmux 3.6a and does
  not measure every tmux version.
- TypeScript retains scene graph, layout, render graph, interaction, focus, and
  hit-testing ownership. Rust/WGPU paints and composites one complete frame,
  then emits it through the existing local SHM transport using a `U=1` virtual
  placement and the Kitty Unicode placeholder grid. The physical gate passes
  through a real Kitty window and tmux PTY; the producer and outer captures are
  checked separately so tmux's consumed DCS wrapper is not mistaken for a
  missing frame.
- Each Kitty APC is wrapped in its own tmux DCS passthrough envelope. Images
  and canvas content follow the same image-grid route; no ASCII or cell-art
  fallback is permitted. Direct baseline APCs use Kitty `q=2` to suppress both
  success and error replies; the SHM upload uses `q=1` for optional errors.
  SHM completion is `is_consumed`-driven, not ACK-driven.
- Retained GPU effects remain the same as the direct path. The approved tmux
  route is SHM-only: exactly one attached client across the tmux server, one in-flight upload plus the latest
  pending frame, and bounded cleanup on `is_consumed`, error, or timeout. It has
  no automatic direct/file fallback or per-layer patch transport; regions wait
  for later performance measurement. Kitty `a=f` animation updates are also not
  used because the Ghostty 1.3.1 target reports the action unimplemented.
- WezTerm remains a supported direct target, but Unicode-placeholder support
  through tmux is not claimed for WezTerm. Reattaching a session through a
  different outer terminal requires a fresh probe/restart.
- The implementation remains experimental. The six-tab Kitty direct/tmux review
  is user-confirmed qualitative acceptance; it does not establish pixel-exact,
  exhaustive interaction, Ghostty visual parity, or FPS evidence. See
  [`docs/tmux-parity-report.md`](./tmux-parity-report.md) and
  [`docs/tmux-performance-report.md`](./tmux-performance-report.md); [`docs/tmux.md`](./tmux.md)
  remains the canonical setup and checklist.

#### Grid layout (v1.x beta profile)

`layout="grid"` is an explicit terminal subset implemented by the vendored
`flexily` 0.6.0 workspace package. It is selected per container and shares the
existing TypeScript scene graph, Flexily node lifetime, layout map, render graph,
interaction, focus, hit-testing, transforms, scroll, floating, resize, and
damage pipeline; Rust/WGPU remains responsible for paint, composition, Kitty,
SHM/file/direct transport, and GPU resources. A failed calculation emits a
structured `GridLayoutError` and keeps the last valid rectangles for the frame.

The supported public profile includes explicit and implicit row/column tracks;
px, percentages, `auto`, `min-content`, `max-content`, `fr`, `minmax()`,
`fit-content()`, fixed `repeat()`, `auto-fill`, and `auto-fit`; named lines,
named areas, numeric/negative line references, spans, row/column auto-flow and
`dense`; numeric gaps, padding, borders and margins; intrinsic text measurement;
and nested Flex → Grid, Grid → Flex, and Grid → Grid containers. Public props and
types are documented in [`docs/agent-reference.md`](./agent-reference.md) and
are exported explicitly from the engine barrel.

Writing modes, subgrid, masonry, table/multicolumn layout, fragmentation,
CSSOM/cascade/selectors, baseline or safe alignment, and CSS auto margins are
outside this profile. Unsupported values are rejected with deterministic error
codes; there is no silent Flex fallback and no claim of full CSS/DOM
compatibility. The evidence set is the fixture matrix, independent browser
oracle, scene layout test, physical Kitty/tmux gate, API/build reports, and
serial performance report. This beta profile is released as
`0.10.0-beta.1`; full CSS/DOM compatibility is not implied.

#### Engine optimization (performance-critical)

These optimizations are shipped at v0.9 because they are **10× more expensive to retrofit later** — they touch core paths (frame loop, output, resource management). Gating them behind v1.0 would force a second major rewrite. See DEC-010 for rationale.

**Tier 1 — Baseline performance (non-negotiable)**:

- **Native Kitty protocol encoding in Rust**:
  - Base64 encoding + compression + escape sequence assembly move from JavaScript (`packages/output/src/kitty.ts`) to `libvexart`.
  - Stream directly from GPU readback → Rust encoder → stdout, skipping the JS event loop.
  - Target: encoding of a full 1920×1080 RGBA frame in <0.5 ms (currently ~3-5 ms in JS).
  - Unblocks compositor-thread animation latency target (<16 ms p95).

- **WGPU PipelineCache persisted to disk**:
  - All render pipelines cached under `~/.cache/vexart/pipeline.{platform}.bin`.
  - Cold start recompiles only on version change; warm start hits cache.
  - Target: cold start <120 ms (current: 200-500 ms with `cache: None`).

- **Unified GPU memory budget with priority-based eviction**:
  - Single resource manager in Rust with a configurable total budget (default 128 MB).
  - Global LRU across all caches: layer targets, font atlases, glyph atlases, image sprites, transform sprites, backdrop sprites.
  - Priority tiers: `Visible` (currently rendered) > `Recent` (used within last 5 seconds) > `Cold` (older).
  - Eviction pass at end of each frame when budget is exceeded.
  - Replaces the existing independent per-subsystem caches (`MAX_CACHE` constants in `text-layout.ts`, `font-atlas.ts`, `image.ts`, etc.).

**Tier 2 — Performance for scale (high ROI at v0.9)**:

- **Viewport culling (automatic `content-visibility: auto` equivalent)**:
  - During `walk-tree`, compute bottom-up bounding box per subtree.
  - Skip layout and paint for any subtree fully outside the visible terminal area.
  - Independent of `VirtualList` (which handles explicit virtualization for long lists).
  - Target: 40-70% reduction in walk+layout time for apps with 1000+ nodes where most are offscreen.

- **Frame budget scheduler with three priority lanes**:
  - `user-blocking` (input processing, focus changes) — always runs within frame.
  - `user-visible` (dirty layer repaint) — runs if budget allows.
  - `background` (cache warming, prefetch, telemetry) — only in idle windows.
  - Mirrors the semantics of `scheduler.postTask` in the web platform.
  - When a frame exceeds its budget, `background` tasks defer to next frame; `user-visible` tasks may split across frames.

**Tier 3 — 120fps-class retained runtime (v0.9+ aspirational, performance-contract tracked)**:

- **Goal**: make optimized retained paths capable of 120fps-class budgets without changing the public JSX API.
- **Frame budget math**: 120fps allows `8.33 ms/frame`; Vexart's aggressive engineering target is `5.0 ms` for optimized dirty/compositor paths to leave terminal/I/O headroom.
- **Baseline reality**: as of 2026-04-24, `bun run perf:check` reports `14.23 ms/frame` on the dashboard 800×600 offscreen benchmark. That benchmark is not the release contract; the 120fps program MUST add and optimize against a 1080p (`1920×1080`) dashboard benchmark because that is the normal desktop terminal size.
- **Scope**:
  - profiling-first instrumentation before optimization claims;
  - no-op frame and small dirty-region fast paths;
  - compositor-only transform/opacity path under `8.33 ms p95`;
  - full native canvas display-list GPU replay where canvas rendering is a bottleneck;
  - FFI/batch allocation reduction on the retained path;
  - CI gates for no-op, dirty-region, compositor-only, and full-dashboard frame categories.
- **Non-goal**: promising terminal-visible 120fps on every terminal. The engine can target 120fps-class production, but Kitty/Ghostty/WezTerm presentation loops and display refresh may cap perceived output.

#### Interaction

- Declarative state styles: `hoverStyle`, `activeStyle`, `focusStyle`.
- Event bubbling: `onPress` with `stopPropagation`.
- Per-node mouse events: `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`.
- Keyboard: `onKeyDown`, focus management (`focusable`, Tab navigation).
- Focus scopes (for Dialog-style focus traps).
- Pointer capture (`setPointerCapture` / `releasePointerCapture`).
- Hit-area expansion (min 1 cell for touch-like interaction).

#### Headless components (`@vexart/headless`)

Ship exactly 25 headless primitives (23 unstyled UI components + 2 state factories) with the render-prop pattern (context props for mouse/keyboard integration):

- **Inputs**: Button, Checkbox, Switch, RadioGroup, Input, Textarea, Slider, Select (SelectTrigger, SelectContent, SelectItem), Combobox. (9 components)
- **Display**: Code, Markdown, ProgressBar. (3 components)
- **Containers**: OverlayRoot, Portal, ScrollView, Tabs. (4 components)
- **Collections**: List, VirtualList, Table. (3 components)
- **Overlays**: Dialog (DialogOverlay, DialogContent, DialogClose), Tooltip, Popover. (3 components)
- **Navigation**: Diff (color-coded line diff viewer; app routing is provided canonically by `@vexart/app`). (1 component)
- **State factories**: `createForm` (form validation and field registration) and `createToaster` (toast notification manager). (2 factories)

Note: `<Box>` and `<Text>` are exported by `@vexart/app`; the old `@vexart/primitives` package was permanently merged into `@vexart/app`. `<Span>`, `<RichText>`, and `<WrapRow>` were purged in favor of nested `<Text>` and `<text>` elements.
Badge, Avatar, Skeleton, Separator, and Card are styled-only components in `@vexart/styled`.

#### Styled components (`@vexart/styled`)

Void Design System (OLED-calibrated dark theme inspired by shadcn/ui) with:

- Semantic tokens: colors (background, foreground, card, primary, secondary, muted, accent, destructive, border, input, ring), radius (sm/md/lg/xl/xxl/full), space[1-10], font sizes (xs-4xl), weights, shadows presets.
- Typography primitives: H1, H2, H3, H4, P, Lead, Large, Small, Muted.
- Styled Void components: `VoidBadge`, `VoidAvatar`, `VoidButton` (aliased as `Button`), `VoidCard` (CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction), `VoidCheckbox`, `VoidCombobox`, `VoidDialog` (VoidDialogTitle, VoidDialogDescription, VoidDialogFooter), `VoidDropdownMenu` (VoidDropdownMenuTrigger, VoidDropdownMenuContent, VoidDropdownMenuItem, VoidDropdownMenuSeparator, VoidDropdownMenuLabel), `VoidInput`, `VoidPopover`, `VoidProgress`, `VoidRadioGroup`, `VoidSelect`, `VoidSeparator`, `VoidSkeleton`, `VoidSlider`, `VoidSwitch`, `VoidTable`, `VoidTabs`, `createVoidToaster`, `VoidTooltip`, `VoidTextarea`, `VoidCode`, `VoidMarkdown`, `VoidList`, `VoidVirtualList`, `VoidScrollView`, `VoidDiff`.
- Zero-remount reactive runtime theming: `createTheme`, `setTheme`, `themeColors` (reactive SolidJS signal getters subscribing individual visual properties), `getTheme`, `getThemeVersion`. (No `ThemeProvider` or `useTheme` context wrapper needed).

#### Engine (`@vexart/engine`)

- SolidJS universal reconciler.
- Adaptive render loop (idle 8fps, active up to 60fps, interaction boost windows).
- Layer compositing with 3-phase assignment (scroll → background → static) and 5-frame hysteresis.
- Dirty tracking via signals.
- Input system: keyboard, mouse (SGR + URXVT modes), bracketed paste, focus tracking.
- Animation: `createTransition`, `createSpring`, 12 easing presets.
- Data: `useQuery`, `useMutation` (retry, refetch, optimistic + rollback).
- Syntax highlighting: tree-sitter integration with default parsers (TS, JS, Rust, Go, Python, Bash, JSON).
- Extmarks: virtual text / virtual lines for editors.
- Selection: text selection across nodes.
- Font atlas: runtime font loading (up to 15 atlases).
- Single native library: `libvexart.{dylib,so,dll}` (Rust: wgpu + composite + kitty encoder).

#### Quality

- **Golden image tests**: 40+ scenes, pixel diff threshold < 0.5%.
- **API stability**: SemVer 0.9; API surface locked via `api-extractor` snapshots; breaking changes require bump to 0.10 or 1.0.
- **Performance targets** (measured on M1 Pro / Kitty 0.41+):
  - First paint < 120ms.
  - Sustained 60fps on the "showcase" demo (all features active).
  - Input → visual response latency < 50ms (p95).
  - Idle CPU < 2%.
- **Documentation**: getting-started, API reference, component catalog, examples cookbook, architecture overview, migration notes.
- **Examples**: 15 working demos covering primitives, effects, components, interactions, and realistic app scaffolds.

### 5.2 Out of scope for v0.9 (deferred to v1.x)

- Full CSS Grid/DOM compatibility remains out of scope. The supported terminal
  Grid subset is documented above; writing modes, subgrid, masonry,
  table/multicolumn layout, fragmentation, CSSOM/cascade, baseline/safe
  alignment, and CSS auto margins remain excluded.
- `text-decoration`, `letter-spacing`.
- `transform-origin` as prop (defaults to center).
- HarfBuzz shaping (complex scripts: Arabic, Hindi, CJK with advanced kerning).
- Variable fonts (morph between weights).
- Color emoji (COLR/CBDT font tables).
- Subpixel antialiasing for text (MSDF gives near-equivalent sharpness).
- Priority scheduling for deferred work (`scheduler.postTask`-like API).
- Automatic `content-visibility: auto` equivalent (manual virtualization via `VirtualList` only).
- Hot reload.
- Multiple styled themes (one shipped; others community/premium).
- Terminal-aware DevTools inspector.
- SSH remote rendering optimization.
- Windows support.
- iTerm2, Alacritty, xterm backends.
- tmux with an unsupported outer terminal, tmux older than 3.4, or a disabled
  `allow-passthrough` option; see the experimental Kitty/Ghostty route in
  Section 5.1 and [`docs/tmux.md`](./tmux.md).
- Plugin marketplace.
- Accessibility / screen reader integration.
- Server-side rendering / pre-render.
- Mobile terminals (Termux, iSH).

### 5.3 Removed from scope (previously present, being deleted)

During v0.9 development we are explicitly **deleting** the following assets. These are not deprecated for backward-compat — they are gone.

- **Zig CPU paint path** (entire `zig/` directory and `@tge/pixel` package).
- **Output backends other than Kitty**: the legacy `output-placeholder` and
  `output-halfblock` (ANSI fallback) backends. The current tmux route uses
  Kitty Unicode placeholders over passthrough and does not restore either
  backend.
- **Clay C layout engine** (replaced by Taffy).
- **Bun/TypeScript "CPU mode" branches** in the render loop.
- **Bitmap font atlas path** (replaced by MSDF atlas; the 89-glyph ASCII bitmap is removed once MSDF ships).
- **Per-platform native renderers were considered and rejected** — see DEC-009. WGPU remains the only GPU abstraction.

See Phase 2 in Section 11.

---

## 6. Technical Architecture

### 6.1 The four-layer architecture

Vexart is organized as four strictly-layered packages. Each layer depends only on layers below it — **lateral imports and upward imports are prohibited**.

```
┌───────────────────────────────────────────────┐
│   User's app                                  │
│   <VoidButton variant="primary">Save</VoidButton> │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/app                                 │
│   — App framework + <Box>, <Text> wrappers    │
│   — Tailwind-like className runtime compiler  │
│   — Router, CLI, and app lifecycle            │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/styled                              │
│   — Void design system themed components      │
│   — Tokens (colors, radius, spacing, shadows) │
│   — Typography primitives (H1-H4, P, Lead)    │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/headless                            │
│   — 25 UI & state primitives                  │
│   — Render-prop components (ctx.*Props)       │
│   — Zero visual opinions                      │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/engine                              │
│   — JSX intrinsics: <box>, <text>, <img>,     │
│     <canvas>                                  │
│   — SolidJS reconciler + TS scene graph       │
│   — Render loop + Flexily layout adapter      │
│   — Hooks (useFocus, useKeyboard, useMouse)   │
│   — FFI bridge to libvexart (50 functions)    │
│   — Terminal lifecycle, input parsing         │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   libvexart.{dylib,so,dll} (Rust cdylib)      │
│   — WGPU 29.0.1 (21 shader pipelines)         │
│   — Kitty graphics protocol encoder           │
│   — Composite, transport, GPU resources       │
└──────────────────────┬────────────────────────┘
                       ▼
                  Terminal
          (Kitty / WezTerm / Ghostty)
        [experimental tmux passthrough
          over Kitty / Ghostty]
```

**Internal Packages (Dev & Build Only)**:
- `@vexart/internal-atlas-gen`: CLI generator converting TTF fonts to MSDF atlas PNGs and metrics JSON.
- `@vexart/internal-devtools`: internal MCP devtools server for inspector integrations.
- `@vexart/internal-flexily`: vendored Flexily 0.6.0 pure-JavaScript Flex and Grid solver. `@vexart/engine` depends directly on `flexily` for all scene graph layout computation without native layout FFI.

`@vexart/app` depends on `styled`, `headless`, and `engine`; the vertical
diagram shows the primary public path, while the direct engine/headless edges
are listed below.

tmux is a transport/presentation boundary rather than a renderer: the pane's
text stream carries Kitty Unicode placeholders and per-APC DCS passthrough
wrappers to the outer Kitty or Ghostty terminal. It does not change the
TypeScript/Rust ownership split or add an ASCII/cell-art backend.

### 6.2 Layer dependency rules (enforced by lint)

- `@vexart/engine` depends on: nothing Vexart-internal (only `solid-js`, `bun:ffi`, `libvexart`).
- `@vexart/app` depends on: `@vexart/styled`, `@vexart/headless`, `@vexart/engine`.
- `@vexart/headless` depends on: `@vexart/engine`.
- `@vexart/styled` depends on: `@vexart/headless`, `@vexart/engine`.

**Prohibited**:
- Relative imports across packages (`../../otro-paquete/src/...`).
- Any reverse dependency (engine importing from headless, etc.).
- Sibling imports at the same layer (e.g., `@vexart/styled` importing from another styled-tier module that doesn't exist).

CI enforces this via `dependency-cruiser` or `eslint-plugin-boundaries`. Violations fail the build.

### 6.3 Stack decision — TypeScript + Rust only

Final language stack for Vexart v0.9:

| Layer | Language | Runtime | Why |
|---|---|---|---|
| User-facing API | TypeScript/TSX | Bun | JSX is the product's surface; SolidJS is the reconciler; Bun offers the best FFI perf. |
| Engine orchestration | TypeScript | Bun | Reconciler, loop, signals, hooks. |
| Native core | Rust | Compiled to cdylib | WGPU (paint pipelines) + composite + Kitty protocol encoder + GPU resources in one binary. Layout is TS-side via Flexily. |

**Rejected alternatives**:
- C (Clay) — replaced by Taffy (Rust, performance parity, richer features, unified binary).
- Zig — deleted entirely (CPU fallback no longer supported).
- C++ (Yoga) — would add complexity and duplicate Taffy's feature set.
- Go or Dart — would replace TypeScript, killing the JSX developer ergonomics that differentiates Vexart.

**Benefits of 2-language stack**:
- One native binary (`libvexart`), one FFI boundary, one build command (`cargo build --release`).
- Layout stays TypeScript-side via Flexily, while Rust owns paint/presentation behind one paint-forward FFI boundary.
- Cross-compilation trivial via `cargo` (macOS + Linux for v0.9, Windows in v1.x).

### 6.4 Native FFI contract

The FFI boundary between TypeScript and Rust follows a strict **packed ArrayBuffer pattern** for ARM64 safety:

- All exported functions take ≤8 parameters.
- Functions with more parameters use a shared `ArrayBuffer(64)` pointer, with fields at fixed byte offsets.
- The ArrayBuffer is stack-allocated in the calling TypeScript — zero heap allocations at 60fps.
- All exports prefixed `vexart_`.

This pattern is inherited from the Zig FFI (which it replaces) and the existing `wgpu-canvas-bridge.ts` (which it absorbs).

### 6.5 Public API policy

- Each package exports a single `public.ts` that explicitly lists exported symbols. **No `export *` from index.**
- API surface is snapshotted in git via `api-extractor`. Any change to the `.api.md` files triggers a CI gate that requires a human-approved PR.
- Internal modules (render graph, layer compositor, GPU backend internals, etc.) are **not** exported and may change without notice.
- Plugin extensibility goes through documented extension points: `RendererBackend`, slot registry, theme system, font atlas.

### 6.6 Component API policy (headless)

Every headless component exposes its render API via a **render prop with context**:

```tsx
<Button
  onPress={() => save()}
  renderButton={(ctx) => (
    <box {...ctx.buttonProps} padding={8} cornerRadius={6}>
      <text>Save</text>
    </box>
  )}
/>
```

- `ctx.*Props` objects are stable contracts. Adding a field is minor (0.x.+1). Removing or renaming is breaking (0.+1.0).
- Styled components wrap headless components and supply their own renderers with token-based styling.

### 6.7 TS/Rust paint-forward engine boundary

DEC-014 supersedes the retained scene/layout/render/event portions of the historical Rust-retained roadmap documents (`PRD-RUST-RETAINED-ENGINE.md` and `ROADMAP-RUST-RETAINED-ENGINE.md`). Those documents were removed after the plan was reverted; only the paint/composite/transport portions remain current.

The target ownership model is:

```txt
JSX (SolidJS createRenderer)
  -> reconciler (TS): scene graph + reactivity
    -> walk-tree (TS): visual props, text measurement, interaction metadata
      -> layout (Flexily in TS): flexbox, sizing, positioned commands
        -> render graph (TS): ordered paint commands and layer plan
          ===== FFI boundary: paint-forward only =====
          -> paint pipelines (Rust/WGPU)
            -> composite (Rust)
              -> Kitty encoding (Rust)
                -> SHM / file / direct transport (Rust)
```

TypeScript owns:

- SolidJS custom renderer adapter, scene graph, and reactivity.
- `walk-tree`, layout via Flexily in TS, render graph generation, layer plan, event dispatch, interaction, focus, hit-testing, and callback registry.
- Public package APIs, types, hooks, components, terminal lifecycle, and explicit fallback/test/offscreen APIs.

Rust owns:

- WGPU paint pipelines, effect shaders, text paint, and paint command dispatch.
- Composite, layer registry targets, dirty-region readback needed by presentation, Kitty encoding, and SHM/file/direct transport.
- Image assets, GPU resources, pipeline cache, and native stats for paint/composite/presentation cost.

Normal terminal presentation MUST NOT return raw RGBA buffers to JavaScript. RGBA readback into JS is allowed only for explicit screenshot, debug, test, or offscreen APIs.

The experimental tmux route preserves this boundary. Rust reads back and emits
one complete composited frame through the approved local SHM path, followed by
Kitty Unicode placeholder placement; TypeScript receives no presentation
pixels. The production code path is PASS at the real-tmux-PTY level; the
prior direct full-frame run is a comparison baseline, not an automatic
fallback. tmux has no automatic direct or file fallback, and regions wait for a
later performance measurement. Kitty
`a=f` animation updates are not used because the Ghostty 1.3.1 target reports
the action unimplemented.

This section supersedes older wording that assigns scene graph, layout, render graph generation, event dispatch, or frame orchestration ownership to Rust. The four public retained-native flags (`nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, `nativeEventDispatch`) have been removed from `mount()`.

---

## 7. Quality Bar

### 7.1 Correctness

- Every public API function has a type-level test (compile-time check of signatures).
- Every interactive component has a keyboard + mouse integration test.
- Every visual effect has at least one golden image reference.

### 7.2 Visual regression

- **Golden image suite**: 40+ scenes in `tests/visual/`, each with a reference PNG.
- **Diff threshold**: 0.5% of pixels may differ before CI fails.
- **Refresh command**: `bun run test:visual:update` regenerates references after human review.
- **Backend coverage**: Kitty direct (primary). WezTerm and Ghostty in v0.9 via manual smoke checklist (automated matrix in v1.0). tmux over Kitty/Ghostty remains experimental; the six-tab Kitty direct/tmux review is user-confirmed qualitatively, not pixel-exact, exhaustive interaction, Ghostty visual-parity, or FPS evidence.

### 7.3 Performance

Measured on Apple M1 Pro, Kitty 0.41+, 2560×1600 retina:

| Metric | Target | Measurement |
|---|---|---|
| **Cold start — first run** | < 120 ms | Time from `mount()` to first visible pixel, empty pipeline cache. |
| **Cold start — warm cache** | < 50 ms | Time from `mount()` to first visible pixel, pre-existing `pipeline.{platform}.bin`. |
| Sustained frame time (idle) | < 2 ms @ 8 fps | 99th percentile walk+layout+paint time. |
| Sustained frame time (active) | < 10 ms @ 60 fps | 99th percentile during `showcase.tsx` interactions. |
| **No-op retained frame** | < 1 ms (p99) | No scene mutation; Rust/TS shell must avoid render graph rebuild and GPU work. |
| **Small dirty-region frame** | < 5 ms (p95) | Single dirty layer/region such as hover, focus ring, cursor, or button state. |
| **Compositor-only transform/opacity frame** | < 8.33 ms (p95) | 120fps-class budget for layer-uniform updates bypassing layout/paint. |
| **Full dashboard 1080p frame** | < 8.33 ms aspirational, < 10 ms release gate | `1920×1080` realistic dashboard workload (`bun run bench:dashboard-1080p`). `perf:check` (800×600) remains a dev smoke test. |
| Input-to-visual latency (typical) | < 50 ms (p95) | Keyboard event → rendered frame in user's eyes. |
| Input-to-visual latency (compositor-animated transform/opacity) | < 16 ms (p95) | For properties running on the compositor fast path. |
| Frame time for compositor fast path | < 8.33 ms (p95) | Bypasses SolidJS reconciliation, layout, and paint command building, updating only uniforms via FFI. |
| MSDF text throughput | 10,000+ glyphs/frame | At 60fps without frame drops, single 1024×1024 MSDF atlas. |
| **Kitty protocol encoding (full 1920×1080 RGBA frame)** | < 0.5 ms | Native Rust path from GPU readback to stdout-ready bytes. |
| **Viewport culling savings (large tree)** | ≥ 40% walk+layout time saved | Synthetic benchmark: 1000-node tree with 100 visible nodes. |
| **Frame budget scheduler — user-blocking tasks** | Always within frame | No deferral; input handling never skips a frame. |
| Idle CPU | < 2% of one core | Measured during 30 seconds of zero input. |
| Memory baseline (empty app) | < 50 MB | RSS after mount, 5 seconds idle. |
| Memory steady state (showcase) | < 150 MB | RSS during 60 seconds of interaction. |
| GPU memory per font (MSDF) | ≤ 4 MB | One 1024×1024 RGBA8 atlas. |
| **GPU memory total (configurable budget)** | Default 512 MB | Unified resource manager enforces cap; exceeds trigger LRU eviction. |

CI runs `bun run bench:dashboard-1080p` and `bun run perf:check` on performance gates. Specific optimization regressions (cold-start-warm, Kitty encoding, viewport culling savings, retained no-op, dirty-region, compositor-only, and dashboard frame categories) have dedicated micro-benchmarks in `bench:optimizations`.

The tmux route is not included in the direct-terminal performance targets above.
Its approved target is one full composited frame through local SHM, with one
attached client and bounded `is_consumed`/error/timeout cleanup. The prior direct
full-frame run is a comparison baseline, not SHM validation. Measure bytes and
latency before considering regions; no FPS or physical-presentation claim is
made here. Kitty `a=f` animation updates are not used because the Ghostty 1.3.1
target reports the action unimplemented.

### 7.4 Supported terminals (v0.9)

| Terminal | Support level | Notes |
|---|---|---|
| **Kitty** 0.41+ | **Primary** | Full feature set, all effects, SHM transport. |
| **Ghostty** | **Primary** | Full feature set, direct transport. |
| **WezTerm** 2025.04+ | Primary | Full feature set, direct transport. |
| **tmux** 3.4+ over Kitty/Ghostty | **Experimental** | User applies effective `allow-passthrough all`; native one-frame local-SHM route is synthetic tmux-PTY PASS; no automatic direct/file fallback. Six-tab Kitty direct/tmux review is user-confirmed qualitatively; live producer timings are internal, not visible FPS; Ghostty visual parity remains unverified. |
| tmux over WezTerm; Alacritty, iTerm2, Windows Terminal | **Unsupported / not claimed** | No alternate pixel protocol; engine exits with clear error on startup. |

### 7.5 Platform support (v0.9)

- macOS (aarch64, x86_64) — primary.
- Linux (x86_64, aarch64) — primary.
- Windows — **out of scope for v0.9**.

---

## 8. Monetization

### 8.1 License model — dual licensing

Vexart is **source-available** (not open-source) under the following model:

**Vexart Community License** (free):
- Personal projects (non-commercial).
- Open-source projects using permissive licenses (MIT, Apache 2.0, BSD).
- Commercial use by individuals or entities with <$1M USD annual revenue in the most recent fiscal year.

**Vexart Commercial License** (paid):
- Required for entities with ≥$1M USD annual revenue.
- Priced at **$299 USD per developer per year** (prepaid annually).
- Includes email support (48h response SLA), security patches, minor version updates.

**Vexart Enterprise License** (paid, negotiated):
- Custom pricing starting at $10,000 USD per year.
- Includes: priority support (24h SLA), custom theming, consulting hours, dedicated Slack/Discord, influence on roadmap.

### 8.2 Distribution model

- Source code is **public** on GitHub under a source-available license.
- Binaries distributed via npm (pre-compiled native lib per platform).
- License verification is **honor-based** (no DRM). Enterprise customers sign MSA.

### 8.3 Go-to-market phases

**Phase GTM-1 — Private beta** (during v0.9 development):
- Invite-only: 10-20 hand-picked CLI tool builders and dev tool company contacts.
- Feedback channel: private Discord.
- No public marketing.

**Phase GTM-2 — Developer preview launch** (at v0.9 release):
- Public announcement: HackerNews, Twitter/X, dev.to, lobste.rs.
- Landing page with interactive demo video.
- First 3 commercial sign-ups get 50% lifetime discount.

**Phase GTM-3 — v1.0 launch** (post-validation):
- Full public docs and tutorials.
- Case studies from commercial customers.
- Paid ads in developer-focused channels.

### 8.4 Revenue projections (hypothesis, not commitment)

Year 1 (v0.9 + v1.0 launch):
- 3 commercial seats (early adopter friends): $900.
- 1 enterprise contract: $10,000.
- **Target: $10,000-$15,000.** (Not sustaining; validation phase.)

Year 2:
- 30 commercial seats: $9,000.
- 3 enterprise contracts: $30,000.
- **Target: $40,000-$60,000.**

Year 3:
- 100 commercial seats: $30,000.
- 10 enterprise contracts: $100,000.
- **Target: $130,000-$200,000.** (Sustaining solo founder.)

---

## 9. Success Metrics

### 9.1 v0.9 release criteria (all must be met)

- [ ] All "in scope" items from Section 5.1 implemented and documented.
- [ ] Golden image suite of 40+ scenes passing in CI.
- [ ] Public API locked and snapshotted (`api-extractor`).
- [ ] Performance targets from Section 7.3 met on reference hardware.
- [ ] 15 working example apps.
- [ ] Documentation site deployed.
- [ ] License verification process documented.
- [ ] 10 private beta users actively using Vexart.
- [ ] Zero P0 bugs open.
- [ ] Zero known security vulnerabilities.

### 9.2 v1.0 release criteria (post-v0.9)

- [ ] 90 days of v0.9 in the wild with <5 P0 bugs per month.
- [ ] Grid v1.x beta profile graduates to a versioned release (full CSS/DOM
  compatibility is not a v1.0 requirement).
- [x] Declarative transition API shipped (`createTransition`, `createSpring`).
- [x] Filter-on-self effect (`cmd_kind=19`, `filter.rs`, `self_filter.wgsl`).
- [ ] Windows support.
- [ ] First 3 paid commercial licenses signed.
- [ ] First enterprise contract signed.
- [ ] 1000+ npm downloads/week.

### 9.3 North star metric

**Weekly active developer projects** using `@vexart/engine` (measured via telemetry opt-in). Target: 500 by end of Year 1, 5000 by end of Year 2.

---

## 10. Non-Goals and Hard Constraints

### 10.1 Non-goals (explicit)

- Vexart is **not** a universal TUI framework. It does not aim to run on every terminal.
- Vexart is **not** a replacement for web apps. It targets the terminal workflow specifically.
- Vexart is **not** accessibility-first for screen readers. Terminal accessibility is a known gap and not prioritized for v0.9 or v1.0.
- Vexart does **not** support server-side rendering or static HTML output.
- Vexart does **not** ship its own reactive runtime — it uses SolidJS.
- Vexart does **not** ship its own layout engine — it uses Flexily (pure JavaScript, Yoga-compatible API).

### 10.2 Hard technical constraints

- **GPU acceleration mandatory**: every visual effect must have a WGPU-backed implementation. No CPU fallback.
- **Kitty graphics protocol required**: no ASCII or cell-based fallback.
- **Two-language rule**: TypeScript + Rust only. Adding a third language requires a PRD amendment with founder approval.
- **Native surface is a single binary**: `libvexart` ships all native code. No sub-binaries for individual features.
- **FFI params ≤8**: all Rust exports respect ARM64 register limits.
- **Zero-alloc hot path**: no heap allocations in per-frame FFI calls (enforced by packed ArrayBuffer pattern).

### 10.3 Process constraints

- **Solo development**: founder is the only developer for v0.9. No outside contributors.
- **Public repository**: source-available on GitHub. Community contributions welcome via PRs and issues.
- **8 hours of focused coding per day, 5-6 days per week**: sustainability over sprint.
- **Bi-weekly architectural reviews**: founder reviews progress with external senior advisor every 2 weeks.
- **Historical process note**: Earlier v0.9 planning used Spec-Driven Development
  (SDD: propose → spec → design → tasks → apply → verify → archive). This remains
  historical context in the Decisions Log, not a current execution requirement.

---

## 11. Roadmap — 7 Phases to v0.9

Timeline assumes 8 hours/day of focused coding, solo, with bi-weekly reviews. Total ~8 months including buffer.

**Summary:**

| Phase | Name | Duration | Output |
|---|---|---|---|
| 0 | Architectural alignment | 3 days | PRD + ARCHITECTURE + API-POLICY + historical SDD bootstrap |
| 1 | Structural cleanup | 2 weeks | 4-package monorepo with enforced boundaries |
| 2 | Native consolidation | 3 weeks | Single `libvexart` Rust binary (Taffy + WGPU, no Zig/Clay) |
| 2b | Advanced rendering + Tier 1 optimizations | 5-6 weeks | MSDF text + compositor animations + self filters + hints + native Kitty encoding + pipeline cache + GPU memory budget |
| 3 | Loop decomposition + Tier 2 optimizations | 4 weeks | Testable pipeline phases (`loop.ts` < 400 lines) + viewport culling + frame budget scheduler |
| 4 | Public API + visual testing | 2 weeks | `api-extractor` locked, 40+ golden image tests |
| 5 | Polish + launch | 2-3 weeks | Docs site, marketing, v0.9 Developer Preview released |
| Buffer | Absorbs overruns | ~2 weeks built-in | — |

### Phase 0 — Architectural Alignment (3 days)

**Goal**: Lock decisions before writing or deleting code.

- [ ] `docs/ARCHITECTURE.md` with the 4-layer architecture and dependency rules.
- [ ] `docs/API-POLICY.md` with the public/internal contract policy.
- [ ] `docs/CHANGELOG-PRD.md` initialized.
- [x] **Historical**: SDD framework was initialized in `/openspec/`; this is
  retained for records and is not required for current changes.
- [ ] Final package names confirmed: `@vexart/engine`, `@vexart/app`, `@vexart/headless`, `@vexart/styled` (the old primitives layer is merged into app).
- [ ] This PRD finalized and committed.

**Exit criteria**: founder reviews all docs, commits them to `main`.

### Phase 1 — Structural Cleanup (2 weeks)

**Goal**: Leak-free package boundaries.

- Delete 7 ghost packages with zero source files (`compat-*`, `compositor`, `output-compat`, `render-graph`, `scene`, `text`).
- Merge or delete stub packages with <10 lines (`layout-clay`, `platform-terminal`, `output-kitty`, `gpu`).
- Declare explicit `dependencies` in every `package.json`.
- Replace every `../../otro-paquete/src/...` import with `@vexart/otro-paquete`.
- Resolve cycles that emerge.
- Rename packages to final names (`@tge/*` → `@vexart/*`).
- Add `dependency-cruiser` with layer-boundary rules to CI.
- Update examples and scripts for new structure.

**Exit criteria**: CI passes with lint + typecheck + tests.

### Phase 2 — Native Consolidation (3 weeks)

**Goal**: One native binary (Rust-only), kill C and Zig.

- Inventory all Zig FFI usages from TypeScript.
- Delete `starfield`/`nebula` Zig demos (founder decision — procedural demos not in v0.9 scope).
- Port missing Zig primitives to Rust/WGPU:
  - Conic gradients.
  - Multi-stop linear/radial gradients.
  - Outer glow / halo.
  - Blend modes (top 4: normal, multiply, screen, overlay).
  - Inset shadow (if used).
- Replace Clay with Taffy:
  - Map Clay's layout commands to Taffy's API.
  - Preserve ID hashing for layer assignment.
  - Validate on `showcase.tsx` demo.
- Merge WGPU bridge + Taffy into single `libvexart` cdylib.
- Delete: `zig/`, `vendor/clay*`, `@tge/pixel`, output-placeholder, output-halfblock, `gpu-frame-composer` (no more CPU/GPU switch).
- Simplify `loop.ts` (remove ~400 lines of CPU/GPU branches).
- **Text rendering exception (DEC-011)**: bitmap text is NOT ported to Rust. Text nodes render as a minimal placeholder (no glyphs painted) until Phase 2b. The `vexart_text_*` FFI surface exists as stubs returning success without side effects.

**Exit criteria**: `bun run showcase` produces output that is **visually identical to pre-migration for all non-text regions** (verified by golden image diff with text regions masked out). Text-bearing regions are expected to be blank during Phase 2 per DEC-011 and are re-validated in Phase 2b when MSDF lands. Phase 3 does NOT start until Phase 2b closes the text gap and the unmasked `showcase` diff passes.

### Phase 2b — Advanced Rendering + Tier 1 Optimizations (5-6 weeks)

**Goal**: Ship the state-of-the-art rendering features (DEC-008) alongside the Tier 1 performance optimizations (DEC-010). These are bundled in the same phase because both touch `libvexart` and the output pipeline — doing them together avoids two separate stability windows.

#### Advanced rendering (DEC-008) — 3-4 weeks

**MSDF text pipeline** (~2 weeks):
- Build MSDF atlas generator tool (offline: TTF → MSDF PNG + metrics JSON).
- Extend `libvexart` with MSDF shader (WGSL): distance-field sampling, subpixel edge reconstruction, supersize-safe rendering.
- Replace runtime font loading path (`tge_load_font_atlas`) with MSDF atlas loading.
- Support font sizes 8px–72px with single 1024×1024 atlas per font.
- Migrate `@vexart/styled` typography tokens to MSDF.
- Delete the 89-glyph ASCII bitmap path.

**Compositor-thread animations** (~1 week):
- Add animation descriptor system: when `transform` or `opacity` animates via `createTransition` or `createSpring`, mark the target as compositor-animated.
- Extend layer system: compositor-animated nodes get persistent GPU targets; per-frame updates only touch transform/opacity uniforms, not paint commands.
- Runtime enforcement: if a compositor-animated node also changes a non-animatable property (size, color), fall back to normal path with a warning.
- Benchmark: verify 60fps under saturated main thread.

**Self filters** (~3 days):
- Add `filter` prop parallel to `backdropFilter`: `filter={{ blur: 4, brightness: 80 }}`.
- Reuse backdrop-filter shader pipeline with source bound to the element's own paint output.
- Document which filter combos compose cleanly (blur + color filters OK; blur + transform requires isolated layer).

**Declarative hints** (~3 days):
- `willChange?: string | string[]` prop — tells compositor to pre-promote a layer.
- `contain?: 'none' | 'layout' | 'paint' | 'strict'` prop — tells engine to short-circuit invalidation at the boundary.
- Document performance implications in `docs/performance.md`.

#### Tier 1 optimizations (DEC-010) — 2 weeks

**Native Kitty protocol encoding in Rust** (~5 days):
- Port base64 encoding, compression (zlib/zstd), and Kitty escape-sequence assembly from `packages/output/src/kitty.ts` to `libvexart`.
- Expose a single FFI call: given a GPU readback handle + target image ID, write encoded bytes directly to stdout via buffered writer.
- Benchmark against current TS path on a 1920×1080 RGBA frame.
- Target: <0.5 ms per full-frame encode (current: ~3-5 ms).

**WGPU PipelineCache persisted to disk** (~2 days):
- Replace all `cache: None` with a shared `PipelineCache` handle.
- Cache binary at `~/.cache/vexart/pipeline.{platform}-{version}.bin`.
- Invalidate on Vexart version change.
- Validate cold start <120 ms (empty cache) and <50 ms (warm cache) on reference hardware.

**Unified GPU memory budget with priority eviction** (~1 week):
- Design a `ResourceManager` struct in Rust holding all GPU-resident assets: layer targets, font atlases, glyph atlases, image sprites, transform sprites, backdrop sprites.
- Add a `Priority` enum (`Visible`, `Recent`, `Cold`) per resource; update on use.
- Implement LRU eviction with a global budget (default 128 MB, configurable via `mount({ gpuBudgetMb: N })`).
- Migrate the existing independent caches (`MAX_CACHE`, `MAX_FONT_ATLAS_CACHE`, `MAX_IMAGE_CACHE`, etc.) to route through the `ResourceManager`.
- Add telemetry: `getRendererResourceStats()` reports current usage, high-water mark, eviction count.

**Exit criteria**:
- MSDF text renders sharp at 8px, 16px, 32px, 72px (golden tests).
- Compositor animation benchmark maintains 60fps with main thread saturated.
- Kitty encoding benchmark hits <0.5 ms for 1920×1080 RGBA frame.
- Cold start <50 ms with warm pipeline cache.
- GPU budget benchmark: lifespan of 200 fonts + 500 images stays within 128 MB with zero crashes (exceeds trigger eviction).
- All new props appear in `TGEProps` type with tests.
- `showcase.tsx` demonstrates each new feature with a dedicated tab.

### Phase 3 — Loop Decomposition + Tier 2 Optimizations (4 weeks)

**Goal**: Break the god module into testable phases AND layer in the Tier 2 optimizations that live in those phases.

#### Loop decomposition — 3 weeks

- Extract `walk-tree.ts` (input: node tree → output: layout commands + interactive nodes). Unit tests with fixture JSON.
- Extract `layout.ts` (input: walk result → output: positioned commands + damage).
- Extract `assign-layers.ts` (input: layout frame → output: layer plan).
- Extract `paint.ts` (input: layer plan + backend → output: paint result).
- Extract `composite.ts` (input: paint result + terminal → output: protocol bytes).
- Reduce `loop.ts` to ~300 lines of coordination.
- Integration tests: end-to-end frame fixtures → expected output.

#### Tier 2 optimizations (DEC-010) — 1 week

**Viewport culling inside `walk-tree.ts`** (~4 days):
- Compute per-node bounding box bottom-up during walk.
- Short-circuit walk for subtrees whose AABB is fully outside the terminal's visible area.
- Preserve walk for scroll containers whose children may move into view next frame.
- Add `debugDumpCulledNodes()` to runtime debug exports for introspection.
- Micro-benchmark: 1000-node tree, 100 visible → verify ≥40% wall-time reduction vs unculled baseline.

**Frame budget scheduler** (~3 days):
- Design a three-priority task queue in `runtime/frame-scheduler.ts`: `user-blocking`, `user-visible`, `background`.
- Integrate with `loop.ts` such that each frame drains queues in priority order with a per-frame budget (default 12 ms leaving 4 ms slack on a 16.6 ms frame).
- `user-blocking` tasks never skip.
- `user-visible` tasks may split across frames (e.g. layer repaint continues next frame if budget exhausted).
- `background` tasks only run when the loop detects an idle window (no input, no dirty layers).
- Expose scheduling hooks: `scheduleTask(priority, fn)` as an internal runtime utility.

**Exit criteria**:
- Each pipeline phase testable in isolation.
- `loop.ts` under 400 lines.
- Viewport culling benchmark confirms ≥40% walk+layout savings on reference synthetic tree.
- Frame scheduler benchmark: under a synthetic heavy-background workload (10× tasks), `user-blocking` input handling never misses a frame.

### Phase 4 — Public API & Visual Testing (2 weeks)

**Goal**: v0.9-rc ready.

- Create `public.ts` per package with explicit exports.
- Remove all `export *` from entry points.
- Configure `api-extractor` to snapshot `.api.md` files.
- CI gate: any diff in `.api.md` requires PR approval.
- Type-strict the reconciler: eliminate `any` casts, build discriminated-union prop handlers.
- Auto-generate `jsx-runtime.d.ts` from `TGEProps`.
- Build golden image harness: 40 scenes covering primitives, effects, components, interactions.
- CI gate: pixel diff > 0.5% fails.
- Command `bun run test:visual:update` for reference regeneration.

**Exit criteria**: API snapshot clean, 40 golden tests passing in CI.

### Phase 5 — Polish, Docs, Launch (2-3 weeks)

**Goal**: Ship v0.9 Developer Preview.

- Write documentation site (Starlight or Fumadocs):
  - Getting started (install, first app, core concepts).
  - API reference (auto-generated from `.api.md` + handwritten prose).
  - Component catalog.
  - Examples cookbook.
  - Architecture overview (simplified for users).
  - Migration guides (internal: TGE → Vexart).
- Add deferred CSS parity features prioritized by beta feedback.
- Add performance regression gates to CI.
- Finalize license text and distribution packaging.
- Record launch video / demo.
- Announce to private beta list.

**Exit criteria**: all v0.9 release criteria from Section 9.1 met. Announcement published.

### Rust-retained engine migration overlay — reverted by DEC-014

The roadmap above remains the product roadmap, but the retained scene/layout/render/event overlay below has been reverted by DEC-014 after cosmic-shell-1080p bench evidence showed the TS path is 4.8× faster at p95 (15.84 ms vs 75.42 ms). The overlay is preserved as historical record. TS now owns scene graph, reactivity, layout (Flexily), render graph, event dispatch, interaction, and canvas rasterization; Rust owns paint pipelines, composite, Kitty encoding, SHM/file/direct transport, and image assets.

Source documents (removed — retained plan was reverted by DEC-014; see git history for originals).

| Retained phase | Name | Outcome | Status gate |
|---|---|---|---|
| R0 | Approval and baseline | Founder-approved roadmap, baseline metrics, feature flags | No retained implementation starts without baseline evidence. |
| R1 | Native Presentation | Rust emits normal terminal output; JS receives stats/status only | `rgbaBytesRead === 0` for normal presentation; visual parity verified. |
| R2 | Native Layer Registry | Rust owns layer targets, terminal image IDs, lifecycle, and resource accounting | TS no longer owns presentation GPU target handles. |
| R3 | Native Scene Graph Skeleton | **Reverted** (phase-3b archived as `reverted-phase-3b-native-scene-graph`) | DEC-014: native snapshot/writeback overhead made Rust retained path slower. |
| R4 | Native Layout, Damage, and Hit-Testing | **Reverted** (phase-3c, phase-4a, phase-4b archived with `reverted-` prefix) | DEC-014: layout/writeback p95 20.09 ms; TS Flexily path remains. |
| R5 | Native Render Graph | **Reverted** (phase-3d archived as `reverted-phase-3d-native-render-graph`) | DEC-014: TS render graph stays source of ordered paint commands. |
| R6 | Native Frame Orchestrator | **Reverted** (phase-3e archived as `reverted-phase-3e-native-frame-orchestrator`) | DEC-014: Rust frame strategy did not offset FFI overhead. |
| R7 | Default Cutover | **Reverted** (phase-3f archived as `reverted-phase-3f-native-default-cutover`) | DEC-014: TS path is default and only scene/layout/event path. |
| R8 | Cleanup | **Reverted** (phase-3g and phase-13 archived with `reverted-` prefix) | DEC-014: cleanup removes retained-native scene/layout/render/event code instead. |

Rules for this overlay:

- Public JS/JSX behavior MUST remain stable throughout the migration.
- Reverted retained phases remain archived as historical record with `REVERTED.md` notes.
- No new phase may move scene graph, layout, render graph, or event dispatch ownership to Rust without new benchmark evidence and a new DEC entry.
- The paint-forward Rust boundary from §6.7 is the current target.

This overlay no longer supersedes TS ownership of frame preparation. DEC-014 supersedes the retained scene/layout/render/event portions of DEC-012.

### Phase 6 — Buffer (built-in)

**Goal**: absorb the overruns that will happen.

Plan includes ~2 weeks of buffer across phases for:
- Unexpected Flexily behaviors.
- WGPU regressions on specific terminals.
- Scope adjustments based on beta feedback.
- Personal health / rest days.

---

## 12. Decisions Log

Every architectural or product decision is logged here with date, context, and rationale. **This section is append-only** — decisions are never edited, only superseded by new entries.

### 2026-04-17 — DEC-001: Vexart as product name

**Decision**: Adopt "Vexart" as the final product name, replacing "TGE".

**Rationale**: Founder-owned domain/repo already named Vexart. TGE was an internal codename. Vexart is unique, memorable, and not trademarked in the developer tools space.

**Implications**: Rename all `@tge/*` packages to `@vexart/*` in Phase 1.

### 2026-04-17 — DEC-002: Primary user persona is CLI tool builder

**Decision**: Target CLI tool builders (individual developers, small OSS teams) as primary user persona.

**Alternatives considered**: Dev tool companies (commercial buyers), terminal app builders (showcase users).

**Rationale**: Largest audience, loudest on social media (free marketing), easiest to reach. Dev tool companies remain the ideal buyer; terminal app builders remain the showcase producer.

**Implications**: Docs style prioritizes copy-paste examples over deep customization guides. Marketing targets Twitter/HN/dev.to over enterprise sales channels initially.

### 2026-04-17 — DEC-003: Dual licensing with $1M ARR threshold

**Decision**: Source-available model. Free for personal, OSS, and small commercial use (< $1M ARR). Commercial license ($299/dev/year) required at $1M+ ARR. Enterprise license (≥$10k/year) for large customers.

**Alternatives considered**: Open source (Apache 2.0), fully closed source with per-seat licensing, freemium with feature gates.

**Rationale**: Dual licensing with revenue threshold is proven by Elastic, MongoDB, Redis Labs, Mapbox. It captures commercial value without alienating hobbyists or OSS community. Repository is public on GitHub.

**Implications**: License verification is honor-based. Written license agreement required for $1M+ entities. No DRM.

### 2026-04-17 — DEC-004: Two-language stack (TypeScript + Rust)

**Decision**: Vexart's production stack is TypeScript (Bun runtime) + Rust (single cdylib). No C, no Zig, no C++.

**Alternatives considered**: Status quo (TS + C + Rust + Zig), Go + Rust, full Rust with WASM bindings.

**Rationale**: Zig CPU path is tech debt and violates founder's 100% GPU constraint. Clay (C) can be replaced by Taffy (Rust) with negligible performance loss and significant maintenance gain. Unified Rust binary eliminates internal FFI between layout and paint.

**Implications**: Phase 2 deletes `zig/`, `vendor/clay*`, `@tge/pixel`. Taffy becomes the layout engine. Single `libvexart` ships from a single `cargo build`.

### 2026-04-17 — DEC-005: Kitty graphics protocol as only supported backend

**Decision**: v0.9 supports only Kitty, Ghostty, and WezTerm. Placeholder (tmux braille) and halfblock (ANSI fallback) backends are deleted.

**Alternatives considered**: Keep degraded backends as fallback, add iTerm2 image protocol.

**Rationale**: Keeping fallback backends costs maintenance and produces inferior visuals that hurt product perception. Modern terminals that matter for the target persona (CLI tool builders) support Kitty protocol. iTerm2 and Alacritty users are a known gap, accepted for now.

**Implications**: Engine exits with clear error on unsupported terminals. Documentation explicitly lists supported terminals. No fallback code path in loop.

### 2026-04-17 — DEC-006: Four-layer package architecture

**Decision**: Vexart organizes into 4 public packages with strict directional dependencies: `@vexart/engine` → `@vexart/primitives` → `@vexart/headless` → `@vexart/styled`.

**Current shape (2026-09)**: the historical primitives layer is merged into
`@vexart/app`, which now owns the public intrinsic/layout helpers and depends on
`engine`, `headless`, and `styled`; the original decision remains historical.

**Alternatives considered**: Current 16-package structure, single monolithic package, 3-layer without primitives/engine split.

**Rationale**: Mirrors Radix/shadcn pattern familiar to React devs. Three distinct user entry points (styled for turnkey, headless for custom styling, engine for full control) maximize addressable market. Strict layering prevents architectural rot.

**Implications**: Phase 1 consolidates 16 packages into 4 (+ optional internals). CI enforces layer rules via dependency-cruiser.

### 2026-04-17 — DEC-007: SDD (Spec-Driven Development) as execution methodology

**Historical decision — not a current execution requirement.**

**Decision**: Earlier Vexart development followed the SDD workflow: Change Proposal
→ Spec → Design → Tasks → Apply → Verify → Archive.

**Rationale**: Founder has limited programming experience and is solo. SDD compensates by making every implementation step atomic, verifiable, and agent-executable. Each task fits in a single Claude session.

**Implications**: `/openspec/` directory structure. Every phase in Section 11 maps to 1 Change Proposal. AI agents execute tasks; founder verifies.

### 2026-04-17 — DEC-008: Option B scope — state-of-the-art rendering features added to v0.9

**Decision**: v0.9 scope expands beyond baseline to include four advanced rendering capabilities:

1. **MSDF (Multi-channel Signed Distance Field) text rendering** — replaces bitmap atlas path. Single atlas per font renders sharply at any size via GPU shader.
2. **Compositor-thread animations** for `transform` and `opacity` — these properties animate without triggering layout or paint recomputation, staying at 60fps even when the main thread is saturated.
3. **Self filters** (`filter` prop) — CSS `filter:` parity. Self-applied blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate. Previously only `backdrop-*` variants existed.
4. **Declarative compositor hints** — `willChange` and `contain` props. Mirror CSS semantics. Allow developers to pre-promote layers and short-circuit invalidation.

**Alternatives considered**:
- Option A (baseline, 6 months): ship only originally-planned features. Rejected — would leave Vexart technically behind browsers in text rendering and animation latency.
- Option C (partial uplift, 6.5 months): ship only MSDF + compositor animations, defer filters and hints. Rejected in favor of shipping a coherent "most-advanced engine" story at v0.9 launch.

**Rationale**: Founder prioritized "lo más avanzado y eficiente posible". These four features are the delta between "competitive with cell-based TUI libraries" and "technically superior to web browsers for our domain". Shipping them at v0.9 means the launch story is unambiguous: *"the most technically advanced UI engine for the terminal"*.

**Implications**:
- Timeline extended from ~6 months to ~7 months.
- New Phase 2b inserted between native consolidation and loop decomposition.
- Performance targets in Section 7.3 extended with compositor-animation and MSDF-specific metrics.
- Deferred features list (5.2) updated: HarfBuzz, variable fonts, color emoji, subpixel AA remain in v1.x.
- Bitmap font atlas path (89-glyph ASCII) is deleted once MSDF ships.

### 2026-04-17 — DEC-009: WGPU as permanent cross-platform GPU abstraction (no native per-platform backends)

**Decision**: Vexart uses **WGPU** (the Rust implementation of the WebGPU specification) as its single GPU API. WGPU dispatches automatically to Metal (macOS), Vulkan (Linux, Android), DirectX 12 (Windows, future), and WebGPU (browser, if a playground ever ships). Vexart does not implement native per-platform renderers.

**Alternatives considered**:
- Native per-platform renderers (Metal for macOS, DirectX 12 for Windows, Vulkan for Linux, each with its own shader language MSL/HLSL/GLSL). Rejected.
- OpenGL / WebGL legacy abstractions. Rejected — legacy tech, being phased out industry-wide.
- Vulkan-only cross-platform (with MoltenVK on macOS). Rejected — MoltenVK adds overhead and dependency fragility.

**Rationale**:
1. **Maintenance cost**: native per-platform means writing ~3× the GPU code, maintaining 3 shader languages (WGSL vs MSL vs HLSL vs GLSL), and testing 3 matrices. Unsustainable for a solo developer.
2. **Performance**: theoretical overhead of WGPU vs native is 2-8% on GPU-bound workloads. Vexart is NOT GPU-bound — the frame-time dominator is Kitty protocol encoding and terminal I/O. WGPU overhead is <1% of Vexart's frame budget and invisible in practice.
3. **Industry alignment**: WebGPU is the emerging standard. Chrome, Firefox, and Safari have shipped it. Apple, Google, and Microsoft are committed. Native GPU APIs continue to fragment.
4. **Validation**: Bevy, Zed, Veloren, Firefox compositor, Servo, Blender (future), and Figma (migration in progress) all use WGPU or equivalent abstractions. The industry precedent is overwhelming.
5. **Future optionality**: WGPU code compiles to WASM + WebGPU in the browser. If Vexart ever wants a web playground (a strong marketing asset), WGPU enables it for free. Native renderers would foreclose it.
6. **Platform-specific tuning still possible**: WGPU exposes `Features` and `Limits` flags. Platform-exclusive optimizations (Metal argument buffers, Vulkan subgroup operations, DX12 bindless) remain accessible when profiling identifies a specific bottleneck.

**Implications**:
- All shaders authored in WGSL once.
- Single Rust cdylib `libvexart` contains all GPU code.
- Windows support (when added in v1.x) comes "for free" — WGPU dispatches to DirectX 12 automatically.
- If a future feature requires a capability WGPU does not yet support, the response is to upstream the capability to WGPU, not to bypass it with a native renderer.

**Non-reversal clause**: This decision is locked for v0.9 and v1.0. Reversal requires (a) profiling evidence that WGPU overhead exceeds 15% of frame budget on reference hardware AND (b) a feature blocker that WGPU cannot resolve. Speculation does not justify reversal.

### 2026-04-17 — DEC-010: Engine optimization Tier 1 + Tier 2 added to v0.9

**Decision**: Five performance-critical optimizations are added to v0.9 scope. They are bundled into Phase 2b (Tier 1) and Phase 3 (Tier 2) because retrofitting them post-launch would require rewriting core paths (frame loop, output pipeline, resource management) — 10× more expensive than doing them now.

**Tier 1** (Phase 2b, non-negotiable):
1. **Native Kitty protocol encoding in Rust** — base64, compression, and escape-sequence assembly move from JS to `libvexart`. Frees 18-30% of frame budget currently spent on JS-side `Buffer.from(...).toString('base64')`. Unblocks the <16 ms compositor-animation latency target.
2. **WGPU `PipelineCache` persisted to disk** — eliminates shader recompilation on every startup. All `cache: None` occurrences in Rust (10+) become shared cache handles. Enables the <50 ms warm-cache cold-start target.
3. **Unified GPU memory budget with priority-based eviction** — replaces 5 independent caches (`MAX_CACHE` constants across text-layout, font-atlas, image, and GPU-side caches) with one `ResourceManager` in Rust. Default 128 MB budget, configurable at mount. Required for enterprise buyers running dashboards with many fonts + images.

**Tier 2** (Phase 3, high-ROI at v0.9):
4. **Viewport culling (automatic `content-visibility: auto` equivalent)** — subtrees fully outside the terminal's visible area skip layout and paint during `walk-tree`. Target: ≥40% walk+layout savings on large trees.
5. **Frame budget scheduler** — three-priority task queue (`user-blocking`, `user-visible`, `background`) inside `loop.ts`. `user-blocking` never defers. `user-visible` may split frames. `background` only runs in idle windows. Mirrors `scheduler.postTask` web semantics.

**Alternatives considered**:
- Ship Tier 1 only (7.5 months). Rejected — Tier 2 items (viewport culling especially) are easy to add during Phase 3's loop decomposition but very invasive to retrofit afterward.
- Defer all to v1.x (7 months). Rejected — would miss the cold-start and compositor-animation targets the PRD already commits to. Would also leave enterprise buyers with unbounded VRAM growth on large apps.
- Retrofit during v0.10 or v1.0 (post-launch). Rejected — rewriting the output pipeline or the frame loop after v0.9 ships breaks the public API stability commitment under DEC-006.

**Rationale**:
- Auditing the code revealed five specific, evidence-based gaps (not speculative): `Buffer.from(...).toString('base64')` in JS hot path, `cache: None` in all WGPU pipelines, independent un-budgeted caches, no viewport culling, no priority scheduling.
- Each gap blocks or degrades a target the PRD already commits to (cold start, compositor latency, VRAM safety).
- Each gap lives in code that Phase 2b and Phase 3 already touch — adding the optimizations in-flight is cheaper than a separate pass.
- Founder prioritized "lo más eficiente posible" in the DEC-008 discussion. This decision operationalizes that priority with measurable targets.

**Implications**:
- Timeline extended from ~7 months to ~8 months.
- Phase 2b grows from 3-4 weeks to 5-6 weeks.
- Phase 3 grows from 3 weeks to 4 weeks.
- Section 7.3 gains specific metrics: warm-cache cold start, Kitty encoding throughput, viewport culling savings, GPU budget enforcement.
- CI gets a new `bench:optimizations` micro-benchmark suite specifically to protect these gains.

**Non-reversal clause**: Tier 1 items are non-negotiable — they block v0.9 release criteria (Section 9.1). Tier 2 items may be descoped to v1.0 only if explicit founder approval is recorded here with a new dated decision entry.

### 2026-04-17 — DEC-011: Phase 2 text rendering exception (no bitmap port, defer to Phase 2b MSDF)

**Decision**: During Phase 2, bitmap text rendering is NOT ported from Zig to Rust. Text nodes render as empty placeholders (no glyphs painted) until Phase 2b delivers MSDF. The `vexart_text_*` FFI functions exist as stubs that return success without side effects. Phase 2b replaces those stubs with the real MSDF implementation.

**Alternatives considered**:
- Port bitmap text to Rust in Phase 2 as a temporary implementation (~200 LOC), then replace with MSDF in Phase 2b. Rejected by founder as "doble trabajo" (duplicated work for code that would be deleted 5-6 weeks later).
- Block Phase 2 completion on MSDF arrival (fuse Phase 2 and Phase 2b). Rejected — breaks the 8-phase roadmap cadence and makes the phase too large for a single review window.

**Rationale**:
- Founder called the 200 LOC bitmap port "doble trabajo" and accepted the consequences in exchange for avoiding it.
- Text regions are a small minority of pixel area in most UIs; non-text regions can still be validated against the pre-migration golden image during Phase 2.
- Phase 2b already budgets MSDF work (~2 weeks of its 5-6 week scope). Pulling text validation into 2b adds no timeline.
- The FFI surface stays stable between phases: `vexart_text_measure`, `vexart_text_dispatch`, `vexart_text_load_atlas` are defined in Phase 2 (as stubs) and gain real implementations in 2b.

**Implications**:
- Phase 2 exit criteria amended (Section 11): "visually identical for all non-text regions" with text regions masked out of the diff.
- Phase 3 does NOT start until Phase 2b closes the text gap and the **unmasked** `showcase` diff passes. This keeps the original PRD promise of visual parity — it just shifts the gate from Phase 2 → Phase 2b.
- During Phase 2, demos that rely heavily on text (showcase, hello, components demos) will render with blank text areas. This is expected behavior for the duration of Phase 2.
- Phase 4 golden image suite cannot generate text-bearing goldens until Phase 2b completes. Goldens for non-text regions can be collected earlier.
- Biweekly reviews during Phase 2 explicitly communicate that text is intentionally absent. The review gate is "non-text showcase parity", not "full showcase parity".

**Risks**:
- Developer surprise / confusion: anyone running the engine during Phase 2 sees blank text. Mitigation: a runtime console warning `"[vexart] text rendering disabled during Phase 2 (DEC-011) — MSDF lands in Phase 2b"` on first `vexart_text_dispatch` call per session.
- MSDF work in Phase 2b discovers a blocker that the bitmap path would have exposed earlier. Mitigation: the FFI surface is defined in Phase 2 with a stub implementation, so the contract is locked; Phase 2b only swaps the implementation, not the signature.

**Non-reversal clause**: This decision is locked for the current v0.9 cycle. Reversal requires either (a) Phase 2b slipping past its 5-6 week budget by more than 2 weeks (text would then exist as blank placeholder for 8+ weeks, which is unacceptable), or (b) a customer-impacting blocker discovered during Phase 2 that needs text to validate.

### 2026-04-23 — DEC-012: Rust-retained engine roadmap adopted

**Decision**: Adopt the Rust-retained engine roadmap as the execution path for the remaining engine migration. The public JS/JSX API remains stable, but frame-critical ownership moves progressively into `libvexart`: native presentation first, then layer registry, scene graph, layout/damage/hit-testing, render graph, frame orchestration, default cutover, and cleanup.

**Companion documents**: Removed after DEC-014 revert (see git history for originals).

**Alternatives considered**:
- Keep the decomposed TypeScript frame pipeline as the long-term architecture. Rejected: it leaves JS allocations, duplicated resource ownership, render graph drift, and raw presentation payload risk in the hot path.
- Rewrite everything into Rust in one pass. Rejected: too risky for public API compatibility and debugging.
- Move only Kitty presentation to Rust and stop. Rejected: useful first win, but does not address scene, render graph, resource, or layer ownership drift.

**Rationale**: Native Presentation already proves the first boundary can move safely: Rust can emit terminal output and expose stats while TypeScript keeps the public API and fallback path. Continuing boundary-by-boundary gives measurable performance wins without forcing users to migrate app code.

**Implications**:
- `docs/ARCHITECTURE.md` describes the post-cutover retained architecture, not the temporary hybrid state.
- **Historical migration guidance**: OpenSpec changes for retained phases were
  mandatory before implementation. This archived guidance is not a gate for
  current implementation.
- Normal terminal presentation must keep raw RGBA out of JS. JS readback remains explicit-only for tests, screenshots, debug, or offscreen APIs.
- The retained runtime now defaults on for SHM-capable terminals; `VEXART_RETAINED=0` preserves the emergency compatibility-window fallback, and narrower per-feature flags remain available for debugging.
- Existing loop decomposition remains valuable as a compatibility/fallback shell, but not as permanent rendering ownership.

**Non-reversal clause**: Reversal requires profiling evidence that the retained Rust path cannot meet or exceed the hybrid path after obvious fixes, plus founder approval recorded as a new decision.

### 2026-04-24 — DEC-013: 120fps / 5ms performance program adopted

**Decision**: Vexart adopts a 120fps-class performance program for the retained Rust runtime. The program does **not** claim that every full scene will render at 120fps today. It commits the product to profiling and optimizing the retained path until no-op, dirty-region, and compositor-only frames meet 120fps-class budgets, while full-dashboard frames are measured and gated at 1080p (`1920×1080`) because that is the normal desktop terminal workload.

**Companion document**: Removed (execution plan completed; see git history for original).

**Targets**:
- No-op retained frame: `<1 ms p99`.
- Small dirty-region frame: `<5 ms p95`.
- Compositor-only transform/opacity frame: `<8.33 ms p95`.
- Full dashboard 1080p (`1920×1080`) frame: `<10 ms release gate`, `<8.33 ms aspirational`.
- Input-to-visual for optimized compositor interactions: `<16 ms p95`.

**Current baseline**:
- `bun run perf:check` on 2026-04-24: `14.23 ms/frame` for the dashboard 800×600 offscreen benchmark.
- This is a temporary dev/smoke baseline, not the release target. The first performance-plan milestone MUST add a 1080p dashboard benchmark and use that as the dashboard gate.

**Alternatives considered**:
- Claim 120fps now because the retained runtime moved to Rust. Rejected — architecture improves the ceiling, but the only current dashboard measurement is an 800×600 smoke benchmark at ~14 ms; the release workload must be measured at 1080p.
- Keep only the old 60fps target. Rejected — it underspecifies the engine's differentiator and leaves too much performance on the table after the Rust-retained cutover.
- Make `5 ms` a universal product promise. Rejected — terminal presentation, scene complexity, and full-frame work make that dishonest. `5 ms` is a fast-path engineering target, not a universal guarantee.

**Rationale**:
- 120fps requires `8.33 ms/frame`; a `5 ms` engine-side target creates headroom for terminal I/O, scheduling jitter, and presentation overhead.
- Rust-retained ownership removes the largest architectural blockers, but the remaining work is measurement-driven: no-op short-circuiting, dirty-region minimization, native canvas replay, FFI batching, allocation elimination, and terminal presentation pacing.
- User-facing credibility depends on separating proven measurements from aspirational targets.

**Implications**:
- Performance work must start with a phase breakdown profiler; no optimization claim is accepted without per-stage numbers.
- CI gates must distinguish no-op, dirty-region, compositor-only, and full-dashboard workloads.
- **Historical process guidance**: Future SDD performance changes were expected
  to cite this decision and update the companion plan; this is not a current
  execution requirement.

**Non-reversal clause**: The program can adjust thresholds based on profiling evidence, but Vexart must keep explicit per-category performance budgets. Dropping the 120fps-class track requires founder approval and a new dated decision.

### DEC-014 — Rust retained scene graph reverted (April 2026)

**Context**: Phases 3b through 4b implemented a Rust retained source-of-truth for scene graph, layout, render graph, and event dispatch, with the goal of amortizing per-frame work in native code. Bench evidence on the target workload (`cosmic-shell-1080p`) showed the opposite result.

**Evidence**: cosmic-shell-1080p at 1920×1080, SHM transport, 60 frames + 15 warmup:
- Rust retained path: 75.42 ms p95 (~13 fps). Bottleneck: `paintNativeSnapshotMs` 39.21 ms, `layoutWritebackMs` 20.09 ms.
- TS path: 15.84 ms p95 (~63 fps). Paint backend identical (~7.8 ms p95).
- TS path is 4.8× faster at p95, 5.4× at p50.

**Decision**: Revert retained scene graph / render graph / layout / event dispatch. TS owns scene graph, reactivity, layout (Flexily), event dispatch, and canvas rasterization. Rust owns paint (WGPU pipelines), composite, Kitty encoding, transport (SHM/file/direct), and image assets.

**Partially supersedes**: DEC-012 (Rust retained engine roadmap). Only the paint/composite/transport portion of DEC-012 stands.

**Reverted phases**: 3b (native scene graph), 3c (native layout hit-test), 3d (native render graph), 3e (native frame orchestrator), 3f (native default cutover), 3g (native cleanup), 4a (native layout hit-test cutover), 4b (native transform hit-test), 13 (Rust retained mutation protocol).

---

### 2026-04-25 — DEC-015: Flexily replaces Taffy for TypeScript-side layout

**Decision**: The TypeScript-side layout engine is **Flexily** (pure JavaScript, zero dependencies, Yoga-compatible API). Flexily replaced the custom ~610-line TS mini-flexbox in `layout-adapter.ts` which itself had replaced Clay (C FFI, deleted Phase 2). Taffy was completely eliminated from `libvexart/Cargo.toml` and the repository by DEC-014 and DEC-015.

**Alternatives considered**:
- Taffy in TS (via FFI to Rust): rejected — DEC-014 proved that FFI overhead for layout exceeded the benefit. TS-side layout is 4.8× faster.
- Yoga (C++/WASM): rejected — adds native dependency, Flexily offers API-compatible pure JS alternative with zero-alloc hot path.
- Custom mini-flexbox (previous implementation): rejected — had 3 known bugs (no cross-axis stretch, broken grow, measure propagation errors).

**Rationale**: Flexily is pure JS with zero dependencies, has a Yoga-compatible API making migration trivial, offers zero-allocation hot path for 60fps layout, and eliminates all native FFI for layout computation. The layout-adapter.ts went from ~610 lines of buggy custom code to ~500 lines of clean Flexily integration.

**Implications**:
- All "Taffy" references in TS code, comments, and docs that describe the layout engine should say "Flexily".
- Taffy was permanently removed from `libvexart/Cargo.toml`; no native layout crate dependency exists.
- Future layout work should target Flexily's API, not Taffy's.

---

### 2026-09-07 — Amendment to DEC-005: experimental tmux Kitty transport

**Historical status:** this initial direct-transport amendment is preserved as
written; the follow-up approval below supersedes its tmux transport choice.

**Decision**: Preserve the Kitty-only rendering constraint and permit a narrow,
experimental tmux route. tmux 3.4+ may carry Vexart through a Kitty or Ghostty
outer terminal when the user enables `allow-passthrough` and the runtime probes
pass. The native path paints and composites one complete GPU frame, transmits it
with lossless Kitty direct transport, creates a `U=1` virtual placement, and
emits the Kitty graphics APCs through per-APC tmux DCS passthrough wrappers,
followed by the Unicode placeholder grid as normal pane text. It does not
restore the deleted character-art backends.

**Boundaries**:
- Direct Kitty, Ghostty, and WezTerm support is unchanged.
- WezTerm-over-tmux Unicode-placeholder support is not claimed in this release.
- The current Vexart tmux implementation starts with direct full-frame
  retransmit; it does not currently use SHM/file or per-layer patch transport.
  This SHM choice is not a claim that a compatible outer terminal cannot
  support SHM. Kitty `a=f` animation updates are not current tmux promises
  because the current Ghostty target returns an unimplemented-action error for
  Kitty animation actions.
- The pane's pixel area and cell size are queried separately; input parsing
  remains stream-fragmentation safe, while tmux mouse/focus/extended-key
  settings can still change which events arrive.
- A session reattached through a different outer terminal must be stopped and
  restarted to reprobe. In tmux copy mode, captured pane text contains the
  Unicode placeholder characters rather than rendered image pixels or semantic
  text.

**Historical status (September 7, 2026)**: Implementation was experimental and
physical smoke verification was pending at that snapshot; the current G-037
gate supersedes that status. [`docs/tmux.md`](./tmux.md) records setup,
read-only diagnostics, the feature/performance matrix, and the smoke checklist.
The protocol references
are the [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
and [tmux passthrough documentation](https://github.com/tmux/tmux/wiki/FAQ).
The current Ghostty animation-action limit is documented in
[Ghostty 1.3.1's Kitty graphics actions](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/terminal/kitty/graphics_exec.zig).

---

### 2026-09-07 — Follow-up approval: tmux SHM-only presentation

This dated note amends the preceding experimental transport note without
rewriting DEC-005 or its history. The user approved the next tmux target:
The historical DEC-005 phrase “placeholder (tmux braille)” refers to the
deleted character-art backend; it does not describe Kitty Unicode placeholders.

- Rust/WGPU retains the same scene, retained layers, and one full composited
  frame; the presentation path uses the existing local SHM primitive only.
- The route requires one attached tmux client across the tmux server and effective
  `allow-passthrough all`, applied by the user, plus client `RGB` features for
  truecolor image IDs. The SHM route is local-only: sessions carrying
  `SSH_CONNECTION`, `SSH_CLIENT`, or `SSH_TTY` are rejected. Vexart does not edit
  `tmux.conf` or automatically change session options.
- Native ownership is bounded by `is_consumed` as primary completion, with
  error/timeout cleanup, one in-flight upload, and only the latest pending frame.
  There is no automatic direct/file fallback, queue/pool growth, or new public
  renderer/API. Regions are deferred until real performance measurement.
- The production code path is PASS at the real-tmux-PTY level with a synthetic
  receiver. The 45-scene
  direct batch and isolated synthetic SHM/PTY results remain separate evidence;
  no physical Kitty/Ghostty rendering, reattach parity, or FPS claim is implied.

The isolated tmux 3.6a routing result records that `allow-passthrough all`
forwards a hidden-pane sequence while `on` drops it; an `ESC_G` ACK reaches the
active pane rather than the origin. See the ephemeral
`/tmp/vexart-tmux-ack-routing-result.json` and
`/tmp/vexart-check-tmux-ack-routing.py` when reproducing this transport check.

**Historical status (September 7, 2026):** approved target; the production code
path passed through a synthetic tmux 3.6a PTY. The SHM batch was 47/48 and the
corrected `theme-form` focused run completed 48 distinct scenes (without claiming
a clean 48/48 batch). Physical Kitty/Ghostty smoke and performance measurement
were pending at that snapshot. The Kitty protocol reference is the
[Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/).

---

## 13. Glossary

- **Adaptive render loop**: frame scheduler that varies FPS based on activity (idle 8fps, active up to 60fps).
- **120fps-class frame**: a frame category whose engine-side work fits within `8.33 ms` at p95/p99 depending on the metric. Vexart uses `5 ms` as the aggressive fast-path target for small dirty-region work to preserve terminal/I/O headroom.
- **Backdrop filter**: CSS-style filter applied to content *behind* an element (e.g. glassmorphism blur).
- **Clay**: C-based layout engine formerly used in Vexart pre-Phase 2. Deleted and replaced first by a custom TS mini-flexbox, then by Flexily.
- **Source-available**: source code is publicly available on GitHub under a dual license (free below revenue threshold, paid above).
- **Compositor-thread animation**: animation whose per-frame update touches only GPU uniforms (transform matrix, opacity) without regenerating paint commands or invalidating layout. Stays at 60fps even when the main thread is blocked.
- **`contain` prop**: declarative hint (mirrors CSS `contain`) telling the engine that a subtree is isolated from outer layout/paint invalidation.
- **DEC-XXX**: numbered entry in the Decisions Log (Section 12). Every architectural or product commitment receives one.
- **Effect**: visual transformation applied during paint — shadow, glow, gradient, filter, transform.
- **FFI**: Foreign Function Interface. The boundary between TypeScript (Bun) and Rust (`libvexart`).
- **Flexily**: Pure JavaScript layout engine with a Yoga-compatible API and zero dependencies. Used from packages/engine/src/loop/layout-adapter.ts for TypeScript-side flexbox layout. Replaced the custom mini-flexbox (which had replaced Clay) per DEC-015.
- **Golden image test**: rendered output compared against a reference PNG with a pixel diff threshold.
- **Headless component**: component providing logic/state/accessibility with no visual styling. Consumer supplies the rendering.
- **Hysteresis**: stability window that prevents oscillation between strategies (Vexart uses 5-frame hysteresis for GPU layer strategy).
- **Kitty graphics protocol**: terminal escape sequence protocol for transmitting pixel images. Supported by Kitty, Ghostty, WezTerm.
- **Layer**: retained compositing unit — a rectangular region with its own GPU texture, z-order, and dirty flag.
- **MSDF (Multi-channel Signed Distance Field)**: evolution of SDF for glyph rendering. Stores distance information in three color channels (R, G, B) instead of one, preserving sharp corners and thin strokes that classic SDF loses. Industry standard for GPU-accelerated text in modern game engines and renderers.
- **PipelineCache**: a WGPU resource that persists compiled GPU pipeline state (shaders, pipeline layouts) to disk. First run compiles and saves; subsequent runs load from cache. Enables Vexart's <50 ms warm-cache cold start target.
- **Priority tier (resource manager)**: classification applied to GPU-resident assets inside Vexart's `ResourceManager`. `Visible` = currently rendered, `Recent` = used within the last 5 seconds, `Cold` = older. LRU eviction walks from Cold to Visible when the budget is exceeded.
- **Primitive**: engine-level JSX element (`<box>`, `<text>`, `<image>`, `<canvas>`).
- **Reconciler**: component that translates JSX create/update/delete calls into internal tree mutations. Vexart uses SolidJS's `createRenderer` universal reconciler.
- **Render graph**: intermediate representation between layout commands and paint calls. Enables GPU vs CPU routing (CPU removed in Phase 2) and effect composition.
- **ResourceManager**: the unified GPU memory manager in `libvexart`. Holds all GPU-resident assets under a single budget (default 512 MB). Performs priority-based LRU eviction per frame. Replaces Vexart v0.1's five independent caches.
- **SDD (historical)**: Spec-Driven Development, the former proposal → spec →
  design → tasks → apply → verify → archive workflow retained here as historical
  context only.
- **SDF**: Signed Distance Field. Mathematical representation of shapes that enables GPU-accelerated anti-aliased rendering.
- **Styled component**: themed component built on top of a headless component with opinionated tokens.
- **Task priority lane**: a bucket in Vexart's frame budget scheduler. Three lanes: `user-blocking` (input, focus — never skipped), `user-visible` (layer repaint — may split across frames), `background` (cache warming, telemetry — idle-only). Mirrors web platform's `scheduler.postTask` semantics.
- **Taffy**: Historical Rust layout engine, permanently deleted from `libvexart/Cargo.toml` and the codebase per DEC-014 and DEC-015. The active layout engine in Vexart is Flexily.
- **tmux passthrough**: tmux's DCS envelope for forwarding a complete terminal escape sequence to the outer terminal. Vexart doubles `ESC` bytes inside each Kitty APC and keeps APCs separate.
- **Kitty Unicode placeholder**: Kitty's `U+10EEEE` cell character, paired with a virtual image placement (`U=1`), that lets a multiplexer move a pixel image with normal pane text.
- **Tier 1 optimization**: the three performance-critical items from DEC-010 bundled into Phase 2b. Non-negotiable for v0.9 release. Cover native Kitty encoding, WGPU pipeline cache, and unified GPU budget.
- **Tier 2 optimization**: the two performance-for-scale items from DEC-010 bundled into Phase 3. Cover viewport culling and frame budget scheduler. May be descoped only via explicit founder decision recorded in the log.
- **Viewport culling**: skip layout and paint for subtrees whose bounding box is fully outside the visible terminal area. Vexart's automatic equivalent of CSS `content-visibility: auto`. Activates during `walk-tree`.
- **Void**: the default styled theme (dark, shadcn-inspired). Located in `@vexart/styled`.
- **WebGPU**: modern graphics API specification. Cross-platform, designed by browser vendors (Google, Apple, Mozilla, Microsoft) as the successor to WebGL. Exposes Metal, Vulkan, and DirectX 12 through a unified API.
- **WGPU**: Rust implementation of the WebGPU specification (the crate `wgpu` from `gfx-rs`). Vexart's only GPU API. Dispatches automatically to Metal (macOS), Vulkan (Linux), DirectX 12 (Windows), and WebGPU (browser, for future playground). **Not** an alternative to native APIs — it is a single abstraction that uses them internally.
- **`willChange` prop**: declarative hint (mirrors CSS `will-change`) telling the compositor which properties will animate, so it can pre-promote a layer and avoid a just-in-time promotion hitch.
- **WGSL**: the WebGPU Shading Language. Modern shader language used by WGPU. Replaces legacy GLSL/HLSL/MSL in the Vexart stack.

---

## Appendix A — Documentation Ownership

These pointers identify where product, architecture, API, and implementation
information is maintained. They are references for navigation, not execution
gates; inspect current code and focused checks when resolving a discrepancy.

| Aspect | Reference | Location |
|---|---|---|
| Product vision, scope, quality bar | This PRD | `docs/PRD.md` |
| Architecture principles | `docs/ARCHITECTURE.md` | (derived from this PRD) |
| API surface policy | `docs/API-POLICY.md` | (derived from this PRD) |
| Historical phase plans | Historical SDD Change Proposals | `openspec/changes/*/proposal.md` |
| Historical behavior specs | Historical SDD Specs | `openspec/changes/*/specs/*.md` |
| Historical task decomposition | Historical SDD Tasks | `openspec/changes/*/tasks.md` |
| Code implementation | The code itself | `packages/*/src/` |
| Historical decisions | Decisions Log (§12 above) | `docs/PRD.md` |
| tmux setup and transport limits | tmux support guide | `docs/tmux.md` |
| In-flight PRD edits | `CHANGELOG-PRD.md` | `docs/CHANGELOG-PRD.md` |

---

**END OF PRD v0.10**

### Status: Resolved — Dedicated box-shadow pipeline implemented (`cmd_kind=20`, `shadow.rs`, `shadow.wgsl`)

**Resolution**: Dedicated analytic anti-aliased Gaussian box-shadow pipeline (`cmd_kind = 20`) was implemented in native Rust (`native/libvexart/src/paint/pipelines/shadow.rs`) and WGSL (`native/libvexart/src/paint/shaders/shadow.wgsl`). It supports directional offset `(x, y)`, Gaussian blur radii, spread, alpha blending, and multi-shadow arrays (`ShadowConfig[]`), achieving full parity with CSS `box-shadow`.
