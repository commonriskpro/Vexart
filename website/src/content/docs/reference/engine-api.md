---
title: Engine API
description: Complete public API surface of @vexart/engine.
---

The engine is the foundation layer. It provides the reconciler, render loop, FFI bridge, input system, and all low-level utilities.

## Import

```tsx
// Most users — via the barrel
import { mount, createTransition, useFocus } from "vexart/engine"

// Or from monorepo
import { mount } from "@vexart/engine"
```

## Core

- `createRenderLoop` — create the adaptive render loop
- `mount` — mount a component tree to a terminal
- `createTerminal` — create a terminal instance
- `MouseButton`, `RGBA`, `useTerminalDimensions`, `decodePasteBytes`

## Reconciler (SolidJS)

- `createComponent`, `createElement`, `createTextNode`, `insertNode`
- `insert`, `spread`, `setProp`, `mergeProps`
- `effect`, `memo`, `use`, `solidRender`
- `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`
- `createContext`, `useContext`

## Input & Interaction

- `useKeyboard`, `useMouse`, `useInput`, `onInput`, `dispatchInput`
- `useFocus`, `setFocus`, `focusedId`, `setFocusedId`, `pushFocusScope`, `resetFocus`
- `setPointerCapture`, `releasePointerCapture`
- `useDrag`, `useHover`

## Animation

- `createTransition`, `createSpring`, `easing`
- `hasActiveAnimations`, `boostWindowFor`, `hasRecentInteraction`

## Data

- `useQuery`, `useMutation`
- `createRouter`, `createNavigationStack`, `useRouter`

## Selection

- `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal`, `resetSelection`

## Font & Text

- `registerFont`, `getFont`, `clearTextCache`, `getTextLayoutCacheStats`
- `msdfFontInit`, `msdfFontQuery`, `msdfMeasureText`, `isMsdfFontAvailable`

## Debug & Observability

- `toggleDebug`, `setDebug`, `isDebugEnabled`
- `debugDumpTree`, `debugDumpCulledNodes`
- `getRendererResourceStats`, `getImageCacheStats`

## Terminal

- `createTerminal`, `detect`
- `inferCaps`, `probeKittyGraphics`, `queryColors`
- `getSize`, `queryPixelSize`, `onResize`
- `enter`, `leave`, `beginSync`, `endSync`

For the complete export list (200+ symbols), see the [AGENTS.md](https://github.com/commonriskpro/Vexart/blob/main/AGENTS.md) reference.
