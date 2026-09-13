---
name: vexart-app
description: Build, develop, or refactor GPU-accelerated terminal UI applications using Vexart, SolidJS reactivity, Void design tokens, and Flexbox layout.
metadata:
  short-description: Build Vexart terminal applications
---

# Vexart Application Builder

Guide for developing high-performance, GPU-accelerated terminal UI applications using Vexart. Vexart renders browser-grade visuals (rounded corners, box-shadows, gradients, backdrop blurs, images, canvas) in terminal emulators supporting Kitty graphics (Kitty, Ghostty, WezTerm, Herdr, tmux).

## Core Invariants & Architectural Rules

1. **Unified Barrel Rule**: All consumer applications and components MUST import exclusively from `"vexart"`:
   ```tsx
   import { createApp, VoidCard, VoidButton, colors, space, createSignal, Show, For } from "vexart"
   ```
   Never import from internal workspace packages (`@vexart/engine`, `@vexart/app`, `@vexart/styled`, `@vexart/headless`) or raw `solid-js`.

2. **No HTML DOM**: HTML elements (`<div>`, `<span>`, `<p>`, `<button>`) DO NOT exist.
   - Core intrinsics: `<box>`, `<text>`, `<img>`, `<canvas>`.
   - Raw text strings must always be wrapped in a `<text>` element or a typography component (`<H1>`, `<P>`, `<Small>`).

3. **16:9 Widescreen Layout Default (`direction="row"`)**:
   - `<box>` defaults to `direction="row"` (matching CSS Flexbox and modern widescreen terminal displays). Sibling elements and texts flow horizontally left-to-right by default.
   - For vertical stacking (lists, card contents, forms, vertical sidebars), ALWAYS set `direction="column"` explicitly:
     ```tsx
     <box direction="column" gap={space[4]}>
       <text>Item 1</text>
       <text>Item 2</text>
     </box>
     ```

4. **SolidJS Reactivity (No React, No VDOM)**:
   - Components execute ONCE during setup. Do not destructure props if you want them to remain reactive.
   - Use Solid primitives: `createSignal`, `createMemo`, `createEffect`, `<Show>`, `<For>`, `<Switch>`, `<Match>`.

5. **Lifecycle & Mounting**:
   - Applications are launched with `createApp`:
     ```tsx
     createApp(() => <App />, { quit: ["ctrl+c"] })
     ```

## Progressive Disclosure & References

Load these supporting guides when working on specific areas:

- [references/components.md](references/components.md) — Comprehensive catalog of Void styled components, inputs, and overlays.
- [references/layout-and-styling.md](references/layout-and-styling.md) — Flexbox and Grid cheatsheet, sizing (`"grow"`, `"fit"`, `"100%"`), and responsive 16:9 patterns.
- [references/reactivity-and-hooks.md](references/reactivity-and-hooks.md) — Event system, keyboard shortcuts, focus navigation (`useFocus`), animations (`createTransition`, `createSpring`), and data fetching (`useQuery`).
- [references/template-starter.md](references/template-starter.md) — Minimal project configuration, Bun runner setup, and Babel JSX transform configuration.

## Essential Application Skeleton

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
  VoidCardContent,
  VoidButton,
  useTerminalDimensions,
} from "vexart"

function App() {
  const [count, setCount] = createSignal(0)
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
      {/* Top Navigation Bar */}
      <box width="100%" direction="row" alignX="space-between" alignY="center">
        <text color={colors.foreground} fontSize={16} fontWeight={600}>
          My Vexart App
        </text>
        <text color={colors.mutedForeground} fontSize={12}>
          {dims.width()} × {dims.height()} px
        </text>
      </box>

      {/* Main Content Area */}
      <box width="100%" height="grow" direction="row" gap={space[4]}>
        <VoidCard className="sidebar" width={240}>
          <VoidCardHeader>
            <VoidCardTitle>Controls</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <box direction="column" gap={space[3]}>
              <VoidButton
                variant="primary"
                onPress={() => setCount((c) => c + 1)}
              >
                Increment: {count()}
              </VoidButton>
              <VoidButton
                variant="outline"
                onPress={() => setCount(0)}
              >
                Reset
              </VoidButton>
            </box>
          </VoidCardContent>
        </VoidCard>

        <box
          width="grow"
          height="100%"
          direction="column"
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          padding={space[6]}
          alignX="center"
          alignY="center"
        >
          <text color={colors.primary} fontSize={32} fontWeight={700}>
            Count: {count()}
          </text>
        </box>
      </box>
    </box>
  )
}

// Start application
createApp(() => <App />, { quit: ["ctrl+c"] })
```

