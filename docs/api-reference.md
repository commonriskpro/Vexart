# API Reference

Vexart exposes five public packages for v0.9. Public exports are defined explicitly in each package's `src/public.ts` and snapshotted with API Extractor.

## Entry points

Use the highest-level API that matches your integration needs:

1. **`createApp()` from `@vexart/app`** — managed default. Creates the terminal, provides app context, starts the render loop, and wires lifecycle cleanup.
2. **`mountApp()` from `@vexart/app`** — async app lifecycle for custom bootstrapping while still using the app framework.
3. **`mount()` from `@vexart/engine`** — low-level alternative for advanced use when you manage terminal creation and input plumbing yourself.

```tsx
import { createApp, Box, Text } from "vexart"

await createApp(() => (
  <Box width="100%" height="100%" alignX="center" alignY="center">
    <Text>Hello Vexart</Text>
  </Box>
))
```

## `@vexart/app`

Managed application framework package:

- app lifecycle: `createApp`, `mountApp`, `useAppTerminal`
- app primitives: `Box`, `Text` with `className` support
- router: `createAppRouter`, `RouterProvider`, `RouteOutlet`, `useRouter`
- route manifest helpers and CLI/config helpers

```ts
import { createApp, mountApp, useAppTerminal, Box, Text } from "vexart"
```

## `@vexart/engine`

Core renderer/runtime package:

- terminal lifecycle: `createTerminal`, `mount`
- renderer backend configuration
- TS scene/layout/render graph hooks
- input/focus/selection/router hooks
- animation helpers
- canvas and syntax-highlighting primitives
- resource/debug/stat APIs

```ts
import { createTerminal, mount, useTerminalDimensions, onInput } from "vexart/engine"
```

`mount()` is intentionally still public, but it is the low-level alternative for advanced use. Application docs should prefer `createApp()` unless they explicitly need manual terminal control.

Current export groups include:

- core lifecycle: `createRenderLoop`, `mount`, `createTerminal`
- renderer/native bridge: `setRendererBackend`, `getRendererBackend`, `createGpuRendererBackend`, `createGpuFrameComposer`, `chooseGpuLayerStrategy`, `openVexartLibrary`, `closeVexartLibrary`, `vexartVersion`, `assertBridgeVersion`, `vexartGetLastError`, `getRendererResourceStats`
- Solid reconciler: `createComponent`, `createElement`, `createTextNode`, `insertNode`, `insert`, `spread`, `setProp`, `mergeProps`, `effect`, `memo`, `use`, `solidRender`, `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`
- input/interaction: `useKeyboard`, `useMouse`, `useInput`, `onInput`, `dispatchInput`, `useFocus`, `setFocus`, `focusedId`, `setFocusedId`, `pushFocusScope`, `resetFocus`, `setPointerCapture`, `releasePointerCapture`, `useDrag`, `useHover`
- animation: `createTransition`, `createSpring`, `easing`
- utilities/resources: `markDirty`, `isDirty`, `clearDirty`, `createHandle`, `createScrollHandle`, `releaseScrollHandle`, `resetScrollHandles`, `registerFont`, `getFont`, `clearTextCache`, `getTextLayoutCacheStats`, `getFontAtlasCacheStats`, `clearImageCache`, `getImageCacheStats`, `useTerminalDimensions`, `decodePasteBytes`, `CanvasContext`, `createParticleSystem`, `createLayerStore`
- router/data/selection: `useQuery`, `useMutation`, `createRouter`, `createNavigationStack`, `useRouter`, `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal`, `resetSelection`
- debug/plugins/syntax: `toggleDebug`, `setDebug`, `isDebugEnabled`, `debugFrameStart`, `debugUpdateStats`, `debugState`, `debugStatsLine`, `debugDumpTree`, `debugDumpCulledNodes`, `createSlotRegistry`, `createSlot`, `ExtmarkManager`, `TreeSitterClient`, `getTreeSitterClient`, `addDefaultParsers`, `SyntaxStyle`, `ONE_DARK`, `KANAGAWA`, `highlightsToTokens`
- classes/constants: `RGBA`, `MouseButton`, `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y`

Implementation helpers such as `createToggle()` and `useScrollHandle()` live inside `@vexart/headless`; `createLRUCache()` lives inside the engine FFI/text-layout implementation. They are documented here as architecture helpers, not as public API, unless exported from a package `public.ts` in a later change.

## `@vexart/primitives`

Primitive component wrappers over JSX intrinsics:

- `Box`
- `Text`
- `RichText`
- `Span`
- `WrapRow`

```ts
import { Box, Text } from "vexart"
```

## `@vexart/headless`

Behavior-only components with render props/context props:

- inputs: `Button`, `Input`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`, `Select`, `Combobox`, `Slider`
- display: `Code`, `Markdown`, `ProgressBar`
- containers/navigation/collections: `ScrollView`, `Tabs`, `List`, `Table`, `VirtualList`, `Router`
- overlays: `Dialog`, `Tooltip`, `Popover`, `createToaster`
- forms: `createForm`

```ts
import { Button, Input, Dialog } from "vexart"
```

## `@vexart/styled`

Opinionated design system and styled components:

- tokens: `colors`, `radius`, `space`, `font`, `weight`, `shadows`, `glows`
- theme: `createTheme`, `ThemeProvider`, `useTheme`
- typography: `H1`, `H2`, `P`, `Muted`, etc.
- styled controls: `Button`, `Card`, `Badge`, `VoidInput`, `VoidSelect`, `VoidDialog`, etc.

```ts
import { colors, Button, Card } from "vexart"
```

## JSX intrinsics

The v0.9 intrinsic set is:

- `<box>`
- `<text>`
- `<image>` (`<img>` remains a compatibility alias)
- `<canvas>` (`<surface>` remains a compatibility alias)

The prop contract lives in `TGEProps` for compatibility with existing internal names, but the public product name is Vexart.

## Layout and native boundary

Layout is computed in TypeScript with Flexily. `libvexart` does not own the scene graph, layout, render graph generation, or event dispatch after DEC-014; it owns WGPU paint, compositing, Kitty encoding, transport, image assets, canvas display lists, GPU resources, and native presentation stats.

## API snapshot gate

Run:

```bash
bun run api:check
```

This regenerates:

- `packages/engine/etc/engine.api.md`
- `packages/primitives/etc/primitives.api.md`
- `packages/headless/etc/headless.api.md`
- `packages/styled/etc/styled.api.md`
- `packages/app/etc/app.api.md`

Any diff is a public API change and must be reviewed intentionally.
