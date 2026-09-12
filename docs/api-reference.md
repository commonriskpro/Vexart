# API Reference

Vexart exposes four public packages for v0.9. Public exports are defined explicitly in each package's `src/public.ts` and snapshotted with API Extractor.

## Entry points

Use the highest-level API that matches your integration needs:

1. **`createApp()` from `@vexart/app`** — managed default. Creates the terminal, provides app context, starts the render loop, and wires lifecycle cleanup.
2. **`mountApp()` from `@vexart/app`** — async app lifecycle for custom bootstrapping while still using the app framework.
3. **`mount()` from `@vexart/engine`** — low-level alternative for advanced use when you manage terminal creation and input plumbing yourself.

```tsx
import { createApp } from "vexart"

await createApp(() => (
  <box width="100%" height="100%" alignX="center" alignY="center">
    <text>Hello Vexart</text>
  </box>
))
```

## `@vexart/app`

Managed application framework package:

- app lifecycle: `createApp`, `mountApp`, `useAppTerminal`
- JSX intrinsics: `<box>`, `<text>` with `className` support
- router: `createAppRouter`, `RouterProvider`, `RouteOutlet`, `useRouter`
- route manifest helpers and CLI/config helpers

```ts
import { createApp, mountApp, useAppTerminal } from "vexart"
```

## `@vexart/engine`

The published engine entry point provides `mount()` and `createTerminal()` for
integrations that need an explicit engine boundary, user-facing hooks, public
types needed to type those hooks and JSX refs, and the supported debug
controls. The retained scene/layout tree remains internal.
Application code should prefer `createApp()` or `mountApp()` from `vexart`;
use `mount()` only when the integration owns the low-level terminal boundary.

```ts
import { createTerminal, mount, useFocus, useKeyboard } from "vexart/engine"
import type { MountHandle, NodeHandle } from "vexart/engine"
```

The internal scene tree, layout engine, reconciler primitives, render loop,
renderer/native bridge, FFI bindings, diagnostic state/culling helpers, and raw
node helpers are not public APIs. In particular, consumers must not import or call
`createNode`, `createRenderLoop`, `solidRender`, `createHandle`, layout/native
helpers, `debugState`, `debugDumpCulledNodes`, or FFI symbols. The supported
debug controls are `toggleDebug`, `setDebug`, `isDebugEnabled`, `debugDumpTree`,
and `debugStatsLine`. JSX uses the shared reconciler through the published
`vexart/jsx-runtime`; `@vexart/engine/jsx-runtime` is reserved for the
workspace compiler and is not a raw-node construction API.

Maintainers and tests may use `@vexart/engine/internal` inside the workspace.
That entry point is not part of the published export map.

## `@vexart/headless`

Behavior-only components with render props/context props:

- inputs: `Button`, `Checkbox`, `Combobox`, `Input`, `RadioGroup`, `Select`, `Slider`, `Switch`, `Textarea`
- display: `Code`, `Markdown`, `ProgressBar`
- containers: `OverlayRoot`, `Portal`, `ScrollView`, `Tabs`
- collections: `List`, `Table`, `VirtualList`
- overlays: `Dialog`, `Tooltip`, `Popover`, `createToaster`
- navigation: `Diff`
- forms: `createForm`

```ts
import { Button, Input, Dialog } from "vexart"
```

## `@vexart/styled`

Opinionated design system and styled components:

- tokens: `colors`, `radius`, `space`, `font`, `weight`, `shadows`, `glows`, `theme`
- theme: `createTheme`, `darkTheme`, `lightTheme`, `themeColors`, `setTheme`, `getTheme`, `getThemeVersion`
- typography: `H1`, `H2`, `H3`, `H4`, `P`, `Lead`, `Large`, `Small`, `Muted`
- styled controls: `VoidAvatar`, `VoidBadge`, `VoidButton`, `VoidCard`, `VoidCheckbox`, `VoidCombobox`, `VoidDialog`, `VoidDropdownMenu`, `VoidInput`, `VoidPopover`, `VoidProgress`, `VoidRadioGroup`, `VoidSelect`, `VoidSeparator`, `VoidSkeleton`, `VoidSlider`, `VoidSwitch`, `VoidTable`, `VoidTabs`, `createVoidToaster`, `VoidTooltip`, `VoidTextarea`, `VoidCode`, `VoidMarkdown`, `VoidList`, `VoidVirtualList`, `VoidScrollView`, `VoidDiff`

```ts
import { colors, VoidButton, VoidCard } from "vexart"
```

## JSX intrinsics

The v0.9 intrinsic set is:

- `<box>`
- `<text>`
- `<img>`
- `<canvas>`

The prop contract lives in `TGEProps` for compatibility with existing internal names, but the public product name is Vexart.

## Layout and native boundary

Layout is computed in TypeScript with Flexily. `libvexart` does not own the scene graph, layout, render graph generation, or event dispatch after DEC-014; it owns WGPU paint, compositing, Kitty encoding, transport, image assets, GPU resources, and native presentation stats (canvas is rasterized in JS and uploaded as RGBA texture).

## API snapshot gate

Run:

```bash
bun run api:check
```

This regenerates:

- `packages/engine/etc/engine.api.md`
- `packages/headless/etc/headless.api.md`
- `packages/styled/etc/styled.api.md`
- `packages/app/etc/app.api.md`

Any diff is a public API change and must be reviewed intentionally.
