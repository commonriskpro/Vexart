---
title: Engine API
description: Public mount, terminal, hooks, types, and debug controls from @vexart/engine.
---

The engine entry point is the foundation boundary for custom integrations. Its
published surface includes `mount()`, `createTerminal()`, user-facing hooks,
the public types needed by those hooks and JSX refs, and supported debug
controls. The retained scene, layout, reconciler, render-loop, native, and FFI
machinery remains internal.

## Import

```tsx
// Advanced integration — most applications should use createApp() instead
import { createTerminal, mount, useFocus, useKeyboard } from "vexart/engine"
import type { MountHandle, NodeHandle } from "vexart/engine"

// The published root package also exposes the app-facing hooks and JSX runtime.
import { createApp } from "vexart"
```

`mount()` is the supported low-level entry point when an integration owns the
terminal boundary. For normal applications, use `createApp()` or `mountApp()`
from `vexart` so terminal and lifecycle ownership stays managed.

## Public hooks and types

User-facing hooks include focus, keyboard/mouse/input, drag/hover, animation,
data, and terminal-dimension hooks. Public node refs use the cached
`NodeHandle`; there is no public raw-node alternative.

```ts
import {
  useFocus,
  useKeyboard,
  useMouse,
  useInput,
  onInput,
  useDrag,
  useHover,
  useQuery,
  useMutation,
  createTransition,
  createSpring,
  useTerminalDimensions,
} from "vexart/engine"
import type { NodeHandle, NodeMouseEvent, PressEvent } from "vexart/engine"
```

Supported debug controls are `toggleDebug`, `setDebug`, `isDebugEnabled`,
`debugDumpTree`, and `debugStatsLine`.

SolidJS control-flow and reactivity primitives (`For`, `Show`, `createSignal`,
etc.) are available from `vexart`; they are not a second reconciler entry point.

## Reserved internal entry points

The following are implementation details and must not be imported by consumers:
raw node creation (`createNode`, `createHandle`), reconciler helpers
(`createElement`, `solidRender`), manual render-loop construction
(`createRenderLoop`), layout internals, renderer/native backends, FFI symbols,
diagnostic state/culling helpers (`debugState`, `debugDumpCulledNodes`), and
other engine-private utilities. Supported debug controls are `toggleDebug`,
`setDebug`, `isDebugEnabled`, `debugDumpTree`, and `debugStatsLine`.

JSX is compiled through the shared reconciler. `vexart/jsx-runtime` is the
published runtime; `@vexart/engine/jsx-runtime` is reserved for the workspace
compiler and is not a public raw-node API. Maintainers and tests may use the
workspace-only `@vexart/engine/internal` entry point, which is not published.
