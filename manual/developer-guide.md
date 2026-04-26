# Vexart Developer Guide

> Complete API reference for building terminal applications with Vexart.
> Vexart renders browser-quality pixel UI in the terminal using JSX (SolidJS).

## Table of Contents

- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Requirements](#requirements)
  - [Import Model](#import-model)
  - [Minimal App](#minimal-app)
  - [The `--conditions=browser` Flag](#the---conditionsbrowser-flag)
- [Core Concepts](#core-concepts)
  - [The Rendering Pipeline](#the-rendering-pipeline)
  - [Three Intrinsic Elements](#three-intrinsic-elements)
  - [SolidJS Reactivity (Not React)](#solidjs-reactivity-not-react)
  - [Default Layout](#default-layout)
- [`<box>` — Complete Prop Reference](#box--complete-prop-reference)
  - [Layout Props](#layout-props)
  - [Sizing Props](#sizing-props)
  - [Visual Props](#visual-props)
  - [Shadow & Glow](#shadow--glow)
  - [Gradient](#gradient)
  - [Backdrop Filters](#backdrop-filters)
  - [Element Opacity](#element-opacity)
  - [Interactive States](#interactive-states)
  - [Interaction Props](#interaction-props)
  - [Scroll Props](#scroll-props)
  - [Floating / Absolute Positioning](#floating--absolute-positioning)
  - [Compositing](#compositing)
- [`<text>` — Complete Prop Reference](#text--complete-prop-reference)
- [`<img>` — Complete Prop Reference](#img--complete-prop-reference)
- [Colors](#colors)
- [Hooks & Signals](#hooks--signals)
  - [useFocus](#usefocusopts)
  - [useKeyboard / useMouse / useInput / onInput](#usekeyboard--usemouse--useinput--oninput)
  - [pushFocusScope](#pushfocusscope)
  - [createTransition](#createtransitionsignal-options)
  - [createSpring](#createspringsignal-options)
  - [useQuery](#usequeryfetcher-options)
  - [useMutation](#usemutationmutator-options)
  - [useTerminalDimensions](#useterminaldimensionsterminal)
  - [markDirty](#markdirty)
- [Components (Headless)](#components-headless)
  - [Component Architecture](#component-architecture)
  - [Complete Component Reference](#complete-component-reference)
  - [createForm — Form Validation](#createform--form-validation)
- [Design System (Styled)](#design-system-styled)
  - [Tokens](#tokens)
  - [Theming](#theming)
  - [Void Components](#void-components)
  - [Creating Custom Theme Packages](#creating-custom-theme-packages)
- [Patterns & Recipes](#patterns--recipes)
  - [Glassmorphism Card](#glassmorphism-card)
  - [Form with Validation](#form-with-validation)
  - [Multi-Screen App with Router](#multi-screen-app-with-router)
  - [Modal Dialog](#modal-dialog)
  - [Virtualized Data Table](#virtualized-data-table)
  - [Global Keyboard Shortcuts](#global-keyboard-shortcuts)
  - [Animated Transitions](#animated-transitions)
- [API Quick Reference](#api-quick-reference)
  - [`@vxrt/core`](#vxrt-core)
  - [`@vxrt/core/engine`](#vxrt-core-engine)

---

## Quick Start

### Installation

```bash
bun add @vxrt/core@beta solid-js
bun add -d @babel/core @babel/preset-typescript babel-preset-solid
```

### JSX Setup

Vexart uses SolidJS, which requires a custom JSX transform (different from React's).
You need two configuration files in your project root:

**`bunfig.toml`** — tells Bun to preload the Solid JSX plugin before running `.tsx` files:

```toml
preload = ["@vxrt/core/solid-plugin"]
```

**`tsconfig.json`** — tells TypeScript to use Vexart's JSX types:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "@vxrt/core",
    "strict": true,
    "noEmit": true
  }
}
```

Without `bunfig.toml`, Bun interprets JSX as React and you get
`Cannot find module "react/jsx-dev-runtime"`. Without the preload,
SolidJS reactivity breaks — components render once but never update.

### Requirements

- **Bun >= 1.1.0** — Vexart uses Bun's FFI for the native Rust library.
- **Terminal with Kitty graphics protocol** — Kitty, Ghostty, or WezTerm. The Kitty protocol transmits pixel data directly to the terminal GPU. Standard terminals (iTerm2, Terminal.app, Windows Terminal) are not supported.
- **macOS ARM64** — The shipped native binary (`libvexart.dylib`) is currently ARM64 Darwin only. Linux and x86 builds are planned.

### Import Model

Vexart uses a two-tier import structure:

| Import | What it provides |
|--------|-----------------|
| `@vxrt/core` | Everything for app development — components, design tokens, hooks, SolidJS primitives (`createSignal`, `For`, `Show`, etc.), headless components, styled components. This is the only import most apps need. |
| `@vxrt/core/engine` | Low-level engine access — FFI bridge, render loop, terminal management, focus system internals, pointer capture, debug utilities, tree-sitter, font registration. Only needed for advanced use cases. |

```tsx
// App-level imports — covers 95% of use cases
import { createSignal, For, Show, createApp, Button, Input, colors } from "@vxrt/core"

// Low-level engine access — only when needed
import { useFocus, setFocus, toggleDebug, registerFont } from "@vxrt/core/engine"
```

### Minimal App

```tsx
import { createApp } from "@vxrt/core"

function App() {
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={0x141414ff}
      alignX="center"
      alignY="center"
    >
      <text color={0xfafafaff} fontSize={16}>
        Hello from Vexart
      </text>
    </box>
  )
}

async function main() {
  await createApp(() => <App />, { quit: ["q", "ctrl+c"] })
}

main()
```

**What happens:**

1. `createApp()` — creates the terminal, detects capabilities, enters raw mode, enables Kitty graphics and mouse tracking, and mounts your JSX tree.
2. Vexart creates the SolidJS reactive root, initializes the Flexily layout engine, starts the 30fps render loop with dirty-flag optimization, and connects stdin to the input parser.
3. Your JSX renders. When signals change, only affected nodes re-layout and re-paint.

Run it:

```bash
bun --conditions=browser run app.tsx
```

### The `--conditions=browser` Flag

SolidJS ships separate entry points for server (`solid-js/universal`) and browser environments. Vexart uses `solid-js/universal` with the `createRenderer` API, which is resolved through the `"browser"` export condition.

You **must** pass `--conditions=browser` when running any Vexart app:

```bash
bun --conditions=browser run app.tsx
```

Without it, Bun resolves the server entry point and SolidJS reactivity breaks silently — components render once but never update.

For convenience, add a script to your `package.json`:

```json
{
  "scripts": {
    "dev": "bun --conditions=browser run src/app.tsx"
  }
}
```

### Complete Project Setup (copy-paste)

Here is the full setup sequence for a new Vexart project:

```bash
mkdir my-app && cd my-app
bun init -y
bun add @vxrt/core@beta solid-js
bun add -d @babel/core @babel/preset-typescript babel-preset-solid
```

Create `bunfig.toml`:

```toml
preload = ["@vxrt/core/solid-plugin"]
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "@vxrt/core",
    "strict": true,
    "noEmit": true
  }
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "bun --conditions=browser run src/app.tsx"
  }
}
```

Create `src/app.tsx`:

```tsx
import { createApp, Box, Text, colors, radius, space } from "@vxrt/core"

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      alignX="center"
      alignY="center"
    >
      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.xl}
        padding={space[6]}
        direction="column"
        gap={space[2]}
      >
        <Text color={colors.foreground} fontSize={16}>
          Hello from Vexart
        </Text>
        <Text color={colors.mutedForeground} fontSize={12}>
          Press Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />)
```

Run:

```bash
bun run dev
```

---

## Core Concepts

### The Rendering Pipeline

```
JSX → SolidJS reactive signals → Flexily layout (TypeScript) → Rust/WGPU paint → Kitty protocol → Terminal
```

| Stage | What happens |
|-------|-------------|
| **JSX** | You write `<box>` and `<text>` elements. SolidJS compiles them into fine-grained reactive nodes — no virtual DOM. |
| **SolidJS signals** | When a signal changes, only the specific DOM operation (e.g., set background color) fires. No diffing, no re-render. |
| **Flexily layout** | A pure JavaScript layout engine computes the position and size of every element in microseconds. Same model as CSS flexbox. |
| **Rust/WGPU paint** | A Rust/WGPU native library paints each element into a pixel buffer using SDF (Signed Distance Field) primitives — anti-aliased corners, gradients, shadows, blur. |
| **Kitty protocol** | The pixel buffer is transmitted to the terminal via the Kitty graphics protocol. The terminal composites it on its GPU. Only dirty regions are retransmitted. |

### Three Intrinsic Elements

Vexart has exactly **three** built-in JSX elements. Everything else (Button, ScrollView, Dialog, etc.) is a component built from these primitives.

| Element | HTML Equivalent | Purpose |
|---------|----------------|---------|
| `<box>` | `<div>` | Layout container. Flexbox, visual styling, effects, interaction. |
| `<text>` | `<span>` | Text display. Color, size, weight, wrapping. |
| `<img>` | `<img>` | Image display. Loads from file path, supports object-fit and rounded corners. |

```tsx
<box direction="row" gap={8} padding={16} backgroundColor={0x1e1e2eff}>
  <text color={0xfafafaff} fontSize={14}>Hello</text>
  <img src="./logo.png" width={32} height={32} cornerRadius={8} />
</box>
```

### SolidJS Reactivity (Not React)

Vexart uses **SolidJS**, not React. The key differences:

- **Signals, not state.** `createSignal` returns a getter and setter. The getter is a function call.
- **No VDOM.** Components run once. Only signal reads inside JSX are tracked and updated.
- **No `useMemo`/`useCallback`.** Fine-grained reactivity makes them unnecessary.

```tsx
import { createSignal, Show, For } from "@vxrt/core"

function Counter() {
  const [count, setCount] = createSignal(0)

  // This log runs ONCE — the component function is not re-invoked
  console.log("Counter mounted")

  return (
    <box direction="column" gap={4}>
      {/* count() is tracked — only this text node updates */}
      <text color={0xfafafaff}>{String(count())}</text>

      <box
        focusable
        onPress={() => setCount(c => c + 1)}
        backgroundColor={0x333333ff}
        padding={8}
        cornerRadius={6}
      >
        <text color={0xfafafaff}>Increment</text>
      </box>
    </box>
  )
}
```

**Control flow** uses components, not ternaries:

```tsx
import { Show, For } from "@vxrt/core"

// Conditional rendering
<Show when={isVisible()}>
  <text>Visible</text>
</Show>

// List rendering — keyed by index, efficient updates
<For each={items()}>
  {(item) => <text>{item.name}</text>}
</For>
```

For the full SolidJS reactivity model, see: https://docs.solidjs.com/concepts/intro-to-reactivity

### Default Layout

`<box>` defaults to **column** direction (vertical, top-to-bottom). This is terminal-native — most terminal UIs stack vertically.

```tsx
// These two are identical:
<box>
  <text>First</text>
  <text>Second</text>
</box>

<box direction="column">
  <text>First</text>
  <text>Second</text>
</box>
```

Use `direction="row"` explicitly for horizontal layout:

```tsx
<box direction="row" gap={8}>
  <text>Left</text>
  <text>Right</text>
</box>
```

The terminal window resizes automatically. When the terminal is resized, Vexart detects the new dimensions, re-runs Flexily layout, and re-paints. Your layout adapts if you use relative sizing (`width="100%"`, `width="grow"`).
---

## `<box>` — Complete Prop Reference

The `<box>` element is the universal building block. It handles layout, visual styling, effects, and interaction — equivalent to a CSS `<div>` with flexbox.

### Layout Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `direction` | `"row" \| "column"` | `"column"` | Flex direction. `"column"` = vertical (top-to-bottom), `"row"` = horizontal (left-to-right). |
| `flexDirection` | `"row" \| "column"` | — | Alias for `direction`. Provided for CSS familiarity. |
| `padding` | `number` | — | Uniform padding on all sides (pixels). |
| `paddingX` | `number` | — | Horizontal padding (left + right). |
| `paddingY` | `number` | — | Vertical padding (top + bottom). |
| `paddingLeft` | `number` | — | Left padding. |
| `paddingRight` | `number` | — | Right padding. |
| `paddingTop` | `number` | — | Top padding. |
| `paddingBottom` | `number` | — | Bottom padding. |
| `gap` | `number` | — | Space between children (pixels). Like CSS `gap`. |
| `alignX` | `"left" \| "right" \| "center" \| "space-between"` | `"left"` | Horizontal alignment of children. In a column layout, this controls cross-axis alignment. |
| `alignY` | `"top" \| "bottom" \| "center" \| "space-between"` | `"top"` | Vertical alignment of children. In a row layout, this controls cross-axis alignment. |
| `justifyContent` | `"left" \| "right" \| "center" \| "space-between" \| "flex-start" \| "flex-end"` | — | Alias for `alignX`. `flex-start` = `left`, `flex-end` = `right`. |
| `alignItems` | `"top" \| "bottom" \| "center" \| "space-between" \| "flex-start" \| "flex-end"` | — | Alias for `alignY`. `flex-start` = `top`, `flex-end` = `bottom`. |

```tsx
// Centered content
<box width="100%" height="100%" alignX="center" alignY="center">
  <text>Centered</text>
</box>

// Row with spacing
<box direction="row" gap={8} alignY="center">
  <text>Left</text>
  <text>Right</text>
</box>

// Space-between (like a header with left/right content)
<box direction="row" alignX="space-between" width="100%" padding={16}>
  <text>Title</text>
  <text>Actions</text>
</box>
```

### Sizing Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number \| string` | — | Fixed pixels, `"grow"` (fill available), `"fit"` (shrink to content), or percentage (`"100%"`, `"50%"`). |
| `height` | `number \| string` | — | Same as width — fixed, `"grow"`, `"fit"`, or percentage. |
| `minWidth` | `number` | — | Minimum width in pixels. |
| `maxWidth` | `number` | — | Maximum width in pixels. |
| `minHeight` | `number` | — | Minimum height in pixels. |
| `maxHeight` | `number` | — | Maximum height in pixels. |
| `flexGrow` | `number` | — | Makes the element grow to fill available space. Equivalent to `width="grow"`. |
| `flexShrink` | `number` | — | Allows the element to shrink below its content size. Accepted for CSS compatibility. |

**Sizing modes explained:**

```tsx
// Fixed — exactly 200px wide
<box width={200} height={100} />

// Grow — fill all available space (like CSS flex: 1)
<box width="grow" />

// Fit — shrink-wrap to content size (default behavior)
<box width="fit" />

// Percentage — relative to parent
<box width="100%" height="50%" />

// Constrained — grows but capped at 600px
<box width="grow" maxWidth={600} />
```

### Visual Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `backgroundColor` | `string \| number` | — | Background color. See [Colors](#colors). |
| `cornerRadius` | `number` | — | Uniform corner radius (pixels). SDF anti-aliased — subpixel smooth. |
| `cornerRadii` | `{ tl, tr, br, bl }` | — | Per-corner radius. `tl` = top-left, `tr` = top-right, `br` = bottom-right, `bl` = bottom-left. |
| `borderColor` | `string \| number` | — | Border color. |
| `borderWidth` | `number` | — | Uniform border width (pixels). |
| `borderLeft` | `number` | — | Left border width. |
| `borderRight` | `number` | — | Right border width. |
| `borderTop` | `number` | — | Top border width. |
| `borderBottom` | `number` | — | Bottom border width. |
| `borderBetweenChildren` | `number` | — | Draws a border between each child element. Useful for lists and dividers. |
| `opacity` | `number` | `1.0` | Element-level opacity. 0.0 = fully transparent, 1.0 = fully opaque. |

```tsx
// Card with rounded corners and border
<box
  backgroundColor={0x262626ff}
  cornerRadius={14}
  borderColor={0xffffff1a}
  borderWidth={1}
  padding={24}
>
  <text color={0xfafafaff}>Card content</text>
</box>

// Pill shape (top rounded, bottom square)
<box
  backgroundColor={0x333333ff}
  cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}
  padding={16}
>
  <text color={0xfafafaff}>Pill top</text>
</box>
```

### Shadow & Glow

#### Shadow

| Prop | Type | Description |
|------|------|-------------|
| `shadow` | `ShadowDef \| ShadowDef[]` | One or more drop shadows painted behind the element. |

**ShadowDef:**

```typescript
{
  x: number      // Horizontal offset (pixels)
  y: number      // Vertical offset (pixels)
  blur: number   // Blur radius (pixels) — larger = softer
  color: number  // MUST be u32 RGBA (e.g., 0x00000060)
}
```

> **Important:** Shadow `color` MUST be a u32 number (e.g., `0x00000060`). Hex strings are NOT supported for shadow colors — they bypass the color parser and go directly to the Rust/WGPU paint engine.

```tsx
// Single subtle shadow
<box
  backgroundColor={0x262626ff}
  cornerRadius={14}
  shadow={{ x: 0, y: 2, blur: 8, color: 0x00000040 }}
/>

// Elevated shadow
<box shadow={{ x: 0, y: 4, blur: 16, color: 0x00000060 }} />

// Multi-shadow (painted in array order)
<box
  shadow={[
    { x: 0, y: 1, blur: 3, color: 0x00000030 },
    { x: 0, y: 4, blur: 12, color: 0x00000050 },
  ]}
/>

// Colored shadow
<box shadow={{ x: 4, y: 4, blur: 8, color: 0xa8483e60 }} />
```

#### Glow

| Prop | Type | Description |
|------|------|-------------|
| `glow` | `{ radius, color, intensity? }` | Outer glow around the element. |

```typescript
{
  radius: number              // Glow spread (pixels)
  color: string | number      // Glow color — hex string or u32
  intensity?: number          // Glow strength (0-100, default ~60)
}
```

```tsx
// Cyan glow
<box
  backgroundColor={0x262626ff}
  cornerRadius={14}
  glow={{ radius: 20, color: 0x4fc4d4ff, intensity: 60 }}
/>

// Combined shadow + glow
<box
  shadow={{ x: 0, y: 4, blur: 12, color: 0x00000050 }}
  glow={{ radius: 16, color: "#4fc4d4", intensity: 50 }}
/>
```

### Gradient

| Prop | Type | Description |
|------|------|-------------|
| `gradient` | `LinearGradient \| RadialGradient` | Gradient fill. Replaces `backgroundColor` when set. |

**Linear gradient:**

```typescript
{
  type: "linear"
  from: number    // Start color (u32 RGBA)
  to: number      // End color (u32 RGBA)
  angle?: number  // Degrees — 0 = left-to-right, 90 = top-to-bottom
}
```

**Radial gradient:**

```typescript
{
  type: "radial"
  from: number   // Center color (u32 RGBA)
  to: number     // Edge color (u32 RGBA)
}
```

```tsx
// Top-to-bottom linear gradient
<box
  width={200}
  height={100}
  cornerRadius={14}
  gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 90 }}
/>

// Radial gradient (center out)
<box
  width={200}
  height={200}
  gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }}
/>
```

### Backdrop Filters

Backdrop filters process the pixel content **behind** the element before compositing. This is how glassmorphism works — blur the background, then draw a semi-transparent surface on top.

| Prop | Type | Range | Description |
|------|------|-------|-------------|
| `backdropBlur` | `number` | 0+ | Blur radius in pixels. The flagship filter. Use with a semi-transparent `backgroundColor`. |
| `backdropBrightness` | `number` | 0-200 | 0 = black, 100 = unchanged, 200 = 2x bright. |
| `backdropContrast` | `number` | 0-200 | 0 = flat grey, 100 = unchanged, 200 = high contrast. |
| `backdropSaturate` | `number` | 0-200 | 0 = grayscale, 100 = unchanged, 200 = hyper-saturated. |
| `backdropGrayscale` | `number` | 0-100 | 0 = unchanged, 100 = full grayscale. |
| `backdropInvert` | `number` | 0-100 | 0 = unchanged, 100 = fully inverted. |
| `backdropSepia` | `number` | 0-100 | 0 = unchanged, 100 = full sepia tone. |
| `backdropHueRotate` | `number` | 0-360 | Hue rotation in degrees. |

```tsx
// Glassmorphism panel
<box
  backgroundColor={0xffffff15}   // semi-transparent white
  backdropBlur={12}
  cornerRadius={14}
  borderColor={0xffffff1a}
  borderWidth={1}
  padding={24}
>
  <text color={0xfafafaff}>Frosted glass</text>
</box>

// Desaturated overlay
<box
  backgroundColor={0x00000080}
  backdropGrayscale={100}
  backdropBrightness={60}
  width="100%"
  height="100%"
/>
```

Backdrop filters read the pixel buffer region behind the element, apply the filter into a temporary buffer, then composite the element on top. Each filter runs independently — you can stack multiple filters on one element.

### Element Opacity

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `opacity` | `number` | `1.0` | Element-level opacity. 0.0 = fully transparent, 1.0 = fully opaque. Multiplies the alpha of the entire element including children. |

```tsx
<box opacity={0.5} backgroundColor={0xff0000ff}>
  <text color={0xffffffff}>50% transparent</text>
</box>
```

### Interactive States

Vexart provides declarative hover/active/focus styles. No manual signal boilerplate needed — the engine tracks pointer and focus state internally and merges style overrides automatically.

| Prop | Type | Description |
|------|------|-------------|
| `hoverStyle` | `Partial<VisualProps>` | Merged over base props when the pointer is over the element. |
| `activeStyle` | `Partial<VisualProps>` | Merged over base props when the element is being pressed (mousedown). |
| `focusStyle` | `Partial<VisualProps>` | Merged over base props when the element has keyboard focus. |

**Props available in all three:**

`backgroundColor`, `borderColor`, `borderWidth`, `cornerRadius`, `shadow`, `glow`, `gradient`, `backdropBlur`, `opacity`

```tsx
// Button with hover and active states
<box
  backgroundColor={0x333333ff}
  cornerRadius={8}
  padding={12}
  hoverStyle={{ backgroundColor: 0x444444ff }}
  activeStyle={{ backgroundColor: 0x555555ff }}
>
  <text color={0xfafafaff}>Hover me</text>
</box>

// Focus ring that glows
<box
  focusable
  backgroundColor={0x262626ff}
  cornerRadius={14}
  borderColor={0xffffff1a}
  borderWidth={1}
  focusStyle={{
    borderColor: 0x4488ccff,
    borderWidth: 2,
    glow: { radius: 16, color: 0x4488cc80, intensity: 50 },
  }}
>
  <text color={0xfafafaff}>Tab to focus</text>
</box>
```

**Border reservation:** `borderWidth` in `focusStyle`/`hoverStyle`/`activeStyle` auto-reserves space with a transparent border when inactive, preventing layout jitter on activation.

### Interaction Props

| Prop | Type | Description |
|------|------|-------------|
| `focusable` | `boolean` | Registers the element in the focus ring. Like HTML `tabindex="0"`. Tab cycles through focusable elements. |
| `onPress` | `(event?: PressEvent) => void` | Fires on mouse click AND on Enter/Space when the element is focused. Events bubble up parent chain like DOM click events. Call `event.stopPropagation()` to prevent further bubbling. |
| `onKeyDown` | `(event: KeyEvent) => void` | Keyboard events when the element is focused. |
| `onMouseDown` | `(event: NodeMouseEvent) => void` | Per-node mouse button pressed. Does NOT bubble. Works on any `<box>`, not just focusable ones. |
| `onMouseUp` | `(event: NodeMouseEvent) => void` | Per-node mouse button released. Does NOT bubble. |
| `onMouseMove` | `(event: NodeMouseEvent) => void` | Per-node pointer move while hovered (or while pointer is captured). Does NOT bubble. |
| `onMouseOver` | `(event: NodeMouseEvent) => void` | Pointer entered node bounds. Does NOT bubble. |
| `onMouseOut` | `(event: NodeMouseEvent) => void` | Pointer left node bounds. Does NOT bubble. |

`NodeMouseEvent`: `{ x, y, nodeX, nodeY, width, height }` — `x/y` are absolute pixels, `nodeX/nodeY` are relative to the node's layout origin. `width/height` are the node's layout dimensions (useful for ratio calculations like slider position).

```tsx
// Clickable card (keyboard + mouse)
<box
  focusable
  onPress={() => console.log("pressed!")}
  backgroundColor={0x262626ff}
  cornerRadius={14}
  padding={16}
  hoverStyle={{ backgroundColor: 0x333333ff }}
>
  <text color={0xfafafaff}>Click or press Enter</text>
</box>

// Custom keyboard handling
<box
  focusable
  onKeyDown={(e) => {
    if (e.key === "right") nextItem()
    if (e.key === "left") prevItem()
  }}
>
  <text color={0xfafafaff}>Arrow keys to navigate</text>
</box>
```

**Auto-RECT:** Interactive nodes don't need explicit `backgroundColor` to be clickable. The engine automatically injects a near-transparent placeholder for hit-testing.

### Scroll Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `scrollX` | `boolean` | `false` | Enable horizontal scrolling. Content overflowing the box width becomes scrollable. |
| `scrollY` | `boolean` | `false` | Enable vertical scrolling. Content overflowing the box height becomes scrollable. |
| `scrollSpeed` | `number` | — | Pixels per scroll tick. |
| `scrollId` | `string` | — | Stable ID for programmatic scroll control via `createScrollHandle(id)`. |

```tsx
// Scrollable list
<box scrollY height={300} width={200}>
  <For each={items()}>
    {(item) => (
      <box padding={8}>
        <text color={0xfafafaff}>{item.name}</text>
      </box>
    )}
  </For>
</box>

// Programmatic scroll
import { createScrollHandle } from "@vxrt/core/engine"

const handle = createScrollHandle("my-list")
handle.scrollTo(0)       // scroll to top
handle.scrollBy(100)     // scroll down 100px
handle.scrollIntoView("item-5")  // scroll element into view
```

**Scissor clipping:** All paint primitives (rects, text, blur, shadows, glow) are clipped to the scroll container bounds. Hit-testing also respects scroll viewport — off-screen items don't receive false hover/click events.

### Floating / Absolute Positioning

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `floating` | `"parent" \| "root" \| { attachTo: string }` | — | Positioning mode. `"parent"` = positioned relative to parent. `"root"` = positioned relative to terminal viewport. `{ attachTo: "element-id" }` = anchored to a specific element. |
| `floatOffset` | `{ x: number, y: number }` | — | Pixel offset from the attach point. |
| `zIndex` | `number` | — | Z-order. Higher values render on top. |
| `floatAttach` | `{ element?: number, parent?: number }` | — | Attach points using a 0-8 grid. 0=top-left, 4=center, 8=bottom-right. |
| `pointerPassthrough` | `boolean` | `false` | When `true`, mouse events pass through to elements below. Useful for overlays that shouldn't capture clicks. |

```tsx
// Tooltip positioned relative to parent
<box>
  <text>Hover target</text>
  <box
    floating="parent"
    floatOffset={{ x: 0, y: -30 }}
    zIndex={100}
    backgroundColor={0x333333ff}
    cornerRadius={6}
    padding={8}
  >
    <text color={0xfafafaff} fontSize={12}>Tooltip text</text>
  </box>
</box>

// Modal overlay at root level
<box
  floating="root"
  zIndex={999}
  width="100%"
  height="100%"
  backgroundColor={0x00000080}
  alignX="center"
  alignY="center"
>
  <box backgroundColor={0x262626ff} cornerRadius={14} padding={24}>
    <text color={0xfafafaff}>Modal content</text>
  </box>
</box>
```

### Compositing

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `layer` | `boolean` | `false` | Gives the element its own Kitty graphics image. Only dirty layers are retransmitted to the terminal — everything else stays in terminal GPU VRAM. Critical for performance in dashboards and multi-widget layouts. |

```tsx
// Each widget is an independent compositing layer
<box direction="row" gap={16}>
  <box layer>
    {/* Clock — repaints every second, only its tiny buffer retransmits */}
    <Clock />
  </box>
  <box layer>
    {/* Stats — repaints on data change only */}
    <Stats />
  </box>
</box>
```

Use `layer` on elements that update independently at different frequencies. Without layers, the entire screen re-paints on every change. With layers, only the changed widget's pixel buffer (~8-15KB) is retransmitted.

---

## `<text>` — Complete Prop Reference

The `<text>` element renders text content. It is the only element that can contain string children.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `string \| number` | — | Text color. See [Colors](#colors). |
| `fg` | `string \| number` | — | Alias for `color`. |
| `bg` | `string \| number` | — | Text background highlight color. |
| `backgroundColor` | `string \| number` | — | Alias for `bg`. |
| `fontSize` | `number` | — | Font size in pixels. Common values: 12 (small), 14 (body), 16 (heading). |
| `fontId` | `number` | `0` | Runtime font atlas ID. 0 = built-in font. Use `registerFont()` for custom fonts (IDs 1-15). |
| `lineHeight` | `number` | — | Line height in pixels. Controls spacing between wrapped lines. |
| `wordBreak` | `"normal" \| "keep-all"` | `"normal"` | `"normal"` = break at word boundaries. `"keep-all"` = no word breaking (CJK-friendly). |
| `whiteSpace` | `"normal" \| "pre-wrap"` | `"normal"` | `"normal"` = collapse whitespace. `"pre-wrap"` = preserve whitespace and newlines. |
| `wrapMode` | `"word" \| "char" \| "none"` | `"word"` | `"word"` = break at word boundaries. `"char"` = break at any character. `"none"` = no wrapping. |
| `fontFamily` | `string` | — | Font family name (requires a loaded font atlas matching this name). |
| `fontWeight` | `number` | `400` | Weight: 400 = normal, 500 = medium, 600 = semibold, 700 = bold. |
| `fontStyle` | `"normal" \| "italic"` | `"normal"` | Italic style. |
| `flexShrink` | `number` | — | Allow text to shrink in a flex layout. |
| `flexGrow` | `number` | — | Allow text to grow in a flex layout. |
| `width` | `number \| string` | — | Constrain text width. Without this, text measures its intrinsic width. |

```tsx
// Basic text
<text color={0xfafafaff} fontSize={14}>Hello world</text>

// Heading
<text color={0xfafafaff} fontSize={24} fontWeight={700}>Title</text>

// Muted small text
<text color={0xa3a3a3ff} fontSize={12}>Secondary info</text>

// Pre-formatted text (preserves whitespace)
<text color={0xfafafaff} whiteSpace="pre-wrap">
  {"Line 1\nLine 2\n  Indented"}
</text>

// Text that wraps within a constrained box
<box width={200}>
  <text color={0xfafafaff} fontSize={14}>
    This long text will wrap at word boundaries within the 200px parent box.
  </text>
</box>
```

> **Note:** `<text>` children must be strings. Use `String()` to convert numbers and other values. Signal values inside text must be called: `{String(count())}`, not `{count}`.

---

## `<img>` — Complete Prop Reference

The `<img>` element displays images from file paths. Images are decoded once, cached, and rendered as pixel data through the same pipeline as everything else.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | **(required)** | Image file path — absolute or relative to the working directory. PNG, JPEG, WebP supported. |
| `objectFit` | `"contain" \| "cover" \| "fill" \| "none"` | `"contain"` | How the image fits its layout box. Same as CSS `object-fit`. |
| `width` | `number \| string` | — | Display width. If omitted, uses the image's intrinsic width. Accepts fixed pixels, `"grow"`, `"fit"`. |
| `height` | `number \| string` | — | Display height. If omitted, uses the image's intrinsic height. |
| `cornerRadius` | `number` | — | Rounds the image corners via SDF mask. |
| `cornerRadii` | `{ tl, tr, br, bl }` | — | Per-corner radius for the image mask. |
| `minWidth` | `number` | — | Minimum width constraint. |
| `maxWidth` | `number` | — | Maximum width constraint. |
| `minHeight` | `number` | — | Minimum height constraint. |
| `maxHeight` | `number` | — | Maximum height constraint. |
| `flexGrow` | `number` | — | Grow to fill available space. |
| `flexShrink` | `number` | — | Shrink below intrinsic size. |
| `floating` | `"parent" \| "root" \| { attachTo: string }` | — | Floating position mode. |
| `floatOffset` | `{ x: number, y: number }` | — | Offset from attach point. |
| `zIndex` | `number` | — | Z-order for floating images. |
| `layer` | `boolean` | `false` | Own compositing layer. |
| `opacity` | `number` | `1.0` | Image opacity (0.0-1.0). |

```tsx
// Basic image
<img src="./assets/logo.png" width={64} height={64} />

// Rounded avatar
<img
  src="./avatar.png"
  width={48}
  height={48}
  cornerRadius={9999}
  objectFit="cover"
/>

// Full-width banner that maintains aspect ratio
<img src="./banner.png" width="100%" objectFit="contain" />
```

**Object-fit modes:**

| Mode | Behavior |
|------|----------|
| `"contain"` | Scale to fit entirely within the box, preserving aspect ratio. May letterbox. |
| `"cover"` | Scale to cover the entire box, preserving aspect ratio. May crop. |
| `"fill"` | Stretch to fill the box exactly. May distort. |
| `"none"` | Display at intrinsic size, no scaling. |

---

## Colors

All color props (`backgroundColor`, `color`, `borderColor`, etc.) accept three formats:

| Format | Example | Notes |
|--------|---------|-------|
| Hex string | `"#ff0000"` | No alpha = `ff` (fully opaque). |
| Hex string with alpha | `"#ff000080"` | Last two hex digits are alpha. |
| u32 RGBA | `0xff0000ff` | Packed 32-bit integer: `0xRRGGBBAA`. Fastest — zero parse cost. |

```tsx
// All equivalent — red at full opacity
<box backgroundColor="#ff0000" />
<box backgroundColor="#ff0000ff" />
<box backgroundColor={0xff0000ff} />
```

Colors are parsed **once** when the prop is set (during reconciliation), not per frame. There is zero performance difference between hex strings and u32 numbers at runtime. Use whichever is more readable for your case.

**Reactive theme colors:**

```tsx
import { themeColors } from "@vxrt/core"

// themeColors properties are reactive getters — they update when the theme changes
<box backgroundColor={themeColors.primary} />
<text color={themeColors.foreground}>Themed text</text>
```

**The RGBA class:**

```tsx
import { RGBA } from "@vxrt/core"

const red = new RGBA(255, 0, 0, 255)
const blue = RGBA.fromHex("#0000ff")
const green = RGBA.fromInts(0, 255, 0)

<box backgroundColor={red.toU32()} />
```

### Shadow color exception

Shadow colors **must** be u32 numbers. They bypass the color parser and go directly to the Rust/WGPU paint engine:

```tsx
// Correct
<box shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }} />

// WRONG — will not work
<box shadow={{ x: 0, y: 4, blur: 12, color: "#00000060" }} />
```

### Void design tokens (quick reference)

```tsx
import { colors, radius, space, font, weight, shadows } from "@vxrt/core"

colors.background       // 0x141414ff — app background
colors.foreground       // 0xfafafaff — default text
colors.card             // 0x262626ff — elevated surfaces
colors.primary          // 0xe5e5e5ff — brand/actions
colors.secondary        // 0x333333ff — secondary actions
colors.muted            // 0x333333ff — subtle surfaces
colors.mutedForeground  // 0xa3a3a3ff — low-emphasis text
colors.accent           // 0x333333ff — hover/focus
colors.destructive      // 0xdc2626ff — errors
colors.border           // 0xffffff1a — borders (white 10%)
colors.input            // 0xffffff26 — input borders (white 15%)
colors.ring             // 0x737373ff — focus rings

radius.sm    // 6
radius.md    // 8
radius.lg    // 10
radius.xl    // 14
radius.xxl   // 18
radius.full  // 9999

space[1]     // 4
space[2]     // 8
space[3]     // 12
space[4]     // 16
space[5]     // 20
space[6]     // 24
space[8]     // 32
space[10]    // 40

font.xs      // 10
font.sm      // 12
font.base    // 14
font.lg      // 16
font.xl      // 20

weight.normal    // 400
weight.medium    // 500
weight.semibold  // 600
weight.bold      // 700

shadows.sm   // subtle drop shadow
shadows.md   // medium elevation
shadows.lg   // floating elevation
shadows.xl   // dramatic elevation
```

---
## Hooks & Signals

Vexart hooks return SolidJS signals -- reactive getters that automatically re-render your component when the value changes. If you know React hooks, these work similarly but without the rules-of-hooks constraints.

### useFocus(opts?)

```typescript
import { useFocus } from "@vxrt/core/engine"

type FocusHandle = {
  focused: () => boolean    // reactive signal -- true when this element has focus
  focus: () => void         // programmatically focus this element
  id: string                // the generated focus ID
}

function useFocus(opts?: {
  id?: string                         // override auto-generated ID
  onKeyDown?: (event: KeyEvent) => void  // keyboard events when focused
  onPress?: (event?: PressEvent) => void  // fires on Enter/Space
}): FocusHandle
```

**How focus works:**

- `Tab` / `Shift+Tab` cycles through focusable elements in registration order (like browser tab order)
- The focused component receives keyboard events via `onKeyDown`
- The first registered focusable auto-focuses (no manual `autoFocus` needed)
- Focus state is a SolidJS signal -- your component re-renders only when focus changes

**Web analogy:** `tabindex="0"` + `document.addEventListener("keydown")`, but reactive.

**Custom interactive component:**

```tsx
import { useFocus } from "@vxrt/core/engine"
import { Show } from "@vxrt/core"

function ToggleCard(props: { label: string; active: boolean; onToggle: () => void }) {
  const { focused } = useFocus({
    onPress: () => props.onToggle(),
  })

  return (
    <box
      padding={12}
      cornerRadius={8}
      backgroundColor={props.active ? "#1a3a2a" : "#1a1a2e"}
      borderColor={focused() ? "#4488cc" : "#333"}
      borderWidth={focused() ? 2 : 1}
    >
      <text color={props.active ? "#4ec94e" : "#888"}>{props.label}</text>
    </box>
  )
}
```

> **Note:** For simple cases, use the `focusable` prop on `<box>` instead of `useFocus()`. The `focusable` prop auto-registers the element and supports `focusStyle`/`onPress`/`onKeyDown` declaratively. Use `useFocus()` when you need the `FocusHandle` for programmatic control.

---

### useKeyboard()

Subscribe to all keyboard events as a reactive signal.

```typescript
import { useKeyboard } from "@vxrt/core"

type KeyboardState = {
  key: () => KeyEvent | null     // last key event
  pressed: (name: string) => boolean  // check last key name
}

type KeyEvent = {
  type: "key"
  key: string           // "a", "enter", "escape", "tab", "up", "f1", etc.
  char?: string         // printable character (undefined for special keys)
  mods: {
    shift: boolean
    ctrl: boolean
    alt: boolean
    meta: boolean
  }
}
```

```tsx
function StatusBar() {
  const kb = useKeyboard()
  return <text color="#888">Last key: {kb.key()?.key ?? "none"}</text>
}
```

---

### useMouse()

Subscribe to mouse events as a reactive signal.

```typescript
import { useMouse } from "@vxrt/core"

type MouseState = {
  mouse: () => MouseEvent | null              // last mouse event
  pos: () => { x: number; y: number }         // current position (cells)
}

type MouseEvent = {
  type: "mouse"
  x: number            // column (0-indexed)
  y: number            // row (0-indexed)
  button: number       // 0=left, 1=middle, 2=right, 64=scrollUp, 65=scrollDown
  action: "press" | "release" | "move" | "scroll"
  mods: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }
}
```

> **`useMouse()` vs per-node `onMouse*` events:** `useMouse()` is a global reactive signal that reports mouse position in terminal cell coordinates. Per-node mouse events (`onMouseDown`, `onMouseMove`, etc.) are callbacks dispatched directly to the node under the pointer, with coordinates relative to the node's layout origin (`nodeX`, `nodeY`). Use `useMouse()` for reactive UI updates based on cursor position. Use per-node `onMouse*` events for element-specific interactions like drag, hover detection, and click handling.

---

### useInput()

Low-level hook -- subscribe to ALL input events (key, mouse, paste, focus).

```typescript
import { useInput } from "@vxrt/core"

function DebugInput() {
  const event = useInput()
  return <text>{JSON.stringify(event())}</text>
}
```

Returns `() => InputEvent | null` where `InputEvent` is `KeyEvent | MouseEvent | PasteEvent | FocusEvent`.

---

### onInput(handler)

Global event bus -- not a hook, not reactive. Registers a callback for all input events. Returns an unsubscribe function.

```typescript
import { onInput } from "@vxrt/core"

const unsub = onInput((event) => {
  if (event.type === "key" && event.key === "q" && event.mods.ctrl) {
    process.exit(0)
  }
})

// Later: unsub()
```

**When to use which:**
| Need | Use |
| ---- | --- |
| Reactive UI updates on keypress | `useKeyboard()` |
| Reactive UI updates on mouse | `useMouse()` |
| Global hotkeys, side effects | `onInput()` |
| All events as a signal | `useInput()` |

---

### pushFocusScope()

Creates a focus trap -- `Tab`/`Shift+Tab` only cycles within the scope. Used internally by `Dialog`. Returns a cleanup function.

```typescript
import { pushFocusScope } from "@vxrt/core/engine"

// Inside a component:
const popScope = pushFocusScope()

// Tab now only cycles through focusables registered AFTER this call.
// Previous focus is saved and restored when the scope is popped.

onCleanup(popScope) // restore previous scope
```

**Web analogy:** `inert` attribute on background + `focus-trap` library.

---

### createTransition(initial, options?)

Animate numeric values with easing. Returns `[getter, setter]`.

```typescript
import { createTransition, easing } from "@vxrt/core"

type TransitionConfig = {
  duration?: number    // ms, default 300
  easing?: EasingFn    // default easeInOut
  delay?: number       // ms, default 0
}

const [width, setWidth] = createTransition(100, { duration: 300 })
setWidth(300) // animates from 100 → 300 over 300ms

// Use in JSX:
<box width={width()} />
```

**Available easings:**

| Easing | Description |
| ------ | ----------- |
| `easing.linear` | Constant speed |
| `easing.easeIn` | Slow start |
| `easing.easeOut` | Slow end |
| `easing.easeInOut` | Slow start + end (default) |
| `easing.easeInCubic` | Cubic acceleration |
| `easing.easeOutCubic` | Cubic deceleration |
| `easing.easeOutBack` | Overshoot then settle |
| `easing.easeOutElastic` | Elastic bounce |
| `easing.cubicBezier(x1,y1,x2,y2)` | Custom curve (like CSS) |

---

### createSpring(initial, options?)

Physics-based spring animation. Returns `[getter, setter]`.

```typescript
import { createSpring } from "@vxrt/core"

type SpringConfig = {
  stiffness?: number    // default 170
  damping?: number      // default 26
  mass?: number         // default 1
  precision?: number    // velocity threshold to stop, default 0.01
}

const [y, setY] = createSpring(0, { stiffness: 200, damping: 20 })
setY(-100) // spring toward -100

<box paddingTop={Math.round(y())} />
```

**Web analogy:** `react-spring` or CSS `spring()` function.

---

### useQuery(fetcher, options?)

Reactive data fetching.

```typescript
import { useQuery } from "@vxrt/core"

type QueryResult<T> = {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  refetch: () => void
  mutate: (data: T | ((prev: T | undefined) => T)) => void
}

type QueryOptions = {
  enabled?: boolean          // run immediately? default: true
  refetchInterval?: number   // auto-refetch ms, 0=disabled
  retry?: number             // retry count on error, default: 0
  retryDelay?: number        // retry delay ms, default: 1000
}
```

```tsx
import { useQuery } from "@vxrt/core"
import { Show, For } from "@vxrt/core"

function UserList() {
  const users = useQuery(
    () => fetch("https://api.example.com/users").then(r => r.json()),
    { retry: 2, retryDelay: 500 }
  )

  return (
    <box direction="column" gap={4}>
      <Show when={users.loading()}>
        <text color="#888">Loading...</text>
      </Show>
      <Show when={users.error()}>
        <text color="#ff4444">{users.error()!.message}</text>
      </Show>
      <Show when={users.data()}>
        <For each={users.data()!}>
          {(user) => <text color="#e0e0e0">{user.name}</text>}
        </For>
      </Show>
    </box>
  )
}
```

---

### useMutation(mutator, options?)

Reactive data mutation with optimistic updates.

```typescript
import { useMutation } from "@vxrt/core"

type MutationResult<T, V> = {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  mutate: (variables: V) => Promise<T | undefined>
  reset: () => void
}

type MutationOptions<T, V> = {
  onMutate?: (variables: V) => T | undefined     // optimistic update
  onSuccess?: (data: T, variables: V) => void
  onError?: (error: Error, variables: V, previousData: T | undefined) => void
  onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void
}
```

```tsx
const deleteUser = useMutation(
  (id: string) => fetch(`/api/users/${id}`, { method: "DELETE" }).then(r => r.json()),
  {
    onMutate: (id) => {
      // Optimistic: remove from local list immediately
      users.mutate(prev => prev?.filter(u => u.id !== id))
      return undefined
    },
    onError: (err, id, prev) => {
      // Rollback on failure
      users.refetch()
    },
  }
)

// Trigger: deleteUser.mutate("user-123")
```

---

### useTerminalDimensions(terminal)

Reactive terminal size that updates on resize.

```typescript
import { useTerminalDimensions } from "@vxrt/core"

const dims = useTerminalDimensions(terminal)

dims.width()       // pixel width
dims.height()      // pixel height
dims.cols()        // column count
dims.rows()        // row count
dims.cellWidth()   // pixel width per cell
dims.cellHeight()  // pixel height per cell
```

---

### markDirty()

Force a repaint on the next frame. Normally Vexart repaints automatically when signals change. Use this when you mutate external state that Vexart can't track.

```typescript
import { markDirty } from "@vxrt/core/engine"

externalStore.update(newData)
markDirty() // tell Vexart to repaint
```

---

### useDrag(options)

Encapsulates drag interactions — pointer capture, `isDragging` flag, and mouse event wiring. Returns `dragProps` to spread on the drag target.

```typescript
import { useDrag } from "@vxrt/core/engine"

type DragOptions = {
  onDragStart?: (event: NodeMouseEvent) => void
  onDrag?: (event: NodeMouseEvent) => void
  onDragEnd?: (event: NodeMouseEvent) => void
  disabled?: () => boolean
}

type DragState = {
  dragging: () => boolean    // reactive signal
  dragProps: DragProps        // spread on target element
}
```

```tsx
import { useDrag } from "@vxrt/core/engine"

function Scrubber(props: { value: number; onChange: (v: number) => void }) {
  const { dragging, dragProps } = useDrag({
    onDragStart: (e) => props.onChange(Math.round((e.nodeX / e.width) * 100)),
    onDrag: (e) => props.onChange(Math.round(Math.max(0, Math.min(1, e.nodeX / e.width)) * 100)),
  })

  return (
    <box {...dragProps} width={200} height={12} backgroundColor="#333" cornerRadius={6}>
      <box width={`${props.value}%`} height={12} backgroundColor={dragging() ? "#66aaff" : "#4488cc"} cornerRadius={6} />
    </box>
  )
}
```

The Slider component uses `useDrag` internally.

---

### useHover(options)

Encapsulates hover detection with configurable enter/leave delays. Returns `hovered` signal and `hoverProps` to spread on the target.

```typescript
import { useHover } from "@vxrt/core/engine"

type HoverOptions = {
  delay?: number          // ms before onEnter (default: 0)
  leaveDelay?: number     // ms before onLeave (default: 0)
  onEnter?: () => void
  onLeave?: () => void
}

type HoverState = {
  hovered: () => boolean    // reactive signal
  hoverProps: HoverProps    // spread on target element
}
```

```tsx
import { useHover } from "@vxrt/core/engine"

function HoverCard(props: { children: any }) {
  const { hovered, hoverProps } = useHover({
    delay: 300,
    onEnter: () => console.log("hovered"),
  })

  return (
    <box {...hoverProps} backgroundColor={hovered() ? "#333" : "#222"} padding={12} cornerRadius={8}>
      {props.children}
    </box>
  )
}
```

The Tooltip component uses `useHover` internally for delayed show/hide.
## Components (`@vxrt/core`)

### Component Architecture

Vexart components follow a **headless** pattern inspired by Radix UI and Headless UI:

- `@vxrt/core` headless components = **behavior only**, zero visual output
- `@vxrt/core` styled components = **pre-styled** versions using Void design tokens

There are two headless patterns:

**Render props (interactive components):** The component manages focus, keyboard, state. You provide `renderButton`, `renderInput`, etc. to control visuals.

```tsx
// Headless — YOU decide how it looks
<Button
  onPress={() => save()}
  renderButton={({ focused, pressed }) => (
    <box backgroundColor={pressed ? "#333" : "#222"} padding={8}>
      <text>Save</text>
    </box>
  )}
/>
```

**Theme props (content components):** The component handles rendering but visual properties come from a `theme` object.

```tsx
// Headless — theme object controls colors/sizes
<Code content={source} language="typescript" syntaxStyle={style}
  theme={{ bg: 0x1e1e2eff, lineNumberFg: 0x555555ff, radius: 8, padding: 12 }}
/>
```

**Web analogy:** Headless components in `@vxrt/core` are like Radix Primitives. Styled components in `@vxrt/core` are like shadcn/ui.

---

### Complete Component Reference

#### 1. Box

Layout container. Thin wrapper over the `<box>` intrinsic with typed props.

```typescript
import { Box } from "@vxrt/core"

type BoxProps = {
  direction?: "row" | "column"      // default: "column"
  padding?: number
  paddingX?: number; paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"
  width?: number | string            // number | "grow" | "fit" | "100%"
  height?: number | string
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number
  shadow?: ShadowConfig | ShadowConfig[]
  glow?: GlowConfig
  children?: JSX.Element
}
```

```tsx
<Box padding={16} backgroundColor="#1a1a2e" cornerRadius={12} gap={8}>
  <Text color="#e0e0e0">Hello Vexart</Text>
</Box>
```

---

#### 2. Text

Text display with color and font settings.

```typescript
import { Text } from "@vxrt/core"

type TextProps = {
  color?: string | number
  fontSize?: number
  fontId?: number
  lineHeight?: number
  wordBreak?: "normal" | "keep-all"
  whiteSpace?: "normal" | "pre-wrap"
  fontFamily?: string
  fontWeight?: number           // 400/500/600/700
  fontStyle?: "normal" | "italic"
  children?: JSX.Element
}
```

```tsx
<Text color="#e0e0e0" fontSize={16} lineHeight={20}>Hello world</Text>
```

---

#### 3. ScrollView

Scrollable container with visual scrollbar. Content that overflows is clipped.

```typescript
import { ScrollView } from "@vxrt/core"
import type { ScrollHandle } from "@vxrt/core/engine"

type ScrollViewProps = {
  ref?: (handle: ScrollHandle) => void
  width?: number | string
  height?: number | string
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number
  showScrollbar?: boolean         // default: true (auto-hides)
  backgroundColor?: string | number
  cornerRadius?: number
  direction?: "row" | "column"
  padding?: number
  gap?: number
  children?: JSX.Element
}
```

```tsx
let scrollRef: ScrollHandle

<ScrollView ref={(h) => scrollRef = h} width={400} height={300} scrollY>
  <For each={items}>
    {(item) => <Text>{item}</Text>}
  </For>
</ScrollView>

// Programmatic: scrollRef.scrollTo(0), scrollRef.scrollBy(-100)
```

**Keyboard:** Mouse wheel scrolls. Programmatic scroll via `ScrollHandle`.

---

#### 4. Button

Headless interactive button. Focus-aware with Enter/Space activation.

```typescript
import { Button } from "@vxrt/core"

type ButtonRenderContext = {
  focused: boolean
  pressed: boolean
  disabled: boolean
  buttonProps: { focusable: true; onPress: (event?: PressEvent) => void }  // spread on root element
}

type ButtonProps = {
  onPress?: (event?: PressEvent) => void
  disabled?: boolean
  focusId?: string
  renderButton: (ctx: ButtonRenderContext) => JSX.Element  // REQUIRED
}
```

```tsx
<Button
  onPress={() => save()}
  renderButton={({ focused, pressed, disabled }) => (
    <box
      backgroundColor={pressed ? "#444" : focused ? "#333" : "#222"}
      padding={8} cornerRadius={6}
      borderColor={focused ? "#4488cc" : "#555"} borderWidth={1}
    >
      <text color={disabled ? "#555" : "#fff"}>Save</text>
    </box>
  )}
/>
```

**Keyboard:** `Tab` to focus, `Enter`/`Space` to press.

---

#### 5. Input

Headless single-line text input. Controlled component.

```typescript
import { Input } from "@vxrt/core"

type InputRenderContext = {
  value: string
  displayText: string
  showPlaceholder: boolean
  cursor: number
  blink: boolean
  focused: boolean
  disabled: boolean
  selection: [number, number] | null
}

type InputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  renderInput: (ctx: InputRenderContext) => JSX.Element  // REQUIRED
}
```

```tsx
const [name, setName] = createSignal("")

<Input
  value={name()}
  onChange={setName}
  onSubmit={(v) => console.log("submitted:", v)}
  placeholder="Enter your name..."
  renderInput={(ctx) => (
    <box width={250} height={24} backgroundColor="#1e1e2e" cornerRadius={4}
      borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} padding={4}>
      <text color={ctx.showPlaceholder ? "#666" : "#fff"}>{ctx.displayText}</text>
    </box>
  )}
/>
```

**Keyboard:** Arrow keys, Home/End, Backspace/Delete, Shift+arrows for selection, Ctrl+A select all, Enter to submit.

---

#### 6. Textarea

Multi-line text editor with 2D cursor, syntax highlighting, extmarks, and configurable key bindings.

```typescript
import { Textarea } from "@vxrt/core"
import type { TextareaHandle, TextareaTheme } from "@vxrt/core"

type TextareaTheme = {
  accent: string | number
  fg: string | number
  muted: string | number
  bg: string | number
  disabledBg: string | number
  border: string | number
  radius: number
  padding: number
}

type TextareaProps = {
  ref?: (handle: TextareaHandle) => void
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void      // Ctrl+Enter
  onCursorChange?: (row: number, col: number) => void
  onKeyDown?: (event: KeyEvent) => void
  onPaste?: (text: string) => void
  placeholder?: string
  width?: number                           // default: 400
  height?: number                          // default: 200
  color?: number                           // accent color
  disabled?: boolean
  focusId?: string
  keyBindings?: KeyBinding[]               // custom key bindings
  syntaxStyle?: SyntaxStyle                // enable syntax highlighting
  language?: string                        // e.g. "typescript"
  theme?: Partial<TextareaTheme>
}
```

```tsx
const [code, setCode] = createSignal("")
let ref: TextareaHandle

<Textarea
  ref={(h) => ref = h}
  value={code()}
  onChange={setCode}
  width={600} height={400}
  syntaxStyle={ONE_DARK}
  language="typescript"
/>

// Imperative: ref.setText("hello"), ref.insertText("world"), ref.gotoBufferEnd()
```

**Keyboard:** Full editing -- arrows, Home/End, Ctrl+Home/End, PgUp/PgDown, Shift+arrows for selection, Ctrl+A, Ctrl+Enter to submit.

**TextareaHandle** (via ref):

| Method | Description |
| ------ | ----------- |
| `plainText` | Full text content |
| `cursorOffset` / `cursorRow` / `cursorCol` | Cursor position |
| `setText(text)` | Replace all text |
| `insertText(text)` | Insert at cursor |
| `clear()` | Clear all text |
| `getTextRange(start, end)` | Get substring |
| `gotoBufferEnd()` | Move cursor to end |
| `gotoLineEnd()` | Move cursor to end of line |
| `focus()` / `blur()` | Programmatic focus |
| `extmarks` | Access ExtmarkManager |

---

#### 7. Checkbox

Headless toggleable checkbox. Controlled component.

```typescript
import { Checkbox } from "@vxrt/core"

type CheckboxRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
  toggleProps: { focusable: true; onPress: (event?: PressEvent) => void }  // spread on root element
}

type CheckboxProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  focusId?: string
  renderCheckbox: (ctx: CheckboxRenderContext) => JSX.Element  // REQUIRED
}
```

```tsx
<Checkbox
  checked={agreed()}
  onChange={setAgreed}
  renderCheckbox={({ checked, focused }) => (
    <box direction="row" gap={8} alignY="center">
      <box width={16} height={16} cornerRadius={3}
        backgroundColor={checked ? "#22c55e" : "#333"}
        borderColor={focused ? "#22c55e" : "#666"} borderWidth={1}>
        {checked ? <text color="#fff" fontSize={10}>x</text> : null}
      </box>
      <text color="#e0e0e0">I agree to the terms</text>
    </box>
  )}
/>
```

**Keyboard:** `Tab` to focus, `Enter`/`Space` to toggle.

---

#### 8. ToggleSwitch

Headless toggle switch. Controlled component.

> **Note:** Exported as `ToggleSwitch` (not `Switch`) to avoid collision with the SolidJS `Switch` control flow component.

```typescript
import { ToggleSwitch } from "@vxrt/core"

type ToggleSwitchRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
  toggleProps: { focusable: true; onPress: (event?: PressEvent) => void }  // spread on root element
}

type ToggleSwitchProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  focusId?: string
  renderSwitch: (ctx: ToggleSwitchRenderContext) => JSX.Element  // REQUIRED
}
```

```tsx
<ToggleSwitch
  checked={darkMode()}
  onChange={setDarkMode}
  renderSwitch={({ checked, focused }) => (
    <box direction="row" gap={8} alignY="center">
      <box width={36} height={20} cornerRadius={10}
        backgroundColor={checked ? "#22c55e" : "#444"}
        borderColor={focused ? "#22c55e" : "transparent"} borderWidth={1}
        direction="row" alignX={checked ? "right" : "left"} padding={3}>
        <box width={14} height={14} cornerRadius={7} backgroundColor="#fff" />
      </box>
      <text color="#e0e0e0">Dark mode</text>
    </box>
  )}
/>
```

**Keyboard:** `Tab` to focus, `Enter`/`Space` to toggle.

---

#### 9. RadioGroup

Headless radio button group. Controlled component with Up/Down navigation.

```typescript
import { RadioGroup } from "@vxrt/core"

type RadioOption = { value: string; label: string; disabled?: boolean }

type RadioOptionContext = {
  selected: boolean
  focused: boolean
  disabled: boolean
  index: number
  optionProps: { onPress: (event?: PressEvent) => void }  // spread on each option element
}

type RadioGroupProps = {
  value?: string
  onChange?: (value: string) => void
  options: RadioOption[]
  disabled?: boolean
  focusId?: string
  renderOption: (option: RadioOption, ctx: RadioOptionContext) => JSX.Element  // REQUIRED
  renderGroup?: (children: JSX.Element) => JSX.Element
}
```

```tsx
<RadioGroup
  value={size()}
  onChange={setSize}
  options={[
    { value: "sm", label: "Small" },
    { value: "md", label: "Medium" },
    { value: "lg", label: "Large" },
  ]}
  renderOption={(opt, ctx) => (
    <box direction="row" gap={8} alignY="center">
      <box width={16} height={16} cornerRadius={8}
        borderColor={ctx.selected ? "#4488cc" : "#555"} borderWidth={1}>
        {ctx.selected ? <box width={8} height={8} cornerRadius={4} backgroundColor="#4488cc" /> : null}
      </box>
      <text color={ctx.selected ? "#fff" : "#888"}>{opt.label}</text>
    </box>
  )}
/>
```

**Keyboard:** `Tab` to focus group, `Up`/`Down`/`Left`/`Right`/`j`/`k` to navigate, `Enter`/`Space` to confirm.

---

#### 10. Select

Headless dropdown select. Controlled component with keyboard navigation.

```typescript
import { Select } from "@vxrt/core"

type SelectOption = { value: string; label: string; disabled?: boolean }

type SelectTriggerContext = {
  selectedLabel: string | undefined
  placeholder: string
  open: boolean
  focused: boolean
  disabled: boolean
}

type SelectOptionContext = {
  highlighted: boolean
  selected: boolean
  disabled: boolean
}

type SelectProps = {
  value?: string
  onChange?: (value: string) => void
  options?: SelectOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  renderTrigger?: (ctx: SelectTriggerContext) => JSX.Element
  renderOption?: (option: SelectOption, ctx: SelectOptionContext) => JSX.Element
  renderContent?: (children: JSX.Element) => JSX.Element
}
```

```tsx
<Select
  value={fruit()}
  onChange={setFruit}
  options={[
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "cherry", label: "Cherry" },
  ]}
  placeholder="Pick a fruit..."
  renderTrigger={(ctx) => (
    <box padding={8} borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} cornerRadius={4}>
      <text color={ctx.selectedLabel ? "#fff" : "#666"}>
        {ctx.selectedLabel || ctx.placeholder} {ctx.open ? "^" : "v"}
      </text>
    </box>
  )}
  renderOption={(opt, ctx) => (
    <box padding={6} backgroundColor={ctx.highlighted ? "#333" : "transparent"}>
      <text color={ctx.selected ? "#4488cc" : "#e0e0e0"}>{opt.label}</text>
    </box>
  )}
/>
```

**Keyboard:** `Tab` to focus, `Enter`/`Space` to open, `Up`/`Down` to navigate, `Enter` to select, `Escape` to close.

**Mouse:** Click trigger to open/close. Click an option to select it.

---

#### 11. Combobox

Headless autocomplete with text filtering. Controlled component.

```typescript
import { Combobox } from "@vxrt/core"

type ComboboxOption = { value: string; label: string; disabled?: boolean }

type ComboboxInputContext = {
  inputValue: string
  placeholder: string
  open: boolean
  focused: boolean
  disabled: boolean
  selectedLabel: string | undefined
}

type ComboboxOptionContext = {
  highlighted: boolean
  selected: boolean
  disabled: boolean
}

type ComboboxProps = {
  value?: string
  onChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  filter?: (option: ComboboxOption, query: string) => boolean
  renderInput: (ctx: ComboboxInputContext) => JSX.Element      // REQUIRED
  renderOption: (option: ComboboxOption, ctx: ComboboxOptionContext) => JSX.Element  // REQUIRED
  renderContent?: (children: JSX.Element) => JSX.Element
  renderEmpty?: () => JSX.Element
}
```

```tsx
<Combobox
  value={country()}
  onChange={setCountry}
  options={countries}
  placeholder="Search countries..."
  renderInput={(ctx) => (
    <box padding={6} borderWidth={1} borderColor={ctx.focused ? "#4488cc" : "#444"} cornerRadius={4}>
      <text color={ctx.inputValue ? "#fff" : "#666"}>{ctx.inputValue || ctx.placeholder}</text>
    </box>
  )}
  renderOption={(opt, ctx) => (
    <box padding={4} backgroundColor={ctx.highlighted ? "#333" : "transparent"}>
      <text color="#e0e0e0">{opt.label}</text>
    </box>
  )}
  renderEmpty={() => <text color="#666">No results</text>}
/>
```

**Keyboard:** Type to filter, `Up`/`Down` to navigate, `Enter` to select, `Escape` to close.

**Mouse:** Click an option to select it. Click the input to toggle the dropdown.

---

#### 12. Slider

Headless numeric range input. Controlled component.

```typescript
import { Slider } from "@vxrt/core"

type SliderRenderContext = {
  value: number
  min: number
  max: number
  percentage: number      // 0-100
  focused: boolean
  disabled: boolean
  trackProps: Record<string, any>   // Spread onto track element for mouse click+drag
  dragging: boolean                 // True while mouse is scrubbing
}

type SliderProps = {
  value: number
  onChange: (value: number) => void
  min?: number              // default: 0
  max?: number              // default: 100
  step?: number             // default: 1
  largeStep?: number        // PgUp/PgDown, default: step * 10
  disabled?: boolean
  focusId?: string
  renderSlider: (ctx: SliderRenderContext) => JSX.Element  // REQUIRED
}
```

```tsx
<Slider
  value={volume()}
  onChange={setVolume}
  min={0} max={100} step={1}
  renderSlider={(ctx) => (
    <box direction="row" gap={8} alignY="center">
      <box width={200} height={8} backgroundColor="#333" cornerRadius={4}>
        <box width={ctx.percentage * 2} height={8} backgroundColor="#4488cc" cornerRadius={4} />
      </box>
      <text color="#888" fontSize={12}>{ctx.value}%</text>
    </box>
  )}
/>
```

**Keyboard:** `Left`/`Right` by step, `PgUp`/`PgDown` by large step, `Home`/`End` to min/max.

**Mouse:** Click the track to jump to that position. Drag to scrub continuously. The render context includes `trackProps` (spread onto the track element for mouse handling) and `dragging` (boolean, true while scrubbing).

```tsx
<Slider
  value={volume()}
  onChange={setVolume}
  min={0} max={100} step={1}
  renderSlider={(ctx) => (
    <box direction="row" gap={8} alignY="center">
      <box width={200} height={8} backgroundColor="#333" cornerRadius={4} {...ctx.trackProps}>
        <box width={ctx.percentage * 2} height={8} backgroundColor="#4488cc" cornerRadius={4} />
      </box>
      <text color="#888" fontSize={12}>{ctx.value}%</text>
    </box>
  )}
/>
```

---

#### 13. Tabs

Headless tab switcher. Controlled component.

```typescript
import { Tabs } from "@vxrt/core"

type TabItem = { label: string; content: () => JSX.Element }
type TabRenderContext = { active: boolean; focused: boolean; index: number; tabProps: { onPress: (event?: PressEvent) => void } }

type TabsProps = {
  activeTab: number
  onTabChange?: (index: number) => void
  tabs: TabItem[]
  focusId?: string
  renderTab: (tab: TabItem, ctx: TabRenderContext) => JSX.Element  // REQUIRED
  renderTabBar?: (children: JSX.Element) => JSX.Element
  renderPanel?: (content: JSX.Element) => JSX.Element
  renderContainer?: (tabBar: JSX.Element, panel: JSX.Element) => JSX.Element
}
```

```tsx
<Tabs
  activeTab={tab()}
  onTabChange={setTab}
  tabs={[
    { label: "General", content: () => <text>General settings</text> },
    { label: "Advanced", content: () => <text>Advanced settings</text> },
  ]}
  renderTab={(tab, ctx) => (
    <box padding={8} backgroundColor={ctx.active ? "#333" : "transparent"}>
      <text color={ctx.active ? "#fff" : "#888"}>{tab.label}</text>
    </box>
  )}
/>
```

**Keyboard:** `Tab` to focus tab bar, `Left`/`Right` to switch tabs.

---

#### 14. List

Headless selectable list with Up/Down navigation.

```typescript
import { List } from "@vxrt/core"

type ListItemContext = { selected: boolean; focused: boolean; index: number; itemProps: { onPress: (event?: PressEvent) => void } }

type ListProps = {
  items: string[]
  selectedIndex: number
  onSelectedChange?: (index: number) => void
  onSelect?: (index: number) => void          // fires on Enter
  disabled?: boolean
  focusId?: string
  renderItem: (item: string, ctx: ListItemContext) => JSX.Element  // REQUIRED
  renderList?: (children: JSX.Element) => JSX.Element
}
```

```tsx
<List
  items={["Alpha", "Beta", "Gamma"]}
  selectedIndex={idx()}
  onSelectedChange={setIdx}
  onSelect={(i) => console.log("picked:", items[i])}
  renderItem={(item, ctx) => (
    <box padding={4} backgroundColor={ctx.selected ? "#2a2a4e" : "transparent"}>
      <text color={ctx.selected ? "#fff" : "#aaa"}>{item}</text>
    </box>
  )}
/>
```

**Keyboard:** `Up`/`Down`/`j`/`k` to navigate, `Enter` to select.

---

#### 15. Table

Headless data table with row selection.

```typescript
import { Table } from "@vxrt/core"

type TableColumn = { key: string; header: string; width?: number | "grow"; align?: "left" | "center" | "right" }
type TableCellContext = { selected: boolean; focused: boolean; rowIndex: number; rowProps: { onPress: (event?: PressEvent) => void } }

type TableProps = {
  columns: TableColumn[]
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean            // default: true
  disabled?: boolean
  focusId?: string
  renderHeader?: (column: TableColumn) => JSX.Element
  renderCell: (value: any, column: TableColumn, rowIndex: number, ctx: TableCellContext) => JSX.Element  // REQUIRED
  renderRow?: (children: JSX.Element, rowIndex: number, ctx: TableCellContext) => JSX.Element
  renderTable?: (children: JSX.Element) => JSX.Element
}
```

```tsx
<Table
  columns={[
    { key: "name", header: "Name", width: 120 },
    { key: "role", header: "Role", width: "grow" },
  ]}
  data={users()}
  selectedRow={selectedIdx()}
  onSelectedRowChange={setSelectedIdx}
  renderHeader={(col) => <text color="#888" fontSize={12}>{col.header}</text>}
  renderCell={(value, col, rowIdx, ctx) => (
    <text color={ctx.selected ? "#fff" : "#aaa"}>{String(value)}</text>
  )}
/>
```

**Keyboard:** `Up`/`Down`/`j`/`k` to navigate, `Enter` to select row.

---

#### 16. ProgressBar

Headless progress indicator. Pure visual, no focus.

```typescript
import { ProgressBar } from "@vxrt/core"

type ProgressBarRenderContext = {
  ratio: number          // 0-1
  fillWidth: number      // computed px
  width: number
  height: number
  value: number
  max: number
}

type ProgressBarProps = {
  value: number
  max?: number           // default: 100
  width?: number         // default: 200
  height?: number        // default: 12
  renderBar: (ctx: ProgressBarRenderContext) => JSX.Element  // REQUIRED
}
```

```tsx
<ProgressBar
  value={progress()}
  max={100}
  width={300}
  renderBar={({ fillWidth, width, height }) => (
    <box width={width} height={height} backgroundColor="#333" cornerRadius={6}>
      <box width={fillWidth} height={height} backgroundColor="#22c55e" cornerRadius={6} />
    </box>
  )}
/>
```

---

#### 17. Dialog

Headless modal dialog. Compound component with focus trap.

```typescript
import { Dialog } from "@vxrt/core"

type DialogProps = { children?: any; onClose?: () => void }
type DialogOverlayProps = { backgroundColor?: string | number; backdropBlur?: number }
type DialogContentProps = { width?: number | string; maxWidth?: number; padding?: number; cornerRadius?: number; backgroundColor?: string | number; children?: any }
type DialogCloseProps = { children?: any }

// Compound: Dialog.Overlay, Dialog.Content, Dialog.Close
```

```tsx
<Show when={isOpen()}>
  <Dialog onClose={() => setOpen(false)}>
    <Dialog.Overlay backgroundColor="#00000088" backdropBlur={4} />
    <Dialog.Content backgroundColor="#1a1a2e" cornerRadius={12} padding={20} width={400}>
      <text color="#fff" fontSize={18}>Confirm Delete</text>
      <text color="#888">This action cannot be undone.</text>
      <box direction="row" gap={8} paddingTop={16}>
        <Button onPress={() => setOpen(false)}
          renderButton={({ focused }) => (
            <box padding={8} cornerRadius={6} backgroundColor={focused ? "#333" : "#222"}>
              <text color="#fff">Cancel</text>
            </box>
          )}
        />
        <Button onPress={() => { deleteThing(); setOpen(false) }}
          renderButton={({ focused }) => (
            <box padding={8} cornerRadius={6} backgroundColor={focused ? "#dc2626" : "#aa1e1e"}>
              <text color="#fff">Delete</text>
            </box>
          )}
        />
      </box>
    </Dialog.Content>
  </Dialog>
</Show>
```

**Keyboard:** `Escape` to close. `Tab`/`Shift+Tab` trapped within dialog.

---

#### 18. Tooltip

Headless tooltip on hover.

```typescript
import { Tooltip } from "@vxrt/core"

type TooltipProps = {
  content: string
  renderTooltip: (content: string) => JSX.Element  // REQUIRED
  children: JSX.Element              // trigger element
  showDelay?: number                 // ms, default: 0
  hideDelay?: number                 // ms, default: 0
  disabled?: boolean
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number                    // px, default: 4
}
```

```tsx
<Tooltip
  content="Save your work (Ctrl+S)"
  renderTooltip={(content) => (
    <box backgroundColor="#333" padding={4} cornerRadius={4}>
      <text color="#fff" fontSize={12}>{content}</text>
    </box>
  )}
>
  <text color="#4488cc">Save</text>
</Tooltip>
```

---

#### 19. Popover

Headless popover panel. Controlled open/close.

```typescript
import { Popover } from "@vxrt/core"

type PopoverTriggerContext = { open: boolean; toggle: () => void }

type PopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  renderTrigger: (ctx: PopoverTriggerContext) => JSX.Element
  renderContent: () => JSX.Element
  placement?: "top" | "bottom" | "left" | "right"
  offset?: number                   // default: 4
}
```

```tsx
<Popover
  open={menuOpen()}
  onOpenChange={setMenuOpen}
  renderTrigger={(ctx) => (
    <box focusable onPress={() => ctx.toggle()}>
      <text color="#4488cc">Options...</text>
    </box>
  )}
  renderContent={() => (
    <box backgroundColor="#1a1a2e" cornerRadius={8} padding={8} gap={4}>
      <text color="#e0e0e0">Edit</text>
      <text color="#e0e0e0">Duplicate</text>
      <text color="#dc2626">Delete</text>
    </box>
  )}
/>
```

---

#### 20. Toast / createToaster

Imperative toast notification system.

```typescript
import { createToaster } from "@vxrt/core"

type ToastData = { id: number; message: string; variant: ToastVariant; duration: number; description?: string }
type ToastVariant = "default" | "success" | "error" | "warning" | "info"
type ToastInput = string | { message: string; variant?: ToastVariant; duration?: number; description?: string }

type ToasterOptions = {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center"
  maxVisible?: number           // default: 5
  defaultDuration?: number      // ms, default: 3000
  gap?: number                  // px, default: 4
  padding?: number              // px, default: 16
  renderToast: (toast: ToastData, dismiss: () => void) => JSX.Element  // REQUIRED
}

type ToasterHandle = {
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
  dismissAll: () => void
  Toaster: () => JSX.Element          // mount this in your app root
}
```

```tsx
const { toast, Toaster } = createToaster({
  position: "bottom-right",
  renderToast: (t, dismiss) => (
    <box backgroundColor="#222" padding={8} cornerRadius={6} direction="row" gap={8}>
      <text color="#fff">{t.message}</text>
      <box focusable onPress={dismiss}><text color="#888">x</text></box>
    </box>
  ),
})

// Mount once at root:
<Toaster />

// Fire from anywhere:
toast("File saved!")
toast({ message: "Error!", variant: "error", duration: 5000 })
```

---

#### 21. Router / Route / NavigationStack

Two navigation models for terminal apps.

**Flat routing** (dashboard-style):

```tsx
import { Router, Route, useRouterContext } from "@vxrt/core"

<Router initial="home">
  <Route path="home" component={HomeScreen} />
  <Route path="settings" component={SettingsScreen} />
  <Route path="profile" component={ProfileScreen} />
</Router>

// Navigate from any child:
function HomeScreen(props: RouteProps) {
  const router = useRouterContext()
  return (
    <box>
      <text>Home</text>
      <box focusable onPress={() => router.navigate("settings")}>
        <text>Go to Settings</text>
      </box>
    </box>
  )
}
```

**Stack routing** (wizard/drill-down):

```tsx
import { NavigationStack, useStack } from "@vxrt/core"

<NavigationStack initial={HomeScreen}>
  {(screen) => <box width="100%" height="100%">{screen()}</box>}
</NavigationStack>

function HomeScreen(props: ScreenProps) {
  const stack = useStack()
  return (
    <box>
      <text>Home</text>
      <box focusable onPress={() => stack.push(DetailScreen, { id: 42 })}>
        <text>View Detail</text>
      </box>
    </box>
  )
}

function DetailScreen(props: ScreenProps) {
  return (
    <box>
      <text>Detail #{props.params?.id}</text>
      <box focusable onPress={() => props.goBack()}>
        <text>Back</text>
      </box>
    </box>
  )
}
```

**NavigationStackHandle:**

| Method | Description |
| ------ | ----------- |
| `push(component, params?)` | Push screen onto stack |
| `pop()` / `goBack()` | Pop top screen |
| `replace(component, params?)` | Replace top screen |
| `reset(component, params?)` | Reset to single screen |
| `depth()` | Current stack size |
| `current()` | Top screen entry |
| `stack()` | Full stack array |

---

#### 22. VirtualList

Virtualized list for large datasets. Only renders visible items.

```typescript
import { VirtualList } from "@vxrt/core"

type VirtualListItemContext = {
  selected: boolean
  highlighted: boolean
  index: number               // absolute index in full list
}

type VirtualListProps<T> = {
  items: T[]
  itemHeight: number          // fixed height per item (px)
  height: number              // viewport height (px)
  width?: number | string     // default: "grow"
  overscan?: number           // extra items above/below, default: 3
  renderItem: (item: T, index: number, ctx: VirtualListItemContext) => JSX.Element
  selectedIndex?: number
  onSelect?: (index: number) => void
  keyboard?: boolean          // default: true
  focusId?: string
}
```

```tsx
<VirtualList
  items={allUsers}          // can be 100K+ items
  itemHeight={24}
  height={400}
  overscan={5}
  selectedIndex={selectedIdx()}
  onSelect={setSelectedIdx}
  renderItem={(user, index, ctx) => (
    <box height={24} padding={4}
      backgroundColor={ctx.selected ? "#2a2a4e" : ctx.highlighted ? "#1a1a2e" : "transparent"}>
      <text color={ctx.selected ? "#fff" : "#aaa"}>{user.name}</text>
    </box>
  )}
/>
```

**Keyboard:** `Up`/`Down` to navigate, `Enter` to select.

**Mouse:** Hover highlights items (`ctx.hovered`). Click to select. The container handles mouse events internally — no props to spread.

---

#### 23. Portal

Renders children above all content in a separate compositing layer.

```typescript
import { Portal } from "@vxrt/core"

type PortalProps = { children?: JSX.Element }
```

```tsx
<Portal>
  <box width="100%" height="100%" backgroundColor="#000000aa" alignX="center" alignY="center">
    <box backgroundColor="#1a1a2e" padding={20} cornerRadius={12}>
      <text color="#fff">I'm above everything</text>
    </box>
  </box>
</Portal>
```

**Web analogy:** `ReactDOM.createPortal(children, document.body)`.

---

#### 24. Code

Syntax-highlighted code block with tree-sitter tokenization.

```typescript
import { Code } from "@vxrt/core"

type CodeTheme = { bg: string | number; lineNumberFg: string | number; radius: number; padding: number }

type CodeProps = {
  content: string
  language: string               // "typescript", "python", "rust", etc.
  syntaxStyle: SyntaxStyle       // e.g. ONE_DARK, KANAGAWA
  width?: number | string
  height?: number | string
  theme?: Partial<CodeTheme>
}
```

```tsx
import { ONE_DARK } from "@vxrt/core/engine"

<Code
  content={`const x = 42;\nconsole.log(x);`}
  language="typescript"
  syntaxStyle={ONE_DARK}
  width={400}
  theme={{ bg: "#1e1e2e", lineNumberFg: "#555", radius: 8, padding: 12 }}
/>
```

---

#### 25. Markdown

Markdown renderer with inline styling. Uses `marked` lexer internally.

```typescript
import { Markdown } from "@vxrt/core"

type MarkdownTheme = {
  fg: string | number; muted: string | number; heading: string | number
  link: string | number; bold: string | number; italic: string | number
  codeFg: string | number; codeBg: string | number; codeBlockBg: string | number
  blockquoteBorder: string | number; listBullet: string | number
  tableBg: string | number; hrColor: string | number; del: string | number
  // ... plus tableHeaderFg, lineNumberFg, etc.
}

type MarkdownProps = {
  content: string
  syntaxStyle?: SyntaxStyle
  width?: number | string
  height?: number | string
  theme?: Partial<MarkdownTheme>
}
```

```tsx
<Markdown
  content={readmeText}
  syntaxStyle={ONE_DARK}
  width={600}
  theme={{ fg: 0xe0e0e0ff, heading: 0x56d4c8ff, codeBg: 0x2c313aff }}
/>
```

---

#### 26. Diff

Unified diff viewer with per-line coloring and syntax highlighting.

```typescript
import { Diff } from "@vxrt/core"

type DiffTheme = {
  fg: string | number; muted: string | number; bg: string | number; radius: number
  addedBg: string | number; removedBg: string | number; contextBg: string | number
  addedSign: string | number; removedSign: string | number
  lineNumberFg: string | number; lineNumberBg: string | number
}

type DiffProps = {
  diff: string                   // unified diff string
  syntaxStyle?: SyntaxStyle
  filetype?: string
  width?: number | string
  height?: number | string
  theme?: Partial<DiffTheme>
}
```

```tsx
<Diff
  diff={unifiedDiff}
  syntaxStyle={ONE_DARK}
  filetype="typescript"
  width={600}
  theme={{ addedBg: "#1a3a1a", removedBg: "#3a1a1a" }}
/>
```

---

#### 27. RichText / Span

Multi-span inline text.

```typescript
import { RichText, Span } from "@vxrt/core"

type RichTextProps = { color?: string | number; children?: JSX.Element }
type SpanProps = { color?: string | number; fontSize?: number; fontWeight?: number; fontStyle?: "normal" | "italic"; children?: JSX.Element }
```

```tsx
<RichText color="#e0e0e0">
  <Span>Hello </Span>
  <Span color="#4488cc" fontWeight={700}>world</Span>
  <Span> from Vexart</Span>
</RichText>
```

---

#### 28. WrapRow

Flex-wrap workaround for Flexily (which doesn't support `flexWrap`).

```typescript
import { WrapRow } from "@vxrt/core"

type WrapRowProps = {
  width: number          // total available width
  itemWidth: number      // uniform item width
  gap?: number           // default: 0
  rowGap?: number        // default: same as gap
  children?: JSX.Element
}
```

```tsx
<WrapRow width={400} itemWidth={80} gap={8}>
  <For each={tags}>
    {(tag) => (
      <box width={80} padding={4} backgroundColor="#333" cornerRadius={4}>
        <text color="#fff" fontSize={12}>{tag}</text>
      </box>
    )}
  </For>
</WrapRow>
```

---

### createForm -- Form Validation

Factory function that creates reactive form state with validation.

```typescript
import { createForm } from "@vxrt/core"

type FormOptions<T> = {
  initialValues: T
  validate?: { [K in keyof T]?: (value: T[K], allValues: T) => string | undefined }
  validateAsync?: { [K in keyof T]?: (value: T[K], allValues: T) => Promise<string | undefined> }
  validateForm?: (values: T) => Record<string, string> | undefined
  onSubmit: (values: T) => void | Promise<void>
  validateOnChange?: boolean       // default: false (validate on blur/submit)
}

type FormHandle<T> = {
  values: { [K in keyof T]: () => T[K] }            // reactive getters
  errors: { [K in keyof T]: () => string | undefined }
  touched: { [K in keyof T]: () => boolean }
  dirty: { [K in keyof T]: () => boolean }
  setValue: <K extends keyof T>(field: K, value: T[K]) => void
  setError: <K extends keyof T>(field: K, error: string | undefined) => void
  setTouched: <K extends keyof T>(field: K) => void
  isValid: () => boolean
  submitting: () => boolean
  submit: () => void
  reset: () => void
  getValues: () => T
}
```

**Full form example:**

```tsx
import { createForm } from "@vxrt/core"
import { Input, Button } from "@vxrt/core"
import { Show, createSignal } from "@vxrt/core"

function SignupForm() {
  const form = createForm({
    initialValues: { name: "", email: "", password: "" },
    validate: {
      name: (v) => v.length < 2 ? "Name must be at least 2 characters" : undefined,
      email: (v) => !v.includes("@") ? "Invalid email address" : undefined,
      password: (v) => v.length < 8 ? "Password must be at least 8 characters" : undefined,
    },
    onSubmit: async (values) => {
      await registerUser(values)
    },
  })

  return (
    <box direction="column" gap={12} padding={16}>
      {/* Name field */}
      <box direction="column" gap={4}>
        <text color="#888" fontSize={12}>Name</text>
        <Input
          value={form.values.name()}
          onChange={(v) => form.setValue("name", v)}
          placeholder="Your name"
          renderInput={(ctx) => (
            <box width={300} height={24} backgroundColor="#1e1e2e" cornerRadius={4}
              borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} padding={4}>
              <text color={ctx.showPlaceholder ? "#666" : "#fff"}>{ctx.displayText}</text>
            </box>
          )}
        />
        <Show when={form.touched.name() && form.errors.name()}>
          <text color="#dc2626" fontSize={12}>{form.errors.name()}</text>
        </Show>
      </box>

      {/* Email field */}
      <box direction="column" gap={4}>
        <text color="#888" fontSize={12}>Email</text>
        <Input
          value={form.values.email()}
          onChange={(v) => form.setValue("email", v)}
          placeholder="you@example.com"
          renderInput={(ctx) => (
            <box width={300} height={24} backgroundColor="#1e1e2e" cornerRadius={4}
              borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} padding={4}>
              <text color={ctx.showPlaceholder ? "#666" : "#fff"}>{ctx.displayText}</text>
            </box>
          )}
        />
        <Show when={form.touched.email() && form.errors.email()}>
          <text color="#dc2626" fontSize={12}>{form.errors.email()}</text>
        </Show>
      </box>

      {/* Submit */}
      <Button
        onPress={form.submit}
        disabled={form.submitting()}
        renderButton={({ focused, disabled }) => (
          <box padding={10} cornerRadius={6}
            backgroundColor={disabled ? "#333" : focused ? "#4488cc" : "#3a7abd"}>
            <text color="#fff">{form.submitting() ? "Submitting..." : "Sign Up"}</text>
          </box>
        )}
      />
    </box>
  )
}
```
## Design System

### Tokens

All design tokens are exported from `@vxrt/core`:

#### colors

```typescript
import { colors } from "@vxrt/core"

colors.background           // "#0a0a0a"    — app background (near-OLED black)
colors.foreground           // "#fafafa"    — default text
colors.card                 // "#171717"    — elevated surfaces
colors.cardForeground       // "#fafafa"    — text on cards
colors.popover              // "#171717"    — floating surfaces
colors.popoverForeground    // "#fafafa"    — text on popovers
colors.primary              // "#e5e5e5"    — brand/high-emphasis actions
colors.primaryForeground    // "#171717"    — text on primary
colors.secondary            // "#262626"    — lower-emphasis actions
colors.secondaryForeground  // "#fafafa"    — text on secondary
colors.muted                // "#262626"    — subtle surfaces
colors.mutedForeground      // "#a3a3a3"    — low-emphasis text
colors.accent               // "#262626"    — hover/focus surfaces
colors.accentForeground     // "#fafafa"    — text on accent
colors.destructive          // "#dc2626"    — errors/danger
colors.destructiveForeground // "#fafafa"   — text on destructive
colors.border               // "#ffffff25"  — borders (~14.5% white)
colors.input                // "#ffffff26"  — input borders (~15% white)
colors.ring                 // "#737373"    — focus rings
colors.transparent          // "#00000000"  — transparent
```

#### radius

```typescript
import { radius } from "@vxrt/core"

radius.sm    // 6
radius.md    // 8
radius.lg    // 10
radius.xl    // 14
radius.xxl   // 18
radius.full  // 9999 (pill)
```

#### space

```typescript
import { space } from "@vxrt/core"

space.px     // 1
space[0.5]   // 2
space[1]     // 4
space[1.5]   // 6
space[2]     // 8
space[2.5]   // 10
space[3]     // 12
space[3.5]   // 14
space[4]     // 16
space[5]     // 20
space[6]     // 24
space[7]     // 28
space[8]     // 32
space[9]     // 36
space[10]    // 40
```

#### font

```typescript
import { font } from "@vxrt/core"

font.xs      // 10
font.sm      // 12
font.base    // 14
font.lg      // 16
font.xl      // 20
font["2xl"]  // 24
font["3xl"]  // 30
font["4xl"]  // 36
```

#### weight

```typescript
import { weight } from "@vxrt/core"

weight.normal    // 400
weight.medium    // 500
weight.semibold  // 600
weight.bold      // 700
```

#### shadows

```typescript
import { shadows } from "@vxrt/core"

// Each preset is an array of ShadowConfig objects (multi-shadow for depth)
shadows.sm   // subtle lift
shadows.md   // card elevation
shadows.lg   // modal/dialog
shadows.xl   // highest elevation
```

---

### Theming

#### Static vs Reactive

| Import | Reactivity | Use when |
| ------ | ---------- | -------- |
| `colors` | Static object | One-time reads, config, conditions |
| `themeColors` | SolidJS signals via getters | JSX props (auto-updates on theme switch) |

```tsx
// STATIC — won't update if theme changes at runtime
<box backgroundColor={colors.background} />

// REACTIVE — updates automatically when setTheme() is called
<box backgroundColor={themeColors.background} />
```

Use `themeColors` in JSX props. Use `colors` for static config or conditions.

#### createTheme(overrides?)

Create a theme definition by merging overrides with default tokens:

```typescript
import { createTheme } from "@vxrt/core"

const myTheme = createTheme({
  colors: {
    background: "#0d1117",
    primary: "#58a6ff",
    card: "#161b22",
  },
})
```

#### setTheme(theme)

Switch theme at runtime. Only components reading `themeColors` re-render:

```typescript
import { setTheme, darkTheme, lightTheme, createTheme } from "@vxrt/core"

setTheme(lightTheme)    // built-in light theme
setTheme(darkTheme)     // built-in dark theme (default)
setTheme(myTheme)       // custom theme
```

#### Built-in presets

| Theme | Description |
| ----- | ----------- |
| `darkTheme` | Default. OLED-optimized dark theme (same as static `colors`) |
| `lightTheme` | Light theme with inverted surfaces |

#### ThemeProvider

Component wrapper for nested themes. For most apps, global `setTheme()` is sufficient:

```tsx
import { ThemeProvider } from "@vxrt/core"

<ThemeProvider theme={myTheme}>
  {/* children use myTheme */}
</ThemeProvider>
```

#### Theme switching example

```tsx
import { createTheme, setTheme, darkTheme, lightTheme, themeColors } from "@vxrt/core"
import { ToggleSwitch, createSignal } from "@vxrt/core"

const catppuccin = createTheme({
  colors: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    primary: "#89b4fa",
    card: "#313244",
    border: "#45475a",
  },
})

function ThemeSwitcher() {
  const [mode, setMode] = createSignal<"dark" | "light" | "catppuccin">("dark")

  const cycle = () => {
    const next = mode() === "dark" ? "light" : mode() === "light" ? "catppuccin" : "dark"
    setMode(next)
    setTheme(next === "dark" ? darkTheme : next === "light" ? lightTheme : catppuccin)
  }

  return (
    <box backgroundColor={themeColors.background} padding={20}>
      <box focusable onPress={cycle}>
        <text color={themeColors.foreground}>Theme: {mode()} (press to cycle)</text>
      </box>
    </box>
  )
}
```

---

### Void Components

Pre-styled components using Void design tokens. Drop-in replacements for headless components.

| Component | Variants | Sizes |
| --------- | -------- | ----- |
| `Button` | default, secondary, outline, ghost, destructive | xs, sm, default, lg |
| `Card` | default, sm | -- |
| `CardHeader` | -- | -- |
| `CardTitle` | -- | -- |
| `CardDescription` | -- | -- |
| `CardContent` | -- | -- |
| `CardFooter` | -- | -- |
| `Badge` | default, secondary, outline, destructive | -- |
| `Separator` | horizontal, vertical | -- |
| `Avatar` | -- | sm, default, lg |
| `Skeleton` | -- | -- |
| `VoidDialog` | -- | -- |
| `VoidSelect` | -- | -- |
| `VoidSwitch` | -- | -- |
| `VoidRadioGroup` | -- | -- |
| `VoidTable` | -- | -- |
| `createVoidToaster` | -- | -- |

All imported from `@vxrt/core`.

**Typography components:**

| Component | Font Size | Weight | Color |
| --------- | --------- | ------ | ----- |
| `H1` | 36px | bold | foreground |
| `H2` | 30px | semibold | foreground |
| `H3` | 24px | semibold | foreground |
| `H4` | 20px | semibold | foreground |
| `P` | 14px | normal | foreground |
| `Lead` | 20px | normal | mutedForeground |
| `Large` | 18px | semibold | foreground |
| `Small` | 12px | medium | foreground |
| `Muted` | 14px | normal | mutedForeground |

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, H2, P, Muted } from "@vxrt/core"

<Card>
  <CardHeader>
    <CardTitle>Dashboard</CardTitle>
  </CardHeader>
  <CardContent>
    <H2>Welcome back</H2>
    <P>Here's what happened while you were away.</P>
    <Badge variant="secondary">3 new</Badge>
    <Button variant="default" size="default" onPress={() => refresh()}>
      Refresh
    </Button>
  </CardContent>
</Card>
```

---

### Creating Custom Theme Packages

See [`manual/creating-theme-packages.md`](./creating-theme-packages.md) for a guide on building and distributing your own Vexart theme package.

---

## Patterns & Recipes

### Glassmorphism Card

```tsx
<box
  backgroundColor="#ffffff10"
  backdropBlur={12}
  backdropBrightness={110}
  cornerRadius={16}
  borderColor="#ffffff20"
  borderWidth={1}
  padding={20}
  shadow={{ x: 0, y: 8, blur: 32, color: 0x00000040 }}
>
  <text color="#fff" fontSize={18}>Frosted Glass</text>
  <text color="#ffffff88" fontSize={14}>Content behind this card is blurred</text>
</box>
```

---

### Form with Validation

```tsx
import { createForm, Input, Button, Show } from "@vxrt/core"

const form = createForm({
  initialValues: { email: "" },
  validate: { email: (v) => !v.includes("@") ? "Must be a valid email" : undefined },
  onSubmit: async (vals) => { await subscribe(vals.email) },
})

<box direction="column" gap={8}>
  <Input
    value={form.values.email()}
    onChange={(v) => form.setValue("email", v)}
    placeholder="you@example.com"
    renderInput={(ctx) => (
      <box width={250} height={24} backgroundColor="#1e1e2e" padding={4}
        borderColor={form.errors.email() ? "#dc2626" : ctx.focused ? "#4488cc" : "#444"}
        borderWidth={1} cornerRadius={4}>
        <text color={ctx.showPlaceholder ? "#666" : "#fff"}>{ctx.displayText}</text>
      </box>
    )}
  />
  <Show when={form.errors.email()}>
    <text color="#dc2626" fontSize={12}>{form.errors.email()}</text>
  </Show>
  <Button onPress={form.submit} disabled={form.submitting()}
    renderButton={({ focused }) => (
      <box padding={8} cornerRadius={6} backgroundColor={focused ? "#4488cc" : "#3a7abd"}>
        <text color="#fff">Subscribe</text>
      </box>
    )}
  />
</box>
```

---

### Multi-Screen App with Router

```tsx
import { Router, Route, useRouterContext } from "@vxrt/core"
import type { RouteProps } from "@vxrt/core/engine"

function App() {
  return (
    <Router initial="home">
      <Route path="home" component={Home} />
      <Route path="settings" component={Settings} />
      <Route path="about" component={About} />
    </Router>
  )
}

function Home(props: RouteProps) {
  const router = useRouterContext()
  return (
    <box direction="column" gap={8} padding={16}>
      <text color="#fff" fontSize={20}>Home</text>
      <box focusable onPress={() => router.navigate("settings")}>
        <text color="#4488cc">Settings</text>
      </box>
      <box focusable onPress={() => router.navigate("about")}>
        <text color="#4488cc">About</text>
      </box>
    </box>
  )
}

function Settings(props: RouteProps) {
  const router = useRouterContext()
  return (
    <box direction="column" gap={8} padding={16}>
      <text color="#fff" fontSize={20}>Settings</text>
      <box focusable onPress={() => router.goBack()}>
        <text color="#888">Back</text>
      </box>
    </box>
  )
}

function About(props: RouteProps) {
  const router = useRouterContext()
  return (
    <box padding={16}>
      <text color="#fff">About this app</text>
      <box focusable onPress={() => router.goBack()}>
        <text color="#888">Back</text>
      </box>
    </box>
  )
}
```

---

### Modal Dialog

```tsx
import { Dialog, Button, Show, createSignal } from "@vxrt/core"

const [open, setOpen] = createSignal(false)

<box>
  <Button onPress={() => setOpen(true)}
    renderButton={({ focused }) => (
      <box padding={8} cornerRadius={6} backgroundColor={focused ? "#444" : "#333"}>
        <text color="#fff">Delete Item</text>
      </box>
    )}
  />

  <Show when={open()}>
    <Dialog onClose={() => setOpen(false)}>
      <Dialog.Overlay backgroundColor="#00000088" backdropBlur={4} />
      <Dialog.Content backgroundColor="#1a1a2e" cornerRadius={12} padding={20} width={350}>
        <text color="#fff" fontSize={16}>Are you sure?</text>
        <text color="#888" fontSize={14}>This action cannot be undone.</text>
        <box direction="row" gap={8} paddingTop={12}>
          <Button onPress={() => setOpen(false)}
            renderButton={({ focused }) => (
              <box padding={8} cornerRadius={6} backgroundColor={focused ? "#333" : "#262626"}>
                <text color="#fff">Cancel</text>
              </box>
            )}
          />
          <Button onPress={() => { deleteItem(); setOpen(false) }}
            renderButton={({ focused }) => (
              <box padding={8} cornerRadius={6} backgroundColor={focused ? "#ef4444" : "#dc2626"}>
                <text color="#fff">Delete</text>
              </box>
            )}
          />
        </box>
      </Dialog.Content>
    </Dialog>
  </Show>
</box>
```

---

### Virtualized Data Table

```tsx
import { VirtualList, createSignal } from "@vxrt/core"

// Generate 10K items
const items = Array.from({ length: 10_000 }, (_, i) => ({
  id: i,
  name: `User ${i}`,
  email: `user${i}@example.com`,
}))

const [selected, setSelected] = createSignal(-1)

<VirtualList
  items={items}
  itemHeight={24}
  height={500}
  width={600}
  overscan={5}
  selectedIndex={selected()}
  onSelect={setSelected}
  renderItem={(item, index, ctx) => (
    <box height={24} direction="row" gap={16} padding={4}
      backgroundColor={ctx.selected ? "#2a2a4e" : ctx.highlighted ? "#1a1a3e" : "transparent"}>
      <box width={60}><text color="#555" fontSize={12}>#{item.id}</text></box>
      <box width={150}><text color={ctx.selected ? "#fff" : "#ccc"}>{item.name}</text></box>
      <box width="grow"><text color="#888">{item.email}</text></box>
    </box>
  )}
/>
```

---

### Global Keyboard Shortcuts

```tsx
import { onInput } from "@vxrt/core"

onInput((event) => {
  if (event.type !== "key") return

  // Ctrl+Q to quit
  if (event.key === "q" && event.mods.ctrl) {
    process.exit(0)
  }

  // Ctrl+S to save
  if (event.key === "s" && event.mods.ctrl) {
    save()
  }

  // F1 for help
  if (event.key === "f1") {
    showHelp()
  }
})
```

---

### Animated Transitions

```tsx
import { createTransition, createSpring, easing, createSignal } from "@vxrt/core"

function AnimatedPanel() {
  const [expanded, setExpanded] = createSignal(false)

  const [width, setWidth] = createTransition(100, {
    duration: 400,
    easing: easing.easeOutCubic,
  })

  const [opacity, setOpacity] = createSpring(0.5, {
    stiffness: 200,
    damping: 20,
  })

  const toggle = () => {
    const next = !expanded()
    setExpanded(next)
    setWidth(next ? 400 : 100)
    setOpacity(next ? 1 : 0.5)
  }

  return (
    <box direction="column" gap={8}>
      <box focusable onPress={toggle}>
        <text color="#4488cc">{expanded() ? "Collapse" : "Expand"}</text>
      </box>
      <box
        width={Math.round(width())}
        height={60}
        backgroundColor="#1a1a2e"
        cornerRadius={8}
        opacity={opacity()}
        padding={12}
      >
        <text color="#e0e0e0">Animated content</text>
      </box>
    </box>
  )
}
```

---

## Best Practices

### Project structure

Organize application code by concern. A recommended layout for a Vexart app:

```
src/
  layout/          — shell, sidebar, status bar, top-level containers
  views/           — route-level screens (each maps to a Router path)
  components/      — reusable UI pieces shared across views
  lib/             — non-UI helpers: data fetching, formatting, constants
  main.tsx         — entry point (mount + router setup)
```

Keep files small. One component per file. Co-locate a component's types and helpers in the same file unless they are shared elsewhere.

### Component composition

Choose the right abstraction level for the job:

1. **Styled components first** (`Button`, `Card`, `Badge`, etc. from `@vxrt/core`). These cover 80% of UI needs with zero configuration.
2. **Headless components** when you need full visual control. Drop to `Input`, `Dialog`, `Tabs`, `VirtualList`, etc. with a `render*` prop to supply your own layout.
3. **Raw `<box>` / `<text>`** for one-off layouts or highly custom visuals that don't warrant a reusable component.

Avoid wrapping styled components in another component just to rename them. Use them directly and let the variant/size props handle visual variation.

### Performance

- **Use `layer` on independently-updating widgets.** A node with `layer` gets its own GPU compositing target. The engine can repaint it without redrawing siblings. Good candidates: animated panels, clocks, progress indicators, status bars.
- **Use `VirtualList` for large datasets.** Rendering 10K items into the tree is slow no matter the framework. `VirtualList` only materializes visible rows plus an `overscan` buffer.
- **Avoid deep nesting.** Every `<box>` is a Flexily layout node. Flatten where you can — use `direction="row"` with `gap` instead of wrapping each child in its own container.
- **Use `willChange` sparingly.** It pre-promotes a node to its own compositing layer. Only set it on elements that will actually animate (`"transform"`, `"opacity"`).

### Theme

- **Create a custom theme early.** Call `createTheme()` with your brand colors at app startup. Changing tokens later means updating every hardcoded hex.
- **Use `themeColors` (reactive) in JSX props.** This is the only way to get automatic re-rendering on theme switch. Reserve static `colors` for conditions and config.
- **Keep custom tokens minimal.** Override only the colors you need. The defaults are designed for OLED contrast and accessibility.

### State management

- **Keep signals flat.** A `createSignal<string>()` is better than a `createSignal<{ value: string }>()`. Flat signals trigger fine-grained updates.
- **Avoid deep nesting.** Nested objects inside signals force the entire subtree to re-render when any field changes.
- **Co-locate state with the component that owns it.** If only one component reads a signal, define it inside that component. Lift state up only when siblings need to share it.
- **Use `createForm` for form state.** It handles validation, touched tracking, and async submission out of the box.

### When to use `@vxrt/core/engine`

Most apps only need `@vxrt/core`. Reach for `@vxrt/core/engine` when you need:

- **Direct focus control** — `useFocus`, `setFocus`, `focusedId`, `pushFocusScope`
- **Custom render loops** — `createRenderLoop`, `createTerminal`, `markDirty`
- **Debug tools** — `toggleDebug`, `setDebug`, `debugState`, `debugDumpTree`
- **Tree-sitter integration** — `TreeSitterClient`, `addDefaultParsers`, syntax themes
- **Low-level input** — `useKeyboard`, `useMouse`, `useInput` (signal-based)
- **Selection API** — `getSelection`, `setSelection`, `getSelectedText`
- **Font/image management** — `registerFont`, `clearTextCache`, `clearImageCache`
- **Plugin system** — `createSlotRegistry`, `createSlot`
- **FFI bridge** — `VEXART_SYMBOLS`, `openVexartLibrary`, `vexartVersion`

If you find yourself importing more than two or three things from `@vxrt/core/engine`, you are likely building infrastructure (an editor, a devtool, a custom compositor) rather than an application — which is fine, just be aware of the boundary.

---

## API Quick Reference

### `@vxrt/core` — Application API

Everything app developers use: components, tokens, hooks, SolidJS primitives, and animations.

#### SolidJS Primitives

| Export | Description |
| ------ | ----------- |
| `createSignal` | Reactive signal |
| `createComponent` | SolidJS component creation |
| `createElement` | SolidJS element creation |
| `effect` | SolidJS effect |
| `memo` | SolidJS memo |
| `mergeProps` | SolidJS props merge |
| `createContext` / `useContext` | Dependency injection |
| `For` | List iteration |
| `Show` | Conditional rendering |
| `Switch` / `Match` | Switch/match rendering |
| `Index` | Keyed index iteration |
| `ErrorBoundary` | Error boundary |

#### Design Tokens

| Export | Description |
| ------ | ----------- |
| `colors` | Static color tokens |
| `themeColors` | Reactive color tokens (signals) |
| `radius` | Border radius presets |
| `space` | Spacing scale |
| `font` | Font size scale |
| `weight` | Font weight presets |
| `shadows` | Shadow presets (sm/md/lg/xl) |

#### Theming

| Export | Description |
| ------ | ----------- |
| `createTheme` | Create theme from overrides |
| `setTheme` | Switch active theme |
| `getTheme` | Get current theme |
| `darkTheme` | Built-in dark theme |
| `lightTheme` | Built-in light theme |
| `ThemeProvider` | Theme context provider |
| `useTheme` | Read theme in component |

#### Styled Components

| Export | Description |
| ------ | ----------- |
| `Button` | Styled button (variants: default/secondary/outline/ghost/destructive) |
| `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` / `CardAction` | Card layout |
| `Badge` | Status/label badge |
| `Separator` | Horizontal/vertical divider |
| `Avatar` | User avatar |
| `Skeleton` | Loading placeholder |
| `VoidDialog` / `VoidDialogTitle` / `VoidDialogDescription` / `VoidDialogFooter` | Styled dialog |
| `VoidCombobox` | Styled combobox |
| `VoidDropdownMenu` / `VoidDropdownMenuTrigger` / `VoidDropdownMenuContent` / `VoidDropdownMenuItem` / `VoidDropdownMenuSeparator` / `VoidDropdownMenuLabel` | Styled dropdown |
| `VoidInput` | Styled input |
| `VoidPopover` | Styled popover |
| `VoidProgress` | Styled progress bar |
| `VoidRadioGroup` | Styled radio group |
| `VoidSelect` | Styled select |
| `VoidSlider` | Styled slider |
| `VoidSwitch` | Styled switch |
| `VoidTable` | Styled table |
| `VoidTabs` | Styled tabs |
| `VoidTooltip` | Styled tooltip |
| `createVoidToaster` | Imperative toast notifications |

#### Typography

| Export | Description |
| ------ | ----------- |
| `H1` / `H2` / `H3` / `H4` | Heading components |
| `P` / `Lead` / `Large` / `Small` / `Muted` | Body text components |

#### Layout Primitives

| Export | Description |
| ------ | ----------- |
| `Box` | Layout container wrapper |
| `Text` | Text display wrapper |
| `RichText` / `Span` | Multi-span inline text |
| `WrapRow` | Flex-wrap workaround |
| `ScrollView` | Scrollable container with visual scrollbar |
| `Portal` | Render at root/overlay level |

#### Headless Components

| Export | Description |
| ------ | ----------- |
| `Button` (headless) | Interactive button with `renderButton` prop |
| `Input` | Single-line text input |
| `Textarea` | Multi-line editor |
| `Checkbox` | Toggle checkbox |
| `ToggleSwitch` | Toggle switch (renamed from `Switch` to avoid collision) |
| `RadioGroup` | Radio option group |
| `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` | Dropdown select |
| `Combobox` | Autocomplete with filtering |
| `Slider` | Numeric range input |
| `Tabs` | Tab switcher |
| `List` | Scrollable list with selection |
| `Table` | Data table with row selection |
| `VirtualList` | Virtualized list (keyboard + mouse) |
| `Dialog` / `Dialog.Overlay` / `Dialog.Content` | Modal dialog |
| `Tooltip` | Delayed tooltip |
| `Popover` | Controlled popover panel |
| `ProgressBar` | Progress indicator |
| `Code` | Syntax-highlighted code block |
| `Markdown` | Markdown renderer |
| `Diff` | Unified diff viewer |
| `OverlayRoot` | Overlay container root |
| `createToaster` | Imperative toast factory |
| `createForm` | Form validation factory |

#### Navigation

| Export | Description |
| ------ | ----------- |
| `Router` / `Route` | Declarative routing |
| `NavigationStack` | Stack-based navigation |
| `useRouterContext` / `useStack` | Router context hooks |

#### Input & Interaction

| Export | Description |
| ------ | ----------- |
| `onInput` | Global input event bus |
| `useDrag` | Drag interaction hook |
| `useHover` | Hover detection hook |
| `setPointerCapture` / `releasePointerCapture` | Pointer lock for drag |

#### Animation

| Export | Description |
| ------ | ----------- |
| `createTransition` | Tween animation |
| `createSpring` | Spring animation |
| `easing` | Easing function presets |

#### Data

| Export | Description |
| ------ | ----------- |
| `useQuery` | Reactive data fetching |
| `useMutation` | Reactive data mutation |

#### Utilities

| Export | Description |
| ------ | ----------- |
| `RGBA` | Color utility class |
| `MouseButton` | Mouse button enum |
| `useTerminalDimensions` | Reactive terminal size |
| `createHandle` | Create node handle (ref) |
| `createScrollHandle` / `releaseScrollHandle` | Programmatic scroll control |
| `SIZING` / `DIRECTION` / `ALIGN_X` / `ALIGN_Y` | Layout enums |

---

### `@vxrt/core/engine` — Low-Level Engine API

Internals for custom render loops, focus management, debug tools, tree-sitter, and FFI.

#### Core

| Export | Description |
| ------ | ----------- |
| `mount` | Mount JSX tree onto terminal |
| `createTerminal` | Create terminal instance |
| `createRenderLoop` | Manual render loop (advanced) |
| `markDirty` / `isDirty` / `clearDirty` | Force/check repaint |

#### Focus

| Export | Description |
| ------ | ----------- |
| `useFocus` | Make component focusable |
| `setFocus` | Focus element by ID |
| `focusedId` / `setFocusedId` | Current focused ID (signal) |
| `pushFocusScope` / `resetFocus` | Focus traps and reset |

#### Input (signal-based)

| Export | Description |
| ------ | ----------- |
| `useKeyboard` | Reactive keyboard signal |
| `useMouse` | Reactive mouse signal |
| `useInput` / `dispatchInput` | All input as signal / dispatch |
| `decodePasteBytes` | Decode paste data |

#### Renderer / Native Bridge

| Export | Description |
| ------ | ----------- |
| `setRendererBackend` / `getRendererBackend` / `getRendererBackendName` | Backend control |
| `createGpuRendererBackend` / `getGpuRendererBackendCacheStats` | GPU backend |
| `createGpuFrameComposer` / `chooseGpuLayerStrategy` | Frame composition |
| `VEXART_SYMBOLS` / `EXPECTED_BRIDGE_VERSION` | FFI symbols |
| `openVexartLibrary` / `closeVexartLibrary` | Library lifecycle |
| `vexartVersion` / `assertBridgeVersion` / `vexartGetLastError` | Version/error |
| `getRendererResourceStats` | Resource stats |

#### Router (low-level)

| Export | Description |
| ------ | ----------- |
| `createRouter` | Create flat router |
| `createNavigationStack` | Create stack router |
| `useRouter` | Access router context |

#### Fonts & Images

| Export | Description |
| ------ | ----------- |
| `registerFont` / `getFont` | Load/get font atlas |
| `clearTextCache` / `getTextLayoutCacheStats` / `getFontAtlasCacheStats` | Font cache |
| `clearImageCache` / `getImageCacheStats` | Image cache |

#### Rendering Utilities

| Export | Description |
| ------ | ----------- |
| `createScrollHandle` / `resetScrollHandles` | Scroll handle management |
| `CanvasContext` | Canvas draw context |
| `createParticleSystem` | Particle effects |
| `createLayerStore` | Layer management |

#### Selection

| Export | Description |
| ------ | ----------- |
| `getSelection` / `setSelection` / `clearSelection` | Selection API |
| `getSelectedText` | Get selected text |
| `selectionSignal` / `resetSelection` | Reactive selection |

#### Debug

| Export | Description |
| ------ | ----------- |
| `toggleDebug` / `setDebug` / `isDebugEnabled` | Debug overlay |
| `debugState` / `debugStatsLine` | Debug info |
| `debugFrameStart` / `debugUpdateStats` | Frame debug |
| `debugDumpTree` / `debugDumpCulledNodes` | Tree inspection |

#### Syntax Highlighting

| Export | Description |
| ------ | ----------- |
| `ExtmarkManager` | Extmark management |
| `TreeSitterClient` / `getTreeSitterClient` | Tree-sitter parser |
| `addDefaultParsers` | Register default grammars |
| `SyntaxStyle` | Style definition type |
| `ONE_DARK` / `KANAGAWA` | Built-in syntax themes |
| `highlightsToTokens` | Convert highlights to tokens |

#### Plugins

| Export | Description |
| ------ | ----------- |
| `createSlotRegistry` / `createSlot` | Plugin slot system |

#### Constants

| Export | Description |
| ------ | ----------- |
| `ATTACH_TO` / `ATTACH_POINT` | Float attachment points |
