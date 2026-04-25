# API Reference

Vexart exposes four public packages for v0.9. Public exports are defined explicitly in each package's `src/public.ts` and snapshotted with API Extractor.

## `@vexart/engine`

Core renderer/runtime package:

- terminal lifecycle: `createTerminal`, `mount`
- renderer backend configuration
- retained scene/layout/paint hooks
- input/focus/selection/router hooks
- animation helpers
- canvas and syntax-highlighting primitives
- resource/debug/stat APIs

```ts
import { createTerminal, mount, useTerminalDimensions, onInput } from "@vexart/engine"
```

## `@vexart/primitives`

Primitive component wrappers over JSX intrinsics:

- `Box`
- `Text`
- `RichText`
- `Span`
- `WrapRow`

```ts
import { Box, Text } from "@vexart/primitives"
```

## `@vexart/headless`

Behavior-only components with render props/context props:

- inputs: `Button`, `Input`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`, `Select`, `Combobox`, `Slider`
- display: `Code`, `Markdown`, `ProgressBar`
- containers/navigation/collections: `ScrollView`, `Tabs`, `List`, `Table`, `VirtualList`, `Router`
- overlays: `Dialog`, `Tooltip`, `Popover`, `createToaster`
- forms: `createForm`

```ts
import { Button, Input, Dialog } from "@vexart/headless"
```

## `@vexart/styled`

Opinionated design system and styled components:

- tokens: `colors`, `radius`, `space`, `font`, `weight`, `shadows`, `glows`
- theme: `createTheme`, `ThemeProvider`, `useTheme`
- typography: `H1`, `H2`, `P`, `Muted`, etc.
- styled controls: `Button`, `Card`, `Badge`, `VoidInput`, `VoidSelect`, `VoidDialog`, etc.

```ts
import { colors, Button, Card } from "@vexart/styled"
```

## JSX intrinsics

The v0.9 intrinsic set is:

- `<box>`
- `<text>`
- `<image>` (`<img>` remains a compatibility alias)
- `<canvas>` (`<surface>` remains a compatibility alias)

The prop contract lives in `TGEProps` for compatibility with existing internal names, but the public product name is Vexart.

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

Any diff is a public API change and must be reviewed intentionally.
