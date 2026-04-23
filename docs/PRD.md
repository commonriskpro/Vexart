# Vexart — Product Requirements Document

**Version**: 0.4
**Status**: Draft — foundational document
**Owner**: Founder (solo developer)
**Last updated**: April 2026

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

This PRD is the **master reference** for Vexart. It is read by:

1. The founder, for decision-making alignment.
2. AI agents (Claude sessions), for implementation context.
3. Future contributors, mentors, and contractors.

**Rules for readers:**

- This document is **immutable during a phase's execution**. Proposed changes go to `CHANGELOG-PRD.md` and apply to the next phase.
- When any tension appears between this PRD and code, **the PRD wins** until explicitly updated.
- Every implementation task (see `/openspec/changes/*`) must cite which section of this PRD it satisfies.

**Rules for changes to this document:**

- Only the founder approves PRD edits.
- Every edit requires a dated entry in Section 12 (Decisions Log).
- Renaming, scope changes, or monetization shifts require a full version bump (0.1 → 0.2).

---

## 1. Executive Summary

**Vexart** is a GPU-accelerated UI engine for the modern terminal. Developers write JSX (SolidJS), and Vexart renders browser-quality interfaces — anti-aliased corners, drop shadows, gradients, glow effects, backdrop filters, transforms — as real pixels in terminals that support the Kitty graphics protocol (Kitty, WezTerm, Ghostty).

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

Vexart bridges JSX + SolidJS reactivity to a Rust-native GPU rendering pipeline using the Kitty graphics protocol. Developers write the UI the way they write React web apps. Vexart handles layout (Taffy), paint (WGPU), and composition (Kitty protocol) natively.

The result:

- Pixel-perfect anti-aliased shapes using SDF primitives.
- CSS-parity visual effects: shadows, gradients, glow, backdrop filters, opacity, transforms.
- Reactive updates via SolidJS signals — no VDOM diffing.
- Adaptive render loop (8-60fps based on activity) so idle UIs don't burn CPU.
- Two-layer API: headless components (logic + accessibility, no styling) + styled defaults (opinionated theme).

### 2.3 Why now

- **Terminal graphics protocols are mature**: Kitty stabilized in 2018, WezTerm and Ghostty both support it, tmux supports passthrough via placeholders.
- **Developer preference shifted**: CLI-first dev tools are premium products (Warp, Zed, Charm's tooling, Supabase CLI, Vercel CLI). Market wants CLIs that look as good as web apps.
- **Rust ecosystem matured**: WGPU reached v26 stability, Taffy powers production editors (Zed, Lapce, Servo), cross-compilation via `cargo` is trivial.
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
| **Required terminal** | Any | Any | Any | Any | **Kitty / WezTerm / Ghostty** |

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

#### Primitives (`@vexart/primitives`)

- `<box>`, `<text>`, `<image>`, `<canvas>` intrinsic elements.
- Layout: flexbox (row/column, gap, align, padding, sizing: fixed/grow/fit/percent).
- `margin` (per-side + shorthand).
- Sizing constraints: minWidth, maxWidth, minHeight, maxHeight.
- Absolute positioning: `floating`, `zIndex`, `floatOffset`, `floatAttach`.
- Scrolling: `scrollX`, `scrollY`, programmatic scroll via `createScrollHandle`.

#### Visual effects

- `cornerRadius` + per-corner (`cornerRadii`).
- `border` (uniform + per-side).
- `backgroundColor` (hex string or u32).
- `gradient`: linear, radial (multi-stop supported).
- `shadow`: drop shadow + multi-shadow (array).
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
- **Compositor-thread animations**:
  - Animations targeting `transform` and `opacity` run on a dedicated compositor path.
  - Do **not** trigger layout recomputation, paint command regeneration, or reconciler traversal.
  - Visible frame stays at 60fps even when the main TypeScript thread is blocked.
  - Target: input-to-visual latency < 16ms during heavy JS workloads.
- **Declarative hints for the compositor**:
  - `willChange` prop — mirrors CSS `will-change`. Tells the compositor which properties will animate, enabling layer pre-promotion.
  - `contain` prop — mirrors CSS `contain: layout | paint | strict`. Tells the engine that a subtree is isolated, skipping invalidation propagation beyond the boundary.
- **WGPU cross-platform GPU backend**:
  - Single Rust codebase dispatching automatically to Metal (macOS), Vulkan (Linux), DirectX 12 (Windows, future).
  - WGSL shaders compiled once, run natively on every platform.
  - No per-platform renderer maintenance.

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

#### Interaction

- Declarative state styles: `hoverStyle`, `activeStyle`, `focusStyle`.
- Event bubbling: `onPress` with `stopPropagation`.
- Per-node mouse events: `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`.
- Keyboard: `onKeyDown`, focus management (`focusable`, Tab navigation).
- Focus scopes (for Dialog-style focus traps).
- Pointer capture (`setPointerCapture` / `releasePointerCapture`).
- Hit-area expansion (min 1 cell for touch-like interaction).

#### Headless components (`@vexart/headless`)

Ship 28 components with render-prop pattern (context props for mouse/keyboard integration):

- **Inputs**: Button, Checkbox, Switch, RadioGroup, Input, Textarea, Slider, Select, Combobox.
- **Display**: Text, RichText, Span, Code, Markdown, ProgressBar, Badge, Avatar, Skeleton, Separator.
- **Containers**: Box, ScrollView, Tabs, Card, Portal.
- **Collections**: List, VirtualList, Table.
- **Overlays**: Dialog, Tooltip, Popover, Toast.
- **Navigation**: Router (flat + stack), Diff viewer.

#### Styled components (`@vexart/styled`)

Single opinionated theme ("void" — dark, shadcn-inspired) with:

- Semantic tokens: colors (background, foreground, card, primary, secondary, muted, accent, destructive, border, input, ring), radius (sm/md/lg/xl/xxl/full), space[1-10], font sizes (xs-4xl), weights, shadows presets.
- Typography primitives: H1, H2, H3, H4, P, Lead, Large, Small, Muted.
- Runtime theming: `ThemeProvider`, `createTheme`, `setTheme` (hot-swappable).

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
- Single native library: `libvexart.{dylib,so,dll}` (Rust: taffy + wgpu + kitty encoder).

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

- CSS Grid layout (flexbox only in v0.9; Taffy supports it, we gate it behind v1.0).
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
- tmux passthrough (the Kitty placeholder backend is out — we stay Kitty-direct in v0.9).
- Plugin marketplace.
- Accessibility / screen reader integration.
- Server-side rendering / pre-render.
- Mobile terminals (Termux, iSH).

### 5.3 Removed from scope (previously present, being deleted)

During v0.9 development we are explicitly **deleting** the following assets. These are not deprecated for backward-compat — they are gone.

- **Zig CPU paint path** (entire `zig/` directory and `@tge/pixel` package).
- **Output backends other than Kitty**: `output-placeholder` (tmux braille), `output-halfblock` (ANSI fallback).
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
│   <Button variant="primary">Save</Button>     │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/styled                              │
│   — Opinionated themed components             │
│   — Tokens (colors, radius, spacing, shadows) │
│   — Typography primitives (H1-H4, P, Lead)    │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/headless                            │
│   — Logic, accessibility, keyboard, state     │
│   — Render-prop components (ctx.*Props)       │
│   — No visual opinions                        │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/primitives                          │
│   — <box>, <text>, <image>, <canvas>          │
│   — Props contract (TGEProps-equivalent)      │
│   — Typed JSX intrinsics                      │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   @vexart/engine                              │
│   — SolidJS reconciler                        │
│   — Render loop (walk, layout, paint, output) │
│   — Hooks (useFocus, useKeyboard, useMouse)   │
│   — FFI bridge to libvexart                   │
│   — Terminal lifecycle, input parsing         │
└──────────────────────┬────────────────────────┘
                       ▼
┌───────────────────────────────────────────────┐
│   libvexart.{dylib,so,dll} (Rust cdylib)      │
│   — Taffy (layout: flexbox, grid-ready)       │
│   — WGPU (paint: SDF, gradients, effects)     │
│   — Kitty graphics protocol encoder           │
└──────────────────────┬────────────────────────┘
                       ▼
                  Terminal
          (Kitty / WezTerm / Ghostty)
```

### 6.2 Layer dependency rules (enforced by lint)

- `@vexart/engine` depends on: nothing Vexart-internal (only `solid-js`, `bun:ffi`, `libvexart`).
- `@vexart/primitives` depends on: `@vexart/engine`.
- `@vexart/headless` depends on: `@vexart/primitives`, `@vexart/engine`.
- `@vexart/styled` depends on: `@vexart/headless`, `@vexart/primitives`, `@vexart/engine`.

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
| Native core | Rust | Compiled to cdylib | Taffy (layout) + WGPU (paint) + Kitty protocol encoder in one binary. |

**Rejected alternatives**:
- C (Clay) — replaced by Taffy (Rust, performance parity, richer features, unified binary).
- Zig — deleted entirely (CPU fallback no longer supported).
- C++ (Yoga) — would add complexity and duplicate Taffy's feature set.
- Go or Dart — would replace TypeScript, killing the JSX developer ergonomics that differentiates Vexart.

**Benefits of 2-language stack**:
- One native binary (`libvexart`), one FFI boundary, one build command (`cargo build --release`).
- Layout and paint share memory within Rust — zero FFI between them.
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
- **Backend coverage**: Kitty direct (primary). WezTerm and Ghostty in v0.9 via manual smoke checklist (automated matrix in v1.0).

### 7.3 Performance

Measured on Apple M1 Pro, Kitty 0.41+, 2560×1600 retina:

| Metric | Target | Measurement |
|---|---|---|
| **Cold start — first run** | < 120 ms | Time from `mount()` to first visible pixel, empty pipeline cache. |
| **Cold start — warm cache** | < 50 ms | Time from `mount()` to first visible pixel, pre-existing `pipeline.{platform}.bin`. |
| Sustained frame time (idle) | < 2 ms @ 8 fps | 99th percentile walk+layout+paint time. |
| Sustained frame time (active) | < 10 ms @ 60 fps | 99th percentile during `showcase.tsx` interactions. |
| Input-to-visual latency (typical) | < 50 ms (p95) | Keyboard event → rendered frame in user's eyes. |
| Input-to-visual latency (compositor-animated transform/opacity) | < 16 ms (p95) | For properties running on the compositor-thread path. |
| Frame time during JS-blocking work (compositor-only animations) | < 16 ms | 60fps maintained while main thread is saturated. |
| MSDF text throughput | 10,000+ glyphs/frame | At 60fps without frame drops, single 1024×1024 MSDF atlas. |
| **Kitty protocol encoding (full 1920×1080 RGBA frame)** | < 0.5 ms | Native Rust path from GPU readback to stdout-ready bytes. |
| **Viewport culling savings (large tree)** | ≥ 40% walk+layout time saved | Synthetic benchmark: 1000-node tree with 100 visible nodes. |
| **Frame budget scheduler — user-blocking tasks** | Always within frame | No deferral; input handling never skips a frame. |
| Idle CPU | < 2% of one core | Measured during 30 seconds of zero input. |
| Memory baseline (empty app) | < 50 MB | RSS after mount, 5 seconds idle. |
| Memory steady state (showcase) | < 150 MB | RSS during 60 seconds of interaction. |
| GPU memory per font (MSDF) | ≤ 4 MB | One 1024×1024 RGBA8 atlas. |
| **GPU memory total (configurable budget)** | Default 128 MB | Unified resource manager enforces cap; exceeds trigger LRU eviction. |

CI runs `bench:showcase` on every PR and fails if any metric regresses by >10% from `main`. Specific optimization regressions (cold-start-warm, Kitty encoding, viewport culling savings) have dedicated micro-benchmarks in `bench:optimizations`.

### 7.4 Supported terminals (v0.9)

| Terminal | Support level | Notes |
|---|---|---|
| **Kitty** 0.41+ | **Primary** | Full feature set, all effects, SHM transport. |
| **Ghostty** | **Primary** | Full feature set, direct transport. |
| **WezTerm** 2025.04+ | Primary | Full feature set, direct transport. |
| Alacritty, iTerm2, Windows Terminal, tmux | **Unsupported** | Engine exits with clear error on startup. |

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

- Source code is **closed** until v0.9 is shipped. No public repository.
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
- [ ] CSS Grid layout added.
- [ ] Declarative transition API shipped.
- [ ] Filter-on-self effect.
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
- Vexart does **not** ship its own layout engine — it uses Taffy.

### 10.2 Hard technical constraints

- **GPU acceleration mandatory**: every visual effect must have a WGPU-backed implementation. No CPU fallback.
- **Kitty graphics protocol required**: no ASCII or cell-based fallback.
- **Two-language rule**: TypeScript + Rust only. Adding a third language requires a PRD amendment with founder approval.
- **Native surface is a single binary**: `libvexart` ships all native code. No sub-binaries for individual features.
- **FFI params ≤8**: all Rust exports respect ARM64 register limits.
- **Zero-alloc hot path**: no heap allocations in per-frame FFI calls (enforced by packed ArrayBuffer pattern).

### 10.3 Process constraints

- **Solo development**: founder is the only developer for v0.9. No outside contributors.
- **Closed source until v0.9 ships**: no public repository, no public issues, no public PRs.
- **8 hours of focused coding per day, 5-6 days per week**: sustainability over sprint.
- **Bi-weekly architectural reviews**: founder reviews progress with external senior advisor every 2 weeks.
- **Spec-Driven Development (SDD)**: every change to the code follows the SDD workflow (propose → spec → design → tasks → apply → verify → archive). AI agents execute tasks; founder verifies.

---

## 11. Roadmap — 7 Phases to v0.9

Timeline assumes 8 hours/day of focused coding, solo, with bi-weekly reviews. Total ~8 months including buffer.

**Summary:**

| Phase | Name | Duration | Output |
|---|---|---|---|
| 0 | Architectural alignment | 3 days | PRD + ARCHITECTURE + API-POLICY + SDD bootstrap |
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
- [ ] SDD framework initialized in `/openspec/`.
- [ ] Final package names confirmed: `@vexart/engine`, `@vexart/primitives`, `@vexart/headless`, `@vexart/styled`.
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

### Phase 6 — Buffer (built-in)

**Goal**: absorb the overruns that will happen.

Plan includes ~2 weeks of buffer across phases for:
- Unexpected Taffy behaviors.
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

**Rationale**: Dual licensing with revenue threshold is proven by Elastic, MongoDB, Redis Labs, Mapbox. It captures commercial value without alienating hobbyists or OSS community. Aligns with founder's closed-source-until-mature constraint.

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

**Alternatives considered**: Current 16-package structure, single monolithic package, 3-layer without primitives/engine split.

**Rationale**: Mirrors Radix/shadcn pattern familiar to React devs. Three distinct user entry points (styled for turnkey, headless for custom styling, engine for full control) maximize addressable market. Strict layering prevents architectural rot.

**Implications**: Phase 1 consolidates 16 packages into 4 (+ optional internals). CI enforces layer rules via dependency-cruiser.

### 2026-04-17 — DEC-007: SDD (Spec-Driven Development) as execution methodology

**Decision**: All Vexart development follows the SDD workflow: Change Proposal → Spec → Design → Tasks → Apply → Verify → Archive.

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
5. **Future optionality**: WGPU code compiles to WASM + WebGPU in the browser. If Vexart ever wants a web playground (a strong marketing asset for closed-source distribution), WGPU enables it for free. Native renderers would foreclose it.
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

---

## 13. Glossary

- **Adaptive render loop**: frame scheduler that varies FPS based on activity (idle 8fps, active up to 60fps).
- **Backdrop filter**: CSS-style filter applied to content *behind* an element (e.g. glassmorphism blur).
- **Clay**: C-based layout engine currently in use. Being replaced by Taffy in Phase 2.
- **Closed source (in this PRD)**: source code is not publicly available, but binaries are distributed with a license agreement.
- **Compositor-thread animation**: animation whose per-frame update touches only GPU uniforms (transform matrix, opacity) without regenerating paint commands or invalidating layout. Stays at 60fps even when the main thread is blocked.
- **`contain` prop**: declarative hint (mirrors CSS `contain`) telling the engine that a subtree is isolated from outer layout/paint invalidation.
- **DEC-XXX**: numbered entry in the Decisions Log (Section 12). Every architectural or product commitment receives one.
- **Effect**: visual transformation applied during paint — shadow, glow, gradient, filter, transform.
- **FFI**: Foreign Function Interface. The boundary between TypeScript (Bun) and Rust (`libvexart`).
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
- **ResourceManager**: the unified GPU memory manager in `libvexart`. Holds all GPU-resident assets under a single budget (default 128 MB). Performs priority-based LRU eviction per frame. Replaces Vexart v0.1's five independent caches.
- **SDD**: Spec-Driven Development. Execution methodology where every change goes through proposal → spec → design → tasks → apply → verify → archive.
- **SDF**: Signed Distance Field. Mathematical representation of shapes that enables GPU-accelerated anti-aliased rendering.
- **Styled component**: themed component built on top of a headless component with opinionated tokens.
- **Task priority lane**: a bucket in Vexart's frame budget scheduler. Three lanes: `user-blocking` (input, focus — never skipped), `user-visible` (layer repaint — may split across frames), `background` (cache warming, telemetry — idle-only). Mirrors web platform's `scheduler.postTask` semantics.
- **Taffy**: Rust-native layout engine implementing Flexbox, CSS Grid, and Block. Replaces Clay in Phase 2.
- **Tier 1 optimization**: the three performance-critical items from DEC-010 bundled into Phase 2b. Non-negotiable for v0.9 release. Cover native Kitty encoding, WGPU pipeline cache, and unified GPU budget.
- **Tier 2 optimization**: the two performance-for-scale items from DEC-010 bundled into Phase 3. Cover viewport culling and frame budget scheduler. May be descoped only via explicit founder decision recorded in the log.
- **Viewport culling**: skip layout and paint for subtrees whose bounding box is fully outside the visible terminal area. Vexart's automatic equivalent of CSS `content-visibility: auto`. Activates during `walk-tree`.
- **Void**: the default styled theme (dark, shadcn-inspired). Located in `@vexart/styled`.
- **WebGPU**: modern graphics API specification. Cross-platform, designed by browser vendors (Google, Apple, Mozilla, Microsoft) as the successor to WebGL. Exposes Metal, Vulkan, and DirectX 12 through a unified API.
- **WGPU**: Rust implementation of the WebGPU specification (the crate `wgpu` from `gfx-rs`). Vexart's only GPU API. Dispatches automatically to Metal (macOS), Vulkan (Linux), DirectX 12 (Windows), and WebGPU (browser, for future playground). **Not** an alternative to native APIs — it is a single abstraction that uses them internally.
- **`willChange` prop**: declarative hint (mirrors CSS `will-change`) telling the compositor which properties will animate, so it can pre-promote a layer and avoid a just-in-time promotion hitch.
- **WGSL**: the WebGPU Shading Language. Modern shader language used by WGPU. Replaces legacy GLSL/HLSL/MSL in the Vexart stack.

---

## Appendix A — Source of Truth Ownership

Different aspects of Vexart are "owned" by different documents and processes. When two sources conflict, the owner below wins:

| Aspect | Owner | Location |
|---|---|---|
| Product vision, scope, quality bar | This PRD | `docs/PRD.md` |
| Architecture principles | `docs/ARCHITECTURE.md` | (derived from this PRD) |
| API surface policy | `docs/API-POLICY.md` | (derived from this PRD) |
| Per-phase plans | SDD Change Proposals | `openspec/changes/*/proposal.md` |
| Detailed behavior specs | SDD Specs | `openspec/changes/*/specs/*.md` |
| Task decomposition | SDD Tasks | `openspec/changes/*/tasks.md` |
| Code implementation | The code itself | `packages/*/src/` |
| Historical decisions | Decisions Log (§12 above) | `docs/PRD.md` |
| In-flight PRD edits | `CHANGELOG-PRD.md` | `docs/CHANGELOG-PRD.md` |

---

**END OF PRD v0.1**

### Issue: Real box-shadow shader (deferred to Phase 4+)

**Status**: Open — identified during Phase 3 demo verification.

**Problem**: Drop shadows (`shadow` prop) currently render using the same glow/halo shader (cmd_kind=6) as the `glow` prop. Both produce a radial halo effect. Real CSS-like box-shadows need a dedicated shader that:
1. Draws a rectangle offset by (x, y) from the element
2. Applies gaussian blur to the rectangle
3. Uses the shadow color with proper alpha blending

**Current behavior**: `shadow={{ x: 4, y: 4, blur: 8, color: 0xa8483e60 }}` looks identical to a glow — no directional offset visible.

**Expected behavior**: Shadow should appear as a blurred copy of the element shifted by (x, y), creating depth/elevation effect like CSS `box-shadow`.

**Impact**: Low — dark shadows on dark backgrounds are nearly invisible anyway. Colored shadows show as glows. The visual difference only matters for light themes or elevated card designs.

**Fix**: Add a dedicated shadow shader (cmd_kind=20+) that renders an offset blurred rectangle instead of reusing the radial halo.
