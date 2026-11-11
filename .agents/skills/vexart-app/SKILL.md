---
name: vexart-app
description: Build, develop, or refactor GPU-accelerated terminal UI applications using Vexart, SolidJS reactivity, Void design tokens, and Flexbox layout.
metadata:
  short-description: Build Vexart terminal applications
---

# Vexart Application Builder

Authoritative engineering guide for developing pixel-native, GPU-accelerated terminal UI applications with Vexart. Vexart combines SolidJS fine-grained reactivity with a high-performance WGPU native rendering engine, delivering browser-grade visuals (anti-aliased rounded corners, box-shadows, linear/radial gradients, backdrop blur glassmorphism, images, and canvas) inside Kitty-graphics-compatible terminal emulators (Kitty, Ghostty, WezTerm, Herdr, tmux).

## When to Use This Skill

Use this skill when:
- Building a new terminal UI application, dashboard, or CLI tool using Vexart.
- Designing layouts for widescreen (16:9) terminal interfaces using Flexbox.
- Creating reactive interfaces with SolidJS signals, memos, and control flow in the terminal.
- Styling components using Void design system tokens (colors, spacing, typography, radii).
- Adding keyboard navigation, focus management, animations, and interactive forms.
- Refactoring existing terminal applications to leverage GPU-accelerated rendering.

## 🛡️ Anti-Hallucination Contract & Core Invariants

Every agent generating or refactoring Vexart applications MUST strictly adhere to these 6 immutable architectural invariants:

### 1. Unified Barrel Rule (`from "vexart"`)
All components, primitives, hooks, styling tokens, and layout constants MUST be imported directly from the root `"vexart"` package:
```tsx
import {
  createApp,
  createSignal,
  createMemo,
  Show,
  For,
  VoidButton,
  VoidCard,
  VoidCardHeader,
  VoidCardTitle,
  VoidCardContent,
  VoidInput,
  colors,
  space,
  radius,
  useTerminalDimensions,
  useFocus,
} from "vexart"
``` 
❌ **NEVER import from internal packages**: Do NOT import from `@vexart/engine`, `@vexart/styled`, `@vexart/headless`, `@vexart/app`, `solid-js`, or `solid-js/web`.

### 2. Web-Native JSX Intrinsics & Core Terminal Primitives
Vexart provides first-class native reconciler support for web-native JSX elements alongside core terminal primitives:
- **Block Containers (`<div>`, `<section>`, `<header>`, `<footer>`, `<main>`, `<nav>`)**:
  - Default to `direction="column"` (vertical flow), matching standard web box behavior.
- **Terminal Box (`<box>`)**:
  - Defaults to `direction="row"` (horizontal flow) for 16:9 widescreen terminal layouts.
- **Interactive Button (`<button>`)**:
  - Defaults to `focusable={true}`, `alignX="center"`, and `alignY="center"`.
  - Supports `onClick` (alias of `onPress`), `onMouseEnter` / `onHoverEnter`, and `onMouseLeave` / `onHoverLeave`.
- **Typography & Text Elements (`<span>`, `<p>`, `<h1>`–`<h4>`, `<label>`)**:
  - Render as native text nodes with standard heading font scales and inherit parent typography (`fontSize`, `color`, `fontWeight`, `fontFamily`, `lineHeight`).
- **Bare Text Children**:
  - Direct string children inside `<box>`, `<div>`, `<button>`, etc. work natively and automatically create text nodes.
- **Unsupported Browser Features**:
  - No Browser DOM (`window`, `document`, `addEventListener`).
  - No `<scroll>` tag (use `<box scrollY scrollId="...">`, `<div>` with `overflow-y-scroll`, or `<ScrollView>`).
  - Use Void / Headless components for rich form controls (`<VoidInput>`, `<VoidCheckbox>`, `<VoidSelect>`).

### 3. 16:9 Widescreen Layout Default (`direction="row"`)
Unlike mobile-first frameworks, Vexart is built for modern desktop and widescreen terminal displays (16:9 aspect ratio).
- **Default Direction**: `<box>` defaults to `direction="row"`. Sibling elements and adjacent texts flow horizontally from left to right.
- **Vertical Stacking**: When creating lists, vertical sidebars, dialog contents, or forms, use `<div>` (which defaults to `direction="column"`) or explicitly set `direction="column"` on `<box>`:
```tsx
{/* Stacks vertically using div */}
<div gap={space[4]}>
  <text color={colors.foreground}>Item 1</text>
  <text color={colors.foreground}>Item 2</text>
</div>

{/* Stacks vertically */}
<box direction="column" gap={space[4]}>
  <text color={colors.foreground}>Item 1</text>
  <text color={colors.foreground}>Item 2</text>
</box>

{/* Flows horizontally side-by-side (default) */}
<box gap={space[2]}>
  <VoidButton variant="default">Save</VoidButton>
  <VoidButton variant="outline">Cancel</VoidButton>
</box>
```

### 4. SolidJS Reactivity Rules (Not React!)
Vexart uses SolidJS universal rendering. There is NO Virtual DOM and NO component re-rendering loop.
- **Run-Once Component Setup**: Components execute once as a setup function. Reactive updates bypass the component function and update native nodes directly.
- **Do NOT Destructure Props**: `const { label } = props` permanently breaks reactivity. Access props directly as `props.label` or use `splitProps`.
- **Reactive Primitives**: Use `createSignal()`, `createMemo()`, and `createEffect()`.
- **Control Flow**: Always use declarative components:
  - Conditional: `<Show when={loggedIn()} fallback={<text>Login</text>}>...</Show>`
  - Collections: `<For each={items()}>{(item, index) => <text>{item.name}</text>}</For>`

### 5. Event System & Interactivity
Vexart uses semantic, cross-platform terminal pointer and keyboard events:
- Buttons & pressable items: `onPress={(e) => ...}` and `onClick={(e) => ...}` (`onClick` is fully supported as an alias of `onPress`).
- Hover events: `onMouseEnter` / `onHoverEnter` and `onMouseLeave` / `onHoverLeave` (aliases of `onMouseOver` / `onMouseOut`).
- Key handling: `onKeyDown={(e) => ...}` (e.g. `e.key === "Enter"`).
- Pointer: `onPointerDown`, `onPointerMove`, `onPointerUp`, `onHover`.

### 6. Pluggable Syntax Highlighting (No Tree-sitter Coupling)
Tree-sitter WASM is NOT bundled inside the engine. `<Code>`, `<Markdown>`, and `<Textarea>` accept an optional `highlighter?: Highlighter` prop. In the absence of a custom highlighter, code renders safely as plain syntax-safe text without requiring any native WASM binaries.

### 7. Modern Protocols, Transports & Release Policy
- **SGR-Pixel Precision (Mode 1016)**: Vexart operates natively in exact pixel coordinates (sub-cell positioning, pointer coordinates, and hit-testing) using the SGR-Pixel protocol rather than coarse character-cell grids.
- **Kitty Graphics Transports**: High-throughput rendering exclusively uses POSIX Shared Memory (`shm`) and Base64 Direct (`direct`) transport mechanisms. Legacy file transport has been eliminated.
- **Automated Versioning & Releases**: Managed via Google Release Please with Conventional Commits (no manual changesets). Baseline package version is `^0.11.0`.

---

## ⚡ Complete Application Starter Skeleton

Here is a complete, production-grade 16:9 widescreen terminal dashboard:

```tsx
import {
  createApp,
  createSignal,
  colors,
  space,
  radius,
  VoidCard,
  VoidCardHeader,
  VoidCardTitle,
  VoidCardDescription,
  VoidCardContent,
  VoidButton,
  VoidBadge,
  useTerminalDimensions,
} from "vexart"

function Dashboard() {
  const [activeTab, setActiveTab] = createSignal<"metrics" | "logs">("metrics")
  const [requests, setRequests] = createSignal(1240)
  const dims = useTerminalDimensions()

  return (
    <box
      width="100%"
      height="100%"
      direction="column"
      backgroundColor={colors.background}
      padding={space[4]}
      gap={space[4]}
    >
      {/* Header Bar */}
      <box
        width="100%"
        direction="row"
        alignX="space-between"
        alignY="center"
        paddingBottom={space[3]}
        borderBottomWidth={1}
        borderColor={colors.border}
      >
        <box direction="row" gap={space[3]} alignY="center">
          <text color={colors.foreground} fontSize={18} fontWeight={700}>
            Vexart Mission Control
          </text>
          <VoidBadge variant="default">ONLINE</VoidBadge>
        </box>
        <text color={colors.mutedForeground} fontSize={12}>
          Viewport: {dims.width()} × {dims.height()} px
        </text>
      </box>

      {/* Main 16:9 Content Layout */}
      <box width="100%" height="grow" direction="row" gap={space[4]}>
        {/* Left Sidebar Navigation */}
        <box width={260} height="100%">
          <VoidCard>
            <VoidCardHeader>
              <VoidCardTitle>Navigation</VoidCardTitle>
              <VoidCardDescription>System modules</VoidCardDescription>
            </VoidCardHeader>
            <VoidCardContent>
              <box direction="column" gap={space[2]} width="100%">
                <VoidButton
                  variant={activeTab() === "metrics" ? "default" : "ghost"}
                  onPress={() => setActiveTab("metrics")}
                >
                  📊 Telemetry Metrics
                </VoidButton>
                <VoidButton
                  variant={activeTab() === "logs" ? "default" : "ghost"}
                  onPress={() => setActiveTab("logs")}
                >
                  📜 System Logs
                </VoidButton>
              </box>
            </VoidCardContent>
          </VoidCard>
        </box>

        {/* Right Content Area */}
        <box
          width="grow"
          height="100%"
          direction="column"
          backgroundColor={colors.card}
          borderWidth={1}
          borderColor={colors.border}
          cornerRadius={radius.lg}
          padding={space[6]}
          gap={space[4]}
        >
          <text color={colors.foreground} fontSize={20} fontWeight={600}>
            Active Overview: {activeTab().toUpperCase()}
          </text>

          <box direction="row" gap={space[4]}>
            <box
              direction="column"
              padding={space[4]}
              backgroundColor={colors.secondary}
              cornerRadius={radius.md}
              width={200}
              gap={space[1]}
            >
              <text color={colors.mutedForeground} fontSize={12}>Total Requests</text>
              <text color={colors.primary} fontSize={24} fontWeight={700}>
                {requests()}
              </text>
            </box>
          </box>

          <box direction="row" gap={space[2]}>
            <VoidButton
              variant="secondary"
              onPress={() => setRequests((r) => r + 50)}
            >
              Simulate Traffic (+50)
            </VoidButton>
            <VoidButton
              variant="outline"
              onPress={() => setRequests(0)}
            >
              Reset Counter
            </VoidButton>
          </box>
        </box>
      </box>
    </box>
  )
}

// Bootstrap application with graceful exit shortcut
createApp(() => <Dashboard />, { quit: ["ctrl+c", "q"] })
``` 

---

## 📐 Sizing & Flexbox Layout Guide

### Sizing Values
- Exact numbers (pixels): `width={300}`, `height={60}`
- Percentage strings: `width="100%"`, `width="50%"`
- Flexible growth: `width="grow"`, `height="grow"` (flex-grow: 1)
- Content shrink/fit: `width="fit"`, `height="fit"` (flex-shrink: 1)

### Alignment Properties
- `alignX`: `"start" | "center" | "end" | "space-between" | "space-around"`
- `alignY`: `"start" | "center" | "end" | "stretch"`

---

## 🎨 Void 2.0 Design System Tokens & Tailwind Engine

Vexart provides an OLED-black design system inspired by shadcn/ui with Void 2.0 visual tokens:

| Token Category | Examples | Description |
|---|---|---|
| `colors` | `colors.background` (#09090b), `colors.foreground` (#fafafa), `colors.card` (#121216), `colors.muted` (#18181e), `colors.mutedForeground` (#a1a1aa), `colors.border`, `colors.ring` | High-contrast Void 2.0 OLED palette |
| `gradients` | `gradients.card` (#18181f -> #101014), `gradients.primaryButton`, `gradients.secondaryButton`, `gradients.destructiveButton`, `gradients.subtle` | Elevated card surfaces and hero button gradients |
| `borders` | `borders.rimTop` (#ffffff2e), `borders.hairline` (#ffffff14), `borders.glassRim` (#ffffff29) | Specular top reflection, hairline divider, and glass rim borders |
| `glows` | `glows.ambient` (depth/elevation), `glows.primary` (brand hero accent), `glows.ring` (focus ring) | Outer glow presets for focus and elevation |
| `backdropBlur` | `12` on `Dialog.Overlay` | GPU glassmorphism for modal backdrops (overlay targets only; foreground text stays crisp) |
| `space` | `space[1]` (4px), `space[2]` (8px), `space[3]` (12px), `space[4]` (16px), `space[6]` (24px), `space[8]` (32px) | Harmonious layout grid scale |
| `radius` | `radius.sm` (6px), `radius.md` (8px), `radius.lg` (10px), `radius.xl` (14px), `radius.full` (9999px) | Per-corner anti-aliased curvature |

### Tailwind `className` Engine
Vexart includes an expanded, high-performance Tailwind utility compiler:
- **Flex & Grid**:
  - Presets: `flex-1`, `flex-auto`, `flex-initial`, `flex-none`.
  - Grid: `grid`, `grid-cols-1` through `grid-cols-12`, `col-span-1` through `col-span-12`.
- **Borders & Radii**:
  - Directional borders: `border-t`, `border-b`, `border-l`, `border-r`, `border-t-2`, etc.
  - Directional radii: `rounded-t-*`, `rounded-b-*`, `rounded-l-*`, `rounded-r-*`, `rounded-tl-*`, `rounded-tr-*`, `rounded-bl-*`, `rounded-br-*`.
- **Arbitrary Bracket Syntax**:
  - Sizing/spacing: `w-[320px]`, `h-[48px]`, `p-[10px]`, `m-[12px]`, `gap-[8px]`, `text-[15px]`, `rounded-[10px]`.
  - Colors: `bg-[#141418]`, `text-[#e4e4e7]`, `border-[#ffffff15]`.
- **Color Scales & Opacity Modifiers**:
  - Full standard scales: `zinc`, `slate`, `neutral`, `red`, `amber`, `emerald`, `blue`, `violet` (50–950).
  - Opacity modifiers: `bg-white/10`, `border-white/15`, `bg-zinc-900/80`, `bg-black/50`.
- **Styled Component Overrides**:
  - `className` overrides work directly on all `@vexart/styled` components:
    `<VoidButton className="w-full h-12 bg-emerald-500 rounded-full">Save</VoidButton>`
    `<VoidCard className="w-[400px] p-6 bg-zinc-900/90 border-emerald-500/30">...</VoidCard>`

---

## 📚 Detailed Reference Documentation

For in-depth guides, component catalogs, and API contracts, consult the included reference files:

- [references/api-reference.md](references/api-reference.md) — Complete public API reference covering all exports from "vexart".
- [references/examples-and-tutorials.md](references/examples-and-tutorials.md) — Practical recipes: 16:9 widescreen layouts, forms, and dynamic filtered lists.
- [references/components.md](references/components.md) — Exhaustive catalog of all 25+ Void components (Buttons, Inputs, Cards, Badges, Tabs, Dialogs, Sliders, Progress, Select, Tooltips).
- [references/layout-and-styling.md](references/layout-and-styling.md) — Comprehensive Flexbox layout guide, 16:9 widescreen patterns, and multi-tier nested box positioning.
- [references/reactivity-and-hooks.md](references/reactivity-and-hooks.md) — SolidJS reactivity best practices, hooks (`useFocus`, `useDrag`, `useHover`, `useQuery`), animations (`createTransition`), and keyboard shortcuts.
- [references/template-starter.md](references/template-starter.md) — Starter project templates, `package.json`, `tsconfig.json`, and Bun runner command lines.

---

## ✅ Hallucination Prevention Checklist

| Feature | DO (Correct Vexart) | DON'T (Hallucination) |
|---|---|---|
| **Package Import** | `import { ... } from "vexart"` | `import { ... } from "@vexart/engine"` or `"solid-js"` |
| **Container Elements** | `<box>` (defaults to row) or `<div>` (defaults to column) | Assuming `<box>` defaults to vertical |
| **Text Rendering** | `<text>`, `<span>`, `<p>`, or direct `"Hello"` string child | Calling browser DOM methods on text |
| **Button Events** | `<VoidButton onPress={...}>` or `<button onClick={...}>` | Calling browser `addEventListener` |
| **Button Variant** | `<VoidButton variant="default">` | `<VoidButton variant="primary">` (primary does not exist) |
| **Badge Variant** | `<VoidBadge variant="default">` | `<VoidBadge variant="success">` (success does not exist) |
| **Card Styling** | `<VoidCard className="w-[300px] p-4">` | Wrapping in unnecessary wrapper boxes |
| **Input Change** | `<VoidInput onChange={(val) => ...}>` | `<input onChange={(e) => ...}>` |
| **Conditional UI** | `<Show when={active()}>{...}</Show>` | `{active() && <div>...</div>}` |
| **List Iteration** | `<For each={items()}>{(item) => ...}</For>` | `{items().map(item => ...)}` |
| **State Signals** | `const [count, setCount] = createSignal(0)` | `const [count, setCount] = useState(0)` |
| **Props Access** | `props.title` (read property on access) | `const { title } = props` (destructuring breaks reactivity) |
| **Syntax Highlighting** | `<Code code={snippet} highlighter={customHL} />` | Bundling or importing `web-tree-sitter` WASM in app |
| **Kitty Transport** | POSIX Shared Memory (`shm`) or Direct (`direct`) | Legacy file transport |
| **Release Management** | Google Release Please + Conventional Commits | Manual `changeset` CLI |
| **Coordinate Precision** | SGR-Pixel Mode 1016 (exact sub-cell pixels) | Cell-grid approximations |
